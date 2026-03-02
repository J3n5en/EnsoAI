import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type AsyncSubscription, subscribe } from '@parcel/watcher';
import type { ClaudeSlashCompletionItem, ClaudeSlashCompletionsSnapshot } from '@shared/types';

function getClaudeConfigDir(): string {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return process.env.CLAUDE_CONFIG_DIR;
  }
  return path.join(os.homedir(), '.claude');
}

function getPrimaryClaudeConfigDir(): string {
  return getClaudeConfigDir();
}

type LearnedSlashCacheV1 = {
  version: 1;
  items: Record<string, { count: number; lastUsedAt: number }>;
};

function getClaudeConfigDirs(): string[] {
  const homeDir = path.join(os.homedir(), '.claude');
  const envDir = process.env.CLAUDE_CONFIG_DIR;

  const candidates = [homeDir];
  if (envDir && envDir.trim()) {
    candidates.push(envDir);
  }

  const normalized = candidates.map((d) => path.resolve(d));
  const unique: string[] = [];
  for (const dir of normalized) {
    if (!unique.includes(dir)) unique.push(dir);
  }
  return unique;
}

function getClaudeCommandsDirs(): string[] {
  return getClaudeConfigDirs().map((d) => path.join(d, 'commands'));
}

function getClaudeSkillsDirs(): string[] {
  return getClaudeConfigDirs().map((d) => path.join(d, 'skills'));
}

function getLearnedCacheFilePath(): string {
  // The learned cache follows CLAUDE_CONFIG_DIR (if set); otherwise it defaults to ~/.claude.
  return path.join(getPrimaryClaudeConfigDir(), 'cache', 'ensoai-slash-learned.json');
}

let snapshot: ClaudeSlashCompletionsSnapshot = { items: [], updatedAt: 0 };
let subscriptions: AsyncSubscription[] = [];
let debounceTimer: NodeJS.Timeout | null = null;
let maxWaitTimer: NodeJS.Timeout | null = null;
let watchersRetryTimer: NodeJS.Timeout | null = null;
let watchersRetryInProgress = false;
let isStarted = false;
let starting: Promise<void> | null = null;
let onUpdate: ((next: ClaudeSlashCompletionsSnapshot) => void) | null = null;

function cleanupTimers(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (maxWaitTimer) {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
  }
}

function cleanupWatchersRetryTimer(): void {
  if (watchersRetryTimer) {
    clearInterval(watchersRetryTimer);
    watchersRetryTimer = null;
  }
  watchersRetryInProgress = false;
}

function scheduleWatchersRetry(): void {
  if (watchersRetryTimer) return;
  // Poll for directory creation: users may create ~/.claude/commands|skills while the app is running.
  watchersRetryTimer = setInterval(() => {
    if (subscriptions.length > 0) {
      cleanupWatchersRetryTimer();
      return;
    }
    if (watchersRetryInProgress) return;
    watchersRetryInProgress = true;
    startWatchers()
      .catch(() => {
        // Ignore retry errors; a later tick may succeed.
      })
      .finally(() => {
        watchersRetryInProgress = false;
      });
  }, 2000);
}

function scheduleRefresh(): void {
  const run = () => {
    cleanupTimers();
    refreshSnapshot()
      .then((next) => {
        onUpdate?.(next);
      })
      .catch((err) => {
        console.warn('[ClaudeCompletions] 刷新失败：', err);
      });
  };

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  if (!maxWaitTimer) {
    maxWaitTimer = setTimeout(() => {
      run();
    }, 2000);
  }

  debounceTimer = setTimeout(() => {
    run();
  }, 400);
}

function stripQuotes(input: string): string {
  const trimmed = input.trim();
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseMarkdownHeading(content: string): string | null {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  return null;
}

function parseSkillFrontMatter(content: string): { name?: string; description?: string } | null {
  const lines = content.split(/\r?\n/);
  if (lines.length < 3) return null;
  if (lines[0]?.trim() !== '---') return null;

  const endIndex = lines.slice(1).findIndex((l) => l.trim() === '---');
  if (endIndex === -1) return null;

  const metaLines = lines.slice(1, endIndex + 1);
  const meta: { name?: string; description?: string } = {};
  for (const line of metaLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = stripQuotes(trimmed.slice(idx + 1));
    if (!value) continue;
    if (key === 'name') meta.name = value;
    if (key === 'description') meta.description = value;
  }
  if (!meta.name && !meta.description) return null;
  return meta;
}

async function readTextFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    console.warn('[ClaudeCompletions] 读取失败：', filePath, err);
    return null;
  }
}

