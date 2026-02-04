import type { ProxySettings } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { appDetector } from '../services/app/AppDetector';
import { getRecentProjects, validateLocalPath } from '../services/app/RecentProjectsService';
import { applyProxy, testProxy } from '../services/proxy/ProxyConfig';

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

  ipcMain.handle(IPC_CHANNELS.APP_SET_PROXY, (_, settings: ProxySettings) => applyProxy(settings));

  ipcMain.handle(IPC_CHANNELS.APP_TEST_PROXY, (_, proxyUrl: string) => testProxy(proxyUrl));

  ipcMain.handle(IPC_CHANNELS.APP_RECENT_PROJECTS, () => {
    return getRecentProjects();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_VALIDATE_LOCAL_PATH, (_, path: string) => {
    return validateLocalPath(path);
  });
}
