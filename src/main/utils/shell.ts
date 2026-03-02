/**
 * Shared shell utilities for consistent shell configuration across the app.
 * Reads user's shell config from settings and provides consistent environment.
 */

import type { ShellConfig } from '@shared/types';
import * as pty from 'node-pty';
import { readSettings } from '../ipc/settings';
import { findLoginShell, getEnhancedPath } from '../services/terminal/PtyManager';
import { shellDetector } from '../services/terminal/ShellDetector';
import { killProcessTree } from './processUtils';

// Re-export for convenience
export { killProcessTree } from './processUtils';

type Disposable = { dispose(): void };

interface LiveExecPty {
  pty: pty.IPty;
  exitPromise: Promise<void>;
  exitDisposable: Disposable;
}

// Track execInPty PTY processes so we can reliably tear them down during app quit.
// If any node-pty PTY is still alive when Node is cleaning up native addons, it can
// deadlock (macOS "Application Not Responding" on quit).
const liveExecPtys = new Set<LiveExecPty>();

function trackExecInPty(ptyProcess: pty.IPty): LiveExecPty {
  let resolveExit!: () => void;
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  const record: LiveExecPty = {
    pty: ptyProcess,
    exitPromise,
    exitDisposable: { dispose: () => {} },
  };

  record.exitDisposable = ptyProcess.onExit(() => {
    liveExecPtys.delete(record);
    try {
      record.exitDisposable.dispose();
    } catch {
      // Ignore
    }
    resolveExit();
  });

  liveExecPtys.add(record);
  return record;
}

export async function cleanupExecInPtys(timeout = 2000): Promise<void> {
  const records = Array.from(liveExecPtys);
  if (records.length === 0) return;

  console.log(`[pty] Cleaning up ${records.length} execInPty sessions...`);
  for (const rec of records) {
    try {
      killProcessTree(rec.pty);
    } catch {
      // Ignore
    }
  }

  // Wait for tracked PTYs to exit, but never hang shutdown.
  await Promise.race([
    Promise.all(records.map((r) => r.exitPromise)),
    new Promise<void>((resolve) => setTimeout(resolve, timeout)),
  ]);

  // Avoid holding references if some sessions never reported exit.
  for (const rec of records) {
    try {
      rec.exitDisposable.dispose();
    } catch {
      // Ignore
    }
    liveExecPtys.delete(rec);
  }
}

export function cleanupExecInPtysSync(): void {
  const records = Array.from(liveExecPtys);
  if (records.length === 0) return;

  console.log(`[pty] Sync cleaning up ${records.length} execInPty sessions...`);
  for (const rec of records) {
    try {
      killProcessTree(rec.pty);
    } catch {
      // Ignore
    }
    try {
      rec.exitDisposable.dispose();
    } catch {
      // Ignore
    }
    liveExecPtys.delete(rec);
  }
}

/**
 * Strip ANSI escape codes from terminal output
 */
export function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence is intentional
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Get shell configuration for executing commands.
 * Uses user's configured shell from settings, falls back to findLoginShell.
 */
export function getShellForCommand(): { shell: string; args: string[] } {
  const settings = readSettings();
  // zustand stores settings under 'enso-settings.state'
  const zustandState = (settings?.['enso-settings'] as { state?: Record<string, unknown> })?.state;
  const shellConfig = zustandState?.shellConfig as ShellConfig | undefined;

  if (shellConfig) {
    const { shell, execArgs } = shellDetector.resolveShellForCommand(shellConfig);
    return { shell, args: execArgs };
  }

  return findLoginShell();
}

/**
 * Get environment variables for executing commands.
 * Includes enhanced PATH and proper locale settings.
 */
export function getEnvForCommand(additionalEnv?: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    PATH: getEnhancedPath(),
    LANG: process.env.LANG || 'en_US.UTF-8',
    LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
    ...additionalEnv,
  } as Record<string, string>;
}

export interface ExecInPtyOptions {
  /** Timeout in milliseconds (default: 15000) */
  timeout?: number;
  /** If true, force kill after timeout and return collected output instead of rejecting */
  killOnTimeout?: boolean;
}

/**
 * Execute command in PTY to load user's environment (PATH, nvm, mise, volta, etc.)
 * Uses the same mechanism as terminal sessions to ensure consistent behavior.
 *
 * @param command - The command to execute
 * @param options - Execution options
 * @returns The command output (cleaned of ANSI codes)
 */
export async function execInPty(command: string, options: ExecInPtyOptions = {}): Promise<string> {
  const { timeout = 15000, killOnTimeout = false } = options;

  return new Promise((resolve, reject) => {
    const { shell, args } = getShellForCommand();
    const shellName = shell.toLowerCase();

    // Construct shell args with command
    // Shell will naturally exit with the command's exit code
    let shellArgs: string[];
    if (shellName.includes('wsl')) {
      // WSL: wsl.exe doesn't load user's shell environment by default.
      // We use 'exec "$SHELL"' to launch user's actual shell (bash/zsh) with login flag
      // to ensure PATH and other environment variables are properly initialized.
      const escapedCommand = command.replace(/"/g, '\\"');
      shellArgs = ['-e', 'sh', '-lc', `exec "$SHELL" -ilc "${escapedCommand}"`];
    } else {
      shellArgs = [...args, command];
    }

    let output = '';
    let hasExited = false;
    let ptyProcess: pty.IPty | null = null;
    let dataDisposable: Disposable | null = null;
    let exitDisposable: Disposable | null = null;

    const timeoutId = setTimeout(() => {
      if (!hasExited && ptyProcess) {
        hasExited = true;
        // Kill entire process tree to ensure child processes are also terminated
        killProcessTree(ptyProcess);
        try {
          dataDisposable?.dispose();
        } catch {
          // Ignore
        }
        try {
          exitDisposable?.dispose();
        } catch {
          // Ignore
        }
        const cleaned = stripAnsi(output).trim();
        if (killOnTimeout) {
          // When killOnTimeout is true, always resolve with collected output (even if empty)
          // Let the caller decide how to handle empty results
          resolve(cleaned);
        } else {
          reject(new Error('Detection timeout'));
        }
      }
    }, timeout);

    try {
      ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.env.USERPROFILE || '/',
        env: {
          ...getEnvForCommand(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        } as Record<string, string>,
      });

      trackExecInPty(ptyProcess);

      dataDisposable = ptyProcess.onData((data) => {
        output += data;
      });

      exitDisposable = ptyProcess.onExit(({ exitCode }) => {
        if (hasExited) return;
        hasExited = true;
        clearTimeout(timeoutId);

        try {
          dataDisposable?.dispose();
        } catch {
          // Ignore
        }
        try {
          exitDisposable?.dispose();
        } catch {
          // Ignore
        }

        const cleaned = stripAnsi(output).trim();
        if (exitCode === 0) {
          resolve(cleaned);
        } else {
          reject(new Error(`Command exited with code ${exitCode}`));
        }
      });
    } catch (error) {
      hasExited = true;
      clearTimeout(timeoutId);
      try {
        dataDisposable?.dispose();
      } catch {
        // Ignore
      }
      try {
        exitDisposable?.dispose();
      } catch {
        // Ignore
      }
      reject(error);
    }
  });
}
