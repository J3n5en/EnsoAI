import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { type FileEntry, type FileReadResult, IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';
import simpleGit from 'simple-git';
import { FileWatcher } from '../services/files/FileWatcher';
import { registerAllowedLocalFileRoot } from '../services/files/LocalFileAccess';

/**
 * Normalize encoding name to a consistent format
 */
function normalizeEncoding(encoding: string): string {
  const normalized = encoding.toLowerCase().replace(/[^a-z0-9]/g, '');
  const encodingMap: Record<string, string> = {
    gb2312: 'gb2312',
    gbk: 'gbk',
    gb18030: 'gb18030',
    big5: 'big5',
    shiftjis: 'shift_jis',
    eucjp: 'euc-jp',
    euckr: 'euc-kr',
    iso88591: 'iso-8859-1',
    windows1252: 'windows-1252',
    utf8: 'utf-8',
    utf16le: 'utf-16le',
    utf16be: 'utf-16be',
    ascii: 'ascii',
  };
  return encodingMap[normalized] || encoding;
}

/**
 * Detect file encoding from buffer
 */
function detectEncoding(buffer: Buffer): { encoding: string; confidence: number } {
  // Check for BOM first
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: 'utf-8', confidence: 1 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: 'utf-16le', confidence: 1 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { encoding: 'utf-16be', confidence: 1 };
  }

  const result = jschardet.detect(buffer);
  if (result?.encoding) {
    return {
      encoding: normalizeEncoding(result.encoding),
      confidence: result.confidence,
    };
  }

  // Default to utf-8 if detection fails
  return { encoding: 'utf-8', confidence: 0 };
}

const watchers = new Map<string, FileWatcher>();

/**
 * Stop all file watchers for paths under the given directory
 */
export async function stopWatchersInDirectory(dirPath: string): Promise<void> {
  const normalizedDir = dirPath.replace(/\\/g, '/').toLowerCase();

  for (const [path, watcher] of watchers.entries()) {
    const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
    if (normalizedPath === normalizedDir || normalizedPath.startsWith(`${normalizedDir}/`)) {
      await watcher.stop();
      watchers.delete(path);
    }
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_, filePath: string): Promise<FileReadResult> => {
    const buffer = await readFile(filePath);
    const { encoding: detectedEncoding, confidence } = detectEncoding(buffer);

    let content: string;
    try {
      content = iconv.decode(buffer, detectedEncoding);
    } catch {
      content = buffer.toString('utf-8');
      return { content, encoding: 'utf-8', detectedEncoding: 'utf-8', confidence: 0 };
    }

    return { content, encoding: detectedEncoding, detectedEncoding, confidence };
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE_WRITE,
    async (_, filePath: string, content: string, encoding?: string) => {
      const targetEncoding = encoding || 'utf-8';
      const buffer = iconv.encode(content, targetEncoding);
      await writeFile(filePath, buffer);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_CREATE,
    async (_, filePath: string, content = '', options?: { overwrite?: boolean }) => {
      await mkdir(dirname(filePath), { recursive: true });
      const flag = options?.overwrite ? 'w' : 'wx';
      await writeFile(filePath, content, { encoding: 'utf-8', flag });
    }
  );

  ipcMain.handle(IPC_CHANNELS.FILE_CREATE_DIR, async (_, dirPath: string) => {
    await mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle(IPC_CHANNELS.FILE_RENAME, async (_, fromPath: string, toPath: string) => {
    await rename(fromPath, toPath);
  });

  ipcMain.handle(IPC_CHANNELS.FILE_MOVE, async (_, fromPath: string, toPath: string) => {
    await rename(fromPath, toPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE_DELETE,
    async (_, targetPath: string, options?: { recursive?: boolean }) => {
      await rm(targetPath, { recursive: options?.recursive ?? true, force: false });
    }
  );

  ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, async (_, filePath: string): Promise<boolean> => {
    try {
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE_LIST,
    async (_, dirPath: string, gitRoot?: string): Promise<FileEntry[]> => {
      if (gitRoot) {
        registerAllowedLocalFileRoot(gitRoot);
      }

      const entries = await readdir(dirPath);
      const result: FileEntry[] = [];

      for (const name of entries) {
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

      // 检查 gitignore
      if (gitRoot) {
        try {
          const git = simpleGit(gitRoot);
          const relativePaths = result.map((f) => relative(gitRoot, f.path));
          const ignoredResult = await git.checkIgnore(relativePaths);
          const ignoredSet = new Set(ignoredResult);
          for (const file of result) {
            const relPath = relative(gitRoot, file.path);
            file.ignored = ignoredSet.has(relPath);
          }
        } catch {
          // 忽略 git 错误
        }
      }

      return result.sort((a, b) => {
        // Directories first
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    }
  );

  ipcMain.handle(IPC_CHANNELS.FILE_WATCH_START, async (event, dirPath: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    if (watchers.has(dirPath)) {
      return;
    }

    const watcher = new FileWatcher(dirPath, (eventType, path) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.FILE_CHANGE, { type: eventType, path });
      }
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

export async function stopAllFileWatchers(): Promise<void> {
  const stopPromises: Promise<void>[] = [];
  for (const watcher of watchers.values()) {
    stopPromises.push(watcher.stop());
  }
  await Promise.all(stopPromises);
  watchers.clear();
}

/**
 * Synchronous version for signal handlers.
 * Fires unsubscribe without waiting - process will exit anyway.
 */
export function stopAllFileWatchersSync(): void {
  for (const watcher of watchers.values()) {
    watcher.stop().catch(() => {});
  }
  watchers.clear();
}
