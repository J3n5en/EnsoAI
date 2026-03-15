import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { tmuxDetector } from '../services/cli/TmuxDetector';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { remoteSessionManager } from '../services/remote/RemoteSessionManager';

export function registerTmuxHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TMUX_CHECK, async (event, forceRefresh?: boolean) => {
    const session = remoteSessionManager.getSession(event.sender);
    if (session) {
      return await remoteConnectionManager.call(session.connectionId, 'tmux:check', {
        forceRefresh,
      });
    }
    return await tmuxDetector.check(forceRefresh);
  });

  ipcMain.handle(IPC_CHANNELS.TMUX_KILL_SESSION, async (event, name: string) => {
    const session = remoteSessionManager.getSession(event.sender);
    if (session) {
      return await remoteConnectionManager.call(session.connectionId, 'tmux:killSession', {
        name,
      });
    }
    return await tmuxDetector.killSession(name);
  });
}

export async function cleanupTmux(): Promise<void> {
  await tmuxDetector.killServer();
}

export function cleanupTmuxSync(): void {
  tmuxDetector.killServerSync();
}
