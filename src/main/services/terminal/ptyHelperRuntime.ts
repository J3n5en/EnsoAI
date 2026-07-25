import type { PtyHelperCommand, PtyHelperEvent, PtyHelperSpawnOptions } from './ptyHelperProtocol';
import { formatPtyHelperError } from './ptyHelperProtocol';

export interface PtyRuntimeSubscription {
  dispose(): void;
}

export interface PtyRuntimeProcess {
  pid: number;
  onData(listener: (data: string) => void): PtyRuntimeSubscription;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): PtyRuntimeSubscription;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface PtyHelperRuntimeDependencies {
  spawn(shell: string, args: string[], options: PtyHelperSpawnOptions): PtyRuntimeProcess;
  send(event: PtyHelperEvent): void;
  exit(code: number): void;
}

export interface PtyHelperRuntime {
  handle(command: PtyHelperCommand): Promise<void>;
}

export function createPtyHelperRuntime(
  dependencies: PtyHelperRuntimeDependencies
): PtyHelperRuntime {
  let ptyProcess: PtyRuntimeProcess | null = null;
  let dataDisposable: PtyRuntimeSubscription | null = null;
  let exitDisposable: PtyRuntimeSubscription | null = null;
  let createStarted = false;
  let creationReported = false;
  let helperExited = false;
  let destroyRequested = false;
  const pendingData: string[] = [];

  const disposeSubscriptions = (): void => {
    try {
      dataDisposable?.dispose();
    } catch {
      // 原生监听器可能已经随 PTY 退出。
    }
    try {
      exitDisposable?.dispose();
    } catch {
      // 原生监听器可能已经随 PTY 退出。
    }
    dataDisposable = null;
    exitDisposable = null;
  };

  const exitHelper = (code: number): void => {
    if (helperExited) return;
    helperExited = true;
    disposeSubscriptions();
    dependencies.exit(code);
  };

  const handleCreate = (command: Extract<PtyHelperCommand, { type: 'create' }>): void => {
    if (createStarted) {
      dependencies.send({ type: 'error', message: 'PTY has already been created' });
      return;
    }
    createStarted = true;

    try {
      const spawned = dependencies.spawn(command.shell, command.args, command.options);
      ptyProcess = spawned;

      // PTY 可能在 created 消息发出前产生输出，先缓存以保证父进程登记会话后再接收数据。
      dataDisposable = spawned.onData((data) => {
        if (!creationReported) {
          pendingData.push(data);
          return;
        }
        dependencies.send({ type: 'data', data });
      });
      exitDisposable = spawned.onExit(({ exitCode, signal }) => {
        if (helperExited) return;
        if (destroyRequested) {
          exitHelper(0);
          return;
        }
        dependencies.send({ type: 'exit', exitCode, signal });
        exitHelper(exitCode);
      });

      dependencies.send({ type: 'created', ptyPid: spawned.pid });
      creationReported = true;
      for (const data of pendingData.splice(0)) {
        dependencies.send({ type: 'data', data });
      }
    } catch (error) {
      dependencies.send({ type: 'error', message: formatPtyHelperError(error) });
      exitHelper(1);
    }
  };

  return {
    async handle(command): Promise<void> {
      try {
        switch (command.type) {
          case 'create':
            handleCreate(command);
            return;
          case 'write':
            ptyProcess?.write(command.data);
            return;
          case 'resize':
            ptyProcess?.resize(command.cols, command.rows);
            return;
          case 'destroy':
            if (!ptyProcess) {
              exitHelper(0);
              return;
            }
            destroyRequested = true;
            try {
              dataDisposable?.dispose();
            } catch {
              // PTY 可能已经停止发送数据。
            }
            dataDisposable = null;
            // 保留 exit 监听，父进程最多等 3 秒；超时后会强制清理整个 helper 子树。
            ptyProcess.kill();
            return;
        }
      } catch (error) {
        dependencies.send({ type: 'error', message: formatPtyHelperError(error) });
      }
    },
  };
}
