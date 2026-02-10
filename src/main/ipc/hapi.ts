import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IPC_CHANNELS } from '@shared/types';
import { app, BrowserWindow, ipcMain } from 'electron';
import { type CloudflaredConfig, cloudflaredManager } from '../services/hapi/CloudflaredManager';
import { hapiRunnerManager } from '../services/hapi/HapiRunnerManager';
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
  // Hapi runner settings
  runnerEnabled?: boolean;
}

interface HapiControlConfig extends HapiConfig {
  runnerEnabled?: boolean;
}

function waitForHapiReady(maxAttempts = 60, intervalMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;

    const checkReady = () => {
      attempts++;
      const status = hapiServerManager.getStatus();
      if (status.ready) {
        resolve(true);
        return;
      }

      if (!status.running || attempts >= maxAttempts) {
        resolve(false);
        return;
      }

      setTimeout(checkReady, intervalMs);
    };

    checkReady();
  });
}

async function syncRunnerState(runnerEnabled: boolean): Promise<void> {
  if (!runnerEnabled) {
    await hapiRunnerManager.stop();
    return;
  }

  const ready = await waitForHapiReady();
  if (!ready) {
    console.warn('[hapi:runner] Skip start: hapi server is not ready');
    return;
  }

  const runnerStatus = await hapiRunnerManager.start();
  if (!runnerStatus.running && runnerStatus.error) {
    console.error('[hapi:runner] Start failed:', runnerStatus.error);
  }
}

function syncRunnerStateInBackground(runnerEnabled: boolean): void {
  void syncRunnerState(runnerEnabled).catch((error) => {
    console.error('[hapi:runner] Failed to sync runner state:', error);
  });
}

export function registerHapiHandlers(): void {
  // Check global hapi installation (cached)
  ipcMain.handle(IPC_CHANNELS.HAPI_CHECK_GLOBAL, async (_, forceRefresh?: boolean) => {
    return await hapiServerManager.checkGlobalInstall(forceRefresh);
  });

  // Check global happy installation (cached)
  ipcMain.handle(IPC_CHANNELS.HAPPY_CHECK_GLOBAL, async (_, forceRefresh?: boolean) => {
    return await hapiServerManager.checkHappyGlobalInstall(forceRefresh);
  });

  // Hapi Server handlers
  ipcMain.handle(IPC_CHANNELS.HAPI_START, async (_, config: HapiControlConfig) => {
    const { runnerEnabled = false, ...hapiConfig } = config;
    const status = await hapiServerManager.start(hapiConfig);

    if (status.running) {
      syncRunnerStateInBackground(runnerEnabled);
    }

    return status;
  });

  ipcMain.handle(IPC_CHANNELS.HAPI_STOP, async () => {
    await hapiRunnerManager.stop();
    return await hapiServerManager.stop();
  });

  ipcMain.handle(IPC_CHANNELS.HAPI_RESTART, async (_, config: HapiControlConfig) => {
    const { runnerEnabled = false, ...hapiConfig } = config;

    await hapiRunnerManager.stop();
    const status = await hapiServerManager.restart(hapiConfig);

    if (status.running) {
      syncRunnerStateInBackground(runnerEnabled);
    }

    return status;
  });

  ipcMain.handle(IPC_CHANNELS.HAPI_GET_STATUS, async () => {
    return hapiServerManager.getStatus();
  });

  // Hapi Runner handlers
  ipcMain.handle(IPC_CHANNELS.HAPI_RUNNER_START, async () => {
    const hapiStatus = hapiServerManager.getStatus();
    if (!hapiStatus.running) {
      return {
        running: false,
        error: 'Hapi server is not running',
      };
    }

    const ready = hapiStatus.ready || (await waitForHapiReady());
    if (!ready) {
      return {
        running: false,
        error: 'Hapi server is not ready',
      };
    }

    return await hapiRunnerManager.start();
  });

  ipcMain.handle(IPC_CHANNELS.HAPI_RUNNER_STOP, async () => {
    return await hapiRunnerManager.stop();
  });

  ipcMain.handle(IPC_CHANNELS.HAPI_RUNNER_GET_STATUS, async () => {
    return await hapiRunnerManager.getStatus();
  });

  hapiServerManager.on('statusChanged', (status) => {
    if (!status.running && hapiRunnerManager.getStatus().running) {
      void hapiRunnerManager.stop();
    }

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.HAPI_STATUS_CHANGED, status);
      }
    }
  });

  hapiRunnerManager.on('statusChanged', (status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.HAPI_RUNNER_STATUS_CHANGED, status);
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

export async function cleanupHapi(runnerStopTimeoutMs = 5000): Promise<void> {
  try {
    await hapiRunnerManager.cleanup(runnerStopTimeoutMs);
  } catch (error) {
    console.warn('[hapi:runner] Cleanup error:', error);
  }

  hapiServerManager.cleanup();
  cloudflaredManager.cleanup();
}

export function cleanupHapiSync(): void {
  hapiRunnerManager.cleanupSync();
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

      // Auto-start runner if enabled
      if (hapiSettings.runnerEnabled) {
        console.log('[hapi:runner] Auto-starting runner from saved settings...');

        const ready = await waitForHapiReady();
        if (ready) {
          await hapiRunnerManager.start();
        } else {
          console.warn('[hapi:runner] Skip auto-start: hapi server is not ready');
        }
      }

      // Auto-start cloudflared if enabled
      if (hapiSettings.cfEnabled) {
        console.log('[cloudflared] Auto-starting tunnel from saved settings...');

        const ready = await waitForHapiReady();
        if (ready) {
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
