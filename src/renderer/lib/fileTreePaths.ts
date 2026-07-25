import { isWslUncPath, normalizePath, trimTrailingPathSeparators } from '@shared/utils/path';

export type FileTreePlatform = 'darwin' | 'win32' | 'linux';

export interface FileBreadcrumbSegment {
  name: string;
  path: string;
  isLast: boolean;
}

function pathKey(path: string, caseSensitive: boolean): string {
  const normalized = trimTrailingPathSeparators(normalizePath(path));
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function usesCaseSensitivePaths(rootPath: string, platform: FileTreePlatform): boolean {
  return platform === 'linux' || isWslUncPath(rootPath);
}

export function mapPathToFileTree(
  inputPath: string,
  rootPath: string,
  platform: FileTreePlatform
): string | null {
  const normalizedRoot = trimTrailingPathSeparators(normalizePath(rootPath));
  const normalizedInput = trimTrailingPathSeparators(normalizePath(inputPath));
  const caseSensitive = usesCaseSensitivePaths(rootPath, platform);
  const rootKey = pathKey(normalizedRoot, caseSensitive);
  const inputKey = pathKey(normalizedInput, caseSensitive);

  if (inputKey === rootKey) return rootPath;

  // 必须检查目录边界，不能把 EnsoAI-copy 误认为 EnsoAI 的子目录。
  const rootPrefix = rootKey.endsWith('/') ? rootKey : `${rootKey}/`;
  if (!inputKey.startsWith(rootPrefix)) return null;

  const relativePath = normalizedInput.slice(normalizedRoot.length).replace(/^\/+/, '');
  if (!relativePath) return rootPath;

  // Windows 文件树节点来自 node:path，使用反斜杠；查询键也必须保持这种形式。
  if (platform === 'win32') {
    const nativeRoot = normalizedRoot.replace(/\//g, '\\');
    const separator = nativeRoot.endsWith('\\') ? '' : '\\';
    return `${nativeRoot}${separator}${relativePath.replace(/\//g, '\\')}`;
  }

  const separator = normalizedRoot.endsWith('/') ? '' : '/';
  return `${normalizedRoot}${separator}${relativePath}`;
}

export function buildFileBreadcrumbSegments(
  activeFilePath: string | null | undefined,
  rootPath: string | undefined,
  platform: FileTreePlatform
): FileBreadcrumbSegment[] {
  if (!activeFilePath || !rootPath) return [];

  const normalizedRoot = trimTrailingPathSeparators(normalizePath(rootPath));
  const normalizedFile = trimTrailingPathSeparators(normalizePath(activeFilePath));
  if (!mapPathToFileTree(normalizedFile, rootPath, platform)) return [];

  const relativePath = normalizedFile.slice(normalizedRoot.length).replace(/^\/+/, '');
  if (!relativePath) return [];

  const parts = relativePath.split('/').filter(Boolean);
  return parts.map((name, index) => {
    const path = mapPathToFileTree(
      `${normalizedRoot}/${parts.slice(0, index + 1).join('/')}`,
      rootPath,
      platform
    );

    return {
      name,
      path: path ?? activeFilePath,
      isLast: index === parts.length - 1,
    };
  });
}
