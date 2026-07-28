import { mkdir } from 'node:fs/promises';
import { type FileChangeCallback, FileWatcher } from '../files/FileWatcher';

type CodexHistoryEventType = 'create' | 'update' | 'delete';

interface CodexHistoryIndexerLike {
  indexFile(filePath: string): Promise<unknown>;
}

interface CodexHistoryIndexStoreLike {
  deleteByFilePath(filePath: string): Promise<void>;
}

interface CodexHistoryWatcherSubscription {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type CodexHistoryWatcherFactory = (
  directory: string,
  callback: FileChangeCallback
) => CodexHistoryWatcherSubscription;

interface CodexHistoryWatcherOptions {
  debounceMs?: number;
  fileWatcherFactory?: CodexHistoryWatcherFactory;
  ensureDirectory?: (directory: string) => Promise<void>;
}

export interface CodexHistoryWatcherStartOptions {
  paused?: boolean;
}

const DEFAULT_DEBOUNCE_MS = 300;

export class CodexHistoryWatcher {
  private readonly debounceMs: number;
  private readonly fileWatcherFactory: CodexHistoryWatcherFactory;
  private readonly ensureDirectory: (directory: string) => Promise<void>;
  private pendingEvents = new Map<string, CodexHistoryEventType>();
  private pendingTimers = new Map<string, NodeJS.Timeout>();
  private pendingWrites = new Set<Promise<void>>();
  private processingPaused = false;
  private runningPaths = new Set<string>();
  private rerunEvents = new Map<string, CodexHistoryEventType>();
  private watcher: CodexHistoryWatcherSubscription | null = null;
  private stopped = true;
  private startVersion = 0;

  constructor(
    private readonly sessionsRoot: string,
    private readonly indexer: CodexHistoryIndexerLike,
    private readonly store: CodexHistoryIndexStoreLike,
    options: CodexHistoryWatcherOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.fileWatcherFactory =
      options.fileWatcherFactory ?? ((directory, callback) => new FileWatcher(directory, callback));
    this.ensureDirectory =
      options.ensureDirectory ??
      (async (directory) => {
        await mkdir(directory, { recursive: true });
      });
  }

  async start(options: CodexHistoryWatcherStartOptions = {}): Promise<void> {
    if (!this.stopped) return;

    const version = ++this.startVersion;
    this.stopped = false;
    this.processingPaused = options.paused ?? false;

    try {
      await this.ensureDirectory(this.sessionsRoot);
    } catch (error) {
      if (version === this.startVersion) this.stopped = true;
      throw error;
    }
    if (this.stopped || version !== this.startVersion) return;

    let watcher: CodexHistoryWatcherSubscription | null = null;
    try {
      watcher = this.fileWatcherFactory(this.sessionsRoot, this.handleFileChange);
      this.watcher = watcher;
      await watcher.start();
    } catch (error) {
      console.error('[CodexHistoryWatcher] 启动文件监听失败：', error);
      if (watcher && this.watcher === watcher) this.watcher = null;
      if (version === this.startVersion) this.stopped = true;
      throw error;
    }

    if (!watcher) return;
    if (this.stopped || version !== this.startVersion) {
      if (this.watcher === watcher) this.watcher = null;
      // stop 可能早于底层 start 完成；启动完成后必须再停一次，避免留下监听器。
      await watcher.stop().catch((error) => {
        console.error('[CodexHistoryWatcher] 停止过期文件监听失败：', error);
      });
    }
  }

  resume(): void {
    if (this.stopped || !this.processingPaused) return;
    this.processingPaused = false;
    for (const filePath of this.pendingEvents.keys()) this.scheduleFlush(filePath, 0);
  }

  async stop(): Promise<void> {
    this.startVersion += 1;
    const watcher = this.watcher;
    this.stopped = true;
    this.clearPendingEvents();
    this.watcher = null;

    try {
      await watcher?.stop();
    } catch (error) {
      console.error('[CodexHistoryWatcher] 停止文件监听失败：', error);
    }

    // 所有已启动的索引写入完成后，调用方才能安全关闭数据库。
    await Promise.allSettled([...this.pendingWrites]);
  }

  stopSync(): void {
    this.startVersion += 1;
    this.stopped = true;
    this.clearPendingEvents();

    const watcher = this.watcher;
    this.watcher = null;
    void watcher?.stop().catch((error) => {
      console.error('[CodexHistoryWatcher] 停止文件监听失败：', error);
    });
  }

  private clearPendingEvents(): void {
    for (const timer of this.pendingTimers.values()) clearTimeout(timer);
    this.pendingTimers.clear();
    this.pendingEvents.clear();
    this.rerunEvents.clear();
  }

  private mergeEvent(
    events: Map<string, CodexHistoryEventType>,
    type: CodexHistoryEventType,
    filePath: string
  ): void {
    if (events.get(filePath) === 'delete') return;
    events.set(filePath, type);
  }

  private handleFileChange = (type: CodexHistoryEventType, filePath: string): void => {
    if (this.stopped || !filePath.endsWith('.jsonl')) return;

    // 删除事件优先，避免同一批通知又把已删除的记录重新写入索引。
    this.mergeEvent(this.pendingEvents, type, filePath);
    if (this.processingPaused) return;
    this.scheduleFlush(filePath);
  };

  private scheduleFlush(filePath: string, delayMs = this.debounceMs): void {
    const existingTimer = this.pendingTimers.get(filePath);
    if (existingTimer) clearTimeout(existingTimer);
    this.pendingTimers.set(
      filePath,
      setTimeout(() => this.flushEvent(filePath), delayMs)
    );
  }

  private flushEvent(filePath: string): void {
    const type = this.pendingEvents.get(filePath);
    this.pendingEvents.delete(filePath);
    this.pendingTimers.delete(filePath);
    if (!type || this.stopped) return;
    if (this.processingPaused) {
      this.mergeEvent(this.pendingEvents, type, filePath);
      return;
    }
    if (this.runningPaths.has(filePath)) {
      this.mergeEvent(this.rerunEvents, type, filePath);
      return;
    }
    this.startWrite(type, filePath);
  }

  private startWrite(type: CodexHistoryEventType, filePath: string): void {
    this.runningPaths.add(filePath);
    let write: Promise<void>;
    write = this.applyEvent(type, filePath).finally(() => {
      this.pendingWrites.delete(write);
      this.runningPaths.delete(filePath);
      const rerunType = this.rerunEvents.get(filePath);
      this.rerunEvents.delete(filePath);
      if (!rerunType || this.stopped) return;
      this.mergeEvent(this.pendingEvents, rerunType, filePath);
      if (!this.processingPaused) this.scheduleFlush(filePath, 0);
    });
    this.pendingWrites.add(write);
  }

  private async applyEvent(type: CodexHistoryEventType, filePath: string): Promise<void> {
    try {
      if (type === 'delete') {
        await this.store.deleteByFilePath(filePath);
      } else {
        await this.indexer.indexFile(filePath);
      }
    } catch (error) {
      console.error('[CodexHistoryWatcher] 更新会话索引失败：', error);
    }
  }
}
