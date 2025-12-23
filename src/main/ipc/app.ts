import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { appDetector } from '../services/app/AppDetector';

export function registerAppHandlers() {
  ipcMain.handle(IPC_CHANNELS.APP_DETECT, async () => {
    return await appDetector.detectApps();
  });

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_WITH, async (_, path: string, bundleId: string) => {
    await appDetector.openPath(path, bundleId);
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_ICON, async (_, bundleId: string) => {
    return await appDetector.getAppIcon(bundleId);
  });
}
