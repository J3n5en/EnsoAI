import { rmSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { type FileEntry, type FileReadResult, IPC_CHANNELS } from '@shared/types';
import { app, BrowserWindow, ipcMain, shell, type WebContents } from 'electron';
import iconv from 'iconv-lite';
import { isBinaryFile } from 'isbinaryfile';
import jschardet from 'jschardet';
import { FileWatcher } from '../services/files/FileWatcher';
import {
  registerAllowedLocalFileRoot,
  unregisterAllowedLocalFileRootsByOwner,
} from '../services/files/LocalFileAccess';
import { createSimpleGit, normalizeGitRelativePath } from '../services/git/runtime';
import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { createRemoteError } from '../services/remote/RemoteI18n';
import {
  isRemoteVirtualPath,
  parseRemoteVirtualPath,
  toRemoteVirtualPath,
} from '../services/remote/RemotePath';
import { remoteRepositoryBackend } from '../services/remote/RemoteRepositoryBackend';

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

type FileWatcherEventType = 'create' | 'update' | 'delete';
type FileWatcherState = 'starting' | 'running' | 'stopping';

interface FileWatcherEntry {
  watcher: FileWatcher;
  dirPath: string;
  normalizedDirPath: string;
  ownerId: number;
  state: FileWatcherState;
  startPromise: Promise<void>;
  cleanup: () => void;
}

interface RemoteWatcherRegistration {
  key: string;
  connectionId: string;
  dirPath: string;
  normalizedDirPath: string;
  remotePath: string;
  watcherId: string;
  windowId: number;
  removeListener?: () => void;
}

const watchers = new Map<string, FileWatcherEntry>();
const ownerWatcherKeys = new Map<number, Set<string>>();
const fileResourceOwners = new Set<number>();
const remoteWatchers = new Map<string, RemoteWatcherRegistration>();
const remoteWatcherConnectionSubscriptions = new Map<string, () => void>();
const pendingRemoteWatcherConnectionSubscriptions = new Map<string, Promise<void>>();

function resolveBatchConflictTargetPath(
  targetDir: string,
  fallbackName: string,
  newName?: string
): string {
  const candidate = newName?.trim() || fallbackName;
  if (!candidate || candidate === '.' || candidate === '..' || /[\\/]/.test(candidate)) {
    throw new Error('Invalid conflict rename target');
  }

  const resolvedTargetDir = resolve(targetDir);
  const resolvedTargetPath = resolve(resolvedTargetDir, candidate);
  const relativePath = relative(resolvedTargetDir, resolvedTargetPath);
  if (
    relativePath === '' ||
    relativePath === '.' ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === '..'
  ) {
    throw new Error('Conflict rename target escapes destination directory');
  }

  return resolvedTargetPath;
}

function normalizeWatchedPath(inputPath: string): string {
  const normalizedPath = inputPath.replace(/\\/g, '/');
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return normalizedPath.toLowerCase();
  }
  return normalizedPath;
}

function normalizeRemoteWatchPath(inputPath: string): string {
  const normalizedPath = inputPath.replace(/\\/g, '/');
  if (normalizedPath === '/') {
    return '/';
  }
  return normalizedPath.replace(/\/+$/, '');
}

function getWatcherKey(ownerId: number, dirPath: string): string {
  return `${ownerId}:${normalizeWatchedPath(dirPath)}`;
}

function getRemoteWatcherKey(windowId: number, dirPath: string): string {
  return `${windowId}:${normalizeRemoteWatchPath(dirPath)}`;
}

function trackWatcherKey(ownerId: number, key: string): void {
  const keys = ownerWatcherKeys.get(ownerId) ?? new Set<string>();
  keys.add(key);
  ownerWatcherKeys.set(ownerId, keys);
}

function untrackWatcherKey(ownerId: number, key: string): void {
  const keys = ownerWatcherKeys.get(ownerId);
  if (!keys) return;

  keys.delete(key);
  if (keys.size === 0) {
    ownerWatcherKeys.delete(ownerId);
  }
}

async function stopWatcherEntry(key: string): Promise<void> {
  const entry = watchers.get(key);
  if (!entry || entry.state === 'stopping') {
    return;
  }

  entry.state = 'stopping';
  entry.cleanup();
  await entry.startPromise.catch(() => {});
  await entry.watcher.stop().catch(() => {});

  watchers.delete(key);
  untrackWatcherKey(entry.ownerId, key);
}

