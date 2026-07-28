import { appendFile, mkdir, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexHistoryIndexer } from '../CodexHistoryIndexer';
import { CodexHistoryIndexStore } from '../CodexHistoryIndexStore';
import { readCodexSessionMetadata, readCodexSessionMetadataFrom } from '../CodexHistoryMetadata';

const testDirectories: string[] = [];
const testStores: CodexHistoryIndexStore[] = [];

function createSessionContent(cwdValues: string[], timestamp: string): string {
  return cwdValues
    .map((cwd, index) =>
      JSON.stringify({
        type: index === 0 ? 'session_meta' : 'turn_context',
        payload: { cwd, timestamp },
      })
    )
    .join('\n');
}

function createUserTitleLine(title: string): string {
  return JSON.stringify({
    type: 'response_item',
    payload: { role: 'user', content: [{ type: 'input_text', text: title }] },
  });
}

async function createTestContext(): Promise<{
  root: string;
  store: CodexHistoryIndexStore;
  indexer: CodexHistoryIndexer;
}> {
  const root = path.join(os.tmpdir(), `enso-codex-indexer-${Date.now()}-${Math.random()}`);
  testDirectories.push(root);
  await mkdir(root, { recursive: true });

  const store = new CodexHistoryIndexStore(path.join(root, 'codex-history-index.db'));
  await store.initialize();
  testStores.push(store);

  return { root, store, indexer: new CodexHistoryIndexer(store, root) };
}

async function createSessionFile(
  root: string,
  filename: string,
  cwdValues: string[],
  timestamp: string
): Promise<string> {
  const directory = path.join(root, '2026', '07', '20');
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  await writeFile(filePath, createSessionContent(cwdValues, timestamp), 'utf8');
  return filePath;
}

