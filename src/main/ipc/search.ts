import type { ContentSearchParams, FileSearchParams } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { searchService } from '../services/search/SearchService';

export function registerSearchHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_FILES, async (_, params: FileSearchParams) => {
    const results = await searchService.searchFiles(params);
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH_CONTENT, async (_, params: ContentSearchParams) => {
    const results = await searchService.searchContent(params);
    return results;
  });
}