async function readLearnedCacheSafe(): Promise<LearnedSlashCacheV1> {
  const filePath = getLearnedCacheFilePath();
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LearnedSlashCacheV1>;
    if (parsed?.version !== 1 || !parsed.items || typeof parsed.items !== 'object') {
      return { version: 1, items: {} };
    }
    return { version: 1, items: parsed.items as LearnedSlashCacheV1['items'] };
  } catch {
    return { version: 1, items: {} };
  }
}

async function writeLearnedCacheSafe(cache: LearnedSlashCacheV1): Promise<void> {
  const filePath = getLearnedCacheFilePath();
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[ClaudeCompletions] 写入学习缓存失败：', filePath, err);
  }
}

function normalizeSlashLabel(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('/')) return null;
  const token = trimmed.split(/\s+/)[0] ?? '';
  if (token.length < 2) return null;
  if (token.length > 120) return null;
  // Disallow invisible characters to avoid polluting the cache.
  if (/[\r\n\t]/.test(token)) return null;
  // Avoid learning path-like tokens such as `/usr/local/bin`.
  const rest = token.slice(1);
  if (rest.includes('/') || rest.includes('\\')) return null;
  return token;
}

async function loadLearnedCommands(): Promise<ClaudeSlashCompletionItem[]> {
  const cache = await readLearnedCacheSafe();
  const items: ClaudeSlashCompletionItem[] = [];
  for (const [label, meta] of Object.entries(cache.items)) {
    if (!label.startsWith('/')) continue;
    items.push({
      kind: 'command',
      label,
      insertText: `${label} `,
      description: meta?.count ? `自动学习（已使用 ${meta.count} 次）` : '自动学习',
      source: 'learned',
    });
  }
  return items;
}

async function loadUserCommands(): Promise<ClaudeSlashCompletionItem[]> {
  const items: ClaudeSlashCompletionItem[] = [];

  for (const dir of getClaudeCommandsDirs()) {
    if (!fs.existsSync(dir)) continue;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.warn('[ClaudeCompletions] 读取 commands 目录失败：', dir, err);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      const commandName = entry.name.slice(0, -3);
      const filePath = path.join(dir, entry.name);
      const content = await readTextFileSafe(filePath);
      const heading = content ? parseMarkdownHeading(content) : null;

      items.push({
        kind: 'command',
        label: `/${commandName}`,
        insertText: `/${commandName} `,
        description: heading ?? undefined,
        source: 'user',
      });
    }
  }
  return items;
}

async function walkDirForSkillFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.toLowerCase() !== 'skill.md') continue;
      result.push(next);
    }
  }
  return result;
}

async function loadUserSkills(): Promise<ClaudeSlashCompletionItem[]> {
  const items: ClaudeSlashCompletionItem[] = [];
  for (const dir of getClaudeSkillsDirs()) {
    if (!fs.existsSync(dir)) continue;

    const skillFiles = await walkDirForSkillFiles(dir);
    for (const filePath of skillFiles) {
      const content = await readTextFileSafe(filePath);
      if (!content) continue;

      const meta = parseSkillFrontMatter(content);
      const fallbackName = path.basename(path.dirname(filePath));
      const name = meta?.name ?? fallbackName;
      const description = meta?.description ?? parseMarkdownHeading(content) ?? undefined;

      items.push({
        kind: 'skill',
        label: `/${name}`,
        insertText: `/${name} `,
        description,
        source: 'user',
      });
    }
  }

  return items;
}

function loadBuiltinCommands(): ClaudeSlashCompletionItem[] {
  // Built-in Claude Code CLI `/` commands. If the CLI cannot be enumerated reliably, provide a small seed list.
  // Note: this does not affect CLI behavior; it is only used for UI hints and insert text.
  const commands: Array<{ command: string; description: string }> = [
    { command: 'help', description: '查看帮助' },
    { command: 'init', description: '初始化项目（生成 CLAUDE.md）' },
    { command: 'clear', description: '清屏 / 清空当前视图' },
    { command: 'compact', description: '压缩上下文' },
    { command: 'model', description: '切换/查看模型' },
    { command: 'cost', description: '查看用量/费用' },
    { command: 'status', description: '查看状态' },
    { command: 'memory', description: '查看/编辑记忆' },
    { command: 'config', description: '查看/修改配置' },
    { command: 'review', description: '进入评审/检查流程' },
    { command: 'permissions', description: '查看/修改权限设置' },
    { command: 'output-style', description: '配置输出风格（如 concise/detailed）' },
    { command: 'theme', description: '切换主题' },
    { command: 'fast', description: '切换快速模式' },
    { command: 'keybindings', description: '编辑快捷键配置' },
    { command: 'rewind', description: '回退最近一轮对话/变更' },
    { command: 'resume', description: '恢复之前的会话' },
    { command: 'add-dir', description: '添加额外目录到上下文' },
    { command: 'doctor', description: '诊断环境问题' },
    { command: 'usage', description: '查看用量限制进度' },
    { command: 'context-viz', description: '可视化上下文窗口使用情况' },
    { command: 'todo', description: '查看当前会话待办' },
    { command: 'login', description: '登录/切换账号' },
    { command: 'logout', description: '登出当前会话' },
    { command: 'mcp', description: '管理 MCP 集成' },
  ];

  const dedup = new Map<string, { command: string; description: string }>();
  for (const c of commands) {
    dedup.set(c.command, c);
  }

  return Array.from(dedup.values()).map((c) => ({
    kind: 'command' as const,
    label: `/${c.command}`,
    insertText: `/${c.command} `,
    description: c.description,
    source: 'builtin' as const,
  }));
}

