import { describe, expect, it, vi } from 'vitest';
import type { PtyHelperCommand, PtyHelperEvent } from '../ptyHelperProtocol';
import {
  createPtyHelperRuntime,
  type PtyRuntimeProcess,
  type PtyRuntimeSubscription,
} from '../ptyHelperRuntime';

interface FakePty extends PtyRuntimeProcess {
  writes: string[];
  resizes: Array<{ cols: number; rows: number }>;
  killed: boolean;
  emitData(data: string): void;
  emitExit(exitCode: number, signal?: number): void;
}

function createFakePty(pid = 8123): FakePty {
  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();
  const writes: string[] = [];
  const resizes: Array<{ cols: number; rows: number }> = [];

  const disposable = (dispose: () => void): PtyRuntimeSubscription => ({ dispose });

  return {
    pid,
    writes,
    resizes,
    killed: false,
    onData(listener) {
      dataListeners.add(listener);
      return disposable(() => dataListeners.delete(listener));
    },
    onExit(listener) {
      exitListeners.add(listener);
      return disposable(() => exitListeners.delete(listener));
    },
    write(data) {
      writes.push(data);
    },
    resize(cols, rows) {
      resizes.push({ cols, rows });
    },
    kill() {
      this.killed = true;
    },
    emitData(data) {
      for (const listener of dataListeners) listener(data);
    },
    emitExit(exitCode, signal) {
      for (const listener of exitListeners) listener({ exitCode, signal });
    },
  };
}

function createCommand(): Extract<PtyHelperCommand, { type: 'create' }> {
  return {
    type: 'create',
    shell: 'cmd.exe',
    args: [],
    options: {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: 'C:\\work',
      env: { TERM: 'xterm-256color' },
      useConptyDll: true,
    },
  };
}

describe('ptyHelperRuntime', () => {
  it('reports created before flushing output produced during spawn', async () => {
    const sent: PtyHelperEvent[] = [];
    const fakePty = createFakePty();
    const runtime = createPtyHelperRuntime({
      spawn: () => {
        queueMicrotask(() => fakePty.emitData('hello'));
        return fakePty;
      },
      send: (event) => {
        sent.push(event);
      },
      exit: vi.fn(),
    });

    await runtime.handle(createCommand());
    await Promise.resolve();

    expect(sent).toEqual([
      { type: 'created', ptyPid: 8123 },
      { type: 'data', data: 'hello' },
    ]);
  });

  it('routes write, resize, destroy and exits the helper', async () => {
    const fakePty = createFakePty(8124);
    const exit = vi.fn();
    const runtime = createPtyHelperRuntime({
      spawn: () => fakePty,
      send: vi.fn(),
      exit,
    });

    await runtime.handle(createCommand());
    await runtime.handle({ type: 'write', data: 'dir\r' });
    await runtime.handle({ type: 'resize', cols: 120, rows: 40 });
    await runtime.handle({ type: 'destroy' });

    expect(fakePty.writes).toEqual(['dir\r']);
    expect(fakePty.resizes).toEqual([{ cols: 120, rows: 40 }]);
    expect(fakePty.killed).toBe(true);
    expect(exit).not.toHaveBeenCalled();

    fakePty.emitExit(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('forwards a PTY exit once and releases subscriptions', async () => {
    const sent: PtyHelperEvent[] = [];
    const fakePty = createFakePty(8125);
    const exit = vi.fn();
    const runtime = createPtyHelperRuntime({
      spawn: () => fakePty,
      send: (event) => {
        sent.push(event);
      },
      exit,
    });

    await runtime.handle(createCommand());
    fakePty.emitExit(7, 9);
    fakePty.emitExit(7, 9);
    await Promise.resolve();
    await Promise.resolve();

    expect(sent).toEqual([
      { type: 'created', ptyPid: 8125 },
      { type: 'exit', exitCode: 7, signal: 9 },
    ]);
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(7);
    });
  });

  it('waits for the final IPC event before exiting the helper', async () => {
    let finishSendingExit: (() => void) | undefined;
    const exitSent = new Promise<void>((resolve) => {
      finishSendingExit = resolve;
    });
    const sent: PtyHelperEvent[] = [];
    const fakePty = createFakePty(8126);
    const exit = vi.fn();
    const runtime = createPtyHelperRuntime({
      spawn: () => fakePty,
      send: (event) => {
        sent.push(event);
        return event.type === 'exit' ? exitSent : Promise.resolve();
      },
      exit,
    });

    await runtime.handle(createCommand());
    await Promise.resolve();
    fakePty.emitData('last output');
    fakePty.emitExit(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(sent).toEqual([
      { type: 'created', ptyPid: 8126 },
      { type: 'data', data: 'last output' },
      { type: 'exit', exitCode: 0, signal: undefined },
    ]);
    expect(exit).not.toHaveBeenCalled();

    finishSendingExit?.();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it('reports spawn errors and refuses duplicate create commands', async () => {
    const spawnErrorEvents: PtyHelperEvent[] = [];
    const failedRuntime = createPtyHelperRuntime({
      spawn: () => {
        throw new Error('spawn failed');
      },
      send: (event) => {
        spawnErrorEvents.push(event);
      },
      exit: vi.fn(),
    });

    await failedRuntime.handle(createCommand());
    expect(spawnErrorEvents).toEqual([{ type: 'error', message: 'spawn failed' }]);

    const duplicateEvents: PtyHelperEvent[] = [];
    const runtime = createPtyHelperRuntime({
      spawn: () => createFakePty(),
      send: (event) => {
        duplicateEvents.push(event);
      },
      exit: vi.fn(),
    });

    await runtime.handle(createCommand());
    await runtime.handle(createCommand());
    expect(duplicateEvents.at(-1)).toEqual({
      type: 'error',
      message: 'PTY has already been created',
    });
  });
});
