import { IPC_CHANNELS, type ShellConfig } from '@shared/types';
import { ipcMain } from 'electron';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';
import { shellDetector } from '../services/terminal/ShellDetector';

export function registerShellHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_DETECT, async (_, repoPath?: string) => {
    const context = resolveRepositoryRuntimeContext(repoPath);
    if (context.kind === 'remote' && context.connectionId) {
      return await remoteConnectionManager.call(context.connectionId, 'shell:detect', {});
    }
    return await shellDetector.detectShells();
  });

  ipcMain.handle(
    IPC_CHANNELS.SHELL_RESOLVE_FOR_COMMAND,
    async (
      _,
      repoPath: string | undefined,
      config: ShellConfig
    ): Promise<{ shell: string; execArgs: string[] }> => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote' && context.connectionId) {
        return await remoteConnectionManager.call(context.connectionId, 'shell:resolveForCommand', {
          config,
        });
      }
      return shellDetector.resolveShellForCommand(config);
    }
  );
}
