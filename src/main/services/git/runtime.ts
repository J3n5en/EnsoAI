import {
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
  spawn,
} from 'node:child_process';
import simpleGit, { type SimpleGit, type SimpleGitOptions } from 'simple-git';
import { getProxyEnvVars } from '../proxy/ProxyConfig';
import { getEnhancedPath } from '../terminal/PtyManager';
import { withSafeDirectoryEnv } from './safeDirectory';

const WSL_UNC_PREFIXES = ['//wsl.localhost/', '//wsl$/'];

type WslPathInfo = {
  host: 'wsl.localhost' | 'wsl$';
  distro: string;
  linuxPath: string;
};

function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').trim();
}

function parseWslUncPath(inputPath: string): WslPathInfo | null {
  if (process.platform !== 'win32') {
    return null;
  }

  const normalized = normalizePath(inputPath);
  const lower = normalized.toLowerCase();

  let prefix: string | null = null;
  let host: WslPathInfo['host'] | null = null;
  for (const candidate of WSL_UNC_PREFIXES) {
    if (lower.startsWith(candidate)) {
      prefix = candidate;
      host = candidate === '//wsl$/' ? 'wsl$' : 'wsl.localhost';
      break;
    }
  }

  if (!prefix || !host) {
    return null;
  }

  const rest = normalized.slice(prefix.length);
  const segments = rest.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }

  const [distro, ...pathSegments] = segments;
  return {
    host,
    distro,
    linuxPath: pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/',
  };
}

function toWindowsUncPath(host: WslPathInfo['host'], distro: string, linuxPath: string): string {
  const normalizedLinuxPath = normalizePath(linuxPath).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalizedLinuxPath) {
    return `\\\\${host}\\${distro}`;
  }
  return `\\\\${host}\\${distro}\\${normalizedLinuxPath.replace(/\//g, '\\')}`;
}

export function isWslGitRepository(workdir: string): boolean {
  return parseWslUncPath(workdir) !== null;
}

export function toGitPath(workdir: string, inputPath: string): string {
  const repoInfo = parseWslUncPath(workdir);
  if (!repoInfo) {
    return inputPath;
  }

  const inputInfo = parseWslUncPath(inputPath);
  if (!inputInfo) {
    return inputPath;
  }

  if (inputInfo.distro.toLowerCase() !== repoInfo.distro.toLowerCase()) {
    return inputPath;
  }

  return inputInfo.linuxPath;
}

export function fromGitPath(workdir: string, inputPath: string): string {
  const repoInfo = parseWslUncPath(workdir);
  if (!repoInfo) {
    return inputPath;
  }

  if (!inputPath.startsWith('/')) {
    return inputPath;
  }

  return toWindowsUncPath(repoInfo.host, repoInfo.distro, inputPath);
}

export function normalizeGitRelativePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

export function createGitEnv(workdir: string): NodeJS.ProcessEnv {
  return withSafeDirectoryEnv(
    {
      ...process.env,
      ...getProxyEnvVars(),
      PATH: getEnhancedPath(),
    },
    workdir
  );
}

export function createSimpleGit(
  workdir: string,
  options: Partial<SimpleGitOptions> = {}
): SimpleGit {
  const resolvedOptions: Partial<SimpleGitOptions> = {
    ...options,
    baseDir: options.baseDir ?? workdir,
  };
  const baseDir = typeof resolvedOptions.baseDir === 'string' ? resolvedOptions.baseDir : workdir;

  if (isWslGitRepository(baseDir) && !resolvedOptions.binary) {
    resolvedOptions.binary = ['wsl.exe', 'git'];
  }

  return simpleGit(resolvedOptions).env(createGitEnv(baseDir));
}

export function spawnGit(
  workdir: string,
  args: string[],
  options: SpawnOptionsWithoutStdio = {}
): ChildProcessWithoutNullStreams {
  const cwd = typeof options.cwd === 'string' ? options.cwd : workdir;
  const env = options.env ?? createGitEnv(cwd);
  const gitArgs = args.map((arg) => toGitPath(cwd, arg));

  if (isWslGitRepository(cwd)) {
    return spawn('wsl.exe', ['git', ...gitArgs], {
      ...options,
      cwd,
      env,
    }) as ChildProcessWithoutNullStreams;
  }

  return spawn('git', gitArgs, { ...options, cwd, env }) as ChildProcessWithoutNullStreams;
}
