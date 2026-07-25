import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
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
import { parseCodexHistoryJsonl } from './CodexHistoryParser';
import { CodexHistoryWatcher } from './CodexHistoryWatcher';

const RECENT_SCAN_MAX_FILES = 200;
const RECENT_SCAN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let indexStore: CodexHistoryIndexStore | null = null;
let indexer: CodexHistoryIndexer | null = null;
let indexWatcher: CodexHistoryWatcher | null = null;
let indexReady = false;
let indexFailed = false;
let backgroundStarted = false;
let backgroundStarting: Promise<void> | null = null;

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

function defaultSessionsRoot(): string {
  return path.join(homedir(), '.codex', 'sessions');
}

function defaultIndexPath(): string {
  return path.join(app.getPath('userData'), 'codex-history-index.db');
}

function hasUsableIndex(): boolean {
  return indexReady && !indexFailed && indexStore !== null && indexer !== null;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
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
  const sessions: CodexSessionListItem[] = [];

  for (const filePath of files) {
    const metadata = await readScanMetadata(filePath);
    if (!metadata) continue;
    // 旧 EnsoAI 记录没有 cliSessionId 时，用户只能从当前 cwd 下的 Codex 文件里选。
    if (!metadataMatchesCwd(metadata, cwd)) continue;

    sessions.push(
      createSessionListItem(metadata.sessionId, filePath, metadata.modifiedAtMs, metadata)
    );
  }

  sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return { sessions: sessions.slice(0, maxSessions) };
}

async function findLatestCodexSessionByScan(
  sessionsRoot: string,
  cwd: string | undefined,
  startedAfter: number
): Promise<CodexLatestSessionResult | null> {
  const files = await listJsonlFiles(sessionsRoot);
  const candidates: Array<{ sessionId: string; filePath: string; createdAtMs: number }> = [];

  for (const filePath of files) {
    const metadata = await readScanMetadata(filePath);
    if (!metadata) continue;
    if (!metadataMatchesCwd(metadata, cwd)) continue;

    // 新建 Codex 会话时，旧会话文件也可能继续被写入；这里只按会话创建时间判断。
    if (metadata.createdAtMs < startedAfter) continue;
    candidates.push({ sessionId: metadata.sessionId, filePath, createdAtMs: metadata.createdAtMs });
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
  sessionsRoot = defaultSessionsRoot(),
}: InternalSessionListQuery): Promise<CodexSessionListResult> {
  if (!hasUsableIndex() || !indexStore || !indexer) {
    return listCodexSessionsByScan(sessionsRoot, cwd, maxSessions);
  }

  try {
    let sessions = await indexStore.listSessions({ cwd, maxSessions });
    if (sessions.length > 0) return { sessions };

    const initialScanCompleted = await indexStore.getState('initial_scan_completed');
    if (initialScanCompleted !== 'true' && cwd) {
      await indexer.runRecentScan({
        maxFiles: RECENT_SCAN_MAX_FILES,
        newerThanMs: Date.now() - RECENT_SCAN_AGE_MS,
        cwd,
      });
      sessions = await indexStore.listSessions({ cwd, maxSessions });
    }

    return { sessions };
  } catch (error) {
    console.warn('[CodexHistoryService] 索引查询失败，使用文件扫描：', error);
    indexFailed = true;
    return listCodexSessionsByScan(sessionsRoot, cwd, maxSessions);
  }
}

export async function findLatestCodexSession({
  cwd,
  startedAfter = 0,
  sessionsRoot = defaultSessionsRoot(),
}: InternalLatestSessionQuery): Promise<CodexLatestSessionResult | null> {
  if (!hasUsableIndex() || !indexStore || !indexer) {
    return findLatestCodexSessionByScan(sessionsRoot, cwd, startedAfter);
  }

  try {
    let latest = await indexStore.findLatest({ cwd, startedAfter });
    if (latest) return latest;

    const initialScanCompleted = await indexStore.getState('initial_scan_completed');
    if (initialScanCompleted !== 'true') {
      await indexer.runRecentScan({ maxFiles: RECENT_SCAN_MAX_FILES, cwd, startedAfter });
      latest = await indexStore.findLatest({ cwd, startedAfter });
      if (latest) return latest;
    }
  } catch (error) {
    console.warn('[CodexHistoryService] 索引查询失败，使用文件扫描：', error);
    indexFailed = true;
  }

  return findLatestCodexSessionByScan(sessionsRoot, cwd, startedAfter);
}

export async function getCodexHistory({
  sessionId,
  maxMessages = 500,
  sessionsRoot = defaultSessionsRoot(),
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

  let filePath: string | null = null;
  if (hasUsableIndex() && indexStore) {
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

  filePath ??= await findFileBySessionId(sessionsRoot, sessionId);
  if (!filePath) {
    return {
      sessionId,
      filePath: null,
      messages: [],
      truncated: false,
      error: 'session-file-not-found',
    };
  }

  const content = await readFile(filePath, 'utf8');
  const parsed = parseCodexHistoryJsonl(content, maxMessages);
  return { sessionId, filePath, messages: parsed.messages, truncated: parsed.truncated };
}
