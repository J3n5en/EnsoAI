/**
 * Process management utilities for consistent process tree handling across the app.
 */

import type { ChildProcess } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import pidtree from 'pidtree';

const isWindows = process.platform === 'win32';

/**
 * Generic interface for process-like objects with pid and kill method
 */
interface ProcessLike {
  pid?: number;
  kill(signal?: NodeJS.Signals | string): void;
}

/**
 * Kill a process and all its children (process tree).
 * On Windows: uses taskkill /T to kill the process tree synchronously.
 * On Unix: uses pgrep to find all descendants and kills them.
 *
 * @param target - PID number, ChildProcess, or any object with pid and kill method (e.g., IPty)
 * @param signal - Signal to send on Unix (default: SIGKILL)
 */
export function killProcessTree(
  target: number | ChildProcess | ProcessLike,
  signal: NodeJS.Signals = 'SIGKILL'
): void {
  // Extract PID from target
  let pid: number | undefined;
  if (typeof target === 'number') {
    pid = target;
  } else if ('pid' in target) {
    pid = target.pid;
  }

  if (!pid) {
    // No PID available, try to kill directly if possible
    if (typeof target !== 'number' && 'kill' in target) {
      try {
        target.kill(signal);
      } catch {
        // Ignore
      }
    }
    return;
  }

  try {
    if (isWindows) {
      // Windows: use taskkill synchronously to kill the entire process tree
      spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      // Unix: use pgrep to find all descendant processes and kill them recursively
      try {
        const result = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf-8' });
        if (result.stdout) {
          const childPids = result.stdout.trim().split('\n').filter(Boolean).map(Number);
          // Recursively kill children first (deepest first)
          for (const childPid of childPids) {
            killProcessTree(childPid, signal);
          }
        }
      } catch {
        // pgrep may not exist or fail, continue to kill main process
      }
      // Kill the main process.
      // Prefer target.kill() when available so libraries (e.g. node-pty) can run
      // their own cleanup logic around termination.
      try {
        if (typeof target !== 'number' && 'kill' in target) {
          try {
            target.kill(signal);
          } catch {
            // Fallback for ProcessLike implementations that don't support the signal
            // or throw while process.kill would still work.
            process.kill(pid, signal);
          }
        } else {
          process.kill(pid, signal);
        }
      } catch {
        // Ignore - process may have already exited
      }
    }
  } catch {
    // Process may have already exited, ignore errors
  }
}

/**
 * Kill a process and all its children (process tree) - async version.
 * Uses pidtree to reliably find all descendant processes.
 *
 * @param target - PID number, ChildProcess, or any object with pid and kill method
 * @param signal - Signal to send (default: SIGKILL)
 */
export async function killProcessTreeAsync(
  target: number | ChildProcess | ProcessLike,
  signal: NodeJS.Signals = 'SIGKILL'
): Promise<void> {
  let pid: number | undefined;
  if (typeof target === 'number') {
    pid = target;
  } else if ('pid' in target) {
    pid = target.pid;
  }

  if (!pid) {
    if (typeof target !== 'number' && 'kill' in target) {
      try {
        target.kill(signal);
      } catch {
        // Ignore
      }
    }
    return;
  }

  try {
    if (isWindows) {
      spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      // Get all descendant PIDs using pidtree
      let childPids: number[] = [];
      try {
        childPids = await pidtree(pid);
      } catch {
        // pidtree fails if process already exited
      }

      // Kill children first (reverse order - deepest first)
      for (const childPid of childPids.reverse()) {
        try {
          process.kill(childPid, signal);
        } catch {
          // Ignore - process may have already exited
        }
      }

      // Kill the main process.
      // Prefer target.kill() when available so libraries (e.g. node-pty) can run
      // their own cleanup logic around termination.
      try {
        if (typeof target !== 'number' && 'kill' in target) {
          try {
            target.kill(signal);
          } catch {
            process.kill(pid, signal);
          }
        } else {
          process.kill(pid, signal);
        }
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ignore
  }
}