async function buildSnapshot(): Promise<ClaudeSlashCompletionsSnapshot> {
  const learned = await loadLearnedCommands();
  const builtin = loadBuiltinCommands();
  const [commands, skills] = await Promise.all([loadUserCommands(), loadUserSkills()]);
  const dedup = new Map<string, ClaudeSlashCompletionItem>();
  // Let user-defined items override built-ins (same label: last write wins).
  // Learned items have the lowest priority; they are only used as a fallback for discovery.
  for (const item of [...learned, ...builtin, ...commands, ...skills]) {
    dedup.set(item.label, item);
  }
  return { items: Array.from(dedup.values()), updatedAt: Date.now() };
}

async function refreshSnapshot(): Promise<ClaudeSlashCompletionsSnapshot> {
  snapshot = await buildSnapshot();
  return snapshot;
}

async function startWatchers(): Promise<void> {
  if (subscriptions.length > 0) {
    cleanupWatchersRetryTimer();
    return;
  }

  const watchTargets = [...getClaudeCommandsDirs(), ...getClaudeSkillsDirs()].filter((d) =>
    fs.existsSync(d)
  );
  if (watchTargets.length === 0) {
    scheduleWatchersRetry();
    return;
  }

  cleanupWatchersRetryTimer();

  for (const dir of watchTargets) {
    try {
      const sub = await subscribe(dir, (err, events) => {
        if (err) {
          console.warn('[ClaudeCompletions] watcher 错误：', err);
          return;
        }
        const hasRelevantChange = events.some((e) => e.path.toLowerCase().endsWith('.md'));
        if (!hasRelevantChange) return;
        scheduleRefresh();
      });
      subscriptions.push(sub);
    } catch (err) {
      console.warn('[ClaudeCompletions] watcher 启动失败：', dir, err);
    }
  }
}

async function ensureStarted(): Promise<void> {
  if (isStarted) return;
  if (starting) return starting;
  starting = (async () => {
    await refreshSnapshot();
    await startWatchers();
    isStarted = true;
  })();
  await starting;
  starting = null;
}

export async function startClaudeSlashCompletionsWatcher(
  callback: (next: ClaudeSlashCompletionsSnapshot) => void
): Promise<void> {
  onUpdate = callback;
  await ensureStarted();
}

export async function stopClaudeSlashCompletionsWatcher(): Promise<void> {
  cleanupTimers();
  cleanupWatchersRetryTimer();
  onUpdate = null;

  const subs = subscriptions;
  subscriptions = [];
  await Promise.allSettled(subs.map((s) => s.unsubscribe()));

  isStarted = false;
  starting = null;
}

export async function getClaudeSlashCompletionsSnapshot(): Promise<ClaudeSlashCompletionsSnapshot> {
  await ensureStarted();
  return snapshot;
}

export async function refreshClaudeSlashCompletions(): Promise<ClaudeSlashCompletionsSnapshot> {
  await ensureStarted();
  const next = await refreshSnapshot();
  onUpdate?.(next);
  return next;
}

export async function learnClaudeSlashCompletion(
  label: string
): Promise<ClaudeSlashCompletionsSnapshot> {
  await ensureStarted();

  const normalized = normalizeSlashLabel(label);
  if (!normalized) return snapshot;

  const cache = await readLearnedCacheSafe();
  const now = Date.now();
  const current = cache.items[normalized] ?? { count: 0, lastUsedAt: 0 };
  cache.items[normalized] = { count: Math.max(0, current.count) + 1, lastUsedAt: now };
  await writeLearnedCacheSafe(cache);

  const next = await refreshSnapshot();
  onUpdate?.(next);
  return next;
}