async function stopFileWatchersForOwner(ownerId: number): Promise<void> {
  const keys = Array.from(ownerWatcherKeys.get(ownerId) ?? []);
  await Promise.all(keys.map((key) => stopWatcherEntry(key)));
}

async function stopRemoteWatchersForWindow(windowId: number): Promise<void> {
  const registrations = Array.from(remoteWatchers.values()).filter(
    (entry) => entry.windowId === windowId
  );
  await Promise.all(registrations.map((entry) => stopRemoteWatcher(entry)));
}

async function stopRemoteWatchersInDirectory(dirPath: string): Promise<void> {
  const normalizedDir = normalizeRemoteWatchPath(dirPath);
  const registrations = Array.from(remoteWatchers.values()).filter(
    (entry) =>
      entry.normalizedDirPath === normalizedDir ||
      entry.normalizedDirPath.startsWith(`${normalizedDir}/`)
  );
  await Promise.all(registrations.map((entry) => stopRemoteWatcher(entry)));
}

function ensureFileOwnerCleanup(sender: WebContents): void {
  const ownerId = sender.id;
  if (fileResourceOwners.has(ownerId)) {
    return;
  }

  const windowId = BrowserWindow.fromWebContents(sender)?.id;
  fileResourceOwners.add(ownerId);
  sender.once('destroyed', () => {
    fileResourceOwners.delete(ownerId);
    unregisterAllowedLocalFileRootsByOwner(ownerId);
    void stopFileWatchersForOwner(ownerId).catch(() => {});
    if (windowId) {
      void stopRemoteWatchersForWindow(windowId).catch(() => {});
    }
  });
}

/**
 * Stop all file watchers for paths under the given directory
 */
export async function stopWatchersInDirectory(dirPath: string): Promise<void> {
  if (isRemoteVirtualPath(dirPath)) {
    await stopRemoteWatchersInDirectory(dirPath);
    return;
  }

  const normalizedDir = normalizeWatchedPath(dirPath);

  for (const [key, entry] of Array.from(watchers.entries())) {
    if (
      entry.normalizedDirPath === normalizedDir ||
      entry.normalizedDirPath.startsWith(`${normalizedDir}/`)
    ) {
      await stopWatcherEntry(key);
    }
  }
}

async function ensureRemoteWatcherConnectionSubscription(connectionId: string): Promise<void> {
  if (remoteWatcherConnectionSubscriptions.has(connectionId)) {
    return;
  }

  const pending = pendingRemoteWatcherConnectionSubscriptions.get(connectionId);
  if (pending) {
    await pending;
    return;
  }

  const setupPromise = Promise.resolve()
    .then(() => {
      if (remoteWatcherConnectionSubscriptions.has(connectionId)) {
        return;
      }

      const offStatus = remoteConnectionManager.onDidStatusChange(connectionId, (status) => {
        const registrations = [...remoteWatchers.values()].filter(
          (item) => item.connectionId === connectionId
        );
        if (registrations.length === 0) {
          return;
        }

        if (status.connected) {
          void Promise.allSettled(
            registrations.map((item) => startRemoteWatcherRegistration(item))
          );
          return;
        }

        for (const registration of registrations) {
          registration.removeListener?.();
          registration.removeListener = undefined;
        }
      });

      remoteWatcherConnectionSubscriptions.set(connectionId, offStatus);
    })
    .finally(() => {
      if (pendingRemoteWatcherConnectionSubscriptions.get(connectionId) === setupPromise) {
        pendingRemoteWatcherConnectionSubscriptions.delete(connectionId);
      }
    });

  pendingRemoteWatcherConnectionSubscriptions.set(connectionId, setupPromise);
  await setupPromise;
}

