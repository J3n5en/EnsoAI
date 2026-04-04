import { type ExternalSessionSnapshot, IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import { externalSessionApiServer } from '../services/externalSession/ExternalSessionApiServer';

export function registerExternalSessionHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.EXTERNAL_SESSION_SYNC,
    async (event, snapshot: ExternalSessionSnapshot) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || window.isDestroyed()) {
        throw new Error('Window is not available');
      }
      externalSessionApiServer.updateSnapshot(window.id, snapshot);
    }
  );
}
