import type { CustomAgent } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { type CliDetectOptions, cliDetector } from '../services/cli/CliDetector';
import { cliInstaller } from '../services/cli/CliInstaller';

interface ExtendedCliDetectOptions extends CliDetectOptions {
  forceRefresh?: boolean;
}

export function registerCliHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CLI_DETECT,
    async (_, customAgents?: CustomAgent[], options?: ExtendedCliDetectOptions) => {
      // Force refresh cache if requested
      if (options?.forceRefresh) {
        cliDetector.invalidateCache();
      }
      return await cliDetector.detectAll(customAgents, options);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLI_DETECT_ONE,
    async (_, agentId: string, customAgent?: CustomAgent, options?: CliDetectOptions) => {
      return await cliDetector.detectOne(agentId, customAgent, options);
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
