import type { FileChange, FileChangeStatus } from '@shared/types';
import { isWslUncPath, normalizePath } from '@shared/utils/path';
import { pickHigherPriorityGitStatus } from '../../lib/gitFileStatus';

type SupportedPlatform = 'darwin' | 'win32' | 'linux';

export interface FileTreeGitDecoration {
  primary: FileChangeStatus;
  staged?: FileChangeStatus;
  unstaged?: FileChangeStatus;
}

export interface FileTreeGitDecorationMaps {
  files: ReadonlyMap<string, FileTreeGitDecoration>;
  directories: ReadonlyMap<string, FileTreeGitDecoration>;
  caseSensitive: boolean;
}

function pathKey(path: string, caseSensitive: boolean): string {
  const normalized = normalizePath(path).replace(/\/+$/, '');
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function joinRepositoryPath(rootPath: string, relativePath: string): string {
  const root = normalizePath(rootPath).replace(/\/+$/, '');
  const relative = normalizePath(relativePath).replace(/^\/+/, '');
  return relative ? `${root}/${relative}` : root;
}

function selectHigherPriorityStatus(
  first: FileChangeStatus | undefined,
  second: FileChangeStatus | undefined
): FileChangeStatus | undefined {
  if (!first) return second;
  if (!second) return first;
  return pickHigherPriorityGitStatus(first, second);
}

function mergeDecorationStatus(
  current: FileTreeGitDecoration | undefined,
  change: FileChange,
  preferUnstaged: boolean
): FileTreeGitDecoration {
  const staged = change.staged
    ? pickHigherPriorityGitStatus(current?.staged, change.status)
    : current?.staged;
  const unstaged = change.staged
    ? current?.unstaged
    : pickHigherPriorityGitStatus(current?.unstaged, change.status);
  const primary = preferUnstaged
    ? (unstaged ?? staged ?? change.status)
    : (selectHigherPriorityStatus(staged, unstaged) ?? change.status);

  return {
    primary,
    ...(staged ? { staged } : {}),
    ...(unstaged ? { unstaged } : {}),
  };
}

function getRelativePathParts(path: string): string[] | null {
  const parts = normalizePath(path)
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.');

  if (parts.length === 0 || parts.includes('..')) return null;
  return parts;
}

export function buildFileTreeGitDecorations(
  rootPath: string,
  changes: FileChange[],
  platform: SupportedPlatform
): FileTreeGitDecorationMaps {
  const caseSensitive = platform === 'linux' || isWslUncPath(rootPath);
  const files = new Map<string, FileTreeGitDecoration>();
  const directories = new Map<string, FileTreeGitDecoration>();

  for (const change of changes) {
    const parts = getRelativePathParts(change.path);
    if (!parts) continue;

    const filePath = joinRepositoryPath(rootPath, parts.join('/'));
    const fileKey = pathKey(filePath, caseSensitive);
    files.set(fileKey, mergeDecorationStatus(files.get(fileKey), change, true));

    for (let index = 1; index < parts.length; index++) {
      const directoryPath = joinRepositoryPath(rootPath, parts.slice(0, index).join('/'));
      const directoryKey = pathKey(directoryPath, caseSensitive);
      directories.set(
        directoryKey,
        mergeDecorationStatus(directories.get(directoryKey), change, false)
      );
    }
  }

  return { files, directories, caseSensitive };
}

export function getFileTreeGitDecoration(
  path: string,
  isDirectory: boolean,
  decorations: FileTreeGitDecorationMaps
): FileTreeGitDecoration | undefined {
  const key = pathKey(path, decorations.caseSensitive);
  return isDirectory ? decorations.directories.get(key) : decorations.files.get(key);
}
