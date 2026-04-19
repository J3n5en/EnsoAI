#!/usr/bin/env node
/**
 * Dev server wrapper that ensures clean shutdown on Ctrl+C.
 * electron-vite doesn't properly forward SIGINT to Electron subprocess.
 */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Start electron-vite in a new process group so we can kill the entire tree
// On Linux, --no-sandbox is needed when unprivileged user namespaces are disabled
const electronArgs = ['electron-vite', 'dev'];
if (process.platform === 'linux') {
  electronArgs.push('--', '--no-sandbox');
}
const child = spawn('npx', electronArgs, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32', // Use shell on Windows to avoid EINVAL errors
  detached: process.platform !== 'win32', // Create new process group on Unix
});

let shuttingDown = false;

function sleep(ms) {
  const durationMs = Number(ms);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;

  if (process.platform === 'win32') {
    // `ping -n` is seconds-based; `-n (seconds + 1)` because the first ping is sent immediately.
    const seconds = Math.ceil(durationMs / 1000);
    spawnSync('ping', ['-n', String(seconds + 1), '127.0.0.1'], { stdio: 'ignore' });
    return;
  }

  // macOS/Linux: `sleep` supports fractional seconds on typical environments.
  spawnSync('sleep', [String(durationMs / 1000)], { stdio: 'ignore' });
}

function collectProcessTreePids(rootPid) {
  const ps = spawnSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid='], { encoding: 'utf8' });
  if (ps.status !== 0 || typeof ps.stdout !== 'string') return [rootPid];

  const childrenByParent = new Map();
  for (const line of ps.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pidStr, ppidStr] = trimmed.split(/\s+/, 2);
    const pid = Number(pidStr);
    const ppid = Number(ppidStr);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    const siblings = childrenByParent.get(ppid);
    if (siblings) siblings.push(pid);
    else childrenByParent.set(ppid, [pid]);
  }

  const pids = [];
  const seen = new Set();
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    pids.push(pid);
    const children = childrenByParent.get(pid);
    if (children) stack.push(...children);
  }
  return pids;
}

function signalPids(pids, signal) {
  for (const pid of [...pids].reverse()) {
    try {
      process.kill(pid, signal);
    } catch {
      // ignore
    }
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[dev] ${signal} - shutting down...`);

  if (child.pid) {
    if (process.platform === 'win32') {
      // Windows: use taskkill to kill process tree
      spawnSync('taskkill', ['/pid', child.pid.toString(), '/t', '/f'], { stdio: 'ignore' });
    } else {
      // Unix: kill the entire process tree (Electron may spawn its own process group)
      const pids = collectProcessTreePids(child.pid);
      signalPids(pids, 'SIGTERM');
      if (pids.length <= 1) {
        // Fallback: try killing the whole process group when process tree is unavailable
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          // ignore
        }
      }
      sleep(400);
      signalPids(pids, 'SIGKILL');
      if (pids.length <= 1) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
    }
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
child.on('close', (code) => process.exit(shuttingDown ? 0 : (code ?? 0)));
