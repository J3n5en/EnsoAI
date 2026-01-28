import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { TerminalCreateOptions } from '@shared/types';
import * as pty from 'node-pty';
import pidtree from 'pidtree';
import pidusage from 'pidusage';
import { killProcessTree } from '../../utils/processUtils';
import { getProxyEnvVars } from '../proxy/ProxyConfig';
import { detectShell, shellDetector } from './ShellDetector';

const isWindows = process.platform === 'win32';

// Cache for Windows registry PATH (read once)
let cachedWindowsPath: string | null = null;

// Cache for Windows registry environment variables
let cachedRegistryEnvVars: Record<string, string> | null = null;

// Cache for Unix nvm node paths (read once)
let cachedNvmNodePaths: string[] | null = null;

/**
 * Clear cached PATH and environment variables (useful for debugging or after env changes)
 */
export function clearPathCache(): void {
  cachedWindowsPath = null;
  cachedRegistryEnvVars = null;
  cachedNvmNodePaths = null;
  console.log('[PtyManager] PATH cache cleared');
}

/**
 * Read environment variables from Windows registry (user + system level)
 * This is needed because GUI apps don't inherit shell environment variables
 */
function getWindowsRegistryEnvVars(): Record<string, string> {
  if (cachedRegistryEnvVars !== null) {
    return cachedRegistryEnvVars;
  }

  const envVars: Record<string, string> = {};

  // Parse registry output line by line
  // Format: "    VAR_NAME    REG_SZ    value" or with tabs
  const parseRegistryOutput = (output: string): void => {
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
      // Match: whitespace, name, whitespace, REG_SZ or REG_EXPAND_SZ, whitespace, value
      // Use flexible whitespace matching (\s+) and capture the rest as value
      const match = line.match(/^\s+(\S+)\s+REG_(EXPAND_)?SZ\s+(.*)$/i);
      if (match) {
        const name = match[1];
        const value = match[3].trim();
        if (name && value && !envVars[name]) {
          envVars[name] = value;
        }
      }
    }
  };

  try {
    // Read user-level environment variables
    try {
      const userOutput = execSync('reg query "HKCU\\Environment" 2>nul', {
        encoding: 'utf8',
        timeout: 3000,
      });
      parseRegistryOutput(userOutput);
    } catch {
      // User registry query failed
    }

    // Read system-level environment variables
    try {
      const systemOutput = execSync(
        'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" 2>nul',
        { encoding: 'utf8', timeout: 3000 }
      );
      parseRegistryOutput(systemOutput);
    } catch {
      // System registry query failed
    }
  } catch {
    // Ignore errors
  }

  cachedRegistryEnvVars = envVars;
  return envVars;
}

/**
 * Expand Windows environment variables in a string (e.g., %PATH% -> actual value)
 * Reads variable values from registry (GUI apps don't inherit shell environment)
 */
function expandWindowsEnvVars(str: string): string {
  const registryEnvVars = getWindowsRegistryEnvVars();

  // Replace %VAR% patterns with their values from registry
  return str.replace(/%([^%]+)%/g, (match, varName) => {
    const upperVarName = varName.toUpperCase();
    for (const [key, value] of Object.entries(registryEnvVars)) {
      if (key.toUpperCase() === upperVarName) {
        return value;
      }
    }
    // Keep original if not found
    return match;
  });
}

/**
 * Read full PATH from Windows registry (user + system level)
 * This ensures GUI apps get the same PATH as terminal apps
 */
function getWindowsRegistryPath(): string {
  if (cachedWindowsPath !== null) {
    return cachedWindowsPath;
  }

  try {
    // Read user-level PATH
    let userPath = '';
    try {
      const userOutput = execSync('reg query "HKCU\\Environment" /v Path 2>nul', {
        encoding: 'utf8',
        timeout: 3000,
      });
      const userMatch = userOutput.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      userPath = userMatch ? userMatch[1].trim() : '';
    } catch {
      // User PATH might not exist
    }

    // Read system-level PATH
    let systemPath = '';
    try {
      const systemOutput = execSync(
        'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path 2>nul',
        { encoding: 'utf8', timeout: 3000 }
      );
      const systemMatch = systemOutput.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      systemPath = systemMatch ? systemMatch[1].trim() : '';
    } catch {
      // System PATH should always exist, but handle error gracefully
    }

    // Combine: system PATH first, then user PATH (Windows convention)
    let combinedPath = [systemPath, userPath].filter(Boolean).join(delimiter);

    // Expand environment variables like %NVM_SYMLINK%, %USERPROFILE%, etc.
    combinedPath = expandWindowsEnvVars(combinedPath);

    cachedWindowsPath = combinedPath || process.env.PATH || '';
    return cachedWindowsPath;
  } catch {
    // Fallback to process.env.PATH
    cachedWindowsPath = process.env.PATH || '';
    return cachedWindowsPath;
  }
}

