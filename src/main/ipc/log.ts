import { IPC_CHANNELS } from '@shared/types';
import { app, ipcMain, shell } from 'electron';
import log, { initLogger } from '../utils/logger';

export function registerLogHandlers(): void {
  // Update logging configuration (enabled state and/or level)
  ipcMain.handle(
    IPC_CHANNELS.LOG_UPDATE_CONFIG,
    async (_, config: { enabled: boolean; level: 'error' | 'warn' | 'info' | 'debug' }) => {
      initLogger(config.enabled, config.level);
      log.info(`Logging config updated: enabled=${config.enabled}, level=${config.level}`);
    }
  );

  // Open log folder
  ipcMain.handle(IPC_CHANNELS.LOG_OPEN_FOLDER, async () => {
    const logDir = app.getPath('logs');
    const error = await shell.openPath(logDir);
    if (error) {
      log.error(`Failed to open log folder: ${error}`);
      throw new Error(`Failed to open log folder: ${error}`);
    }
  });

  // Get log file path (current day's log file)
  ipcMain.handle(IPC_CHANNELS.LOG_GET_PATH, async () => {
    return log.transports.file.getFile()?.path ?? '';
  });
}
