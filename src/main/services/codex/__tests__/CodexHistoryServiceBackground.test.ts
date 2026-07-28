import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  indexers: [] as Array<{ runFullScan: ReturnType<typeof vi.fn> }>,
  watchers: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/user-data') } }));

vi.mock('../CodexHistoryIndexer', () => ({
  CodexHistoryIndexer: class {
    runFullScan = vi.fn<() => Promise<void>>().mockResolvedValue();

    constructor() {
      mocks.indexers.push(this);
    }
  },
}));

vi.mock('../CodexHistoryWatcher', () => ({
  CodexHistoryWatcher: class {
    start = vi.fn<() => Promise<void>>().mockResolvedValue();
    resume = vi.fn<() => void>();

    constructor() {
      mocks.watchers.push(this);
    }

    stop = vi.fn<() => Promise<void>>().mockResolvedValue();
    stopSync = vi.fn<() => void>();
  },
}));

import {
  cleanupCodexHistoryIndex,
  initializeCodexHistoryIndex,
  startCodexHistoryBackgroundIndexing,
} from '../CodexHistoryService';

describe('CodexHistoryService background indexing', () => {
  afterEach(async () => {
    await cleanupCodexHistoryIndex();
    vi.useRealTimers();
    mocks.indexers.length = 0;
    mocks.watchers.length = 0;
  });

  it('waits for the watcher before running a full scan', async () => {
    let resolveStart: (() => void) | undefined;
    const startReady = new Promise<void>((resolve) => {
      resolveStart = resolve;
    });

    await initializeCodexHistoryIndex({ dbPath: ':memory:', sessionsRoot: '/sessions' });
    const watcher = mocks.watchers[0];
    const indexer = mocks.indexers[0];
    watcher.start.mockImplementationOnce(() => startReady);

    const start = startCodexHistoryBackgroundIndexing();
    expect(indexer.runFullScan).not.toHaveBeenCalled();

    resolveStart?.();
    await start;

    expect(watcher.start).toHaveBeenCalledBefore(indexer.runFullScan);
    expect(watcher.resume).toHaveBeenCalledAfter(indexer.runFullScan);
  });

  it('allows a retry after the watcher fails to start', async () => {
    vi.useFakeTimers();
    await initializeCodexHistoryIndex({ dbPath: ':memory:', sessionsRoot: '/sessions' });
    const watcher = mocks.watchers[0];
    const indexer = mocks.indexers[0];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    watcher.start.mockRejectedValueOnce(new Error('watcher unavailable'));

    try {
      await startCodexHistoryBackgroundIndexing();
      expect(watcher.start).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(2000);
    } finally {
      errorSpy.mockRestore();
    }

    expect(watcher.start).toHaveBeenCalledTimes(2);
    expect(indexer.runFullScan).toHaveBeenCalledTimes(1);
    expect(watcher.resume).toHaveBeenCalledOnce();
  });

  it('cancels a pending retry during cleanup', async () => {
    vi.useFakeTimers();
    await initializeCodexHistoryIndex({ dbPath: ':memory:', sessionsRoot: '/sessions' });
    const watcher = mocks.watchers[0];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    watcher.start.mockRejectedValueOnce(new Error('watcher unavailable'));

    try {
      await startCodexHistoryBackgroundIndexing();
      await cleanupCodexHistoryIndex();
      await vi.advanceTimersByTimeAsync(2000);
    } finally {
      errorSpy.mockRestore();
    }

    expect(watcher.start).toHaveBeenCalledOnce();
  });
});
