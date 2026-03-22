import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { localSessionManager } from '../services/LocalSessionManager';
import { isLegacyLocalStorageMigrated } from '../services/SharedSessionState';

export function registerSessionStorageHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SESSION_STORAGE_GET, async () => {
    return localSessionManager.getSessionState();
  });

  ipcMain.handle(
    IPC_CHANNELS.SESSION_STORAGE_SYNC_LOCAL_STORAGE,
    async (_, snapshot: Record<string, string>) => {
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
