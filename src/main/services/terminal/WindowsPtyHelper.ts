import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  formatPtyHelperError,
  isPtyHelperEvent,
  type PtyHelperCommand,
  type PtyHelperSpawnOptions,
} from './ptyHelperProtocol';

export const WINDOWS_PTY_CREATE_TIMEOUT_MS = 10_000;
export const WINDOWS_PTY_DESTROY_TIMEOUT_MS = 3_000;

export interface WindowsPtyHelperRequest {
  shell: string;
  args: string[];
  options: PtyHelperSpawnOptions;
}

export interface WindowsPtyHelperCallbacks {
  onData(data: string): void;
  onExit(exitCode: number, signal?: number): void;
  onError?(error: Error): void;
}

export interface WindowsPtyHelperSession {
  helperPid: number;
  ptyPid: number;
  activate(): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  destroyAndWait(timeoutMs?: number): Promise<void>;
}

export interface WindowsPtyHelperAttempt {
  helperPid: number;
  ready: Promise<WindowsPtyHelperSession>;
  cancel(): Promise<void>;
}

export interface WindowsPtyHelperDependencies {
  fork(): ChildProcess;
  killProcessTreeAsync(pid: number): Promise<void>;
  timeoutMs?: number;
}

export interface WindowsPtyHelperFallbackInput {
  request: WindowsPtyHelperRequest;
  useBundledConpty: boolean;
  createAttempt(request: WindowsPtyHelperRequest): Promise<WindowsPtyHelperSession>;
}

export function resolvePtyHelperPath(): string {
  const helperPath = fileURLToPath(new URL('./pty-helper.js', import.meta.url));
  return helperPath.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
}

