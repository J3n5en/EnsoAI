import path from 'node:path';

type AllowedLocalFileOwner = number | string;

interface AllowedRootEntry {
  owners: Set<string>;
}

const allowedRoots = new Map<string, AllowedRootEntry>();

function normalizePathForComparison(inputPath: string): string {
  let resolved = path.resolve(inputPath);
  resolved = resolved.replace(/[\\/]+$/, '');

  if (process.platform === 'win32' || process.platform === 'darwin') {
    resolved = resolved.toLowerCase();
  }

  return resolved;
}

function normalizeOwner(owner: AllowedLocalFileOwner): string {
  return typeof owner === 'number' ? `webcontents:${owner}` : owner;
}

export function registerAllowedLocalFileRoot(
  rootPath: string,
  owner: AllowedLocalFileOwner = 'global'
): void {
  const normalizedRoot = normalizePathForComparison(rootPath);
  const entry = allowedRoots.get(normalizedRoot) ?? { owners: new Set<string>() };
  entry.owners.add(normalizeOwner(owner));
  allowedRoots.set(normalizedRoot, entry);
}

export function unregisterAllowedLocalFileRoot(
  rootPath: string,
  owner: AllowedLocalFileOwner = 'global'
): void {
  const normalizedRoot = normalizePathForComparison(rootPath);
  const entry = allowedRoots.get(normalizedRoot);
  if (!entry) return;

  entry.owners.delete(normalizeOwner(owner));
  if (entry.owners.size === 0) {
    allowedRoots.delete(normalizedRoot);
  }
}

export function unregisterAllowedLocalFileRootsByOwner(owner: AllowedLocalFileOwner): void {
  const normalizedOwner = normalizeOwner(owner);

  for (const [root, entry] of allowedRoots.entries()) {
    entry.owners.delete(normalizedOwner);
    if (entry.owners.size === 0) {
      allowedRoots.delete(root);
    }
  }
}

export function isAllowedLocalFilePath(filePath: string): boolean {
  if (allowedRoots.size === 0) return false;

  const normalizedFilePath = normalizePathForComparison(filePath);

  for (const root of allowedRoots.keys()) {
    if (normalizedFilePath === root) return true;
    if (normalizedFilePath.startsWith(`${root}${path.sep}`)) return true;
  }

  return false;
}
