import { type ConnectionProfile, IPC_CHANNELS, type RemoteAuthResponse } from '@shared/types';
import { ipcMain } from 'electron';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';

export function registerRemoteHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.REMOTE_PROFILE_LIST, async () => {
    return remoteConnectionManager.loadProfiles();
  });

  ipcMain.handle(
    IPC_CHANNELS.REMOTE_PROFILE_SAVE,
    async (
      _,
      profile: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'> &
        Partial<Pick<ConnectionProfile, 'id'>>
    ) => {
      return remoteConnectionManager.saveProfile(profile);
    }
  );

  ipcMain.handle(IPC_CHANNELS.REMOTE_PROFILE_DELETE, async (_, profileId: string) => {
    await remoteConnectionManager.deleteProfile(profileId);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_TEST_CONNECTION, async (_, profileOrId) => {
    return remoteConnectionManager.testConnection(profileOrId as string | ConnectionProfile);
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_CONNECT, async (_, profileOrId) => {
    return remoteConnectionManager.connect(profileOrId as string | ConnectionProfile);
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_DISCONNECT, async (_, connectionId: string) => {
    await remoteConnectionManager.disconnect(connectionId);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_GET_STATUS, async (_, connectionId: string) => {
    return remoteConnectionManager.getStatus(connectionId);
  });

  ipcMain.handle(
    IPC_CHANNELS.REMOTE_DIRECTORY_LIST,
    async (_, profileOrId: string | ConnectionProfile, remotePath: string) => {
      return remoteConnectionManager.listDirectory(profileOrId, remotePath);
    }
  );

  ipcMain.handle(IPC_CHANNELS.REMOTE_HELPER_STATUS, async (_, profileOrId) => {
    return remoteConnectionManager.getHelperStatus(profileOrId as string | ConnectionProfile);
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_HELPER_INSTALL, async (_, profileOrId) => {
    return remoteConnectionManager.installHelperManually(profileOrId as string | ConnectionProfile);
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_HELPER_UPDATE, async (_, profileOrId) => {
    return remoteConnectionManager.updateHelper(profileOrId as string | ConnectionProfile);
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_HELPER_DELETE, async (_, profileOrId) => {
    return remoteConnectionManager.deleteHelper(profileOrId as string | ConnectionProfile);
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_BROWSE_ROOTS, async (_, profileOrId) => {
    return remoteConnectionManager.browseRoots(profileOrId as string | ConnectionProfile);
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_AUTH_RESPONSE, async (_, response: RemoteAuthResponse) => {
    return remoteConnectionManager.respondAuthPrompt(response);
  });
}
