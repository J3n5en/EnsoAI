import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import { FileWatcher } from '../services/files/FileWatcher';

const watchers = new Map<string, FileWatcher>();

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_, filePath: string) => {
    const content = await readFile(filePath, 'utf-8');
    return content;
  });

  ipcMain.handle(IPC_CHANNELS.FILE_WRITE, async (_, filePath: string, content: string) => {
    await writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.FILE_LIST, async (_, dirPath: string): Promise<FileEntry[]> => {
    const entries = await readdir(dirPath);
    const result: FileEntry[] = [];

    for (const name of entries) {
      // Skip hidden files and common ignore patterns
      if (name.startsWith('.') || name === 'node_modules') {
        continue;
      }

      const fullPath = join(dirPath, name);
      try {
        const stats = await stat(fullPath);
        result.push({
          name,
          path: fullPath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtimeMs,
        });
      } catch {
        // Skip files we can't stat
      }
    }

    return result.sort((a, b) => {
      // Directories first
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  });

  ipcMain.handle(IPC_CHANNELS.FILE_WATCH_START, async (event, dirPath: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    if (watchers.has(dirPath)) {
      return;
    }

    const watcher = new FileWatcher(dirPath, (eventType, path) => {
      window.webContents.send(IPC_CHANNELS.FILE_CHANGE, { type: eventType, path });
    });

    await watcher.start();
    watchers.set(dirPath, watcher);
  });

  ipcMain.handle(IPC_CHANNELS.FILE_WATCH_STOP, async (_, dirPath: string) => {
    const watcher = watchers.get(dirPath);
    if (watcher) {
      await watcher.stop();
      watchers.delete(dirPath);
    }
  });
}