interface PtySession {
  pty: pty.IPty;
  cwd: string;
  onData: (data: string) => void;
  onExit?: (exitCode: number, signal?: number) => void;
}

function findFallbackShell(): string {
  const candidates = [
    '/bin/zsh',
    '/usr/bin/zsh',
    '/usr/local/bin/zsh',
    '/bin/bash',
    '/usr/bin/bash',
    '/usr/local/bin/bash',
    '/bin/sh',
    '/usr/bin/sh',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return '/bin/sh';
}

function adjustArgsForShell(shell: string, args: string[]): string[] {
  // dash (/bin/sh on Ubuntu) doesn't support login flag "-l"
  if (shell.endsWith('/sh')) {
    return args.filter((a) => a !== '-l');
  }
  return args;
}

/**
 * Find a login shell with appropriate args for running commands.
 * Returns shell path and args that will load user environment (nvm, homebrew, etc.)
 */
export function findLoginShell(): { shell: string; args: string[] } {
  if (isWindows) {
    return { shell: 'cmd.exe', args: ['/c'] };
  }

  // Prefer user's SHELL, fallback to common shells
  const userShell = process.env.SHELL;
  if (userShell && existsSync(userShell)) {
    const args = adjustArgsForShell(userShell, ['-i', '-l', '-c']);
    return { shell: userShell, args };
  }

  const shell = findFallbackShell();
  const args = adjustArgsForShell(shell, ['-i', '-l', '-c']);
  return { shell, args };
}

// GUI apps don't inherit shell PATH, add common paths
export function getEnhancedPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();

  if (isWindows) {
    // Windows: Read full PATH from registry to get user-level PATH
    // This covers all package managers (nvm, volta, scoop, vfox, etc.)
    return getWindowsRegistryPath();
  }

  const currentPath = process.env.PATH || '';

  // Get nvm node version bin paths (cached)
  if (cachedNvmNodePaths === null) {
    cachedNvmNodePaths = [];
    const nvmVersionsDir = join(home, '.nvm', 'versions', 'node');

    // Add 'current' symlink first if it exists (highest priority)
    // Note: Official nvm uses ~/.nvm/alias for version aliases, but some setups
    // or custom configurations may create a 'current' symlink here
    const currentLink = join(nvmVersionsDir, 'current', 'bin');
    if (existsSync(currentLink)) {
      cachedNvmNodePaths.push(currentLink);
    }

    // Parse semver version string, supporting incomplete versions like 'v20' or 'v20.10'
    const parseVersion = (v: string): [number, number, number] => {
      const match = v.match(/^v(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
      if (!match) return [0, 0, 0];
      return [
        parseInt(match[1], 10) || 0,
        parseInt(match[2], 10) || 0,
        parseInt(match[3], 10) || 0,
      ];
    };

    // Add versioned paths, sorted by semver descending (newer versions first)
    if (existsSync(nvmVersionsDir)) {
      try {
        const versions = readdirSync(nvmVersionsDir)
          .filter((v) => v.startsWith('v'))
          .sort((a, b) => {
            const [aMajor, aMinor, aPatch] = parseVersion(a);
            const [bMajor, bMinor, bPatch] = parseVersion(b);
            // Sort descending (newer versions first)
            if (bMajor !== aMajor) return bMajor - aMajor;
            if (bMinor !== aMinor) return bMinor - aMinor;
            return bPatch - aPatch;
          });

        for (const version of versions) {
          cachedNvmNodePaths.push(join(nvmVersionsDir, version, 'bin'));
        }
      } catch {
        // Ignore errors reading nvm versions
      }
    }
  }

  // Unix: Add common paths
  const additionalPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    // Node.js version managers - nvm (cached, with 'current' first, then sorted by version)
    ...cachedNvmNodePaths,
    join(home, '.npm-global', 'bin'),
    // Package managers
    join(home, 'Library', 'pnpm'),
    join(home, '.local', 'share', 'pnpm'),
    join(home, '.bun', 'bin'),
    // Language runtimes
    join(home, '.cargo', 'bin'),
    // mise (polyglot runtime manager)
    join(home, '.local', 'share', 'mise', 'shims'),
    // General user binaries
    join(home, '.local', 'bin'),
  ];
  const allPaths = [...new Set([...additionalPaths, ...currentPath.split(delimiter)])];
  return allPaths.join(delimiter);
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();
  private counter = 0;
  // 活动检测缓存：{ ptyId: { lastCheckTs, lastValue, inFlightPromise } }
  private activityCache = new Map<
    string,
    {
      lastCheckTs: number;
      lastValue: boolean;
      inFlightPromise: Promise<boolean> | null;
    }
  >();
  private readonly ACTIVITY_CACHE_TTL_MS = 2000; // 缓存 2 秒

  create(
    options: TerminalCreateOptions,
    onData: (data: string) => void,
    onExit?: (exitCode: number, signal?: number) => void
  ): string {
    const id = `pty-${++this.counter}`;
    const home = process.env.HOME || process.env.USERPROFILE || homedir();
    const cwd = options.cwd || home;

    let shell: string;
    let args: string[];

    if (options.shell) {
      shell = options.shell;
      args = options.args || [];
    } else if (options.shellConfig) {
      const resolved = shellDetector.resolveShellConfig(options.shellConfig);
      shell = resolved.shell;
      args = resolved.args;
    } else {
      shell = detectShell();
      args = options.args || [];
    }

    if (!isWindows && shell.includes('/') && !existsSync(shell)) {
      const fallbackShell = findFallbackShell();
      console.warn(`[pty] Shell not found: ${shell}. Falling back to ${fallbackShell}`);
      shell = fallbackShell;
      args = adjustArgsForShell(shell, args);
    }

    const initialCommand = options.initialCommand?.trim();
    if (initialCommand) {
      if (isWindows) {
        const isPowerShell =
          shell.toLowerCase().includes('powershell') || shell.toLowerCase().includes('pwsh');
        if (isPowerShell) {
          args = ['-NoExit', '-Command', initialCommand];
        } else {
          args = ['/k', initialCommand];
        }
      } else {
        args = [...args.filter((a) => a !== '-c'), '-c', `${initialCommand}; exec ${shell}`];
      }
    }

    let ptyProcess: pty.IPty;

    try {
      ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd,
        env: {
          ...process.env,
          ...getProxyEnvVars(),
          ...options.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          // Ensure proper locale for UTF-8 support (GUI apps may not inherit LANG)
          LANG: process.env.LANG || 'en_US.UTF-8',
          LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
        } as Record<string, string>,
      });
    } catch (error) {
      if (!isWindows) {
        const fallbackShell = findFallbackShell();
        if (fallbackShell !== shell) {
          const fallbackArgs = adjustArgsForShell(fallbackShell, args);
          console.warn(`[pty] Failed to spawn ${shell}. Falling back to ${fallbackShell}`);
          ptyProcess = pty.spawn(fallbackShell, fallbackArgs, {
            name: 'xterm-256color',
            cols: options.cols || 80,
            rows: options.rows || 24,
            cwd,
            env: {
              ...process.env,
              ...getProxyEnvVars(),
              ...options.env,
              TERM: 'xterm-256color',
              COLORTERM: 'truecolor',
              // Ensure proper locale for UTF-8 support (GUI apps may not inherit LANG)
              LANG: process.env.LANG || 'en_US.UTF-8',
              LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
            } as Record<string, string>,
          });
          shell = fallbackShell;
          args = fallbackArgs;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    ptyProcess.onData((data) => {
      onData(data);
    });

    // Store session first so onExit callback can access it
    const session: PtySession = { pty: ptyProcess, cwd, onData, onExit };
    this.sessions.set(id, session);

    ptyProcess.onExit(({ exitCode, signal }) => {
      // Read onExit from session to allow it to be replaced during cleanup
      const currentSession = this.sessions.get(id);
      const exitHandler = currentSession?.onExit;
      this.sessions.delete(id);
      exitHandler?.(exitCode, signal);
    });

    return id;
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.write(data);
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.resize(cols, rows);
    }
  }

  destroy(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      killProcessTree(session.pty);
      this.sessions.delete(id);
      this.activityCache.delete(id);
    }
  }

  /**
   * Destroy a PTY session and wait for it to fully exit.
   * Returns a promise that resolves when the process has exited.
   */
  destroyAndWait(id: string, timeout = 3000): Promise<void> {
    return new Promise((resolve) => {
      const session = this.sessions.get(id);
      if (!session) {
        resolve();
        return;
      }

      const _pid = session.pty.pid;
      let resolved = false;

      // Set up timeout
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.sessions.delete(id);
          resolve();
        }
      }, timeout);

      // Replace the onExit callback to resolve when process exits
      session.onExit = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.sessions.delete(id);
          // Don't call original onExit during cleanup to avoid issues
          resolve();
        }
      };

      // Re-register the onExit handler with node-pty
      // Note: node-pty's onExit is already set, but we've updated session.onExit
      // The existing onExit handler in create() will call session.onExit

      // Kill the process tree
      killProcessTree(session.pty);
    });
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroy(id);
    }
  }

  /**
   * Destroy all PTY sessions and wait for them to fully exit.
   * This should be used during app shutdown to prevent crashes.
   */
  async destroyAllAndWait(timeout = 3000): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    if (ids.length === 0) return;

    console.log(`[pty] Destroying ${ids.length} PTY sessions...`);
    await Promise.all(ids.map((id) => this.destroyAndWait(id, timeout)));
    console.log('[pty] All PTY sessions destroyed');
  }

  destroyByWorkdir(workdir: string): void {
    const normalizedWorkdir = workdir.replace(/\\/g, '/').toLowerCase();
    for (const [id, session] of this.sessions.entries()) {
      const normalizedCwd = session.cwd.replace(/\\/g, '/').toLowerCase();
      if (
        normalizedCwd === normalizedWorkdir ||
        normalizedCwd.startsWith(`${normalizedWorkdir}/`)
      ) {
        this.destroy(id);
      }
    }
  }

  /**
   * Check if a PTY process tree is actively using CPU.
   * Returns true if any process in the tree has CPU activity (> 3%), false otherwise.
   * This detects if an AI agent (running as child process) is working.
   *
   * Uses caching to avoid excessive system calls:
   * - Returns cached value if checked within last 2s
   * - Reuses in-flight promise if already checking
   */
  async getProcessActivity(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) {
      this.activityCache.delete(id);
      return false;
    }

    const pid = session.pty.pid;
    if (!pid) {
      this.activityCache.delete(id);
      return false;
    }

    const now = Date.now();
    const cached = this.activityCache.get(id);

    // 返回缓存值（2 秒内）
    if (cached && now - cached.lastCheckTs < this.ACTIVITY_CACHE_TTL_MS) {
      return cached.lastValue;
    }

    // 复用正在进行的检查
    if (cached?.inFlightPromise) {
      return cached.inFlightPromise;
    }

    // 执行新的活动检测
    const checkPromise = (async () => {
      try {
        // Get entire process tree (shell + all child processes like Claude Code)
        const pids = await pidtree(pid, { root: true });

        if (pids.length === 0) {
          return false;
        }

        // Get CPU usage for all processes in the tree
        const stats = await pidusage(pids);

        // 提高阈值并要求连续检测（通过缓存实现去抖效果）
        // Check if any process has significant CPU activity
        for (const procPid of Object.keys(stats)) {
          if (stats[procPid]?.cpu > 3) {
            // 提高阈值到 3%
            return true;
          }
        }
        return false;
      } catch {
        // Process may have exited or error getting stats
        return false;
      } finally {
        // 清除 in-flight 标记
        const cache = this.activityCache.get(id);
        if (cache) {
          cache.inFlightPromise = null;
        }
      }
    })();

    // 缓存 promise
    this.activityCache.set(id, {
      lastCheckTs: now,
      lastValue: false, // 临时值，会被下面的 await 更新
      inFlightPromise: checkPromise,
    });

    const result = await checkPromise;

    // 更新缓存值
    this.activityCache.set(id, {
      lastCheckTs: now,
      lastValue: result,
      inFlightPromise: null,
    });

    return result;
  }
}
