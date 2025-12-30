import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CustomAgent } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { app, ipcMain } from 'electron';
import { type CliDetectOptions, cliDetector } from '../services/cli/CliDetector';
import { cliInstaller } from '../services/cli/CliInstaller';

export interface EmbeddedCliPath {
  available: boolean;
  nodePath: string;
  cliPath: string;
  version?: string;
}

function getEmbeddedCliPath(): EmbeddedCliPath {
  // In production: process.resourcesPath points to Resources folder
  // In development: use resources folder in project root
  const isDev = !app.isPackaged;
  const cliPath = isDev
    ? join(app.getAppPath(), 'resources', 'cli.js')
    : join(process.resourcesPath, 'cli.js');

  const available = existsSync(cliPath);
  let version: string | undefined;

  // Extract version from cli.js (look for "// Version: x.x.x" comment)
  if (available) {
    try {
      const fs = require('node:fs');
      const content = fs.readFileSync(cliPath, 'utf8').slice(0, 500);
      const match = content.match(/\/\/\s*Version:\s*(\d+\.\d+\.\d+)/);
      if (match) {
        version = match[1];
      }
    } catch {
      // Ignore errors reading version
    }
  }

  return {
    available,
    nodePath: process.execPath,
    cliPath,
    version,
  };
}

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

  // Embedded CLI path handler
  ipcMain.handle(IPC_CHANNELS.CLI_EMBEDDED_PATH, () => {
    return getEmbeddedCliPath();
  });
}