async function startRemoteWatcherRegistration(
  registration: RemoteWatcherRegistration
): Promise<void> {
  const window = BrowserWindow.fromId(registration.windowId);
  if (!window || window.isDestroyed()) {
    remoteWatchers.delete(registration.key);
    return;
  }

  if (registration.removeListener) {
    registration.removeListener();
    registration.removeListener = undefined;
  }

  const handleRemoteEvent = (payload: unknown) => {
    if (window.isDestroyed()) return;
    const event = payload as {
      watcherId?: string;
      type?: 'create' | 'update' | 'delete';
      path?: string;
    };
    if (event.watcherId !== registration.watcherId || !event.type || !event.path) return;
    window.webContents.send(IPC_CHANNELS.FILE_CHANGE, {
      type: event.type,
      path: toRemoteVirtualPath(registration.connectionId, event.path),
    });
  };

  const removeListener = await remoteConnectionManager.addEventListener(
    registration.connectionId,
    'remote:file:change',
    handleRemoteEvent
  );
  registration.removeListener = removeListener;
  await remoteConnectionManager.call(registration.connectionId, 'fs:watchStart', {
    id: registration.watcherId,
    path: registration.remotePath,
  });
}

async function startRemoteWatcher(window: BrowserWindow, dirPath: string): Promise<void> {
  const key = getRemoteWatcherKey(window.id, dirPath);
  if (remoteWatchers.has(key)) {
    return;
  }

  const { connectionId, remotePath } = parseRemoteVirtualPath(dirPath);
  const registration: RemoteWatcherRegistration = {
    key,
    connectionId,
    dirPath,
    normalizedDirPath: normalizeRemoteWatchPath(dirPath),
    remotePath,
    watcherId: `remote-watch:${window.id}:${connectionId}:${remotePath}`,
    windowId: window.id,
  };

  remoteWatchers.set(key, registration);
  await ensureRemoteWatcherConnectionSubscription(connectionId);
  try {
    await startRemoteWatcherRegistration(registration);
  } catch (error) {
    await stopRemoteWatcher(registration);
    throw error;
  }
}

async function stopRemoteWatcher(registration: RemoteWatcherRegistration): Promise<void> {
  remoteWatchers.delete(registration.key);
  registration.removeListener?.();
  registration.removeListener = undefined;
  const hasRemainingForConnection = [...remoteWatchers.values()].some(
    (item) => item.connectionId === registration.connectionId
  );
  if (!hasRemainingForConnection) {
    pendingRemoteWatcherConnectionSubscriptions.delete(registration.connectionId);
    const offStatus = remoteWatcherConnectionSubscriptions.get(registration.connectionId);
    offStatus?.();
    remoteWatcherConnectionSubscriptions.delete(registration.connectionId);
  }
  try {
    await remoteConnectionManager.call(registration.connectionId, 'fs:watchStop', {
      id: registration.watcherId,
    });
  } catch {
    // Helper may already be gone. Cleanup should stay best-effort.
  }
}

