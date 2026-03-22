import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { tmuxDetector } from '../services/cli/TmuxDetector';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';

export function registerTmuxHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TMUX_CHECK,
    async (_, repoPath: string | undefined, forceRefresh?: boolean) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote' && context.connectionId) {
        return await remoteConnectionManager.call(context.connectionId, 'tmux:check', {
          forceRefresh,
        });
      }
      return await tmuxDetector.check(forceRefresh);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TMUX_KILL_SESSION,
    async (_, repoPath: string | undefined, name: string) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote' && context.connectionId) {
        return await remoteConnectionManager.call(context.connectionId, 'tmux:killSession', {
          name,
        });
      }
      return await tmuxDetector.killSession(name);
    }
  );
}

export async function cleanupTmux(): Promise<void> {
  await tmuxDetector.killServer();
}

export function cleanupTmuxSync(): void {
  tmuxDetector.killServerSync();
}
