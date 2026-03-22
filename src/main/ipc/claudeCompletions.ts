import {
  type ClaudeSlashCompletionItem,
  type ClaudeSlashCompletionsSnapshot,
  IPC_CHANNELS,
} from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import {
  getClaudeSlashCompletionsSnapshot,
  learnClaudeSlashCompletion,
  refreshClaudeSlashCompletions,
  startClaudeSlashCompletionsWatcher,
  stopClaudeSlashCompletionsWatcher,
} from '../services/claude/ClaudeCompletionsManager';
import {
  getRepositoryEnvironmentContext,
  listRepositoryRemoteDirectory,
} from '../services/remote/RemoteEnvironmentService';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';

function parseMarkdownHeading(content: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim() || undefined;
    }
  }
  return undefined;
}

function parseSkillFrontMatter(content: string): { name?: string; description?: string } | null {
  const lines = content.split(/\r?\n/);
  if (lines.length < 3 || lines[0]?.trim() !== '---') {
    return null;
  }

  const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (endIndex < 0) {
    return null;
  }

  const result: { name?: string; description?: string } = {};
  for (const line of lines.slice(1, endIndex + 1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (!value) {
      continue;
    }
    if (key === 'name') {
      result.name = value;
    }
    if (key === 'description') {
      result.description = value;
    }
  }

  return result.name || result.description ? result : null;
}

function uniqueItems(items: ClaudeSlashCompletionItem[]): ClaudeSlashCompletionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.label)) {
      return false;
    }
    seen.add(item.label);
    return true;
  });
}

async function walkRemoteSkillFiles(repoPath: string, rootPath: string): Promise<string[]> {
  const stack = [rootPath];
  const files: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }

    const entries = await listRepositoryRemoteDirectory(repoPath, current);
    for (const entry of entries) {
      if (entry.isDirectory) {
        stack.push(entry.path);
        continue;
      }
      if (entry.name.toLowerCase() === 'skill.md') {
        files.push(entry.path);
      }
    }
  }

  return files;
}

async function getRemoteClaudeSlashCompletionsSnapshot(
  repoPath: string
): Promise<ClaudeSlashCompletionsSnapshot> {
  const localSnapshot = await refreshClaudeSlashCompletions();
  const builtinItems = localSnapshot.items.filter((item) => item.source === 'builtin');
  const userItems: ClaudeSlashCompletionItem[] = [];
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind !== 'remote') {
    return localSnapshot;
  }

  const commandEntries = await listRepositoryRemoteDirectory(repoPath, context.claudeCommandsDir);
  for (const entry of commandEntries) {
    if (entry.isDirectory || !entry.name.toLowerCase().endsWith('.md')) {
      continue;
    }
    const commandName = entry.name.slice(0, -3);
    const content = await readRepositoryRemoteTextFile(repoPath, entry.path);
    userItems.push({
      kind: 'command',
      label: `/${commandName}`,
      insertText: `/${commandName} `,
      description: content ? parseMarkdownHeading(content) : undefined,
      source: 'user',
    });
  }

  const skillFiles = await walkRemoteSkillFiles(repoPath, context.claudeSkillsDir);
  for (const filePath of skillFiles) {
    const content = await readRepositoryRemoteTextFile(repoPath, filePath);
    if (!content) {
      continue;
    }
    const meta = parseSkillFrontMatter(content);
    const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    const fallbackName = segments[segments.length - 2] || 'skill';
    const name = meta?.name ?? fallbackName;
    userItems.push({
      kind: 'skill',
      label: `/${name}`,
      insertText: `/${name} `,
      description: meta?.description ?? parseMarkdownHeading(content),
      source: 'user',
    });
  }

  return {
    items: uniqueItems([...builtinItems, ...userItems]),
    updatedAt: Date.now(),
  };
}

async function readRepositoryRemoteTextFile(
  repoPath: string,
  remotePath: string
): Promise<string | null> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind !== 'remote') {
    return null;
  }

  try {
    const { remoteConnectionManager } = await import('../services/remote/RemoteConnectionManager');
    const result = await remoteConnectionManager.call<{ content: string; isBinary?: boolean }>(
      context.connectionId,
      'fs:read',
      { path: remotePath }
    );
    if (result.isBinary) {
      return null;
    }
    return result.content;
  } catch {
    return null;
  }
}

function broadcast(snapshot: ClaudeSlashCompletionsSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(IPC_CHANNELS.CLAUDE_COMPLETIONS_UPDATED, snapshot);
    } catch {
      // Window may be destroyed after the guard above.
    }
  }
}

export function registerClaudeCompletionsHandlers(): void {
  // Start watcher: when ~/.claude/commands or ~/.claude/skills changes, refresh completion items automatically.
  startClaudeSlashCompletionsWatcher((next) => {
    broadcast(next);
  }).catch((err) => {
    console.warn('[ClaudeCompletions] watcher 启动失败：', err);
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_COMPLETIONS_GET, (_, repoPath?: string) => {
    if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote' && repoPath) {
      return getRemoteClaudeSlashCompletionsSnapshot(repoPath);
    }
    return getClaudeSlashCompletionsSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_COMPLETIONS_REFRESH, (_, repoPath?: string) => {
    if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote' && repoPath) {
      return getRemoteClaudeSlashCompletionsSnapshot(repoPath);
    }
    return refreshClaudeSlashCompletions();
  });

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_COMPLETIONS_LEARN,
    (_, repoPath: string | undefined, label: string) => {
      if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
        return false;
      }
      return learnClaudeSlashCompletion(label);
    }
  );
}

export async function stopClaudeCompletionsWatchers(): Promise<void> {
  await stopClaudeSlashCompletionsWatcher();
}
