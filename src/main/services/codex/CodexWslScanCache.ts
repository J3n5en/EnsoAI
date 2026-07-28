import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { type CodexSessionMetadata, readCodexSessionMetadata } from './CodexHistoryMetadata';

interface FileFingerprint {
  mtimeMs: number;
  size: number;
}

interface CachedFileMetadata extends FileFingerprint {
  metadata: CodexSessionMetadata | null;
}

interface CachedRoot {
  coveredSinceMs: number | null;
  expiresAt: number;
  files: Map<string, CachedFileMetadata>;
  knownFiles: Set<string>;
  refresh?: ActiveRefresh;
}

interface ActiveRefresh {
  force: boolean;
  promise: Promise<void>;
}

export interface CodexWslScanOptions {
  forceRefresh?: boolean;
  newerThanMs?: number;
}

interface CodexWslScanCacheOptions {
  ttlMs?: number;
  now?: () => number;
  listFiles?: (root: string) => Promise<string[]>;
  statFile?: (filePath: string) => Promise<FileFingerprint>;
  readMetadata?: (filePath: string) => Promise<CodexSessionMetadata | null>;
}

const DEFAULT_TTL_MS = 2000;

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function listJsonlFiles(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

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

async function statFingerprint(filePath: string): Promise<FileFingerprint> {
  const fileStat = await stat(filePath);
  return { mtimeMs: fileStat.mtimeMs, size: fileStat.size };
}

export class CodexWslScanCache {
  private readonly roots = new Map<string, CachedRoot>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly listFiles: (root: string) => Promise<string[]>;
  private readonly statFile: (filePath: string) => Promise<FileFingerprint>;
  private readonly readMetadata: (filePath: string) => Promise<CodexSessionMetadata | null>;

  constructor(options: CodexWslScanCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
    this.listFiles = options.listFiles ?? listJsonlFiles;
    this.statFile = options.statFile ?? statFingerprint;
    this.readMetadata = options.readMetadata ?? readCodexSessionMetadata;
  }

  async list(
    sessionsRoot: string,
    options: CodexWslScanOptions = {}
  ): Promise<CodexSessionMetadata[]> {
    let cachedRoot = this.roots.get(sessionsRoot);
    if (!cachedRoot) {
      cachedRoot = {
        coveredSinceMs: Number.POSITIVE_INFINITY,
        expiresAt: 0,
        files: new Map(),
        knownFiles: new Set(),
      };
      this.roots.set(sessionsRoot, cachedRoot);
    }

    const activeRefresh = cachedRoot.refresh;
    if (activeRefresh) {
      if (options.forceRefresh && !activeRefresh.force) {
        // 最终回退不能只等待可能已经过期的普通刷新；等待后必须再检查一次磁盘。
        await activeRefresh.promise;
        return this.list(sessionsRoot, options);
      }

      await activeRefresh.promise;
      if (this.coversQuery(cachedRoot, options.newerThanMs)) {
        return this.collectMetadata(cachedRoot, options.newerThanMs);
      }
      return this.list(sessionsRoot, options);
    }

    // 前端会每秒轮询；短时间内直接复用，避免反复访问较慢的 WSL UNC 目录。
    if (
      !options.forceRefresh &&
      this.now() < cachedRoot.expiresAt &&
      this.coversQuery(cachedRoot, options.newerThanMs)
    ) {
      return this.collectMetadata(cachedRoot, options.newerThanMs);
    }

    const refreshPromise = this.refresh(sessionsRoot, cachedRoot, options).finally(() => {
      if (cachedRoot?.refresh?.promise === refreshPromise) delete cachedRoot.refresh;
    });
    cachedRoot.refresh = { force: options.forceRefresh === true, promise: refreshPromise };
    await refreshPromise;
    return this.collectMetadata(cachedRoot, options.newerThanMs);
  }

  async findBySessionId(
    sessionsRoot: string,
    sessionId: string
  ): Promise<CodexSessionMetadata | null> {
    let cachedRoot = this.roots.get(sessionsRoot);
    if (!cachedRoot) {
      cachedRoot = {
        coveredSinceMs: Number.POSITIVE_INFINITY,
        expiresAt: 0,
        files: new Map(),
        knownFiles: new Set(),
      };
      this.roots.set(sessionsRoot, cachedRoot);
    }

    if (cachedRoot.refresh) await cachedRoot.refresh.promise;

    for (const [filePath, cached] of cachedRoot.files) {
      if (cached.metadata?.sessionId !== sessionId) continue;
      const metadata = await this.readCurrentMetadata(cachedRoot, filePath, cached);
      if (metadata?.sessionId === sessionId) return metadata;
    }

    if (cachedRoot.knownFiles.size === 0) {
      cachedRoot.knownFiles = new Set(await this.listFiles(sessionsRoot));
    }

    // 标准 rollout 文件名包含会话号，通常只需读取一个文件。
    const normalizedSessionId = sessionId.toLowerCase();
    const directCandidates = [...cachedRoot.knownFiles].filter((filePath) =>
      path.basename(filePath).toLowerCase().includes(normalizedSessionId)
    );
    for (const filePath of directCandidates) {
      const metadata = await this.readCurrentMetadata(
        cachedRoot,
        filePath,
        cachedRoot.files.get(filePath)
      );
      if (metadata?.sessionId === sessionId) return metadata;
    }

    // 旧版或非标准文件名只能从 JSONL 元数据取得会话号，保留完整扫描作为兼容路径。
    const metadataEntries = await this.list(sessionsRoot, { forceRefresh: true });
    return metadataEntries.find((metadata) => metadata.sessionId === sessionId) ?? null;
  }

  clear(): void {
    this.roots.clear();
  }

  private collectMetadata(root: CachedRoot, newerThanMs?: number): CodexSessionMetadata[] {
    return [...root.files.values()].flatMap(({ metadata }) => {
      if (!metadata) return [];
      if (newerThanMs !== undefined && metadata.createdAtMs < newerThanMs) return [];
      return [metadata];
    });
  }

  private coversQuery(root: CachedRoot, newerThanMs: number | undefined): boolean {
    if (root.coveredSinceMs === null) return true;
    return newerThanMs !== undefined && root.coveredSinceMs <= newerThanMs;
  }

  private async readCurrentMetadata(
    root: CachedRoot,
    filePath: string,
    previous: CachedFileMetadata | undefined
  ): Promise<CodexSessionMetadata | null> {
    let fingerprint: FileFingerprint;
    try {
      fingerprint = await this.statFile(filePath);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      root.files.delete(filePath);
      root.knownFiles.delete(filePath);
      return null;
    }

    if (
      previous &&
      previous.mtimeMs === fingerprint.mtimeMs &&
      previous.size === fingerprint.size
    ) {
      return previous.metadata;
    }

    let metadata: CodexSessionMetadata | null;
    try {
      metadata = await this.readMetadata(filePath);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      root.files.delete(filePath);
      root.knownFiles.delete(filePath);
      return null;
    }

    root.files.set(filePath, {
      mtimeMs: metadata?.fileMtimeMs ?? fingerprint.mtimeMs,
      size: metadata?.fileSize ?? fingerprint.size,
      metadata,
    });
    root.knownFiles.add(filePath);
    return metadata;
  }

  private async refresh(
    sessionsRoot: string,
    root: CachedRoot,
    options: CodexWslScanOptions
  ): Promise<void> {
    const filePaths = await this.listFiles(sessionsRoot);
    const knownFiles = new Set(filePaths);
    const nextFiles = new Map(root.files);
    for (const filePath of nextFiles.keys()) {
      if (!knownFiles.has(filePath)) nextFiles.delete(filePath);
    }

    for (const filePath of filePaths) {
      let fingerprint: FileFingerprint;
      try {
        fingerprint = await this.statFile(filePath);
      } catch (error) {
        if (isMissingFileError(error)) continue;
        throw error;
      }

      // rollout 文件名没有时区信息；近期预筛选只使用文件系统修改时间。
      if (options.newerThanMs !== undefined && fingerprint.mtimeMs < options.newerThanMs) {
        continue;
      }

      const previous = root.files.get(filePath);
      // 缓存过期后仍只重读真正变化的文件，历史越多时节省越明显。
      if (
        previous &&
        previous.mtimeMs === fingerprint.mtimeMs &&
        previous.size === fingerprint.size
      ) {
        nextFiles.set(filePath, previous);
        continue;
      }

      let metadata: CodexSessionMetadata | null;
      try {
        metadata = await this.readMetadata(filePath);
      } catch (error) {
        if (isMissingFileError(error)) continue;
        throw error;
      }
      nextFiles.set(filePath, {
        mtimeMs: metadata?.fileMtimeMs ?? fingerprint.mtimeMs,
        size: metadata?.fileSize ?? fingerprint.size,
        metadata,
      });
    }

    root.files = nextFiles;
    root.knownFiles = knownFiles;
    if (options.newerThanMs === undefined) {
      root.coveredSinceMs = null;
    } else if (root.coveredSinceMs !== null) {
      root.coveredSinceMs = Math.min(root.coveredSinceMs, options.newerThanMs);
    }
    root.expiresAt = this.now() + this.ttlMs;
  }
}
