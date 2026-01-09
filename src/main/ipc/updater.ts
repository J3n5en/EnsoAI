import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';

function isUpdaterEnabled(): boolean {
  // Linux deb/rpm: avoid loading electron-updater (it can trigger GTK crashes on some systems).
  return !(process.platform === 'linux' && !process.env.APPIMAGE);
}

export function registerUpdaterHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK, async () => {
    if (!isUpdaterEnabled()) return;
    const { autoUpdaterService } = await import('../services/updater/AutoUpdater');
    await autoUpdaterService.checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL, async () => {
    if (!isUpdaterEnabled()) return;
    const { autoUpdaterService } = await import('../services/updater/AutoUpdater');
    autoUpdaterService.quitAndInstall();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATER_DOWNLOAD_UPDATE, async () => {
    if (!isUpdaterEnabled()) return;
    const { autoUpdaterService } = await import('../services/updater/AutoUpdater');
    await autoUpdaterService.downloadUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATER_SET_AUTO_UPDATE_ENABLED, async (_, enabled: boolean) => {
    if (!isUpdaterEnabled()) return;
    const { autoUpdaterService } = await import('../services/updater/AutoUpdater');
    autoUpdaterService.setAutoUpdateEnabled(enabled);
  });
}
