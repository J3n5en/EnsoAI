import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexHistoryWatcher, type CodexHistoryWatcherFactory } from '../CodexHistoryWatcher';

describe('CodexHistoryWatcher', () => {
  const testDirectories: string[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(
      testDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  function createWatcher() {
    const sessionsRoot = path.join(
      os.tmpdir(),
      `enso-codex-watcher-${Date.now()}-${crypto.randomUUID()}`
    );
    testDirectories.push(sessionsRoot);
    let callback: ((type: 'create' | 'update' | 'delete', filePath: string) => void) | null = null;
    const start = vi.fn<() => Promise<void>>().mockResolvedValue();
    const stop = vi.fn<() => Promise<void>>().mockResolvedValue();
    const factory: CodexHistoryWatcherFactory = (_directory, nextCallback) => {
      callback = nextCallback;
      return { start, stop };
    };
    const indexer = {
      indexFile: vi.fn<(filePath: string) => Promise<null>>().mockResolvedValue(null),
    };
    const store = {
      deleteByFilePath: vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(),
    };
    const watcher = new CodexHistoryWatcher(sessionsRoot, indexer, store, {
      fileWatcherFactory: factory,
    });

    return {
      emit: (type: 'create' | 'update' | 'delete', filePath: string) => callback?.(type, filePath),
      indexer,
      start,
      stop,
      store,
      watcher,
      sessionsRoot,
    };
  }

  it('creates the sessions directory before constructing the file watcher', async () => {
    const fixture = createWatcher();
    const factory = vi.fn<CodexHistoryWatcherFactory>((directory) => {
      expect(directory).toBe(fixture.sessionsRoot);
      expect(existsSync(directory)).toBe(true);
      return {
        start: vi.fn<() => Promise<void>>().mockResolvedValue(),
        stop: vi.fn<() => Promise<void>>().mockResolvedValue(),
      };
    });
    const watcher = new CodexHistoryWatcher(fixture.sessionsRoot, fixture.indexer, fixture.store, {
      fileWatcherFactory: factory,
    });

    await watcher.start();

    expect(factory).toHaveBeenCalledOnce();
    await watcher.stop();
  });

  it('does not construct a watcher when stopped while creating the directory', async () => {
    let finishDirectory: (() => void) | undefined;
    const ensureDirectory = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDirectory = resolve;
        })
    );
    const factory = vi.fn<CodexHistoryWatcherFactory>();
    const fixture = createWatcher();
    const watcher = new CodexHistoryWatcher(fixture.sessionsRoot, fixture.indexer, fixture.store, {
      ensureDirectory,
      fileWatcherFactory: factory,
    });

    const starting = watcher.start();
    await watcher.stop();
    finishDirectory?.();
    await starting;

    expect(factory).not.toHaveBeenCalled();
  });

  it('stops again after an underlying watcher finishes a stale start', async () => {
    let finishStart: (() => void) | undefined;
    const underlyingStart = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishStart = resolve;
        })
    );
    const underlyingStop = vi.fn<() => Promise<void>>().mockResolvedValue();
    const fixture = createWatcher();
    const watcher = new CodexHistoryWatcher(fixture.sessionsRoot, fixture.indexer, fixture.store, {
      ensureDirectory: vi.fn().mockResolvedValue(undefined),
      fileWatcherFactory: () => ({ start: underlyingStart, stop: underlyingStop }),
    });

    const starting = watcher.start();
    await Promise.resolve();
    const stopping = watcher.stop();
    finishStart?.();
    await Promise.all([starting, stopping]);

    expect(underlyingStart).toHaveBeenCalledOnce();
    expect(underlyingStop).toHaveBeenCalledTimes(2);
  });

  it('ignores paths that are not .jsonl files', async () => {
    vi.useFakeTimers();
    const fixture = createWatcher();
    await fixture.watcher.start();

    fixture.emit('update', '/sessions/notes.txt');
    await vi.advanceTimersByTimeAsync(300);

    expect(fixture.indexer.indexFile).not.toHaveBeenCalled();
    expect(fixture.store.deleteByFilePath).not.toHaveBeenCalled();
  });

  it('indexes one time for repeated updates within the debounce window', async () => {
    vi.useFakeTimers();
    const fixture = createWatcher();
    await fixture.watcher.start();

    fixture.emit('update', '/sessions/one.jsonl');
    await vi.advanceTimersByTimeAsync(200);
    fixture.emit('update', '/sessions/one.jsonl');
    await vi.advanceTimersByTimeAsync(300);

    expect(fixture.indexer.indexFile).toHaveBeenCalledTimes(1);
    expect(fixture.indexer.indexFile).toHaveBeenCalledWith('/sessions/one.jsonl');
  });

  it('removes the indexed record when a file is deleted', async () => {
    vi.useFakeTimers();
    const fixture = createWatcher();
    await fixture.watcher.start();

    fixture.emit('delete', '/sessions/removed.jsonl');
    await vi.advanceTimersByTimeAsync(300);

    expect(fixture.store.deleteByFilePath).toHaveBeenCalledWith('/sessions/removed.jsonl');
    expect(fixture.indexer.indexFile).not.toHaveBeenCalled();
  });

  it('keeps delete when another event for the same file is pending', async () => {
    vi.useFakeTimers();
    const fixture = createWatcher();
    await fixture.watcher.start();

    fixture.emit('create', '/sessions/removed.jsonl');
    fixture.emit('delete', '/sessions/removed.jsonl');
    await vi.advanceTimersByTimeAsync(300);

    expect(fixture.store.deleteByFilePath).toHaveBeenCalledWith('/sessions/removed.jsonl');
    expect(fixture.indexer.indexFile).not.toHaveBeenCalled();
  });

  it('indexes one time when create is followed by update for the same file', async () => {
    vi.useFakeTimers();
    const fixture = createWatcher();
    await fixture.watcher.start();

    fixture.emit('create', '/sessions/new.jsonl');
    await vi.advanceTimersByTimeAsync(100);
    fixture.emit('update', '/sessions/new.jsonl');
    await vi.advanceTimersByTimeAsync(300);

    expect(fixture.indexer.indexFile).toHaveBeenCalledTimes(1);
    expect(fixture.indexer.indexFile).toHaveBeenCalledWith('/sessions/new.jsonl');
  });

  it('waits for an in-progress index write before stopping', async () => {
    vi.useFakeTimers();
    const fixture = createWatcher();
    let resolveIndex: (() => void) | undefined;
    fixture.indexer.indexFile.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveIndex = () => resolve(null);
        })
    );
    await fixture.watcher.start();

    fixture.emit('update', '/sessions/writing.jsonl');
    await vi.advanceTimersByTimeAsync(300);

    let stopped = false;
    const stopPromise = fixture.watcher.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();

    expect(stopped).toBe(false);

    resolveIndex?.();
    await stopPromise;

    expect(stopped).toBe(true);
  });

  it('buffers file events while paused and flushes each path after resume', async () => {
    vi.useFakeTimers();
    const fixture = createWatcher();
    await fixture.watcher.start({ paused: true });

    fixture.emit('update', '/sessions/one.jsonl');
    fixture.emit('update', '/sessions/one.jsonl');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fixture.indexer.indexFile).not.toHaveBeenCalled();

    fixture.watcher.resume();
    await vi.runAllTimersAsync();
    expect(fixture.indexer.indexFile).toHaveBeenCalledTimes(1);
  });

  it('runs at most one index call and one follow-up for updates during a write', async () => {
    vi.useFakeTimers();
    const fixture = createWatcher();
    const resolvers: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    fixture.indexer.indexFile.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          resolvers.push(() => {
            active -= 1;
            resolve(null);
          });
        })
    );
    await fixture.watcher.start();

    fixture.emit('update', '/sessions/active.jsonl');
    await vi.advanceTimersByTimeAsync(300);
    expect(fixture.indexer.indexFile).toHaveBeenCalledTimes(1);

    fixture.emit('update', '/sessions/active.jsonl');
    fixture.emit('update', '/sessions/active.jsonl');
    await vi.advanceTimersByTimeAsync(300);
    expect(fixture.indexer.indexFile).toHaveBeenCalledTimes(1);

    resolvers.shift()?.();
    await vi.runAllTimersAsync();
    expect(fixture.indexer.indexFile).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);

    resolvers.shift()?.();
    await Promise.resolve();
  });

  it('allows another start after the underlying watcher fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const firstStart = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('unavailable'));
    const secondStart = vi.fn<() => Promise<void>>().mockResolvedValue();
    const factory = vi
      .fn<CodexHistoryWatcherFactory>()
      .mockReturnValueOnce({
        start: firstStart,
        stop: vi.fn<() => Promise<void>>().mockResolvedValue(),
      })
      .mockReturnValueOnce({
        start: secondStart,
        stop: vi.fn<() => Promise<void>>().mockResolvedValue(),
      });
    const sessionsRoot = path.join(
      os.tmpdir(),
      `enso-codex-watcher-retry-${Date.now()}-${crypto.randomUUID()}`
    );
    testDirectories.push(sessionsRoot);
    const watcher = new CodexHistoryWatcher(
      sessionsRoot,
      { indexFile: vi.fn<(filePath: string) => Promise<null>>().mockResolvedValue(null) },
      { deleteByFilePath: vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue() },
      { fileWatcherFactory: factory }
    );

    try {
      await expect(watcher.start()).rejects.toThrow('unavailable');
      await expect(watcher.start()).resolves.toBeUndefined();
    } finally {
      errorSpy.mockRestore();
    }

    expect(factory).toHaveBeenCalledTimes(2);
    expect(secondStart).toHaveBeenCalledOnce();
  });

  it('allows another start after constructing the underlying watcher fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fixture = createWatcher();
    const start = vi.fn<() => Promise<void>>().mockResolvedValue();
    const factory = vi
      .fn<CodexHistoryWatcherFactory>()
      .mockImplementationOnce(() => {
        throw new Error('factory unavailable');
      })
      .mockReturnValueOnce({
        start,
        stop: vi.fn<() => Promise<void>>().mockResolvedValue(),
      });
    const watcher = new CodexHistoryWatcher(fixture.sessionsRoot, fixture.indexer, fixture.store, {
      fileWatcherFactory: factory,
    });

    try {
      await expect(watcher.start()).rejects.toThrow('factory unavailable');
      await expect(watcher.start()).resolves.toBeUndefined();
    } finally {
      errorSpy.mockRestore();
    }

    expect(factory).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledOnce();
  });
});
