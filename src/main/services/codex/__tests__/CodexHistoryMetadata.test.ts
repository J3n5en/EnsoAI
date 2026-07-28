import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractCodexSessionCreatedAtFromPath,
  normalizeCwd,
  parseCodexSessionMetadata,
  readCodexSessionMetadata,
} from '../CodexHistoryMetadata';

const { statMock } = vi.hoisted(() => ({ statMock: vi.fn() }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  statMock.mockImplementation(actual.stat);
  return { ...actual, stat: statMock };
});

async function readActualStat(filePath: string) {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return actual.stat(filePath);
}

afterEach(() => {
  statMock.mockReset();
  statMock.mockImplementation(readActualStat);
});

const fixtureStat = {
  birthtimeMs: Date.parse('2026-07-20T09:00:00.000Z'),
  ctimeMs: Date.parse('2026-07-20T09:00:01.000Z'),
  mtimeMs: Date.parse('2026-07-20T09:00:02.000Z'),
  size: 123,
};

describe('CodexHistoryMetadata', () => {
  it('extracts the local creation time from a rollout filename', () => {
    expect(
      extractCodexSessionCreatedAtFromPath(
        path.join('root', 'rollout-2026-07-20T09-08-07-01996abf-bc87-7e80-9909-3a86a414f7e8.jsonl')
      )
    ).toBe(new Date(2026, 6, 20, 9, 8, 7).getTime());
    expect(extractCodexSessionCreatedAtFromPath(path.join('root', 'manual.jsonl'))).toBeNull();
  });

  it('rejects invalid dates in rollout filenames', () => {
    expect(
      extractCodexSessionCreatedAtFromPath(
        path.join('root', 'rollout-2026-02-30T09-08-07-01996abf-bc87-7e80-9909-3a86a414f7e8.jsonl')
      )
    ).toBeNull();
  });

  it('uses session id from rollout filename first', () => {
    const fileSessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const metaSessionId = '11996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = path.join('root', `rollout-2026-07-20T09-00-00-${fileSessionId}.jsonl`);
    const content = JSON.stringify({
      type: 'session_meta',
      payload: { id: metaSessionId, cwd: 'D:/work/current' },
    });

    const metadata = parseCodexSessionMetadata({ filePath, content, fileStat: fixtureStat });

    expect(metadata?.sessionId).toBe(fileSessionId);
  });

  it('falls back to session id from meta when filename has no id', () => {
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const content = JSON.stringify({
      type: 'session_meta',
      payload: { session_id: sessionId, cwd: 'D:/work/current' },
    });

    const metadata = parseCodexSessionMetadata({
      filePath: path.join('root', 'manual.jsonl'),
      content,
      fileStat: fixtureStat,
    });

    expect(metadata?.sessionId).toBe(sessionId);
  });

  it('falls back to id only from a session_meta record when filename has no id', () => {
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const content = JSON.stringify({
      type: 'session_meta',
      payload: { id: sessionId, cwd: 'D:/work/current' },
    });

    const metadata = parseCodexSessionMetadata({
      filePath: path.join('root', 'manual.jsonl'),
      content,
      fileStat: fixtureStat,
    });

    expect(metadata?.sessionId).toBe(sessionId);
  });

  it('does not treat a non-metadata record id as a session id', () => {
    const content = JSON.stringify({
      type: 'response_item',
      payload: { id: 'message-id', role: 'user', content: 'message' },
    });

    const metadata = parseCodexSessionMetadata({
      filePath: path.join('root', 'manual.jsonl'),
      content,
      fileStat: fixtureStat,
    });

    expect(metadata).toBeNull();
  });

  it('extracts multiple cwd values, originator, session source, model provider, model, title and timestamp', () => {
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = path.join('root', `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`);
    const content = [
      JSON.stringify({
        type: 'session_meta',
        payload: {
          cwd: 'D:/work/current',
          timestamp: '2026-07-20T09:00:00.000Z',
          model_provider: 'openai',
          originator: 'ensoai-terminal-a',
          source: 'cli',
        },
      }),
      JSON.stringify({
        type: 'turn_context',
        payload: { cwd: 'D:/work/secondary', model: 'gpt-5' },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '真实用户任务标题' }],
        },
      }),
    ].join('\n');

    const metadata = parseCodexSessionMetadata({ filePath, content, fileStat: fixtureStat });

    expect(metadata?.cwdValues).toEqual(['D:/work/current', 'D:/work/secondary']);
    expect(metadata?.cwdNormalizedValues).toEqual(['d:/work/current', 'd:/work/secondary']);
    expect(metadata?.cwd).toBe('D:/work/current');
    expect(metadata?.originator).toBe('ensoai-terminal-a');
    expect(metadata?.sessionSource).toBe('cli');
    expect(metadata?.model).toBe('gpt-5');
    expect(metadata?.modelProvider).toBe('openai');
    expect(metadata?.title).toBe('真实用户任务标题');
    expect(metadata?.timestamp).toBe('2026-07-20T09:00:00.000Z');
    expect(metadata?.createdAtMs).toBe(Date.parse('2026-07-20T09:00:00.000Z'));
    expect(metadata?.modifiedAtMs).toBe(fixtureStat.mtimeMs);
  });

  it('does not read originator or session source from non-session metadata records', () => {
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = path.join('root', `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`);
    const content = [
      JSON.stringify({ type: 'session_meta', payload: { cwd: 'D:/work/current' } }),
      JSON.stringify({
        type: 'turn_context',
        payload: { originator: 'external-terminal', source: 'cli' },
      }),
    ].join('\n');

    const metadata = parseCodexSessionMetadata({ filePath, content, fileStat: fixtureStat });

    expect(metadata?.originator).toBeUndefined();
    expect(metadata?.sessionSource).toBeUndefined();
  });

  it('skips AGENTS.md instructions without a project path when extracting title', () => {
    const sessionId = '01996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = path.join('root', `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`);
    const content = [
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '# AGENTS.md instructions\n<INSTRUCTIONS>' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '真正的用户任务' }],
        },
      }),
    ].join('\n');

    const metadata = parseCodexSessionMetadata({ filePath, content, fileStat: fixtureStat });

    expect(metadata?.title).toBe('真正的用户任务');
  });

  it('stream reader returns the same metadata as the pure parser', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'enso-codex-metadata-'));
    const sessionId = '31996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = path.join(directory, `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`);
    const content = Array.from({ length: 2000 }, (_, index) =>
      JSON.stringify({
        type: index === 0 ? 'session_meta' : 'turn_context',
        payload: {
          cwd: index % 2 === 0 ? 'D:/work/current' : 'D:/work/secondary',
          timestamp: '2026-07-20T09:00:00.000Z',
          model: 'gpt-5',
          model_provider: 'openai',
        },
      })
    ).join('\n');

    try {
      await writeFile(filePath, content, 'utf8');
      const fileStat = await readActualStat(filePath);

      await expect(readCodexSessionMetadata(filePath)).resolves.toEqual(
        parseCodexSessionMetadata({ filePath, content, fileStat })
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('retries once when the file changes during a snapshot read', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'enso-codex-metadata-retry-'));
    const sessionId = '41996abf-bc87-7e80-9909-3a86a414f7e8';
    const filePath = path.join(directory, `rollout-2026-07-20T09-00-00-${sessionId}.jsonl`);

    try {
      await writeFile(
        filePath,
        JSON.stringify({ type: 'session_meta', payload: { cwd: 'D:/work/current' } }),
        'utf8'
      );
      const unchanged = await readActualStat(filePath);
      const changed = { ...unchanged, mtimeMs: unchanged.mtimeMs + 1 };
      statMock
        .mockResolvedValueOnce(unchanged)
        .mockResolvedValueOnce(changed)
        .mockResolvedValueOnce(unchanged)
        .mockResolvedValueOnce(unchanged);

      await expect(readCodexSessionMetadata(filePath)).resolves.toMatchObject({ sessionId });
      expect(statMock).toHaveBeenCalledTimes(4);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('normalizes cwd like the current service behavior', () => {
    expect(normalizeCwd('D:\\work\\current\\')).toBe('d:/work/current');
  });

  it('preserves case for Linux paths while normalizing Windows paths', () => {
    expect(normalizeCwd('/home/me/Repo')).toBe('/home/me/Repo');
    expect(normalizeCwd('C:\\Repo')).toBe('c:/repo');
    expect(normalizeCwd('\\\\Server\\Share\\Repo')).toBe('//server/share/repo');
  });

  it('converts WSL UNC paths to their Linux paths', () => {
    expect(normalizeCwd('\\\\wsl.localhost\\Ubuntu\\home\\user\\Repo')).toBe('/home/user/Repo');
    expect(normalizeCwd('\\\\wsl$\\Ubuntu\\home\\user\\repo\\')).toBe('/home/user/repo');
  });
});
