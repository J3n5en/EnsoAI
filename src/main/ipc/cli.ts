import type { CustomAgent } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { cliDetector } from '../services/cli/CliDetector';
import { cliInstaller } from '../services/cli/CliInstaller';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { remoteSessionManager } from '../services/remote/RemoteSessionManager';

export function registerCliHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CLI_DETECT_ONE,
    async (event, agentId: string, customAgent?: CustomAgent, customPath?: string) => {
      const session = remoteSessionManager.getSession(event.sender);
      if (session) {
        return await remoteConnectionManager.call(session.connectionId, 'cli:detectOne', {
          agentId,
          customAgent,
          customPath,
        });
      }
      return await cliDetector.detectOne(agentId, customAgent, customPath);
    }
  );

  // CLI Installer handlers
  ipcMain.handle(IPC_CHANNELS.CLI_INSTALL_STATUS, async () => {
    return await cliInstaller.checkInstalled();
  });

  ipcMain.handle(IPC_CHANNELS.CLI_INSTALL, async () => {
    return await cliInstaller.install();
  });

  ipcMain.handle(IPC_CHANNELS.CLI_UNINSTALL, async () => {
    return await cliInstaller.uninstall();
  });
}
