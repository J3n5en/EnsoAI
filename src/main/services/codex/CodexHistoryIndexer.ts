import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { CodexHistoryIndexStore } from './CodexHistoryIndexStore';
import {
  type CodexSessionMetadata,
  normalizeCwd,
  readCodexSessionMetadata,
  readCodexSessionMetadataFrom,
} from './CodexHistoryMetadata';

const DEFAULT_MAX_CONCURRENT_READS = 4;
const FILE_STAT_BATCH_SIZE = 64;

interface RecentScanOptions {
  maxFiles: number;
  newerThanMs?: number;
  cwd?: string;
  startedAfter?: number;
}

interface FileWithMtime {
  filePath: string;
  mtimeMs: number;
  size: number;
}

export interface CodexHistoryIndexerOptions {
  maxConcurrentReads?: number;
  readMetadata?: typeof readCodexSessionMetadata;
  readMetadataFrom?: typeof readCodexSessionMetadataFrom;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function findAppendReadStart(filePath: string, previousSize: number): Promise<number> {
  if (previousSize <= 0) return 0;

  const file = await open(filePath, 'r');
  try {
    const lastByte = Buffer.allocUnsafe(1);
    const lastRead = await file.read(lastByte, 0, 1, previousSize - 1);
    if (lastRead.bytesRead === 1 && lastByte[0] === 0x0a) return previousSize;

    // 上次写入可能停在半行中间，向前找到该行开头后一起重读。
    const buffer = Buffer.allocUnsafe(4096);
    let searchEnd = previousSize;
    while (searchEnd > 0) {
      const searchStart = Math.max(0, searchEnd - buffer.length);
      const length = searchEnd - searchStart;
      const result = await file.read(buffer, 0, length, searchStart);
      for (let index = result.bytesRead - 1; index >= 0; index -= 1) {
        if (buffer[index] === 0x0a) return searchStart + index + 1;
      }
      searchEnd = searchStart;
    }
    return 0;
  } finally {
    await file.close();
  }
}

export async function listCodexJsonlFiles(root: string): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readCodexDirectory>>;
  try {
    entries = await readCodexDirectory(root);
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listCodexJsonlFiles(filePath)));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(filePath);
    }
  }

  return files;
}

function readCodexDirectory(root: string) {
  return readdir(root, { withFileTypes: true, encoding: 'utf8' });
}

export class CodexHistoryIndexer {
  private readonly maxConcurrentReads: number;
  private readonly readMetadata: typeof readCodexSessionMetadata;
  private readonly readMetadataFrom: typeof readCodexSessionMetadataFrom;
  private readonly fileIndexTails = new Map<string, Promise<void>>();

  constructor(
    private readonly store: CodexHistoryIndexStore,
    private readonly sessionsRoot: string,
    options: CodexHistoryIndexerOptions = {}
  ) {
    this.maxConcurrentReads = Math.max(
      1,
      options.maxConcurrentReads ?? DEFAULT_MAX_CONCURRENT_READS
    );
    this.readMetadata = options.readMetadata ?? readCodexSessionMetadata;
    this.readMetadataFrom = options.readMetadataFrom ?? readCodexSessionMetadataFrom;
  }

  async indexFile(filePath: string): Promise<CodexSessionMetadata | null> {
    const previous = this.fileIndexTails.get(filePath) ?? Promise.resolve();
    const task = previous.then(() => this.indexFileSerial(filePath));
    const tail = task.then(
      () => undefined,
      () => undefined
    );
    this.fileIndexTails.set(filePath, tail);

    try {
      return await task;
    } finally {
      if (this.fileIndexTails.get(filePath) === tail) this.fileIndexTails.delete(filePath);
    }
  }

  private async indexFileSerial(filePath: string): Promise<CodexSessionMetadata | null> {
    let fileState: FileWithMtime;
    try {
      const fileStat = await stat(filePath);
      fileState = { filePath, mtimeMs: fileStat.mtimeMs, size: fileStat.size };
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      await this.store.deleteByFilePath(filePath);
      return null;
    }

    const indexed = await this.store.getSessionMetadataByFilePath(filePath);
    if (
      indexed &&
      indexed.fileMtimeMs === fileState.mtimeMs &&
      indexed.fileSize === fileState.size
    ) {
      return null;
    }

    const metadata =
      indexed && fileState.size > indexed.fileSize
        ? await this.readAppendedMetadataForIndexing(filePath, indexed)
        : await this.readMetadataForIndexing(filePath);
    if (metadata) await this.store.upsertSession(metadata);
    return metadata;
  }

