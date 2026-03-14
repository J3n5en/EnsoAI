import path from 'node:path';

const allowedRoots = new Set<string>();

function normalizePathForComparison(inputPath: string): string {
  let resolved = path.resolve(inputPath);
  resolved = resolved.replace(/[\\/]+$/, '');

  if (process.platform === 'win32' || process.platform === 'darwin') {
    resolved = resolved.toLowerCase();
  }

  return resolved;
}

export function registerAllowedLocalFileRoot(rootPath: string): void {
  allowedRoots.add(normalizePathForComparison(rootPath));
}

export function isAllowedLocalFilePath(filePath: string): boolean {
  if (allowedRoots.size === 0) return false;

  const normalizedFilePath = normalizePathForComparison(filePath);

  for (const root of allowedRoots) {
    if (normalizedFilePath === root) return true;
    if (normalizedFilePath.startsWith(`${root}${path.sep}`)) return true;
  }

  return false;
}
