import type { TerminalCreateOptions } from '@shared/types';
import * as pty from 'node-pty';
import { detectShell } from './ShellDetector';

interface PtySession {
  pty: pty.IPty;
  onData: (data: string) => void;
  onExit?: (exitCode: number, signal?: number) => void;
}

// macOS GUI apps don't inherit shell PATH, add common paths
function getEnhancedPath(): string {
  const currentPath = process.env.PATH || '';
  const additionalPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    `${process.env.HOME}/.nvm/versions/node/current/bin`,
    `${process.env.HOME}/.npm-global/bin`,
    `${process.env.HOME}/.local/bin`,
  ];
  const allPaths = [...new Set([...additionalPaths, ...currentPath.split(':')])];
  return allPaths.join(':');
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
    const shell = options.shell || detectShell();
    const cwd = options.cwd || process.env.HOME || '/';

    const args = options.args || [];

    const ptyProcess = pty.spawn(shell, args, {
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

    ptyProcess.onData((data) => {
      onData(data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.sessions.delete(id);
      onExit?.(exitCode, signal);
    });

    this.sessions.set(id, { pty: ptyProcess, onData, onExit });

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
      session.pty.kill();
      this.sessions.delete(id);
    }
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroy(id);
    }
  }
}
