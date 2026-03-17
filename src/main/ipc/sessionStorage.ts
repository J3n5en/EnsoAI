import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { localSessionManager } from '../services/LocalSessionManager';
import { remoteSessionManager } from '../services/remote/RemoteSessionManager';
import { isLegacyLocalStorageMigrated } from '../services/SharedSessionState';

export function registerSessionStorageHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SESSION_STORAGE_GET, async (event) => {
    if (remoteSessionManager.hasSession(event.sender)) {
      return remoteSessionManager.getSessionState(event.sender);
    }
    return localSessionManager.getSessionState();
  });

  ipcMain.handle(
    IPC_CHANNELS.SESSION_STORAGE_SYNC_LOCAL_STORAGE,
    async (event, snapshot: Record<string, string>) => {
      if (remoteSessionManager.hasSession(event.sender)) {
        await remoteSessionManager.syncLocalStorage(event.sender, snapshot);
        return true;
      }
      localSessionManager.syncLocalStorage(snapshot);
      return true;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_STORAGE_IMPORT_LOCAL_STORAGE,
    async (_event, snapshot: Record<string, string>) => {
      localSessionManager.importLegacyLocalStorage(snapshot);
      return true;
    }
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_STORAGE_IS_LEGACY_LOCAL_STORAGE_MIGRATED, async () => {
    return isLegacyLocalStorageMigrated();
  });
}
