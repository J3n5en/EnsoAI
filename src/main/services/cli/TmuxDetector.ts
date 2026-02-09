import { spawnSync } from 'node:child_process';
import { execInPty } from '../../utils/shell';

const isWindows = process.platform === 'win32';

export interface TmuxCheckResult {
  installed: boolean;
  version?: string;
  error?: string;
}

class TmuxDetector {
  private cache: TmuxCheckResult | null = null;

  async check(forceRefresh?: boolean): Promise<TmuxCheckResult> {
    if (isWindows) {
      return { installed: false };
    }

    if (this.cache && !forceRefresh) {
      return this.cache;
    }

    try {
      const stdout = await execInPty('tmux -V', { timeout: 5000 });
      const match = stdout.match(/tmux\s+(\d+\.\d+[a-z]?)/i);
      const result: TmuxCheckResult = {
        installed: true,
        version: match ? match[1] : undefined,
      };
      this.cache = result;
      return result;
    } catch {
      const result: TmuxCheckResult = { installed: false };
      this.cache = result;
      return result;
    }
  }

  async killSession(name: string): Promise<void> {
    if (isWindows) return;
    try {
      await execInPty(`tmux -L enso kill-session -t ${name}`, { timeout: 5000 });
    } catch {
      // Session may already be gone — ignore errors
    }
  }

  async killServer(): Promise<void> {
    if (isWindows) return;
    try {
      await execInPty('tmux -L enso kill-server', { timeout: 5000 });
    } catch {
      // Server may already be gone — ignore errors
    }
  }

  killServerSync(): void {
    if (isWindows) return;
    try {
      spawnSync('tmux', ['-L', 'enso', 'kill-server'], {
        timeout: 3000,
        stdio: 'ignore',
      });
    } catch {
      // Server may already be gone — ignore errors
    }
  }
}

export const tmuxDetector = new TmuxDetector();
