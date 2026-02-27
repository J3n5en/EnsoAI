import type { ProxySettings } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { appDetector } from '../services/app/AppDetector';
import { validateLocalPath } from '../services/app/PathValidator';
import { getRecentProjects } from '../services/app/RecentProjectsService';
import { applyProxy, testProxy } from '../services/proxy/ProxyConfig';
import { autoUpdaterService } from '../services/updater/AutoUpdater';

export function registerAppHandlers() {
  ipcMain.handle(IPC_CHANNELS.APP_DETECT, async () => {
    return await appDetector.detectApps();
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_OPEN_WITH,
    async (
      _,
      path: string,
      bundleId: string,
      options?: {
        line?: number;
        workspacePath?: string;
        openFiles?: string[];
        activeFile?: string;
      }
    ) => {
      await appDetector.openPath(path, bundleId, options);
    }
  );

  ipcMain.handle(IPC_CHANNELS.APP_GET_ICON, async (_, bundleId: string) => {
    return await appDetector.getAppIcon(bundleId);
  });

  ipcMain.handle(IPC_CHANNELS.APP_SET_PROXY, async (_, settings: ProxySettings) => {
    await applyProxy(settings);
    // Sync proxy config to electron-updater's dedicated session after applying session proxy
    try {
      await autoUpdaterService.applyCurrentProxySettings();
    } catch (error) {
      console.error('Failed to apply proxy to updater session:', error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_TEST_PROXY, (_, proxyUrl: string) => testProxy(proxyUrl));

  ipcMain.handle(IPC_CHANNELS.APP_RECENT_PROJECTS, async () => {
    return await getRecentProjects();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_VALIDATE_LOCAL_PATH, async (_, path: string) => {
    return await validateLocalPath(path);
  });
}
