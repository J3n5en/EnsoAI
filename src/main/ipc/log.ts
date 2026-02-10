import path from 'node:path';
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
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const fileName = `ensoai-${year}-${month}-${day}.log`;
    return path.join(app.getPath('logs'), fileName);
  });
}
