import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type {
  CodexHistoryQuery,
  CodexHistoryResult,
  CodexLatestSessionQuery,
  CodexLatestSessionResult,
  CodexSessionListItem,
  CodexSessionListQuery,
  CodexSessionListResult,
} from '@shared/types';
import { app } from 'electron';
import { CodexHistoryIndexer } from './CodexHistoryIndexer';
import { CodexHistoryIndexStore } from './CodexHistoryIndexStore';
import {
  type CodexSessionMetadata,
  normalizeCwd,
  readCodexSessionMetadata,
} from './CodexHistoryMetadata';
import { parseCodexHistoryLines } from './CodexHistoryParser';
import { CodexHistoryWatcher } from './CodexHistoryWatcher';
import { resolveWslCodexLocation } from './CodexWslResolver';
import { CodexWslScanCache } from './CodexWslScanCache';

const RECENT_SCAN_MAX_FILES = 200;
const ROOT_CLI_SESSION_SOURCE = 'cli';
const RECENT_SCAN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BACKGROUND_RETRY_DELAY_MS = 2000;

let indexStore: CodexHistoryIndexStore | null = null;
let indexer: CodexHistoryIndexer | null = null;
let indexWatcher: CodexHistoryWatcher | null = null;
let indexReady = false;
let indexFailed = false;
let backgroundStarted = false;
let backgroundStarting: Promise<void> | null = null;
let backgroundRetryTimer: ReturnType<typeof setTimeout> | null = null;
const wslScanCache = new CodexWslScanCache({ ttlMs: 2000 });

interface InternalCodexHistoryQuery extends CodexHistoryQuery {
  sessionsRoot?: string;
}

interface InternalLatestSessionQuery extends CodexLatestSessionQuery {
  sessionsRoot?: string;
}

interface InternalSessionListQuery extends CodexSessionListQuery {
  sessionsRoot?: string;
}

export interface CodexHistoryIndexOptions {
  dbPath?: string;
  sessionsRoot?: string;
}

export function resolveCodexSessionsRoot(
  codexHome: string | undefined,
  userHome = homedir()
): string {
  const customHome = codexHome?.trim();
  return path.join(customHome || path.join(userHome, '.codex'), 'sessions');
}

function defaultSessionsRoot(): string {
  return resolveCodexSessionsRoot(process.env.CODEX_HOME);
}

function defaultIndexPath(): string {
  return path.join(app.getPath('userData'), 'codex-history-index.db');
}

function hasUsableIndex(): boolean {
  return indexReady && !indexFailed && indexStore !== null && indexer !== null;
}

interface CodexQueryLocation {
  sessionsRoot: string;
  cwd?: string;
  wslDistro?: string;
  usesNativeIndex: boolean;
}

async function resolveQueryLocation(
  query: { cwd?: string; runtime?: 'native' | 'wsl'; wslDistro?: string },
  sessionsRoot: string | undefined
): Promise<CodexQueryLocation> {
  if (sessionsRoot) {
    return { sessionsRoot, ...(query.cwd ? { cwd: query.cwd } : {}), usesNativeIndex: true };
  }

  if (query.runtime === 'wsl') {
    const location = await resolveWslCodexLocation({
      ...(query.cwd ? { cwd: query.cwd } : {}),
      ...(query.wslDistro ? { wslDistro: query.wslDistro } : {}),
    });
    return { ...location, usesNativeIndex: false };
  }

  return {
    sessionsRoot: defaultSessionsRoot(),
    ...(query.cwd ? { cwd: query.cwd } : {}),
    usesNativeIndex: true,
  };
}

function canUseIndexForLocation(location: CodexQueryLocation): boolean {
  // WSL 会话目录不在 Windows 索引监听范围内，必须始终从对应 UNC 目录扫描。
  return location.usesNativeIndex && hasUsableIndex();
}