afterEach(async () => {
  await Promise.all(testStores.splice(0).map((store) => store.close()));
  await Promise.all(
    testDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('CodexHistoryIndexer', () => {
  it('indexes one file and writes every cwd mapping', async () => {
    const { root, store, indexer } = await createTestContext();
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`,
      ['D:/work/current', 'D:/work/linked'],
      '2026-07-20T09:00:00.000Z'
    );

    await expect(indexer.indexFile(filePath)).resolves.toMatchObject({ sessionId, filePath });
    await expect(store.getSessionFilePath(sessionId)).resolves.toBe(filePath);
    await expect(store.listSessions({ cwd: 'D:/work/current' })).resolves.toHaveLength(1);
    await expect(store.listSessions({ cwd: 'D:\\work\\linked' })).resolves.toHaveLength(1);
  });

  it('removes a stale index record when a file disappears before indexing', async () => {
    const { root, store, indexer } = await createTestContext();
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );

    await indexer.indexFile(filePath);
    await unlink(filePath);

    await expect(indexer.indexFile(filePath)).resolves.toBeNull();
    await expect(store.getSessionFilePath(sessionId)).resolves.toBeNull();
  });

  it('records full-scan state and removes records for deleted files', async () => {
    const { root, store, indexer } = await createTestContext();
    const retainedSessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const deletedSessionId = '11996abf-bc87-7e80-9909-3a86a414f7e8';
    await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${retainedSessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );
    const deletedFilePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-01-${deletedSessionId}.jsonl`,
      ['D:/work/deleted'],
      '2026-07-20T09:00:01.000Z'
    );

    await indexer.runFullScan();
    await unlink(deletedFilePath);
    await indexer.runFullScan();

    await expect(store.getState('initial_scan_completed')).resolves.toBe('true');
    await expect(store.getState('last_full_scan_at_ms')).resolves.toMatch(/^\d+$/);
    await expect(store.getSessionFilePath(retainedSessionId)).resolves.not.toBeNull();
    await expect(store.getSessionFilePath(deletedSessionId)).resolves.toBeNull();
  });

  it('indexes only the newest files during a recent scan', async () => {
    const { root, indexer } = await createTestContext();
    const olderSessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const newerSessionId = '11996abf-bc87-7e80-9909-3a86a414f7e8';
    const olderFilePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${olderSessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );
    const newerFilePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-01-${newerSessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:01.000Z'
    );
    const now = Date.now();
    await utimes(olderFilePath, new Date(now - 10_000), new Date(now - 10_000));
    await utimes(newerFilePath, new Date(now), new Date(now));

    await expect(indexer.runRecentScan({ maxFiles: 1 })).resolves.toMatchObject([
      { sessionId: newerSessionId, filePath: newerFilePath },
    ]);
  });

  it('filters recent scan metadata by cwd, modification time, and creation time', async () => {
    const { root, indexer } = await createTestContext();
    const matchedSessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${matchedSessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );
    await createSessionFile(
      root,
      'rollout-2026-07-20T09-00-01-11996abf-bc87-7e80-9909-3a86a414f7e8.jsonl',
      ['D:/work/other'],
      '2026-07-20T09:00:01.000Z'
    );

    await expect(
      indexer.runRecentScan({
        maxFiles: 10,
        newerThanMs: 0,
        cwd: 'D:\\WORK\\CURRENT',
        startedAfter: Date.parse('2026-07-20T08:59:00.000Z'),
      })
    ).resolves.toMatchObject([{ sessionId: matchedSessionId }]);
  });

  it('skips unchanged files on the second full scan', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-indexer-skip-${Date.now()}-${Math.random()}`);
    testDirectories.push(root);
    await mkdir(root, { recursive: true });
    const store = new CodexHistoryIndexStore(path.join(root, 'index.db'));
    await store.initialize();
    testStores.push(store);
    const readMetadata = vi.fn(readCodexSessionMetadata);
    const indexer = new CodexHistoryIndexer(store, root, { readMetadata });
    const sessionId = '51996abf-bc87-7e80-9909-3a86a414f7e8';
    await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );

    await indexer.runFullScan();
    expect(readMetadata).toHaveBeenCalledTimes(1);

    await indexer.runFullScan();
    expect(readMetadata).toHaveBeenCalledTimes(1);
  });

  it('reindexes only the file whose size or mtime changed', async () => {
    const { root, store } = await createTestContext();
    const readMetadata = vi.fn(readCodexSessionMetadata);
    const readMetadataFrom = vi.fn(readCodexSessionMetadataFrom);
    const indexer = new CodexHistoryIndexer(store, root, { readMetadata, readMetadataFrom });
    const firstId = '61996abf-bc87-7e80-9909-3a86a414f7e8';
    const secondId = '71996abf-bc87-7e80-9909-3a86a414f7e8';
    const firstPath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${firstId}.jsonl`,
      ['D:/work/first'],
      '2026-07-20T09:00:00.000Z'
    );
    await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-01-${secondId}.jsonl`,
      ['D:/work/second'],
      '2026-07-20T09:00:01.000Z'
    );
    await indexer.runFullScan();
    readMetadata.mockClear();
    readMetadataFrom.mockClear();

    await writeFile(
      firstPath,
      createSessionContent(['D:/work/first', 'D:/work/changed'], '2026-07-20T09:00:00.000Z'),
      'utf8'
    );
    await indexer.runFullScan();

    expect(readMetadata).not.toHaveBeenCalled();
    expect(readMetadataFrom).toHaveBeenCalledTimes(1);
    expect(readMetadataFrom).toHaveBeenCalledWith(
      firstPath,
      expect.any(Number),
      expect.any(Object)
    );
  });

  it('incrementally indexes cwd and model appended after a title', async () => {
    const { root, store } = await createTestContext();
    const readMetadata = vi.fn(readCodexSessionMetadata);
    const readMetadataFrom = vi.fn(readCodexSessionMetadataFrom);
    const indexer = new CodexHistoryIndexer(store, root, { readMetadata, readMetadataFrom });
    const sessionId = '81996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );
    await appendFile(filePath, `\n${createUserTitleLine('真实任务')}`, 'utf8');
    await indexer.indexFile(filePath);

    await appendFile(
      filePath,
      `\n${JSON.stringify({
        type: 'turn_context',
        payload: { cwd: 'D:/work/appended', model: 'gpt-appended' },
      })}`,
      'utf8'
    );
    await indexer.indexFile(filePath);

    expect(readMetadata).toHaveBeenCalledTimes(1);
    expect((await store.getFileState(filePath))?.fileSize).toBe((await stat(filePath)).size);
    await expect(store.listSessions({ cwd: 'D:/work/appended' })).resolves.toMatchObject([
      { model: 'gpt-appended' },
    ]);
  });

  it('re-reads an incomplete appended JSONL line after the line is completed', async () => {
    const { root, store, indexer } = await createTestContext();
    const sessionId = '82996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );
    await appendFile(filePath, `\n${createUserTitleLine('真实任务')}`, 'utf8');
    await indexer.indexFile(filePath);

    const appendedLine = JSON.stringify({
      type: 'turn_context',
      payload: { cwd: 'D:/work/completed-later' },
    });
    const splitAt = Math.floor(appendedLine.length / 2);
    await appendFile(filePath, `\n${appendedLine.slice(0, splitAt)}`, 'utf8');
    await indexer.indexFile(filePath);
    await expect(store.listSessions({ cwd: 'D:/work/completed-later' })).resolves.toEqual([]);

    await appendFile(filePath, `${appendedLine.slice(splitAt)}\n`, 'utf8');
    await indexer.indexFile(filePath);

    await expect(store.listSessions({ cwd: 'D:/work/completed-later' })).resolves.toHaveLength(1);
  });

  it('serializes overlapping index requests for the same file', async () => {
    const { root, store } = await createTestContext();
    let activeReads = 0;
    let maxActiveReads = 0;
    let incrementalReadCount = 0;
    let releaseFirstRead: () => void = () => {};
    let notifyFirstSnapshot: () => void = () => {};
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    const firstSnapshotReady = new Promise<void>((resolve) => {
      notifyFirstSnapshot = resolve;
    });
    const readMetadataFrom = vi.fn(
      async (...args: Parameters<typeof readCodexSessionMetadataFrom>) => {
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        const metadata = await readCodexSessionMetadataFrom(...args);
        incrementalReadCount += 1;
        if (incrementalReadCount === 1) {
          notifyFirstSnapshot();
          await firstReadGate;
        }
        activeReads -= 1;
        return metadata;
      }
    );
    const indexer = new CodexHistoryIndexer(store, root, { readMetadataFrom });
    const sessionId = '83996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );
    await appendFile(filePath, `\n${createUserTitleLine('真实任务')}`, 'utf8');
    await indexer.indexFile(filePath);

    await appendFile(
      filePath,
      `\n${JSON.stringify({ type: 'turn_context', payload: { cwd: 'D:/work/first-append' } })}`,
      'utf8'
    );
    const firstIndex = indexer.indexFile(filePath);
    await firstSnapshotReady;

    await appendFile(
      filePath,
      `\n${JSON.stringify({ type: 'turn_context', payload: { cwd: 'D:/work/second-append' } })}`,
      'utf8'
    );
    const secondIndex = indexer.indexFile(filePath);
    releaseFirstRead();
    await Promise.all([firstIndex, secondIndex]);

    expect(maxActiveReads).toBe(1);
    expect(readMetadataFrom).toHaveBeenCalledTimes(2);
    await expect(store.listSessions({ cwd: 'D:/work/first-append' })).resolves.toHaveLength(1);
    await expect(store.listSessions({ cwd: 'D:/work/second-append' })).resolves.toHaveLength(1);
  });

  it('reparses an appended session until its first user title is indexed', async () => {
    const { root, store } = await createTestContext();
    const readMetadata = vi.fn(readCodexSessionMetadata);
    const readMetadataFrom = vi.fn(readCodexSessionMetadataFrom);
    const indexer = new CodexHistoryIndexer(store, root, { readMetadata, readMetadataFrom });
    const sessionId = '91996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`,
      ['D:/work/current'],
      '2026-07-20T09:00:00.000Z'
    );
    await indexer.indexFile(filePath);

    await appendFile(filePath, `\n${createUserTitleLine('真实任务')}`, 'utf8');
    await indexer.indexFile(filePath);

    expect(readMetadata).toHaveBeenCalledTimes(1);
    expect(readMetadataFrom).toHaveBeenCalledTimes(1);
    await expect(store.listSessions({ cwd: 'D:/work/current' })).resolves.toMatchObject([
      { title: '真实任务' },
    ]);
  });

  it('reparses a titled session when its file shrinks', async () => {
    const { root, store } = await createTestContext();
    const readMetadata = vi.fn(readCodexSessionMetadata);
    const indexer = new CodexHistoryIndexer(store, root, { readMetadata });
    const sessionId = 'a1996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`,
      ['D:/work/current', 'D:/work/linked', 'D:/work/extra'],
      '2026-07-20T09:00:00.000Z'
    );
    await appendFile(filePath, `\n${createUserTitleLine('较长的真实任务标题')}`, 'utf8');
    await indexer.indexFile(filePath);

    await writeFile(
      filePath,
      `${createSessionContent(['D:/work/current'], '2026-07-20T09:00:00.000Z')}\n${createUserTitleLine('短标题')}`,
      'utf8'
    );
    await indexer.indexFile(filePath);

    expect(readMetadata).toHaveBeenCalledTimes(2);
    await expect(store.listSessions({ cwd: 'D:/work/linked' })).resolves.toEqual([]);
    await expect(store.listSessions({ cwd: 'D:/work/current' })).resolves.toMatchObject([
      { title: '短标题' },
    ]);
  });

  it('never exceeds the configured metadata read concurrency', async () => {
    const { root, store } = await createTestContext();
    let active = 0;
    let maxActive = 0;
    const readMetadata = vi.fn(async (filePath: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const metadata = await readCodexSessionMetadata(filePath);
      active -= 1;
      return metadata;
    });
    const indexer = new CodexHistoryIndexer(store, root, {
      maxConcurrentReads: 2,
      readMetadata,
    });
    for (let index = 0; index < 6; index += 1) {
      await createSessionFile(
        root,
        `rollout-2026-07-20T09-00-0${index}-${index}1996abf-bc87-7e80-9909-3a86a414f7e8.jsonl`,
        [`D:/work/${index}`],
        `2026-07-20T09:00:0${index}.000Z`
      );
    }

    await indexer.runFullScan();

    expect(maxActive).toBe(2);
  });
});
