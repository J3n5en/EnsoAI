import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexHistoryIndexStore } from '../CodexHistoryIndexStore';
import type { CodexSessionMetadata } from '../CodexHistoryMetadata';

const testDirectories: string[] = [];
const testStores: CodexHistoryIndexStore[] = [];

function createRecord(overrides: Partial<CodexSessionMetadata> = {}): CodexSessionMetadata {
  return {
    sessionId: '01996abf-bc87-7e80-9909-3a86a414f7e8',
    filePath: 'D:/codex/session.jsonl',
    cwd: 'D:/work/current',
    cwdValues: ['D:/work/current'],
    cwdNormalizedValues: ['d:/work/current'],
    title: 'title',
    timestamp: '2026-07-20T09:00:00.000Z',
    model: 'gpt-5',
    modelProvider: 'openai',
    createdAtMs: 1000,
    modifiedAtMs: 2000,
    fileMtimeMs: 2000,
    fileSize: 100,
    ...overrides,
  };
}

async function createStore(): Promise<CodexHistoryIndexStore> {
  const directory = path.join(os.tmpdir(), `enso-codex-index-${Date.now()}-${Math.random()}`);
  testDirectories.push(directory);
  await mkdir(directory, { recursive: true });

  const store = new CodexHistoryIndexStore(path.join(directory, 'codex-history-index.db'));
  await store.initialize();
  testStores.push(store);
  return store;
}

afterEach(async () => {
  await Promise.all(testStores.splice(0).map((store) => store.close()));
  await Promise.all(
    testDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('CodexHistoryIndexStore', () => {
  it('queries upserted sessions through normalized cwd rows', async () => {
    const store = await createStore();
    const record = createRecord({ cwdNormalizedValues: ['d:/work/current', 'd:/work/linked'] });

    await store.upsertSession(record);

    await expect(store.listSessions({ cwd: 'D:\\WORK\\LINKED' })).resolves.toEqual([
      {
        sessionId: record.sessionId,
        filePath: record.filePath,
        cwd: record.cwd,
        title: record.title,
        model: record.model,
        modelProvider: record.modelProvider,
        timestamp: record.timestamp,
        modifiedAt: record.modifiedAtMs,
      },
    ]);
  });

  it('replaces outdated cwd mappings when upserting a session again', async () => {
    const store = await createStore();
    const record = createRecord({ cwdNormalizedValues: ['d:/work/old'] });

    await store.upsertSession(record);
    await store.upsertSession({ ...record, cwdNormalizedValues: ['d:/work/new'] });

    await expect(store.listSessions({ cwd: 'D:/work/old' })).resolves.toEqual([]);
    await expect(store.listSessions({ cwd: 'D:/work/new' })).resolves.toHaveLength(1);
  });

  it('finds the latest session after the requested creation time', async () => {
    const store = await createStore();
    const oldRecord = createRecord({ createdAtMs: 1000, modifiedAtMs: 5000 });
    const latestRecord = createRecord({
      sessionId: '11996abf-bc87-7e80-9909-3a86a414f7e8',
      filePath: 'D:/codex/latest.jsonl',
      createdAtMs: 3000,
      modifiedAtMs: 2000,
    });

    await store.upsertSessions([oldRecord, latestRecord]);

    await expect(store.findLatest({ startedAfter: 2000 })).resolves.toEqual({
      sessionId: latestRecord.sessionId,
      filePath: latestRecord.filePath,
    });
  });

  it('returns a session file path and deletes records by file path', async () => {
    const store = await createStore();
    const record = createRecord();

    await store.upsertSession(record);
    await expect(store.getSessionFilePath(record.sessionId)).resolves.toBe(record.filePath);

    await store.deleteByFilePath(record.filePath);

    await expect(store.getSessionFilePath(record.sessionId)).resolves.toBeNull();
  });

  it('deletes sessions and cwd mappings for missing files', async () => {
    const store = await createStore();
    const missingRecord = createRecord({
      cwdNormalizedValues: ['d:/work/missing'],
    });
    const existingRecord = createRecord({
      sessionId: '11996abf-bc87-7e80-9909-3a86a414f7e8',
      filePath: 'D:/codex/existing.jsonl',
      cwdNormalizedValues: ['d:/work/existing'],
    });

    await store.upsertSessions([missingRecord, existingRecord]);
    await store.deleteMissingFiles(new Set([existingRecord.filePath]));

    await expect(store.getSessionFilePath(missingRecord.sessionId)).resolves.toBeNull();
    await expect(store.listSessions({ cwd: 'D:/work/missing' })).resolves.toEqual([]);
    await expect(store.getSessionFilePath(existingRecord.sessionId)).resolves.toBe(
      existingRecord.filePath
    );
  });

  it('reads and writes index state', async () => {
    const store = await createStore();

    await store.setState('initial_scan_completed', 'true');

    await expect(store.getState('initial_scan_completed')).resolves.toBe('true');
    await expect(store.getState('missing')).resolves.toBeNull();
  });

  it('serializes concurrent transactions on one database connection', async () => {
    const store = await createStore();
    const records = Array.from({ length: 12 }, (_, index) =>
      createRecord({
        sessionId: `${String(index).padStart(8, '0')}-bc87-7e80-9909-3a86a414f7e8`,
        filePath: `D:/codex/session-${index}.jsonl`,
        cwdNormalizedValues: [`d:/work/${index}`],
      })
    );

    await expect(
      Promise.all(records.map((record) => store.upsertSession(record)))
    ).resolves.toEqual(records.map(() => undefined));

    await expect(store.listSessions({ maxSessions: 20 })).resolves.toHaveLength(12);
  });

  it('continues queued writes after one write is rejected', async () => {
    const store = await createStore();
    const invalidRecord = createRecord({
      sessionId: 'invalid-record',
      filePath: null as unknown as string,
    });
    const validRecord = createRecord({
      sessionId: '21996abf-bc87-7e80-9909-3a86a414f7e8',
      filePath: 'D:/codex/recovered.jsonl',
    });

    await expect(store.upsertSession(invalidRecord)).rejects.toThrow();
    await expect(store.upsertSession(validRecord)).resolves.toBeUndefined();
    await expect(store.getSessionFilePath(validRecord.sessionId)).resolves.toBe(
      validRecord.filePath
    );
  });

  it('returns indexed file size and mtime by file path', async () => {
    const store = await createStore();
    const record = createRecord({ fileMtimeMs: 2345, fileSize: 6789 });

    await store.upsertSession(record);

    await expect(store.getFileFingerprints()).resolves.toEqual(
      new Map([[record.filePath, { fileMtimeMs: record.fileMtimeMs, fileSize: record.fileSize }]])
    );
  });
});
