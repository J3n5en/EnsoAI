const WSL_UNC_PREFIXES = ['//wsl.localhost/', '//wsl$/'];

function normalizePathForGit(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

function parseConfigCount(rawCount: string | undefined): number {
  const parsed = Number.parseInt(rawCount ?? '0', 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function isWindowsWslUncPath(inputPath: string): boolean {
  if (process.platform !== 'win32') {
    return false;
  }

  const normalized = normalizePathForGit(inputPath).toLowerCase();
  return WSL_UNC_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Inject safe.directory for Windows WSL UNC paths without mutating global git config.
 * Uses Git's GIT_CONFIG_* environment mechanism so trust is scoped to this process.
 *
 * Note:
 * - For non-WSL paths, this returns the original baseEnv reference (no copy overhead).
 * - For WSL UNC paths, this returns a shallow copy with appended GIT_CONFIG_* entries.
 */
export function withSafeDirectoryEnv(
  baseEnv: NodeJS.ProcessEnv,
  workdir: string
): NodeJS.ProcessEnv {
  if (!isWindowsWslUncPath(workdir)) {
    return baseEnv;
  }

  const normalizedSafeDirectory = normalizePathForGit(workdir);
  if (!normalizedSafeDirectory) {
    return baseEnv;
  }

  const env: NodeJS.ProcessEnv = { ...baseEnv };
  const currentCount = parseConfigCount(env.GIT_CONFIG_COUNT);

  env[`GIT_CONFIG_KEY_${currentCount}`] = 'safe.directory';
  env[`GIT_CONFIG_VALUE_${currentCount}`] = normalizedSafeDirectory;
  env.GIT_CONFIG_COUNT = String(currentCount + 1);

  return env;
}
