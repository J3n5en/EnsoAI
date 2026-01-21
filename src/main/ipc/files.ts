import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { type FileEntry, type FileReadResult, IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, ipcMain, shell } from 'electron';
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
    IPC_CHANNELS.FILE_REVEAL_IN_FILE_MANAGER,
    async (_, filePath: string): Promise<void> => {
      shell.showItemInFolder(filePath);
    }
  );

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

  // FILE_COPY: Copy a single file/directory
  ipcMain.handle(IPC_CHANNELS.FILE_COPY, async (_, sourcePath: string, targetPath: string) => {
    const sourceStats = await stat(sourcePath);

    if (sourceStats.isDirectory()) {
      // Recursively copy directory
      await copyDirectory(sourcePath, targetPath);
    } else {
      // Copy single file
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  });

  // FILE_CHECK_CONFLICTS: Check which files already exist in target directory
  ipcMain.handle(
    IPC_CHANNELS.FILE_CHECK_CONFLICTS,
    async (
      _,
      sources: string[],
      targetDir: string
    ): Promise<
      Array<{
        path: string;
        name: string;
        sourceSize: number;
        targetSize: number;
        sourceModified: number;
        targetModified: number;
      }>
    > => {
      const conflicts = [];

      for (const sourcePath of sources) {
        const sourceStats = await stat(sourcePath);
        const fileName = basename(sourcePath);
        const targetPath = join(targetDir, fileName);

        try {
          const targetStats = await stat(targetPath);
          conflicts.push({
            path: sourcePath,
            name: fileName,
            sourceSize: sourceStats.size,
            targetSize: targetStats.size,
            sourceModified: sourceStats.mtimeMs,
            targetModified: targetStats.mtimeMs,
          });
        } catch {
          // Target doesn't exist, no conflict
        }
      }

      return conflicts;
    }
  );

  // FILE_BATCH_COPY: Copy multiple files/directories with conflict resolution
  ipcMain.handle(
    IPC_CHANNELS.FILE_BATCH_COPY,
    async (
      _,
      sources: string[],
      targetDir: string,
      conflicts: Array<{ path: string; action: 'replace' | 'skip' | 'rename'; newName?: string }>
    ): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> => {
      const success: string[] = [];
      const failed: Array<{ path: string; error: string }> = [];

      // Build conflict resolution map
      const conflictMap = new Map(conflicts.map((c) => [c.path, c]));

      for (const sourcePath of sources) {
        try {
          const fileName = basename(sourcePath);
          let targetPath = join(targetDir, fileName);
          const conflict = conflictMap.get(sourcePath);

          if (conflict) {
            if (conflict.action === 'skip') {
              continue;
            }
            if (conflict.action === 'rename' && conflict.newName) {
              targetPath = join(targetDir, conflict.newName);
            }
            // 'replace' action: just overwrite
          }

          const sourceStats = await stat(sourcePath);

          if (sourceStats.isDirectory()) {
            await copyDirectory(sourcePath, targetPath);
          } else {
            await mkdir(dirname(targetPath), { recursive: true });
            await copyFile(sourcePath, targetPath);
          }

          success.push(sourcePath);
        } catch (error) {
          failed.push({
            path: sourcePath,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { success, failed };
    }
  );

  // FILE_BATCH_MOVE: Move multiple files/directories with conflict resolution
  ipcMain.handle(
    IPC_CHANNELS.FILE_BATCH_MOVE,
    async (
      _,
      sources: string[],
      targetDir: string,
      conflicts: Array<{ path: string; action: 'replace' | 'skip' | 'rename'; newName?: string }>
    ): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> => {
      const success: string[] = [];
      const failed: Array<{ path: string; error: string }> = [];

      const conflictMap = new Map(conflicts.map((c) => [c.path, c]));

      for (const sourcePath of sources) {
        try {
          const fileName = basename(sourcePath);
          let targetPath = join(targetDir, fileName);
          const conflict = conflictMap.get(sourcePath);

          if (conflict) {
            if (conflict.action === 'skip') {
              continue;
            }
            if (conflict.action === 'rename' && conflict.newName) {
              targetPath = join(targetDir, conflict.newName);
            }
            // 'replace' action: delete existing first
            if (conflict.action === 'replace') {
              try {
                await rm(targetPath, { recursive: true, force: true });
              } catch {
                // Ignore if target doesn't exist
              }
            }
          }

          try {
            // Try rename first (works for same filesystem)
            await rename(sourcePath, targetPath);
          } catch {
            // If rename fails (cross-filesystem), copy then delete
            const sourceStats = await stat(sourcePath);

            if (sourceStats.isDirectory()) {
              await copyDirectory(sourcePath, targetPath);
            } else {
              await mkdir(dirname(targetPath), { recursive: true });
              await copyFile(sourcePath, targetPath);
            }

            // Delete source after successful copy
            await rm(sourcePath, { recursive: true, force: true });
          }

          success.push(sourcePath);
        } catch (error) {
          failed.push({
            path: sourcePath,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { success, failed };
    }
  );
}

/**
 * Recursively copy a directory
 */
async function copyDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });

  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }
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
