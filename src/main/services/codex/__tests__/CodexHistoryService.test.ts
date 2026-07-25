import { existsSync } from 'node:fs';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupCodexHistoryIndex,
  findLatestCodexSession,
  getCodexHistory,
  initializeCodexHistoryIndex,
  listCodexSessions,
  runCodexHistoryInitialScan,
} from '../CodexHistoryService';

const electronApp = vi.hoisted(() => ({ getPath: vi.fn() }));

vi.mock('electron', () => ({ app: electronApp }));

async function createSessionFile(root: string, filename: string, content: string): Promise<string> {
  const dir = path.join(root, '2026', '07', '17');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

describe('CodexHistoryService', () => {
  afterEach(async () => {
    await cleanupCodexHistoryIndex();
    electronApp.getPath.mockReset();
  });

  it('starts the watcher paused and resumes it after a successful initial scan', async () => {
    const calls: string[] = [];
    const watcher = {
      start: vi.fn<(options: { paused: boolean }) => Promise<void>>(async () => {
        calls.push('start');
      }),
      resume: vi.fn(() => {
        calls.push('resume');
      }),
    };
    const indexer = {
      runFullScan: vi.fn(async () => {
        calls.push('scan');
      }),
    };

    await runCodexHistoryInitialScan(watcher, indexer);

    expect(watcher.start).toHaveBeenCalledWith({ paused: true });
    expect(calls).toEqual(['start', 'scan', 'resume']);
  });

  it('resumes the watcher when the initial scan fails', async () => {
    const watcher = {
      start: vi.fn<(options: { paused: boolean }) => Promise<void>>().mockResolvedValue(undefined),
      resume: vi.fn<() => void>(),
    };
    const indexer = {
      runFullScan: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('scan failed')),
    };

    await expect(runCodexHistoryInitialScan(watcher, indexer)).rejects.toThrow('scan failed');
    expect(watcher.resume).toHaveBeenCalledOnce();
  });

  it('stores the default index database under Electron userData instead of Codex sessions', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-default-index-${Date.now()}`);
    const userDataPath = path.join(root, 'user-data');
    const sessionsRoot = path.join(root, '.codex', 'sessions');
    const expectedDbPath = path.join(userDataPath, 'codex-history-index.db');
    electronApp.getPath.mockReturnValue(userDataPath);

    await initializeCodexHistoryIndex({ sessionsRoot });

    expect(electronApp.getPath).toHaveBeenCalledWith('userData');
    expect(existsSync(expectedDbPath)).toBe(true);
    expect(path.relative(sessionsRoot, expectedDbPath).startsWith('..')).toBe(true);
    expect(path.relative(path.join(root, '.codex'), expectedDbPath).startsWith('..')).toBe(true);
  });

  it('returns sessions from an initialized and populated index', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-index-list-${Date.now()}`);
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${sessionId}.jsonl`,
      [
        JSON.stringify({
          type: 'session_meta',
          payload: { cwd: 'D:/work/current', model_provider: 'openai' },
        }),
        JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5' } }),
      ].join('\n')
    );

    await initializeCodexHistoryIndex({
      dbPath: path.join(root, 'index.db'),
      sessionsRoot: root,
    });
    await listCodexSessions({ cwd: 'D:/work/current', sessionsRoot: root });

    const result = await listCodexSessions({ sessionsRoot: path.join(root, 'missing') });

    expect(result.sessions).toEqual([
      expect.objectContaining({
        sessionId,
        filePath,
        cwd: 'D:/work/current',
        model: 'gpt-5',
        modelProvider: 'openai',
      }),
    ]);
  });

  it('finds indexed sessions using every stored cwd value', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-index-cwd-${Date.now()}`);
    const sessionId = '11996abf-bc87-7e80-9909-3a86a414f7e8';
    await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${sessionId}.jsonl`,
      [
        JSON.stringify({ type: 'session_meta', payload: { cwd: 'D:/work/first' } }),
        JSON.stringify({ type: 'turn_context', cwd: 'D:/work/second' }),
      ].join('\n')
    );

    await initializeCodexHistoryIndex({
      dbPath: path.join(root, 'index.db'),
      sessionsRoot: root,
    });

    const result = await listCodexSessions({
      cwd: 'D:\\work\\second',
      sessionsRoot: path.join(root, 'missing'),
    });

    expect(result.sessions.map((session) => session.sessionId)).toEqual([sessionId]);
  });

  it('reads an indexed session file without scanning other session files', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-index-history-${Date.now()}`);
    const sessionId = '21996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${sessionId}.jsonl`,
      JSON.stringify({ role: 'user', content: 'indexed message' })
    );

    await initializeCodexHistoryIndex({
      dbPath: path.join(root, 'index.db'),
      sessionsRoot: root,
    });
    await findLatestCodexSession({ sessionsRoot: root });

    const result = await getCodexHistory({
      sessionId,
      sessionsRoot: path.join(root, 'missing'),
    });

    expect(result.filePath).toBe(filePath);
    expect(result.messages[0]?.text).toBe('indexed message');
  });

  it('runs a recent cwd scan while the initial index scan is incomplete', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-recent-scan-${Date.now()}`);
    const cwd = 'D:/work/current';
    const sessionId = '31996abf-bc87-7e80-9909-3a86a414f7e8';
    await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${sessionId}.jsonl`,
      JSON.stringify({ type: 'session_meta', payload: { cwd } })
    );

    await initializeCodexHistoryIndex({
      dbPath: path.join(root, 'index.db'),
      sessionsRoot: root,
    });

    const result = await listCodexSessions({ cwd, sessionsRoot: root });

    expect(result.sessions.map((session) => session.sessionId)).toEqual([sessionId]);
  });

  it('loads history by session id', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-history-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${sessionId}.jsonl`,
      JSON.stringify({ role: 'user', content: 'first message' })
    );

    const result = await getCodexHistory({ sessionId, maxMessages: 10, sessionsRoot: root });

    expect(result.sessionId).toBe(sessionId);
    expect(result.messages[0]?.text).toBe('first message');
  });

  it('loads a session found by metadata id when the filename has no id', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-metadata-id-${Date.now()}`);
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      'manual.jsonl',
      [
        JSON.stringify({
          type: 'session_meta',
          payload: {
            id: sessionId,
            cwd: 'D:/work/current',
            timestamp: '2026-07-17T10:00:00.000Z',
          },
        }),
        JSON.stringify({ role: 'user', content: 'metadata session message' }),
      ].join('\n')
    );

    const listed = await listCodexSessions({ sessionsRoot: root });
    const latest = await findLatestCodexSession({ sessionsRoot: root, startedAfter: 0 });
    const result = await getCodexHistory({ sessionId, maxMessages: 10, sessionsRoot: root });

    expect(listed.sessions[0]?.sessionId).toBe(sessionId);
    expect(latest).toEqual({ sessionId, filePath });
    expect(result.filePath).toBe(filePath);
    expect(result.messages[0]?.text).toBe('metadata session message');
  });

  it('finds latest session after a timestamp', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-latest-${Date.now()}`);
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${sessionId}.jsonl`,
      JSON.stringify({ role: 'user', content: 'new session' })
    );

    const result = await findLatestCodexSession({ sessionsRoot: root, startedAfter: 0 });

    expect(result).toEqual({ sessionId, filePath });
  });

  it('filters latest session by cwd before returning session id', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-cwd-${Date.now()}`);
    const expectedCwd = 'D:/work/current';
    const otherCwd = 'D:/work/other';
    const expectedSessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const otherSessionId = '11996abf-bc87-7e80-9909-3a86a414f7e8';

    const expectedFilePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${expectedSessionId}.jsonl`,
      JSON.stringify({ type: 'session_meta', payload: { cwd: expectedCwd } })
    );
    const otherFilePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-01-${otherSessionId}.jsonl`,
      JSON.stringify({ type: 'session_meta', payload: { cwd: otherCwd } })
    );

    const now = Date.now();
    await utimes(expectedFilePath, new Date(now - 10_000), new Date(now - 10_000));
    await utimes(otherFilePath, new Date(now), new Date(now));

    const result = await findLatestCodexSession({
      sessionsRoot: root,
      startedAfter: 0,
      cwd: expectedCwd.replace(/\//g, '\\'),
    });

    expect(result).toEqual({ sessionId: expectedSessionId, filePath: expectedFilePath });
  });

  it('finds new Codex session by creation time instead of modified time', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-created-at-${Date.now()}`);
    const cwd = 'D:/work/current';
    const oldSessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const newSessionId = '11996abf-bc87-7e80-9909-3a86a414f7e8';

    const oldFilePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${oldSessionId}.jsonl`,
      JSON.stringify({
        type: 'session_meta',
        payload: { cwd, timestamp: '2026-07-17T10:00:00.000Z' },
      })
    );
    const newFilePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-01-00-${newSessionId}.jsonl`,
      JSON.stringify({
        type: 'session_meta',
        payload: { cwd, timestamp: '2026-07-17T10:01:00.000Z' },
      })
    );

    const now = Date.now();
    await utimes(oldFilePath, new Date(now), new Date(now));
    await utimes(newFilePath, new Date(now - 10_000), new Date(now - 10_000));

    const result = await findLatestCodexSession({
      sessionsRoot: root,
      startedAfter: Date.parse('2026-07-17T10:00:30.000Z'),
      cwd: cwd.replace(/\//g, '\\'),
    });

    expect(result).toEqual({ sessionId: newSessionId, filePath: newFilePath });
  });

  it('lists sessions matching cwd sorted by modified time', async () => {
    const root = path.join(os.tmpdir(), `enso-codex-list-${Date.now()}`);
    const expectedCwd = 'D:/work/current';
    const olderSessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const newerSessionId = '21996abf-bc87-7e80-9909-3a86a414f7e8';
    const otherSessionId = '31996abf-bc87-7e80-9909-3a86a414f7e8';

    const olderFilePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-00-${olderSessionId}.jsonl`,
      [
        JSON.stringify({
          type: 'session_meta',
          payload: { cwd: expectedCwd, timestamp: '2026-07-17T10:00:00.000Z' },
        }),
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: '# AGENTS.md instructions for D:/work/current' }],
          },
        }),
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Older real task title' }],
          },
        }),
      ].join('\n')
    );
    const newerFilePath = await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-01-${newerSessionId}.jsonl`,
      [
        JSON.stringify({
          type: 'session_meta',
          payload: {
            cwd: expectedCwd,
            timestamp: '2026-07-17T10:00:01.000Z',
            model_provider: 'openai',
          },
        }),
        JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5' } }),
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: '<environment_context>ignored</environment_context>' },
            ],
          },
        }),
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Review the current code changes' }],
          },
        }),
      ].join('\n')
    );
    await createSessionFile(
      root,
      `rollout-2026-07-17T10-00-02-${otherSessionId}.jsonl`,
      JSON.stringify({ type: 'session_meta', payload: { cwd: 'D:/work/other' } })
    );

    const now = Date.now();
    await utimes(olderFilePath, new Date(now - 10_000), new Date(now - 10_000));
    await utimes(newerFilePath, new Date(now), new Date(now));

    const result = await listCodexSessions({
      sessionsRoot: root,
      cwd: expectedCwd.replace(/\//g, '\\'),
    });

    expect(result.sessions.map((session) => session.sessionId)).toEqual([
      newerSessionId,
      olderSessionId,
    ]);
    expect(result.sessions[0]?.cwd).toBe(expectedCwd);
    expect(result.sessions[0]?.title).toBe('Review the current code changes');
    expect(result.sessions[1]?.title).toBe('Older real task title');
    expect(result.sessions[0]?.timestamp).toBe('2026-07-17T10:00:01.000Z');
    expect(result.sessions[0]?.model).toBe('gpt-5');
    expect(result.sessions[0]?.modelProvider).toBe('openai');
  });
});
