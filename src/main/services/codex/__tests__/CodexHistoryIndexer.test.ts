import { mkdir, rm, unlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexHistoryIndexer } from '../CodexHistoryIndexer';
import { CodexHistoryIndexStore } from '../CodexHistoryIndexStore';
import { readCodexSessionMetadata } from '../CodexHistoryMetadata';

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
    const indexer = new CodexHistoryIndexer(store, root, { readMetadata });
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

    await writeFile(
      firstPath,
      createSessionContent(['D:/work/first', 'D:/work/changed'], '2026-07-20T09:00:00.000Z'),
      'utf8'
    );
    await indexer.runFullScan();

    expect(readMetadata).toHaveBeenCalledTimes(1);
    expect(readMetadata).toHaveBeenCalledWith(firstPath);
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
