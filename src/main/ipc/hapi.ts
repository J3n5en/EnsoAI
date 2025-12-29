import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IPC_CHANNELS, type ShellConfig } from '@shared/types';
import { app, BrowserWindow, ipcMain } from 'electron';
import { type CloudflaredConfig, cloudflaredManager } from '../services/hapi/CloudflaredManager';
import { type HapiConfig, hapiServerManager } from '../services/hapi/HapiServerManager';

interface StoredHapiSettings {
  enabled: boolean;
  webappPort: number;
  cliApiToken: string;
  telegramBotToken: string;
  webappUrl: string;
  allowedChatIds: string;
  // Cloudflared settings
  cfEnabled: boolean;
  tunnelMode: 'quick' | 'auth';
  tunnelToken: string;
  useHttp2: boolean;
}

export function registerHapiHandlers(): void {
  // Check global hapi installation (cached)
  ipcMain.handle(
    IPC_CHANNELS.HAPI_CHECK_GLOBAL,
    async (_, forceRefresh?: boolean, shellConfig?: ShellConfig) => {
      return await hapiServerManager.checkGlobalInstall(forceRefresh, shellConfig);
    }
  );

  // Check global happy installation (cached)
  ipcMain.handle(
    IPC_CHANNELS.HAPPY_CHECK_GLOBAL,
    async (_, forceRefresh?: boolean, shellConfig?: ShellConfig) => {
      return await hapiServerManager.checkHappyGlobalInstall(forceRefresh, shellConfig);
    }
  );

  // Hapi Server handlers
  ipcMain.handle(IPC_CHANNELS.HAPI_START, async (_, config: HapiConfig) => {
    return await hapiServerManager.start(config);
  });

  ipcMain.handle(IPC_CHANNELS.HAPI_STOP, async () => {
    return await hapiServerManager.stop();
  });

  ipcMain.handle(IPC_CHANNELS.HAPI_RESTART, async (_, config: HapiConfig) => {
    return await hapiServerManager.restart(config);
  });

  ipcMain.handle(IPC_CHANNELS.HAPI_GET_STATUS, async () => {
    return hapiServerManager.getStatus();
  });

  hapiServerManager.on('statusChanged', (status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.HAPI_STATUS_CHANGED, status);
      }
    }
  });

  // Cloudflared handlers
  ipcMain.handle(IPC_CHANNELS.CLOUDFLARED_CHECK, async () => {
    return await cloudflaredManager.checkInstalled();
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDFLARED_INSTALL, async () => {
    return await cloudflaredManager.install();
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDFLARED_START, async (_, config: CloudflaredConfig) => {
    return await cloudflaredManager.start(config);
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDFLARED_STOP, async () => {
    return await cloudflaredManager.stop();
  });

  ipcMain.handle(IPC_CHANNELS.CLOUDFLARED_GET_STATUS, async () => {
    return cloudflaredManager.getStatus();
  });

  cloudflaredManager.on('statusChanged', (status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.CLOUDFLARED_STATUS_CHANGED, status);
      }
    }
  });
}

export function cleanupHapi(): void {
  hapiServerManager.cleanup();
  cloudflaredManager.cleanup();
}

export async function autoStartHapi(): Promise<void> {
  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json');
    if (!existsSync(settingsPath)) {
      return;
    }

    const data = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const hapiSettings = data?.['enso-settings']?.state?.hapiSettings as
      | StoredHapiSettings
      | undefined;

    if (hapiSettings?.enabled) {
      console.log('[hapi] Auto-starting server from saved settings...');
      const config: HapiConfig = {
        webappPort: hapiSettings.webappPort || 3006,
        cliApiToken: hapiSettings.cliApiToken || '',
        telegramBotToken: hapiSettings.telegramBotToken || '',
        webappUrl: hapiSettings.webappUrl || '',
        allowedChatIds: hapiSettings.allowedChatIds || '',
      };
      await hapiServerManager.start(config);

      // Auto-start cloudflared if enabled
      if (hapiSettings.cfEnabled) {
        console.log('[cloudflared] Auto-starting tunnel from saved settings...');
        // Wait for hapi to be ready before starting cloudflared
        const waitForReady = (): Promise<void> => {
          return new Promise((resolve) => {
            const checkReady = () => {
              const status = hapiServerManager.getStatus();
              if (status.ready) {
                resolve();
              } else if (!status.running) {
                // Hapi failed to start, don't start cloudflared
                resolve();
              } else {
                setTimeout(checkReady, 500);
              }
            };
            checkReady();
          });
        };

        await waitForReady();

        const hapiStatus = hapiServerManager.getStatus();
        if (hapiStatus.ready) {
          const cfConfig: CloudflaredConfig = {
            mode: hapiSettings.tunnelMode || 'quick',
            port: hapiSettings.webappPort || 3006,
            token: hapiSettings.tunnelMode === 'auth' ? hapiSettings.tunnelToken : undefined,
            protocol: hapiSettings.useHttp2 ? 'http2' : undefined,
          };
          await cloudflaredManager.start(cfConfig);
        }
      }
    }
  } catch (error) {
    console.error('[hapi] Auto-start failed:', error);
  }
}