function addWslDistro(
  result: CodexLatestSessionResult | null,
  location: CodexQueryLocation
): CodexLatestSessionResult | null {
  if (!result || !location.wslDistro) return result;
  return { ...result, wslDistro: location.wslDistro };
}

function addWslDistroToSessionList(
  result: CodexSessionListResult,
  location: CodexQueryLocation
): CodexSessionListResult {
  if (!location.wslDistro) return result;
  return {
    wslDistro: location.wslDistro,
    sessions: result.sessions.map((session) => ({
      ...session,
      wslDistro: location.wslDistro,
    })),
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function clearBackgroundRetry(): void {
  if (!backgroundRetryTimer) return;
  clearTimeout(backgroundRetryTimer);
  backgroundRetryTimer = null;
}

async function readScanMetadata(filePath: string): Promise<CodexSessionMetadata | null> {
  try {
    return await readCodexSessionMetadata(filePath);
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function resetIndexState(): void {
  clearBackgroundRetry();
  wslScanCache.clear();
  indexStore = null;
  indexer = null;
  indexWatcher = null;
  indexReady = false;
  indexFailed = false;
  backgroundStarted = false;
  backgroundStarting = null;
}

export async function initializeCodexHistoryIndex(
  options: CodexHistoryIndexOptions = {}
): Promise<void> {
  await cleanupCodexHistoryIndex();

  const dbPath = options.dbPath ?? defaultIndexPath();
  const sessionsRoot = options.sessionsRoot ?? defaultSessionsRoot();
  const store = new CodexHistoryIndexStore(dbPath);

  try {
    await mkdir(path.dirname(dbPath), { recursive: true });
    await store.initialize();
    indexStore = store;
    indexer = new CodexHistoryIndexer(store, sessionsRoot);
    indexWatcher = new CodexHistoryWatcher(sessionsRoot, indexer, store);
    indexReady = true;
  } catch (error) {
    await store.close().catch(() => {});
    resetIndexState();
    indexFailed = true;
    throw error;
  }
}

interface InitialScanWatcher {
  start(options: { paused: boolean }): Promise<void>;
  resume(): void;
}

interface InitialScanIndexer {
  runFullScan(): Promise<void>;
}

export async function runCodexHistoryInitialScan(
  watcher: InitialScanWatcher,
  activeIndexer: InitialScanIndexer
): Promise<void> {
  await watcher.start({ paused: true });
  try {
    await activeIndexer.runFullScan();
  } finally {
    watcher.resume();
  }
}

export async function startCodexHistoryBackgroundIndexing(): Promise<void> {
  if (!hasUsableIndex() || backgroundStarted || !indexer || !indexWatcher) return;
  if (backgroundStarting) return backgroundStarting;

  clearBackgroundRetry();
  const watcher = indexWatcher;
  const activeIndexer = indexer;
  const startPromise = Promise.resolve().then(async () => {
    try {
      if (indexWatcher !== watcher || indexer !== activeIndexer || !hasUsableIndex()) return;
      await runCodexHistoryInitialScan(watcher, activeIndexer);
      if (indexWatcher === watcher && indexer === activeIndexer && hasUsableIndex()) {
        backgroundStarted = true;
      }
    } catch (error) {
      console.error('[CodexHistoryService] 后台会话索引启动失败：', error);
      if (
        !backgroundRetryTimer &&
        indexWatcher === watcher &&
        indexer === activeIndexer &&
        hasUsableIndex() &&
        !backgroundStarted
      ) {
        // 首次运行时 sessions 目录或文件监听可能暂时不可用，短暂等待后再试一次。
        backgroundRetryTimer = setTimeout(() => {
          backgroundRetryTimer = null;
          if (
            indexWatcher === watcher &&
            indexer === activeIndexer &&
            hasUsableIndex() &&
            !backgroundStarted
          ) {
            void startCodexHistoryBackgroundIndexing();
          }
        }, BACKGROUND_RETRY_DELAY_MS);
      }
    } finally {
      if (backgroundStarting === startPromise) backgroundStarting = null;
    }
  });

  backgroundStarting = startPromise;
  return startPromise;
}

export async function cleanupCodexHistoryIndex(): Promise<void> {
  const store = indexStore;
  const watcher = indexWatcher;
  resetIndexState();
  // 先停止文件监听，避免数据库关闭后仍有索引写入。
  await watcher?.stop();
  await store?.close();
}

export function cleanupCodexHistoryIndexSync(): void {
  // 退出时无法等待 sqlite3 回调；同步清理 watcher 定时器并清空引用。
  indexWatcher?.stopSync();
  resetIndexState();
}

async function listJsonlFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listJsonlFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(fullPath);
    }
  }

  return results;
}

async function findFileBySessionId(root: string, sessionId: string): Promise<string | null> {
  const files = await listJsonlFiles(root);

  for (const filePath of files) {
    const metadata = await readScanMetadata(filePath);
    if (metadata?.sessionId === sessionId) return filePath;
  }

  return null;
}

async function listCodexSessionsByScan(
  sessionsRoot: string,
  cwd: string | undefined,
  maxSessions: number
): Promise<CodexSessionListResult> {
  const files = await listJsonlFiles(sessionsRoot);
  const metadataEntries: CodexSessionMetadata[] = [];

  for (const filePath of files) {
    const metadata = await readScanMetadata(filePath);
    if (metadata) metadataEntries.push(metadata);
  }

  return listCodexSessionsFromMetadata(metadataEntries, cwd, maxSessions);
}

function listCodexSessionsFromMetadata(
  metadataEntries: CodexSessionMetadata[],
  cwd: string | undefined,
  maxSessions: number
): CodexSessionListResult {
  const sessions: CodexSessionListItem[] = [];

  for (const metadata of metadataEntries) {
    // 旧 EnsoAI 记录没有 cliSessionId 时，用户只能从当前 cwd 下的 Codex 文件里选。
    if (!metadataMatchesCwd(metadata, cwd)) continue;

    sessions.push(
      createSessionListItem(metadata.sessionId, metadata.filePath, metadata.modifiedAtMs, metadata)
    );
  }

  sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return { sessions: sessions.slice(0, maxSessions) };
}

async function findLatestCodexSessionByScan(
  sessionsRoot: string,
  cwd: string | undefined,
  startedAfter: number,
  excludeSessionIds: string[],
  originator: string | undefined,
  sessionSource: string | undefined,
  requireUnique: boolean
): Promise<CodexLatestSessionResult | null> {
  const files = await listJsonlFiles(sessionsRoot);
  const metadataEntries: CodexSessionMetadata[] = [];

  for (const filePath of files) {
    const metadata = await readScanMetadata(filePath);
    if (metadata) metadataEntries.push(metadata);
  }

  return findLatestCodexSessionFromMetadata(
    metadataEntries,
    cwd,
    startedAfter,
    excludeSessionIds,
    originator,
    sessionSource,
    requireUnique
  );
}

function findLatestCodexSessionFromMetadata(
  metadataEntries: CodexSessionMetadata[],
  cwd: string | undefined,
  startedAfter: number,
  excludeSessionIds: string[],
  originator: string | undefined,
  sessionSource: string | undefined,
  requireUnique: boolean
): CodexLatestSessionResult | null {
  const candidates: Array<{ sessionId: string; filePath: string; createdAtMs: number }> = [];
  const excludedSessionIds = new Set(excludeSessionIds);

  for (const metadata of metadataEntries) {
    if (!metadataMatchesCwd(metadata, cwd)) continue;
    if (excludedSessionIds.has(metadata.sessionId)) continue;
    // originator 会被子代理继承，因此严格模式还要确认这是本次启动产生的主 CLI 会话。
    if (originator && metadata.originator !== originator) continue;
    if (sessionSource && metadata.sessionSource !== sessionSource) continue;

    // 新建 Codex 会话时，旧会话文件也可能继续被写入；这里只按会话创建时间判断。
    if (metadata.createdAtMs < startedAfter) continue;
    // 旧版回退只在唯一主 CLI 会话时关联；第二个候选出现即可拒绝。
    if (requireUnique && candidates.length > 0) return null;
    candidates.push({
      sessionId: metadata.sessionId,
      filePath: metadata.filePath,
      createdAtMs: metadata.createdAtMs,
    });
  }

  candidates.sort((a, b) => b.createdAtMs - a.createdAtMs);
  const latest = candidates[0];
  return latest ? { sessionId: latest.sessionId, filePath: latest.filePath } : null;
}

function metadataMatchesCwd(metadata: CodexSessionMetadata, cwd?: string): boolean {
  if (!cwd) return true;
  const expected = normalizeCwd(cwd);
  if (!expected) return true;

  return metadata.cwdNormalizedValues.includes(expected);
}

function createSessionListItem(
  sessionId: string,
  filePath: string,
  modifiedAt: number,
  metadata: CodexSessionMetadata
): CodexSessionListItem {
  const item: CodexSessionListItem = { sessionId, filePath, modifiedAt };
  if (metadata.cwd) item.cwd = metadata.cwd;
  if (metadata.title) item.title = metadata.title;
  if (metadata.model) item.model = metadata.model;
  if (metadata.modelProvider) item.modelProvider = metadata.modelProvider;
  if (metadata.timestamp) item.timestamp = metadata.timestamp;
  return item;
}

export async function listCodexSessions({
  cwd,
  maxSessions = 50,
  runtime,
  wslDistro,
  sessionsRoot,
}: InternalSessionListQuery): Promise<CodexSessionListResult> {
  const location = await resolveQueryLocation({ cwd, runtime, wslDistro }, sessionsRoot);
  if (!canUseIndexForLocation(location) || !indexStore || !indexer) {
    if (!location.usesNativeIndex) {
      return addWslDistroToSessionList(
        listCodexSessionsFromMetadata(
          await wslScanCache.list(location.sessionsRoot),
          location.cwd,
          maxSessions
        ),
        location
      );
    }
    return listCodexSessionsByScan(location.sessionsRoot, location.cwd, maxSessions);
  }

  try {
    if (!backgroundStarted) {
      // 监听尚未成功时先补扫近期文件，已有缓存也不能阻止新会话进入列表。
      await indexer.runRecentScan({
        maxFiles: RECENT_SCAN_MAX_FILES,
        newerThanMs: Date.now() - RECENT_SCAN_AGE_MS,
        cwd: location.cwd,
      });
    }

    let sessions = await indexStore.listSessions({ cwd: location.cwd, maxSessions });
    if (sessions.length > 0) return { sessions };

    const initialScanCompleted = await indexStore.getState('initial_scan_completed');
    if (initialScanCompleted !== 'true' && location.cwd) {
      await indexer.runRecentScan({
        maxFiles: RECENT_SCAN_MAX_FILES,
        newerThanMs: Date.now() - RECENT_SCAN_AGE_MS,
        cwd: location.cwd,
      });
      sessions = await indexStore.listSessions({ cwd: location.cwd, maxSessions });
    }

    return { sessions };
  } catch (error) {
    console.warn('[CodexHistoryService] 索引查询失败，使用文件扫描：', error);
    indexFailed = true;
    return listCodexSessionsByScan(location.sessionsRoot, location.cwd, maxSessions);
  }
}

export async function findLatestCodexSession({
  cwd,
  startedAfter = 0,
  excludeSessionIds = [],
  originator,
  matchMode = 'strict',
  runtime,
  wslDistro,
  sessionsRoot,
}: InternalLatestSessionQuery): Promise<CodexLatestSessionResult | null> {
  const location = await resolveQueryLocation({ cwd, runtime, wslDistro }, sessionsRoot);
  const requireUnique = matchMode === 'legacy-unique';
  // 旧版 Codex 不会写入 originator，只允许唯一的主 CLI 会话作为回退结果。
  const queryOriginator = requireUnique ? undefined : originator;
  const sessionSource = requireUnique
    ? ROOT_CLI_SESSION_SOURCE
    : originator
      ? ROOT_CLI_SESSION_SOURCE
      : undefined;
  if (!canUseIndexForLocation(location) || !indexStore || !indexer) {
    const latest = !location.usesNativeIndex
      ? findLatestCodexSessionFromMetadata(
          await wslScanCache.list(location.sessionsRoot, {
            newerThanMs: startedAfter,
            ...(requireUnique ? { forceRefresh: true } : {}),
          }),
          location.cwd,
          startedAfter,
          excludeSessionIds,
          queryOriginator,
          sessionSource,
          requireUnique
        )
      : await findLatestCodexSessionByScan(
          location.sessionsRoot,
          location.cwd,
          startedAfter,
          excludeSessionIds,
          queryOriginator,
          sessionSource,
          requireUnique
        );
    return addWslDistro(latest, location);
  }

  try {
    let latest = await indexStore.findLatest({
      cwd: location.cwd,
      startedAfter,
      excludeSessionIds,
      originator: queryOriginator,
      sessionSource,
      requireUnique,
    });
    if (latest) return addWslDistro(latest, location);

    const initialScanCompleted = await indexStore.getState('initial_scan_completed');
    if (initialScanCompleted !== 'true') {
      await indexer.runRecentScan({
        maxFiles: RECENT_SCAN_MAX_FILES,
        cwd: location.cwd,
        startedAfter,
      });
      latest = await indexStore.findLatest({
        cwd: location.cwd,
        startedAfter,
        excludeSessionIds,
        originator: queryOriginator,
        sessionSource,
        requireUnique,
      });
      if (latest) return addWslDistro(latest, location);
    }
  } catch (error) {
    console.warn('[CodexHistoryService] 索引查询失败，使用文件扫描：', error);
    indexFailed = true;
  }

  return addWslDistro(
    await findLatestCodexSessionByScan(
      location.sessionsRoot,
      location.cwd,
      startedAfter,
      excludeSessionIds,
      queryOriginator,
      sessionSource,
      requireUnique
    ),
    location
  );
}

export async function getCodexHistory({
  sessionId,
  cwd,
  maxMessages = 500,
  runtime,
  wslDistro,
  sessionsRoot,
}: InternalCodexHistoryQuery): Promise<CodexHistoryResult> {
  if (!sessionId) {
    return {
      sessionId: null,
      filePath: null,
      messages: [],
      truncated: false,
      error: 'missing-session-id',
    };
  }

  const location = await resolveQueryLocation({ cwd, runtime, wslDistro }, sessionsRoot);

  let filePath: string | null = null;
  if (canUseIndexForLocation(location) && indexStore) {
    try {
      filePath = await indexStore.getSessionFilePath(sessionId);
      if (filePath && !existsSync(filePath)) {
        await indexStore.deleteByFilePath(filePath);
        filePath = null;
      }
    } catch (error) {
      console.warn('[CodexHistoryService] 索引查询失败，使用文件扫描：', error);
      indexFailed = true;
    }
  }

  if (!location.usesNativeIndex) {
    const metadata = await wslScanCache.findBySessionId(location.sessionsRoot, sessionId);
    filePath = metadata?.filePath ?? null;
  } else {
    filePath ??= await findFileBySessionId(location.sessionsRoot, sessionId);
  }
  if (!filePath) {
    return {
      sessionId,
      filePath: null,
      messages: [],
      truncated: false,
      error: 'session-file-not-found',
    };
  }

  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    const parsed = await parseCodexHistoryLines(lines, maxMessages);
    return { sessionId, filePath, messages: parsed.messages, truncated: parsed.truncated };
  } finally {
    lines.close();
    stream.destroy();
  }
}
