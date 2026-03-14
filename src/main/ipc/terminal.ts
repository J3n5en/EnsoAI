import { basename } from 'node:path';
import {
  IPC_CHANNELS,
  type TerminalCreateOptions,
  type TerminalResizeOptions,
} from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { createRemoteError } from '../services/remote/RemoteI18n';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '../services/remote/RemotePath';
import { PtyManager } from '../services/terminal/PtyManager';

export const ptyManager = new PtyManager();

export function destroyAllTerminals(): void {
  ptyManager.destroyAll();
}

/**
 * Destroy all terminals and wait for them to fully exit.
 * This should be used during app shutdown to prevent crashes.
 */
export async function destroyAllTerminalsAndWait(): Promise<void> {
  await ptyManager.destroyAllAndWait();
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeRemoteShell(shell?: string): string | undefined {
  if (!shell) return undefined;
  return basename(shell);
}

function buildRemotePosixCommand(cwd: string, options: TerminalCreateOptions): string {
  const steps: string[] = [`cd -- ${quotePosix(cwd)}`];
  if (options.initialCommand?.trim()) {
    steps.push(options.initialCommand.trim());
  }

  const remoteShell = normalizeRemoteShell(options.shell);
  if (remoteShell) {
    const execCommand = [remoteShell, ...(options.args ?? [])].map(quotePosix).join(' ');
    steps.push(`exec ${execCommand}`);
  } else {
    steps.push(`exec "\${SHELL:-/bin/sh}" -il`);
  }

  return `sh -lc ${quotePosix(steps.join(' && '))}`;
}

function buildRemoteWindowsCommand(cwd: string, options: TerminalCreateOptions): string {
  const remoteShell = normalizeRemoteShell(options.shell);
  const steps: string[] = [`Set-Location -LiteralPath ${quotePowerShell(cwd)}`];

  if (options.initialCommand?.trim()) {
    steps.push(options.initialCommand.trim());
  }

  if (remoteShell) {
    const execCommand = [
      `& ${quotePowerShell(remoteShell)}`,
      ...(options.args ?? []).map(quotePowerShell),
    ].join(' ');
    steps.push(execCommand);
    return `powershell -NoLogo -Command "${steps.join('; ')}"`;
  }

  return `powershell -NoLogo -NoExit -Command "${steps.join('; ')}"`;
}

async function resolveRemoteTerminalOptions(
  options: TerminalCreateOptions
): Promise<TerminalCreateOptions> {
  if (!options.cwd || !isRemoteVirtualPath(options.cwd)) {
    return options;
  }

  const { connectionId, remotePath } = parseRemoteVirtualPath(options.cwd);
  const status = await remoteConnectionManager.connect(connectionId);
  const platform = status.platform;
  if (!platform) {
    throw createRemoteError('Remote platform unavailable for {{connectionId}}', { connectionId });
  }

  const remoteCommand =
    platform === 'win32'
      ? buildRemoteWindowsCommand(remotePath, options)
      : buildRemotePosixCommand(remotePath, options);
  const sshOptions = await remoteConnectionManager.getTerminalSshOptions(
    connectionId,
    remoteCommand
  );

  return {
    ...options,
    spawnCwd: process.env.HOME || process.env.USERPROFILE,
    shell: 'ssh',
    args: sshOptions.args,
    env: {
      ...options.env,
      ...sshOptions.env,
    },
    shellConfig: undefined,
    initialCommand: undefined,
  };
}

export function registerTerminalHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (event, options: TerminalCreateOptions = {}) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        throw new Error('No window found');
      }

      const resolvedOptions = await resolveRemoteTerminalOptions(options);
      const id = ptyManager.create(
        resolvedOptions,
        (data) => {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { id, data });
          }
        },
        (exitCode, signal) => {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { id, exitCode, signal });
          }
        }
      );

      return id;
    }
  );

  ipcMain.handle(IPC_CHANNELS.TERMINAL_WRITE, async (_, id: string, data: string) => {
    ptyManager.write(id, data);
  });

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_RESIZE,
    async (_, id: string, size: TerminalResizeOptions) => {
      ptyManager.resize(id, size.cols, size.rows);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TERMINAL_DESTROY, async (_, id: string) => {
    ptyManager.destroy(id);
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_GET_ACTIVITY, async (_, id: string) => {
    return ptyManager.getProcessActivity(id);
  });
}
