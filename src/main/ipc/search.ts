import type { ContentSearchParams, FileSearchParams } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { isRemoteVirtualPath } from '../services/remote/RemotePath';
import { remoteRepositoryBackend } from '../services/remote/RemoteRepositoryBackend';
import { searchService } from '../services/search/SearchService';

export function registerSearchHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_FILES, async (_, params: FileSearchParams) => {
    if (isRemoteVirtualPath(params.rootPath)) {
      return remoteRepositoryBackend.searchFiles(params.rootPath, params.query, params.maxResults);
    }
    const results = await searchService.searchFiles(params);
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH_CONTENT, async (_, params: ContentSearchParams) => {
    if (isRemoteVirtualPath(params.rootPath)) {
      return remoteRepositoryBackend.searchContent(params);
    }
    const results = await searchService.searchContent(params);
    return results;
  });
}
