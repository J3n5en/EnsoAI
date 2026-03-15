import { IPC_CHANNELS, type ShellConfig } from '@shared/types';
import { ipcMain } from 'electron';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { remoteSessionManager } from '../services/remote/RemoteSessionManager';
import { shellDetector } from '../services/terminal/ShellDetector';

export function registerShellHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_DETECT, async (event) => {
    const session = remoteSessionManager.getSession(event.sender);
    if (session) {
      return await remoteConnectionManager.call(session.connectionId, 'shell:detect', {});
    }
    return await shellDetector.detectShells();
  });

  ipcMain.handle(
    IPC_CHANNELS.SHELL_RESOLVE_FOR_COMMAND,
    async (event, config: ShellConfig): Promise<{ shell: string; execArgs: string[] }> => {
      const session = remoteSessionManager.getSession(event.sender);
      if (session) {
        return await remoteConnectionManager.call(session.connectionId, 'shell:resolveForCommand', {
          config,
        });
      }
      return shellDetector.resolveShellForCommand(config);
    }
  );
}
