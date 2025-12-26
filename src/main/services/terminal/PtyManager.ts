import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { ShellConfig, TerminalCreateOptions } from '@shared/types';
import * as pty from 'node-pty';
import { detectShell, shellDetector } from './ShellDetector';

const isWindows = process.platform === 'win32';

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

// GUI apps don't inherit shell PATH, add common paths
export function getEnhancedPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  const currentPath = process.env.PATH || '';

  if (isWindows) {
    // Windows: Add common Node.js paths
    const additionalPaths = [
      join(home, 'AppData', 'Roaming', 'npm'),
      join(home, '.volta', 'bin'),
      join(home, 'scoop', 'shims'),
    ];
    const allPaths = [...new Set([...additionalPaths, ...currentPath.split(delimiter)])];
    return allPaths.join(delimiter);
  }

  // Unix: Add common paths
  const additionalPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    join(home, '.nvm', 'versions', 'node', 'current', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.local', 'bin'),
  ];
  const allPaths = [...new Set([...additionalPaths, ...currentPath.split(delimiter)])];
  return allPaths.join(delimiter);
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();
  private counter = 0;

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

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd,
        env: {
          ...process.env,
          ...options.env,
          PATH: getEnhancedPath(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
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
              ...options.env,
              PATH: getEnhancedPath(),
              TERM: 'xterm-256color',
              COLORTERM: 'truecolor',
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

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.sessions.delete(id);
      onExit?.(exitCode, signal);
    });

    this.sessions.set(id, { pty: ptyProcess, cwd, onData, onExit });

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
      const pid = session.pty.pid;

      if (isWindows && pid) {
        // On Windows, use taskkill to kill the entire process tree
        exec(`taskkill /F /T /PID ${pid}`, () => {
          // Ignore errors - process may already be dead
        });
      } else {
        session.pty.kill();
      }

      this.sessions.delete(id);
    }
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroy(id);
    }
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
}