export function forkPtyHelper(): ChildProcess {
  return fork(resolvePtyHelperPath(), [], {
    execPath: process.execPath,
    execArgv: [],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
}

function createCommand(request: WindowsPtyHelperRequest): PtyHelperCommand {
  return {
    type: 'create',
    shell: request.shell,
    args: request.args,
    options: request.options,
  };
}

export function startWindowsPtyHelper(
  request: WindowsPtyHelperRequest,
  callbacks: WindowsPtyHelperCallbacks,
  dependencies: WindowsPtyHelperDependencies = {
    fork: forkPtyHelper,
    killProcessTreeAsync: async (pid) => {
      const { killProcessTreeAsync } = await import('../../utils/processUtils');
      await killProcessTreeAsync(pid);
    },
  }
): WindowsPtyHelperAttempt {
  const child = dependencies.fork();
  const helperPid = child.pid;
  if (helperPid === null || helperPid === undefined) {
    throw new Error('PTY helper did not expose a process id');
  }

  let readySettled = false;
  let creationCompleted = false;
  let exitNotified = false;
  let activated = false;
  let timer: NodeJS.Timeout | undefined;
  let cancelPromise: Promise<void> | null = null;
  let session: WindowsPtyHelperSession | null = null;
  const pendingData: string[] = [];

  let resolveReady: (value: WindowsPtyHelperSession) => void = () => undefined;
  let rejectReady: (reason?: unknown) => void = () => undefined;
  const ready = new Promise<WindowsPtyHelperSession>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const cleanupChildListeners = (): void => {
    child.removeListener('message', onMessage);
    child.removeListener('error', onChildError);
    child.removeListener('exit', onChildExit);
  };

  const cancel = (): Promise<void> => {
    if (cancelPromise) return cancelPromise;
    cancelPromise = (async () => {
      if (timer) clearTimeout(timer);
      cleanupChildListeners();
      try {
        if (child.connected) child.disconnect();
      } catch {
        // helper 已经断开时忽略。
      }
      await dependencies.killProcessTreeAsync(helperPid);
    })();
    return cancelPromise;
  };

  const rejectCreation = (error: unknown): void => {
    if (readySettled) return;
    readySettled = true;
    if (timer) clearTimeout(timer);
    rejectReady(error instanceof Error ? error : new Error(formatPtyHelperError(error)));
    void cancel();
  };

  const notifyExit = (exitCode: number, signal?: number): void => {
    if (exitNotified) return;
    exitNotified = true;
    callbacks.onExit(exitCode, signal);
  };

  const onMessage = (message: unknown): void => {
    if (!isPtyHelperEvent(message)) {
      rejectCreation(new Error('Invalid PTY helper event'));
      return;
    }

    switch (message.type) {
      case 'created': {
        if (readySettled || creationCompleted) return;
        creationCompleted = true;
        readySettled = true;
        if (timer) clearTimeout(timer);

        const activate = (): void => {
          if (activated) return;
          activated = true;
          for (const data of pendingData.splice(0)) callbacks.onData(data);
        };

        session = {
          helperPid,
          ptyPid: message.ptyPid,
          activate,
          write(data) {
            if (!child.connected) return;
            child.send({ type: 'write', data });
          },
          resize(cols, rows) {
            if (!child.connected) return;
            child.send({ type: 'resize', cols, rows });
          },
          destroyAndWait(timeoutMs = WINDOWS_PTY_DESTROY_TIMEOUT_MS): Promise<void> {
            return new Promise((resolve) => {
              let settled = false;
              let destroyTimer: NodeJS.Timeout | undefined;

              const finish = (): void => {
                if (settled) return;
                settled = true;
                if (destroyTimer) clearTimeout(destroyTimer);
                child.removeListener('exit', finish);
                child.removeListener('close', finish);
                resolve();
              };

              child.once('exit', finish);
              child.once('close', finish);
              destroyTimer = setTimeout(() => {
                void dependencies.killProcessTreeAsync(helperPid).finally(finish);
              }, timeoutMs);

              try {
                if (!child.connected) {
                  finish();
                  return;
                }
                child.send({ type: 'destroy' }, (error) => {
                  if (error) {
                    void dependencies.killProcessTreeAsync(helperPid).finally(finish);
                  }
                });
              } catch {
                void dependencies.killProcessTreeAsync(helperPid).finally(finish);
              }
            });
          },
        };
        resolveReady(session);
        return;
      }
      case 'data':
        if (activated) callbacks.onData(message.data);
        else pendingData.push(message.data);
        return;
      case 'exit':
        if (!creationCompleted) {
          rejectCreation(new Error('PTY helper exited before creating the terminal'));
          return;
        }
        notifyExit(message.exitCode, message.signal);
        return;
      case 'error': {
        const error = new Error(message.message);
        if (!creationCompleted) rejectCreation(error);
        else callbacks.onError?.(error);
      }
    }
  };

  const onChildError = (error: Error): void => {
    if (!creationCompleted) rejectCreation(error);
    else callbacks.onError?.(error);
  };

  const onChildExit = (code: number | null, _signal: NodeJS.Signals | null): void => {
    if (!creationCompleted) {
      rejectCreation(new Error('PTY helper exited before creating the terminal'));
      return;
    }
    notifyExit(code ?? 1);
  };

  child.on('message', onMessage);
  child.once('error', onChildError);
  child.once('exit', onChildExit);

  timer = setTimeout(() => {
    rejectCreation(
      new Error(
        `PTY helper creation timed out after ${dependencies.timeoutMs ?? WINDOWS_PTY_CREATE_TIMEOUT_MS}ms`
      )
    );
  }, dependencies.timeoutMs ?? WINDOWS_PTY_CREATE_TIMEOUT_MS);

  try {
    child.send(createCommand(request), (error) => {
      if (error) rejectCreation(error);
    });
  } catch (error) {
    rejectCreation(error);
  }

  return { helperPid, ready, cancel };
}

export async function createWindowsPtyWithFallback(
  input: WindowsPtyHelperFallbackInput
): Promise<WindowsPtyHelperSession> {
  try {
    return await input.createAttempt({
      ...input.request,
      options: { ...input.request.options, useConptyDll: input.useBundledConpty },
    });
  } catch (bundledError) {
    if (!input.useBundledConpty) throw bundledError;

    try {
      return await input.createAttempt({
        ...input.request,
        options: { ...input.request.options, useConptyDll: false },
      });
    } catch (systemError) {
      throw new Error(
        `PTY creation failed with bundled and system ConPTY: ${formatPtyHelperError(bundledError)}; ${formatPtyHelperError(systemError)}`
      );
    }
  }
}