export function registerFileHandlers(): void {
  // Save file to temp directory (for enhanced input images)
  ipcMain.handle(
    IPC_CHANNELS.FILE_SAVE_TO_TEMP,
    async (
      event,
      filename: string,
      data: Uint8Array
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        const tempDir = app.getPath('temp');
        const ensoaiInputDir = join(tempDir, 'ensoai-input');
        ensureFileOwnerCleanup(event.sender);
        // Allow renderer to preview saved temp images via local-file:// protocol.
        // Without this, local-file access is denied by default.
        registerAllowedLocalFileRoot(ensoaiInputDir, event.sender.id);
        await mkdir(ensoaiInputDir, { recursive: true });

        // Defense-in-depth: never trust renderer-controlled path segments.
        const safeName = basename(filename);
        if (!safeName || safeName === '.' || safeName === '..') {
          return { success: false, error: 'Invalid filename' };
        }

        const filePath = join(ensoaiInputDir, safeName);

        // Double-check resolved path stays within the allowed directory.
        const resolvedPath = resolve(filePath);
        const allowedRoot = resolve(ensoaiInputDir) + sep;
        if (!resolvedPath.startsWith(allowedRoot)) {
          return { success: false, error: 'Invalid filename' };
        }

        await writeFile(filePath, Buffer.from(data));

        return { success: true, path: filePath };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_, filePath: string): Promise<FileReadResult> => {
    if (isRemoteVirtualPath(filePath)) {
      return remoteRepositoryBackend.readFile(filePath);
    }

    // Design Decision: Binary File Detection
    // ----------------------------------------
    // We detect binary files BEFORE reading the full content to avoid:
    // 1. Loading large binary files (videos, executables) into memory
    // 2. Performance issues from decoding binary content as text
    // 3. Monaco editor freezing when rendering binary garbage
    //
    // The isbinaryfile library only reads the first 512 bytes for detection.
    // If detection fails, we fall back to treating it as a text file.
    // The renderer decides whether to show "unsupported" message based on
    // file extension (images/PDFs have dedicated preview components).
    let isBinary = false;
    try {
      isBinary = await isBinaryFile(filePath);
    } catch {
      // If binary detection fails, assume it's a text file and continue
    }

    if (isBinary) {
      return {
        content: '',
        encoding: 'binary',
        detectedEncoding: 'binary',
        confidence: 1,
        isBinary: true,
      };
    }

    // Only read full file content for non-binary files
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
      if (isRemoteVirtualPath(filePath)) {
        await remoteRepositoryBackend.writeFile(filePath, content);
        return;
      }

      const targetEncoding = encoding || 'utf-8';
      const buffer = iconv.encode(content, targetEncoding);
      await writeFile(filePath, buffer);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_CREATE,
    async (_, filePath: string, content = '', options?: { overwrite?: boolean }) => {
      if (isRemoteVirtualPath(filePath)) {
        await remoteRepositoryBackend.createFile(filePath, content, options);
        return;
      }

      await mkdir(dirname(filePath), { recursive: true });
      const flag = options?.overwrite ? 'w' : 'wx';
      await writeFile(filePath, content, { encoding: 'utf-8', flag });
    }
  );

  ipcMain.handle(IPC_CHANNELS.FILE_CREATE_DIR, async (_, dirPath: string) => {
    if (isRemoteVirtualPath(dirPath)) {
      await remoteRepositoryBackend.createDirectory(dirPath);
      return;
    }

    await mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle(IPC_CHANNELS.FILE_RENAME, async (_, fromPath: string, toPath: string) => {
    if (isRemoteVirtualPath(fromPath) || isRemoteVirtualPath(toPath)) {
      await remoteRepositoryBackend.rename(fromPath, toPath);
      return;
    }

    await rename(fromPath, toPath);
  });

  ipcMain.handle(IPC_CHANNELS.FILE_MOVE, async (_, fromPath: string, toPath: string) => {
    if (isRemoteVirtualPath(fromPath) || isRemoteVirtualPath(toPath)) {
      await remoteRepositoryBackend.move(fromPath, toPath);
      return;
    }

    await rename(fromPath, toPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE_DELETE,
    async (_, targetPath: string, options?: { recursive?: boolean }) => {
      if (isRemoteVirtualPath(targetPath)) {
        await remoteRepositoryBackend.delete(targetPath, options);
        return;
      }

      await rm(targetPath, { recursive: options?.recursive ?? true, force: false });
    }
  );

  ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, async (_, filePath: string): Promise<boolean> => {
    if (isRemoteVirtualPath(filePath)) {
      return remoteRepositoryBackend.exists(filePath);
    }

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
      if (isRemoteVirtualPath(filePath)) {
        throw createRemoteError('Reveal in file manager is not supported for remote files');
      }
      shell.showItemInFolder(filePath);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_LIST,
    async (event, dirPath: string, gitRoot?: string): Promise<FileEntry[]> => {
      if (isRemoteVirtualPath(dirPath)) {
        return remoteRepositoryBackend.listFiles(dirPath);
      }

      ensureFileOwnerCleanup(event.sender);
      if (gitRoot) {
        registerAllowedLocalFileRoot(gitRoot, event.sender.id);
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
          const git = createSimpleGit(gitRoot);
          const relativePaths = result.map((f) =>
            normalizeGitRelativePath(relative(gitRoot, f.path))
          );
          const ignoredResult = await git.checkIgnore(relativePaths);
          const ignoredSet = new Set(ignoredResult.map((p) => normalizeGitRelativePath(p)));
          for (const file of result) {
            const relPath = normalizeGitRelativePath(relative(gitRoot, file.path));
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
    ensureFileOwnerCleanup(event.sender);

    if (isRemoteVirtualPath(dirPath)) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        throw createRemoteError('Unable to resolve window for remote file watcher');
      }
      await startRemoteWatcher(window, dirPath);
      return;
    }

    const ownerId = event.sender.id;
    const watcherKey = getWatcherKey(ownerId, dirPath);
    if (watchers.has(watcherKey)) {
      return;
    }

    const MAX_PENDING_EVENTS = 5000;
    const MAX_FLUSH_EVENTS = 500;
    const FLUSH_DELAY_MS = 100;

    const pendingEvents = new Map<string, FileWatcherEventType>();
    let bulkMode = false;
    let flushTimer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pendingEvents.clear();
      bulkMode = false;
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (event.sender.isDestroyed()) {
          void stopWatcherEntry(watcherKey);
          return;
        }

        if (bulkMode || pendingEvents.size > MAX_FLUSH_EVENTS) {
          const normalizedDir = dirPath.replace(/\\/g, '/');
          event.sender.send(IPC_CHANNELS.FILE_CHANGE, {
            type: 'update',
            path: `${normalizedDir}/.enso-bulk`,
          });
        } else {
          for (const [path, type] of pendingEvents) {
            event.sender.send(IPC_CHANNELS.FILE_CHANGE, { type, path });
          }
        }

        pendingEvents.clear();
        bulkMode = false;
      }, FLUSH_DELAY_MS);
    };

    const watcher = new FileWatcher(dirPath, (eventType, changedPath) => {
      if (event.sender.isDestroyed()) {
        void stopWatcherEntry(watcherKey);
        return;
      }

      if (bulkMode) {
        scheduleFlush();
        return;
      }

      const normalized = changedPath.replace(/\\/g, '/');
      pendingEvents.set(normalized, eventType);
      if (pendingEvents.size > MAX_PENDING_EVENTS) {
        bulkMode = true;
        pendingEvents.clear();
      }
      scheduleFlush();
    });

    const entry: FileWatcherEntry = {
      watcher,
      dirPath,
      normalizedDirPath: normalizeWatchedPath(dirPath),
      ownerId,
      state: 'starting',
      startPromise: Promise.resolve(),
      cleanup,
    };
    watchers.set(watcherKey, entry);
    trackWatcherKey(ownerId, watcherKey);

    const startPromise = watcher.start();
    entry.startPromise = startPromise;

    try {
      await startPromise;

      if (!watchers.has(watcherKey)) {
        await watcher.stop().catch(() => {});
        return;
      }

      entry.state = 'running';
    } catch (error) {
      await stopWatcherEntry(watcherKey);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILE_WATCH_STOP, async (event, dirPath: string) => {
    if (isRemoteVirtualPath(dirPath)) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return;
      }

      const registration = remoteWatchers.get(getRemoteWatcherKey(window.id, dirPath));
      if (registration) {
        await stopRemoteWatcher(registration);
      }
      return;
    }

    const watcherKey = getWatcherKey(event.sender.id, dirPath);
    await stopWatcherEntry(watcherKey);
  });

  // FILE_COPY: Copy a single file/directory
  ipcMain.handle(IPC_CHANNELS.FILE_COPY, async (_, sourcePath: string, targetPath: string) => {
    const sourceIsRemote = isRemoteVirtualPath(sourcePath);
    const targetIsRemote = isRemoteVirtualPath(targetPath);
    if (sourceIsRemote || targetIsRemote) {
      if (sourceIsRemote && targetIsRemote) {
        await remoteRepositoryBackend.copy(sourcePath, targetPath);
        return;
      }
      throw createRemoteError('Copying between local and remote files is not supported');
    }

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
      const hasRemoteSources = sources.some(isRemoteVirtualPath);
      const targetIsRemote = isRemoteVirtualPath(targetDir);
      if (hasRemoteSources || targetIsRemote) {
        if (hasRemoteSources && targetIsRemote && sources.every(isRemoteVirtualPath)) {
          return remoteRepositoryBackend.checkConflicts(sources, targetDir);
        }
        throw createRemoteError(
          'Conflict detection between local and remote files is not supported'
        );
      }

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
      const hasRemoteSources = sources.some(isRemoteVirtualPath);
      const targetIsRemote = isRemoteVirtualPath(targetDir);
      if (hasRemoteSources || targetIsRemote) {
        if (hasRemoteSources && targetIsRemote && sources.every(isRemoteVirtualPath)) {
          return remoteRepositoryBackend.batchCopy(sources, targetDir, conflicts);
        }
        throw createRemoteError('Batch copy between local and remote files is not supported');
      }

      const success: string[] = [];
      const failed: Array<{ path: string; error: string }> = [];

      // Build conflict resolution map
      const conflictMap = new Map(conflicts.map((c) => [c.path, c]));

      for (const sourcePath of sources) {
        try {
          const fileName = basename(sourcePath);
          let targetPath = resolveBatchConflictTargetPath(targetDir, fileName);
          const conflict = conflictMap.get(sourcePath);

          if (conflict) {
            if (conflict.action === 'skip') {
              continue;
            }
            if (conflict.action === 'rename' && conflict.newName) {
              targetPath = resolveBatchConflictTargetPath(targetDir, fileName, conflict.newName);
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
      const hasRemoteSources = sources.some(isRemoteVirtualPath);
      const targetIsRemote = isRemoteVirtualPath(targetDir);
      if (hasRemoteSources || targetIsRemote) {
        if (hasRemoteSources && targetIsRemote && sources.every(isRemoteVirtualPath)) {
          return remoteRepositoryBackend.batchMove(sources, targetDir, conflicts);
        }
        throw createRemoteError('Batch move between local and remote files is not supported');
      }

      const success: string[] = [];
      const failed: Array<{ path: string; error: string }> = [];

      const conflictMap = new Map(conflicts.map((c) => [c.path, c]));

      for (const sourcePath of sources) {
        try {
          const fileName = basename(sourcePath);
          let targetPath = resolveBatchConflictTargetPath(targetDir, fileName);
          const conflict = conflictMap.get(sourcePath);

          if (conflict) {
            if (conflict.action === 'skip') {
              continue;
            }
            if (conflict.action === 'rename' && conflict.newName) {
              targetPath = resolveBatchConflictTargetPath(targetDir, fileName, conflict.newName);
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
  const localStopPromises = Array.from(watchers.keys()).map((key) => stopWatcherEntry(key));
  const remoteStopPromises = Array.from(remoteWatchers.values()).map((entry) =>
    stopRemoteWatcher(entry)
  );

  await Promise.allSettled([...localStopPromises, ...remoteStopPromises]);
  for (const offStatus of remoteWatcherConnectionSubscriptions.values()) {
    offStatus();
  }
  pendingRemoteWatcherConnectionSubscriptions.clear();
  remoteWatcherConnectionSubscriptions.clear();
  ownerWatcherKeys.clear();
  fileResourceOwners.clear();
}

/**
 * Synchronous version for signal handlers.
 * Fires unsubscribe without waiting - process will exit anyway.
 */
export function stopAllFileWatchersSync(): void {
  for (const [key, entry] of watchers.entries()) {
    entry.cleanup();
    entry.watcher.stop().catch(() => {});
    untrackWatcherKey(entry.ownerId, key);
  }
  watchers.clear();
  for (const registration of remoteWatchers.values()) {
    registration.removeListener?.();
    registration.removeListener = undefined;
  }
  remoteWatchers.clear();
  for (const offStatus of remoteWatcherConnectionSubscriptions.values()) {
    offStatus();
  }
  pendingRemoteWatcherConnectionSubscriptions.clear();
  remoteWatcherConnectionSubscriptions.clear();
  ownerWatcherKeys.clear();
  fileResourceOwners.clear();
}

/**
 * Clean up temporary files from ensoai-input directory
 * Cross-platform compatible with retry logic for Windows file locks
 */
export async function cleanupTempFiles(): Promise<void> {
  try {
    const tempDir = app.getPath('temp');
    const ensoaiInputDir = join(tempDir, 'ensoai-input');

    // Use recursive and force options for cross-platform compatibility
    // force: true - ignore errors if directory doesn't exist
    // recursive: true - delete directory and all contents
    await rm(ensoaiInputDir, {
      recursive: true,
      force: true,
      maxRetries: 3, // Retry on Windows file lock issues
      retryDelay: 100, // Wait 100ms between retries
    });

    console.log('[files] Cleaned up temp directory:', ensoaiInputDir);
  } catch (error) {
    // Don't throw - cleanup failure shouldn't block app startup/shutdown
    console.warn('[files] Failed to cleanup temp files:', error);
  }
}

/**
 * Synchronous version for signal handlers (SIGINT/SIGTERM)
 * Cross-platform compatible
 */
export function cleanupTempFilesSync(): void {
  try {
    const tempDir = app.getPath('temp');
    const ensoaiInputDir = join(tempDir, 'ensoai-input');

    // Sync version with same options
    rmSync(ensoaiInputDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });

    console.log('[files] Cleaned up temp directory (sync):', ensoaiInputDir);
  } catch (error) {
    console.warn('[files] Failed to cleanup temp files (sync):', error);
  }
}
