import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PtyHelperEvent, PtyHelperSpawnOptions } from '../ptyHelperProtocol';
import {
  createWindowsPtyWithFallback,
  startWindowsPtyHelper,
  type WindowsPtyHelperCallbacks,
  type WindowsPtyHelperRequest,
  type WindowsPtyHelperSession,
} from '../WindowsPtyHelper';

class FakeIpcChild extends EventEmitter {
  readonly sent: unknown[] = [];
  readonly kill = vi.fn();
  connected = true;

  constructor(readonly pid: number) {
    super();
  }

  send(message: unknown, callback?: (error?: Error | null) => void): boolean {
    this.sent.push(message);
    callback?.();
    return true;
  }

  disconnect(): void {
    this.connected = false;
    this.emit('disconnect');
  }
}

function asChildProcess(child: FakeIpcChild): ChildProcess {
  return child as unknown as ChildProcess;
}

function createRequest(): WindowsPtyHelperRequest {
  const options: PtyHelperSpawnOptions = {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: 'C:\\work',
    env: { TERM: 'xterm-256color' },
    useConptyDll: true,
  };
  return { shell: 'cmd.exe', args: [], options };
}

function createCallbacks(): WindowsPtyHelperCallbacks {
  return {
    onData: vi.fn(),
    onExit: vi.fn(),
    onError: vi.fn(),
  };
}

function emitEvent(child: FakeIpcChild, event: PtyHelperEvent): void {
  child.emit('message', event);
}

function createFakeSession(
  helperPid = 7001,
  ptyPid = 7002,
  overrides: Partial<WindowsPtyHelperSession> = {}
): WindowsPtyHelperSession {
  return {
    helperPid,
    ptyPid,
    activate: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    destroyAndWait: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('WindowsPtyHelper', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('resolves ready with helperPid and ptyPid after created', async () => {
    const child = new FakeIpcChild(7001);
    const attempt = startWindowsPtyHelper(createRequest(), createCallbacks(), {
      fork: () => asChildProcess(child),
      killProcessTreeAsync: vi.fn().mockResolvedValue(undefined),
      timeoutMs: 10_000,
    });

    expect(child.sent).toHaveLength(1);
    emitEvent(child, { type: 'created', ptyPid: 7002 });
    const session = await attempt.ready;

    expect(session.helperPid).toBe(7001);
    expect(session.ptyPid).toBe(7002);
  });

  it('buffers data until the parent activates the session', async () => {
    const child = new FakeIpcChild(7004);
    const callbacks = createCallbacks();
    const attempt = startWindowsPtyHelper(createRequest(), callbacks, {
      fork: () => asChildProcess(child),
      killProcessTreeAsync: vi.fn().mockResolvedValue(undefined),
    });

    emitEvent(child, { type: 'data', data: 'before-ready' });
    emitEvent(child, { type: 'created', ptyPid: 7005 });
    const session = await attempt.ready;

    expect(callbacks.onData).not.toHaveBeenCalled();
    session.activate();
    expect(callbacks.onData).toHaveBeenCalledWith('before-ready');
  });

  it('buffers exit until activation and flushes data before exit', async () => {
    const child = new FakeIpcChild(7008);
    const events: string[] = [];
    const callbacks: WindowsPtyHelperCallbacks = {
      onData: (data) => events.push(`data:${data}`),
      onExit: (exitCode) => events.push(`exit:${exitCode}`),
    };
    const attempt = startWindowsPtyHelper(createRequest(), callbacks, {
      fork: () => asChildProcess(child),
      killProcessTreeAsync: vi.fn().mockResolvedValue(undefined),
    });

    emitEvent(child, { type: 'created', ptyPid: 7009 });
    const session = await attempt.ready;
    emitEvent(child, { type: 'data', data: 'startup' });
    emitEvent(child, { type: 'exit', exitCode: 1 });

    expect(events).toEqual([]);
    session.activate();
    session.activate();
    expect(events).toEqual(['data:startup', 'exit:1']);
  });

  it('cancels a helper that never reports created', async () => {
    vi.useFakeTimers();
    const child = new FakeIpcChild(7003);
    const killProcessTreeAsync = vi.fn().mockResolvedValue(undefined);
    const attempt = startWindowsPtyHelper(createRequest(), createCallbacks(), {
      fork: () => asChildProcess(child),
      killProcessTreeAsync,
      timeoutMs: 10_000,
    });

    const rejection = expect(attempt.ready).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(killProcessTreeAsync).toHaveBeenCalledWith(7003);
    vi.useRealTimers();
  });

  it('rejects ready when creation is cancelled before created', async () => {
    const child = new FakeIpcChild(7010);
    const killProcessTreeAsync = vi.fn().mockResolvedValue(undefined);
    const attempt = startWindowsPtyHelper(createRequest(), createCallbacks(), {
      fork: () => asChildProcess(child),
      killProcessTreeAsync,
    });
    const rejection = expect(attempt.ready).rejects.toThrow('PTY helper creation cancelled');

    await attempt.cancel();
    await attempt.cancel();

    await rejection;
    expect(killProcessTreeAsync).toHaveBeenCalledOnce();
    expect(killProcessTreeAsync).toHaveBeenCalledWith(7010);
  });

  it('sends destroy and waits for the helper to exit', async () => {
    const child = new FakeIpcChild(7006);
    const attempt = startWindowsPtyHelper(createRequest(), createCallbacks(), {
      fork: () => asChildProcess(child),
      killProcessTreeAsync: vi.fn().mockResolvedValue(undefined),
    });
    emitEvent(child, { type: 'created', ptyPid: 7007 });
    const session = await attempt.ready;

    const pending = session.destroyAndWait(1000);
    expect(child.sent.at(-1)).toEqual({ type: 'destroy' });
    child.emit('exit', 0, null);

    await expect(pending).resolves.toBeUndefined();
  });

  it('tries system ConPTY exactly once after bundled ConPTY failure', async () => {
    const useConptyValues: boolean[] = [];
    const session = createFakeSession();
    const result = await createWindowsPtyWithFallback({
      request: createRequest(),
      useBundledConpty: true,
      createAttempt: async (request) => {
        useConptyValues.push(request.options.useConptyDll === true);
        if (useConptyValues.length === 1) throw new Error('bundled timed out');
        return session;
      },
    });

    expect(result).toBe(session);
    expect(useConptyValues).toEqual([true, false]);
  });
});