  async indexFiles(filePaths: string[]): Promise<CodexSessionMetadata[]> {
    const indexed: CodexSessionMetadata[] = [];
    for (let start = 0; start < filePaths.length; start += this.maxConcurrentReads) {
      const batch = filePaths.slice(start, start + this.maxConcurrentReads);
      const metadata = (
        await Promise.all(batch.map((filePath) => this.indexFile(filePath)))
      ).filter((record): record is CodexSessionMetadata => record !== null);
      indexed.push(...metadata);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return indexed;
  }

  async runFullScan(): Promise<void> {
    const files = await listCodexJsonlFiles(this.sessionsRoot);
    const [fileStates, indexedFingerprints] = await Promise.all([
      this.getFilesSortedByMtime(files, undefined),
      this.store.getFileFingerprints(),
    ]);
    const changedFiles = fileStates
      .filter(({ filePath, mtimeMs, size }) => {
        const indexed = indexedFingerprints.get(filePath);
        return !indexed || indexed.fileMtimeMs !== mtimeMs || indexed.fileSize !== size;
      })
      .map(({ filePath }) => filePath);

    await this.indexFiles(changedFiles);
    await this.store.deleteMissingFiles(new Set(files));
    await this.store.setState('initial_scan_completed', 'true');
    await this.store.setState('last_full_scan_at_ms', String(Date.now()));
  }

  async runRecentScan(options: RecentScanOptions): Promise<CodexSessionMetadata[]> {
    const files = await listCodexJsonlFiles(this.sessionsRoot);
    const candidates = await this.getFilesSortedByMtime(files, options.newerThanMs);
    const selectedFiles = candidates
      .slice(0, Math.max(0, options.maxFiles))
      .map(({ filePath }) => filePath);
    const metadata = await this.indexFiles(selectedFiles);
    const normalizedCwd = options.cwd ? normalizeCwd(options.cwd) : undefined;

    return metadata.filter((record) => {
      if (normalizedCwd && !record.cwdNormalizedValues.includes(normalizedCwd)) return false;
      return options.startedAfter === undefined || record.createdAtMs >= options.startedAfter;
    });
  }

  private async readMetadataForIndexing(filePath: string): Promise<CodexSessionMetadata | null> {
    try {
      return await this.readMetadata(filePath);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;

      // 文件在索引时被删除时，直接清掉旧记录，避免留下过期索引。
      await this.store.deleteByFilePath(filePath);
      return null;
    }
  }

  private async readAppendedMetadataForIndexing(
    filePath: string,
    indexed: CodexSessionMetadata
  ): Promise<CodexSessionMetadata | null> {
    try {
      const startByte = await findAppendReadStart(filePath, indexed.fileSize);
      return await this.readMetadataFrom(filePath, startByte, indexed);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;

      await this.store.deleteByFilePath(filePath);
      return null;
    }
  }

  private async getFilesSortedByMtime(
    filePaths: string[],
    newerThanMs: number | undefined
  ): Promise<FileWithMtime[]> {
    const results: FileWithMtime[] = [];
    for (let start = 0; start < filePaths.length; start += FILE_STAT_BATCH_SIZE) {
      const batch = filePaths.slice(start, start + FILE_STAT_BATCH_SIZE);
      const states = await Promise.all(
        batch.map(async (filePath): Promise<FileWithMtime | null> => {
          try {
            const fileStat = await stat(filePath);
            if (newerThanMs !== undefined && fileStat.mtimeMs < newerThanMs) return null;
            return { filePath, mtimeMs: fileStat.mtimeMs, size: fileStat.size };
          } catch (error) {
            if (isMissingFileError(error)) return null;
            throw error;
          }
        })
      );
      results.push(...states.filter((state): state is FileWithMtime => state !== null));
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return results.sort((left, right) => right.mtimeMs - left.mtimeMs);
  }
}
