export const REMOTE_SERVER_VERSION = '0.4.0';
export const REMOTE_HELPER_VERSION = REMOTE_SERVER_VERSION;

export function getRemoteServerSource(): string {
  return String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const state = {
  clients: new Set(),
  sessions: new Map(),
  watchers: new Map(),
};

const REMOTE_SERVER_VERSION = ${JSON.stringify(REMOTE_SERVER_VERSION)};
const DAEMON_INFO_FILE = 'enso-remote-daemon.json';
const MAX_SESSION_REPLAY_CHARS = 65536;
const EXEC_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const EXEC_COMMAND_OUTPUT_LIMIT_CHARS = 2 * 1024 * 1024;
const REMOTE_PTY_UNAVAILABLE = 'REMOTE_PTY_UNAVAILABLE';
const REMOTE_SETTINGS_PATH = '.ensoai/settings.json';
const REMOTE_SESSION_STATE_PATH = '.ensoai/session-state.json';
const RUNTIME_MANIFEST_FILENAME = 'enso-remote-runtime-manifest.json';
const GLOBAL_STATUS_CACHE_TTL = 300000;
const AUTH_TOKEN_BYTES = 36;
let cachedNodePty = undefined;
let cachedNodePtyLoadError = null;
let cachedHapiGlobalStatus = null;
let cachedHapiGlobalStatusAt = 0;
let cachedHappyGlobalStatus = null;
let cachedHappyGlobalStatusAt = 0;
let cachedTmuxStatus = null;
let cachedTmuxStatusAt = 0;

const UNIX_SHELLS = [
  {
    id: 'zsh',
    name: 'Zsh',
    paths: ['/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh', '/opt/homebrew/bin/zsh'],
    args: ['-i', '-l'],
    execArgs: ['-i', '-l', '-c'],
  },
  {
    id: 'bash',
    name: 'Bash',
    paths: ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash'],
    args: ['-i', '-l'],
    execArgs: ['-i', '-l', '-c'],
  },
  {
    id: 'fish',
    name: 'Fish',
    paths: ['/usr/bin/fish', '/usr/local/bin/fish', '/opt/homebrew/bin/fish'],
    args: ['-i', '-l'],
    execArgs: ['-l', '-c'],
  },
  {
    id: 'nushell',
    name: 'Nushell',
    paths: ['/usr/local/bin/nu', '/opt/homebrew/bin/nu', path.join(os.homedir(), '.cargo', 'bin', 'nu')],
    args: ['-l', '-i'],
    execArgs: ['-l', '-c'],
  },
  {
    id: 'sh',
    name: 'Sh',
    paths: ['/bin/sh'],
    args: [],
    execArgs: ['-c'],
  },
];

const BUILTIN_AGENT_CONFIGS = [
  {
    id: 'claude',
    name: 'Claude',
    command: 'claude',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'droid',
    name: 'Droid',
    command: 'droid',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: 'gemini',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'auggie',
    name: 'Auggie',
    command: 'auggie',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    command: 'cursor-agent',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
];

let fatalExitHandled = false;

function formatFatalError(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

function writeFatalError(error) {
  const text = formatFatalError(error).trim();
  if (!text) return;
  process.stderr.write(text.endsWith('\n') ? text : text + '\n');
}

function exitWithFatalError(error) {
  if (fatalExitHandled) return;
  fatalExitHandled = true;
  writeFatalError(error);
  process.exit(1);
}

process.on('uncaughtException', (error) => {
  exitWithFatalError(error);
});

process.on('unhandledRejection', (error) => {
  exitWithFatalError(error);
});

function sendMessage(stream, message) {
  stream.write(JSON.stringify(message) + '\n');
}

function reply(stream, id, result) {
  sendMessage(stream, { type: 'response', id, result });
}

function replyError(stream, id, error) {
  sendMessage(stream, {
    type: 'response',
    id,
    error: error instanceof Error ? error.message : String(error),
  });
}

function sendEvent(stream, event, payload) {
  sendMessage(stream, {
    type: 'event',
    event,
    payload,
  });
}

function broadcast(event, payload) {
  for (const client of state.clients) {
    if (client.destroyed) continue;
    sendEvent(client, event, payload);
  }
}

function normalize(p) {
  if (typeof p !== 'string' || p.length === 0) return '';
  const replaced = p.replace(/\\\\/g, '/').replace(/\/+$/g, '');
  if (/^[A-Za-z]:$/.test(replaced)) {
    return replaced + '/';
  }
  return replaced || '/';
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function appendOutputTail(current, chunk, limit) {
  if (limit <= 0) {
    return '';
  }
  if (chunk.length >= limit) {
    return chunk.slice(-limit);
  }
  const combined = current + chunk;
  return combined.length > limit ? combined.slice(-limit) : combined;
}

function resolvePathWithinRoot(rootPath, filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path');
  }

  const absoluteRoot = path.resolve(rootPath);
  const absolutePath = path.resolve(absoluteRoot, filePath);
  const relativePath = path.relative(absoluteRoot, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Path traversal detected');
  }

  return {
    absolutePath,
    relativePath: relativePath.replace(/\\\\/g, '/'),
  };
}

function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout =
      Number.isFinite(options.timeout) && options.timeout > 0
        ? options.timeout
        : EXEC_COMMAND_TIMEOUT_MS;
    const outputLimit =
      Number.isFinite(options.outputLimit) && options.outputLimit > 0
        ? options.outputLimit
        : EXEC_COMMAND_OUTPUT_LIMIT_CHARS;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finishError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
      finishError(new Error(details || (command + ' timed out')));
    }, timeout);

    child.stdout.on('data', (chunk) => {
      stdout = appendOutputTail(stdout, chunk.toString(), outputLimit);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendOutputTail(stderr, chunk.toString(), outputLimit);
    });
    child.on('error', (error) => {
      finishError(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || (command + ' 已退出，退出码 ' + code)));
      }
    });
  });
}

async function listDirectory(dirPath) {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      const stats = await fsp.stat(fullPath);
      results.push({
        name: entry.name,
        path: normalize(fullPath),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtimeMs,
      });
    } catch {
      // ignore unreadable entries
    }
  }
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return results;
}

function isLikelyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  for (const value of sample) {
    if (value === 0) {
      return true;
    }
  }
  return false;
}

async function readFileText(filePath) {
  const buffer = await fsp.readFile(filePath);
  if (isLikelyBinary(buffer)) {
    return {
      content: '',
      encoding: 'binary',
      detectedEncoding: 'binary',
      confidence: 1,
      isBinary: true,
    };
  }
  return {
    content: buffer.toString('utf8'),
    encoding: 'utf-8',
    detectedEncoding: 'utf-8',
    confidence: 1,
  };
}

async function writeFileText(filePath, content) {
  await fsp.writeFile(filePath, content, 'utf8');
  return { success: true };
}

async function createFile(filePath, content = '', overwrite = false) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, { encoding: 'utf8', flag: overwrite ? 'w' : 'wx' });
  return { success: true };
}

async function createDirectory(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
  return { success: true };
}

async function renamePath(fromPath, toPath) {
  await fsp.mkdir(path.dirname(toPath), { recursive: true });
  await fsp.rename(fromPath, toPath);
  return { success: true };
}

async function removePath(targetPath, recursive = true) {
  await fsp.rm(targetPath, { recursive, force: false });
  return { success: true };
}

async function pathExists(filePath) {
  try {
    await fsp.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function statPath(targetPath) {
  const stats = await fsp.stat(targetPath);
  return {
    path: normalize(targetPath),
    isDirectory: stats.isDirectory(),
    size: stats.size,
    modifiedAt: stats.mtimeMs,
  };
}

async function copyDirectory(sourcePath, targetPath) {
  await fsp.mkdir(targetPath, { recursive: true });
  const entries = await fsp.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const nextSource = path.join(sourcePath, entry.name);
    const nextTarget = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(nextSource, nextTarget);
    } else {
      await fsp.mkdir(path.dirname(nextTarget), { recursive: true });
      await fsp.copyFile(nextSource, nextTarget);
    }
  }
}

async function copyPath(sourcePath, targetPath) {
  const sourceStats = await fsp.stat(sourcePath);
  if (sourceStats.isDirectory()) {
    await copyDirectory(sourcePath, targetPath);
  } else {
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.copyFile(sourcePath, targetPath);
  }
  return { success: true };
}

async function movePath(sourcePath, targetPath) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await fsp.rename(sourcePath, targetPath);
  } catch {
    await copyPath(sourcePath, targetPath);
    await fsp.rm(sourcePath, { recursive: true, force: true });
  }
  return { success: true };
}

async function checkPathConflicts(sources, targetDir) {
  const conflicts = [];

  for (const sourcePath of sources) {
    const sourceStats = await fsp.stat(sourcePath);
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(targetDir, fileName);

    try {
      const targetStats = await fsp.stat(targetPath);
      conflicts.push({
        path: normalize(sourcePath),
        name: fileName,
        sourceSize: sourceStats.size,
        targetSize: targetStats.size,
        sourceModified: sourceStats.mtimeMs,
        targetModified: targetStats.mtimeMs,
      });
    } catch {
      // no conflict
    }
  }

  return conflicts;
}

async function batchTransferPaths(sources, targetDir, conflicts = [], operation = 'copy') {
  const success = [];
  const failed = [];
  const conflictMap = new Map((Array.isArray(conflicts) ? conflicts : []).map((item) => [item.path, item]));

  for (const sourcePath of sources) {
    try {
      const fileName = path.basename(sourcePath);
      let targetPath = path.join(targetDir, fileName);
      const conflict = conflictMap.get(sourcePath) || conflictMap.get(normalize(sourcePath));

      if (conflict) {
        if (conflict.action === 'skip') {
          continue;
        }
        if (conflict.action === 'rename' && conflict.newName) {
          targetPath = path.join(targetDir, conflict.newName);
        }
        if (conflict.action === 'replace') {
          await fsp.rm(targetPath, { recursive: true, force: true }).catch(() => {});
        }
      }

      if (operation === 'move') {
        await movePath(sourcePath, targetPath);
      } else {
        await copyPath(sourcePath, targetPath);
      }

      success.push(normalize(sourcePath));
    } catch (error) {
      failed.push({
        path: normalize(sourcePath),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { success, failed };
}

async function testEnvironment(options = {}) {
  let gitVersion = null;
  if (options.includeGitVersion !== false) {
    try {
      const git = await execCommand('git', ['--version']);
      gitVersion = git.stdout.trim() || git.stderr.trim() || null;
    } catch {
      gitVersion = null;
    }
  }

  const ptyStatus = getPtyStatus();

  return {
    platform: process.platform,
    homeDir: normalize(os.homedir()),
    nodeVersion: process.version,
    gitVersion,
    ptySupported: ptyStatus.supported,
    ptyError: ptyStatus.error || null,
  };
}

async function runSelfTest() {
  const [env, runtimeManifest, helperSourceSha256] = await Promise.all([
    testEnvironment({ includeGitVersion: false }),
    readRuntimeManifest(),
    sha256File(__filename),
  ]);
  const payload = {
    ok: env.platform !== 'linux' || env.ptySupported,
    platform: env.platform,
    arch: process.arch,
    nodeVersion: env.nodeVersion,
    homeDir: env.homeDir,
    ptySupported: env.ptySupported,
    ptyError: env.ptyError,
    helperSourceSha256,
    serverVersion: REMOTE_SERVER_VERSION,
    runtimeManifest,
  };
  const output = JSON.stringify(payload) + '\n';

  if (env.platform === 'linux' && !env.ptySupported) {
    process.stderr.write(output);
    process.exit(1);
  }

  process.stdout.write(output);
}

function parsePorcelainStatus(stdout) {
  const lines = stdout.split('\0').map((line) => line.trim()).filter(Boolean);
  const result = {
    isClean: true,
    current: null,
    tracking: null,
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    deleted: [],
    untracked: [],
    conflicted: [],
  };

  let pendingRename = null;

  for (const line of lines) {
    if (line.startsWith('# branch.head ')) {
      const branch = line.slice('# branch.head '.length);
      result.current = branch === '(detached)' ? null : branch;
      continue;
    }
    if (line.startsWith('# branch.upstream ')) {
      result.tracking = line.slice('# branch.upstream '.length);
      continue;
    }
    if (line.startsWith('# branch.ab ')) {
      const parts = line.split(' ');
      result.ahead = Number.parseInt((parts[2] || '+0').replace('+', ''), 10) || 0;
      result.behind = Number.parseInt((parts[3] || '-0').replace('-', ''), 10) || 0;
      continue;
    }
    if (pendingRename) {
      const filePath = line;
      const x = pendingRename.xy[0] || '.';
      const y = pendingRename.xy[1] || '.';
      if (x !== '.' && x !== '?' && x !== '!') result.staged.push(filePath);
      if (y === 'D') result.deleted.push(filePath);
      else if (y !== '.' && y !== '?' && y !== '!' && y !== ' ') result.modified.push(filePath);
      if (x === 'U' || y === 'U') result.conflicted.push(filePath);
      pendingRename = null;
      continue;
    }
    if (line.startsWith('? ')) {
      result.untracked.push(line.slice(2));
      continue;
    }
    if (line.startsWith('! ')) {
      continue;
    }
    const parts = line.split(' ');
    const kind = line[0];
    const xy = parts[1] || '..';
    const filePath = parts[parts.length - 1];
    if (kind === '2') {
      pendingRename = { xy };
      continue;
    }
    if (!filePath) continue;
    const x = xy[0] || '.';
    const y = xy[1] || '.';
    if (x === 'U' || y === 'U' || kind === 'u') result.conflicted.push(filePath);
    if (x !== '.' && x !== '?' && x !== '!') result.staged.push(filePath);
    if (y === 'D') result.deleted.push(filePath);
    else if (y !== '.' && y !== '?' && y !== '!' && y !== ' ') result.modified.push(filePath);
  }

  result.isClean =
    result.staged.length === 0 &&
    result.modified.length === 0 &&
    result.deleted.length === 0 &&
    result.untracked.length === 0 &&
    result.conflicted.length === 0;

  return result;
}

function parseWorktreeList(stdout, rootPath) {
  const lines = stdout.split('\n');
  const worktrees = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current) worktrees.push(current);
      current = {
        path: normalize(line.slice('worktree '.length)),
        head: '',
        branch: null,
        isMainWorktree: false,
        isLocked: false,
        prunable: false,
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch ')) current.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === 'locked') current.isLocked = true;
    else if (line === 'prunable') current.prunable = true;
  }

  if (current) worktrees.push(current);

  const normalizedRoot = normalize(rootPath);
  return worktrees.map((worktree, index) => ({
    ...worktree,
    isMainWorktree: worktree.path === normalizedRoot || index === 0,
  }));
}

function parseBranches(stdout) {
  const branches = [];
  const lines = stdout.split('\n').map((line) => line.trimEnd()).filter(Boolean);
  for (const line of lines) {
    const current = line.startsWith('*');
    const cleaned = line.replace(/^[* ]+/, '');
    const parts = cleaned.split(/\s+/);
    const name = parts.shift() || '';
    const commit = parts.shift() || '';
    const label = parts.join(' ').trim();
    branches.push({
      name,
      current,
      commit,
      label,
    });
  }
  return branches;
}

function parseLog(stdout) {
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\x01');
      return {
        hash: parts[0] || '',
        date: parts[1] || '',
        author_name: parts[2] || '',
        author_email: parts[3] || '',
        message: (parts[4] || '').trim(),
        refs: (parts[5] || '').trim() || undefined,
      };
    });
}

function parseFileChanges(stdout) {
  const lines = stdout.split('\0').map((line) => line.trim()).filter(Boolean);
  const changes = [];
  let pendingRename = null;
  for (const line of lines) {
    if (line.startsWith('# ') || line.startsWith('! ')) continue;
    if (pendingRename) {
      const filePath = line;
      const x = pendingRename.xy[0] || '.';
      const y = pendingRename.xy[1] || '.';
      if (x !== '.' && x !== '?' && x !== '!') {
        changes.push({ path: filePath, status: x === 'A' ? 'A' : x === 'D' ? 'D' : x === 'R' ? 'R' : x === 'C' ? 'C' : x === 'U' ? 'X' : 'M', staged: true, originalPath: pendingRename.originalPath });
      }
      if (y !== '.' && y !== ' ') {
        changes.push({ path: filePath, status: y === 'D' ? 'D' : y === 'U' ? 'X' : 'M', staged: false });
      }
      pendingRename = null;
      continue;
    }
    if (line.startsWith('? ')) {
      changes.push({ path: line.slice(2), status: 'U', staged: false });
      continue;
    }
    const kind = line[0];
    const parts = line.split(' ');
    const xy = parts[1] || '..';
    const filePath = parts[parts.length - 1];
    if (!filePath) continue;
    if (kind === '2') {
      pendingRename = { xy, originalPath: filePath };
      continue;
    }
    const x = xy[0] || '.';
    const y = xy[1] || '.';
    if (x !== '.' && x !== '?' && x !== '!') {
      changes.push({ path: filePath, status: x === 'A' ? 'A' : x === 'D' ? 'D' : x === 'R' ? 'R' : x === 'C' ? 'C' : x === 'U' ? 'X' : 'M', staged: true });
    }
    if (y !== '.' && y !== ' ') {
      changes.push({ path: filePath, status: y === 'D' ? 'D' : y === 'U' ? 'X' : 'M', staged: false });
    }
  }
  return { changes };
}

function parseCommitFiles(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawStatus, ...rest] = line.split(/\s+/);
      const filePath = rest.join(' ');
      const status = (rawStatus || 'M')[0] || 'M';
      return {
        path: filePath,
        status,
      };
    });
}

function parseDiffStats(stdout) {
  const insertionsMatch = stdout.match(/(\d+)\s+insertion/);
  const deletionsMatch = stdout.match(/(\d+)\s+deletion/);
  return {
    insertions: insertionsMatch ? Number.parseInt(insertionsMatch[1], 10) : 0,
    deletions: deletionsMatch ? Number.parseInt(deletionsMatch[1], 10) : 0,
  };
}

function getGitDirPath(workdir) {
  const dotGitPath = path.join(workdir, '.git');
  try {
    const stats = fs.statSync(dotGitPath);
    if (stats.isDirectory()) {
      return dotGitPath;
    }
  } catch {}

  try {
    const content = fs.readFileSync(dotGitPath, 'utf8');
    const match = content.match(/^gitdir:\s*(.+)\s*$/im);
    if (match?.[1]) {
      return path.resolve(workdir, match[1].trim());
    }
  } catch {}

  return dotGitPath;
}

async function gitShowFile(workdir, spec) {
  try {
    const { stdout } = await execCommand('git', ['show', spec], { cwd: workdir });
    return stdout;
  } catch {
    return '';
  }
}

async function gitStatus(rootPath) {
  const { stdout } = await execCommand('git', ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'], { cwd: rootPath });
  return parsePorcelainStatus(stdout);
}

async function gitResolveRoot(rootPath) {
  try {
    const { stdout } = await execCommand('git', ['rev-parse', '--show-toplevel'], { cwd: rootPath });
    return normalize(stdout.trim());
  } catch {
    return null;
  }
}

async function gitBranches(rootPath) {
  const { stdout } = await execCommand('git', ['branch', '-a', '-v'], { cwd: rootPath });
  return parseBranches(stdout);
}

async function gitBranchCreate(rootPath, name, startPoint) {
  const args = ['branch', name];
  if (startPoint) {
    args.push(startPoint);
  }
  await execCommand('git', args, { cwd: rootPath });
  return { success: true };
}

async function gitCheckout(rootPath, branch) {
  await execCommand('git', ['checkout', branch], { cwd: rootPath });
  return { success: true };
}

async function gitLog(rootPath, maxCount = 50, skip = 0) {
  const args = ['log', '-n' + maxCount, '--pretty=format:%H%x01%ai%x01%an%x01%ae%x01%s%x01%D'];
  if (skip > 0) {
    args.push('--skip=' + skip);
  }
  const { stdout } = await execCommand('git', args, { cwd: rootPath });
  return parseLog(stdout);
}

async function gitDiff(rootPath, staged = false) {
  const args = ['diff'];
  if (staged) args.push('--staged');
  const { stdout } = await execCommand('git', args, { cwd: rootPath });
  return stdout;
}

async function gitCommit(rootPath, message) {
  const { stdout } = await execCommand('git', ['commit', '-m', message], { cwd: rootPath });
  const match = stdout.match(/\[[^\]]+\s+([0-9a-f]{7,40})\]/i);
  return match ? match[1] : stdout.trim();
}

async function gitStage(rootPath, paths) {
  await execCommand('git', ['add', '--', ...paths], { cwd: rootPath });
  return { success: true };
}

async function gitUnstage(rootPath, paths) {
  await execCommand('git', ['restore', '--staged', '--', ...paths], { cwd: rootPath });
  return { success: true };
}

async function gitDiscard(rootPath, paths) {
  await execCommand('git', ['restore', '--worktree', '--source=HEAD', '--', ...paths], {
    cwd: rootPath,
  });
  return { success: true };
}

async function gitPush(rootPath, remote = 'origin', branch, setUpstream = false) {
  const args = ['push'];
  if (setUpstream && branch) args.push('-u');
  args.push(remote);
  if (branch) args.push(branch);
  await execCommand('git', args, { cwd: rootPath });
  return { success: true };
}

async function gitPull(rootPath, remote = 'origin', branch) {
  const args = ['pull', remote];
  if (branch) args.push(branch);
  await execCommand('git', args, { cwd: rootPath });
  return { success: true };
}

async function gitFetch(rootPath, remote = 'origin') {
  await execCommand('git', ['fetch', remote], { cwd: rootPath });
  return { success: true };
}

async function gitFileChanges(rootPath) {
  const { stdout } = await execCommand('git', ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'], { cwd: rootPath });
  return parseFileChanges(stdout);
}

async function gitShowOrEmpty(rootPath, spec) {
  try {
    const result = await execCommand('git', ['show', spec], { cwd: rootPath });
    return result.stdout;
  } catch {
    return '';
  }
}

async function gitFileDiff(rootPath, filePath, staged) {
  let original = '';
  let modified = '';

  if (staged) {
    [original, modified] = await Promise.all([
      gitShowOrEmpty(rootPath, 'HEAD:' + filePath),
      gitShowOrEmpty(rootPath, ':' + filePath),
    ]);
  } else {
    original = await gitShowOrEmpty(rootPath, ':' + filePath);
    if (!original) {
      original = await gitShowOrEmpty(rootPath, 'HEAD:' + filePath);
    }
    modified = await fsp.readFile(path.join(rootPath, filePath), 'utf8').catch(() => '');
  }

  return {
    path: filePath,
    original,
    modified,
  };
}

async function gitCommitShow(rootPath, hash) {
  const { stdout } = await execCommand('git', ['show', '--stat', hash], { cwd: rootPath });
  return stdout;
}

async function gitCommitFiles(rootPath, hash) {
  const { stdout } = await execCommand('git', ['show', '--name-status', '--format=', hash], {
    cwd: rootPath,
  });
  return parseCommitFiles(stdout);
}

async function gitCommitDiff(rootPath, hash, filePath) {
  let original = '';
  let modified = '';

  try {
    const result = await execCommand('git', ['show', hash + '^:' + filePath], { cwd: rootPath });
    original = result.stdout;
  } catch {
    original = '';
  }

  try {
    const result = await execCommand('git', ['show', hash + ':' + filePath], { cwd: rootPath });
    modified = result.stdout;
  } catch {
    modified = '';
  }

  return {
    path: filePath,
    original,
    modified,
  };
}

async function gitDiffStats(rootPath) {
  const { stdout } = await execCommand('git', ['diff', '--shortstat'], { cwd: rootPath });
  return parseDiffStats(stdout);
}

async function worktreeList(rootPath) {
  const { stdout } = await execCommand('git', ['worktree', 'list', '--porcelain'], {
    cwd: rootPath,
  });
  return parseWorktreeList(stdout, rootPath);
}

async function worktreeAdd(rootPath, options) {
  const args = ['worktree', 'add'];
  if (options.newBranch) args.push('-b', options.newBranch);
  args.push(options.path);
  if (options.branch) args.push(options.branch);
  await execCommand('git', args, { cwd: rootPath });
  return { success: true };
}

async function worktreeRemove(rootPath, options) {
  const args = ['worktree', 'remove'];
  if (options.force) args.push('--force');
  args.push(options.path);
  await execCommand('git', args, { cwd: rootPath });
  if (options.deleteBranch && options.branch) {
    await execCommand('git', ['branch', '-D', options.branch], { cwd: rootPath }).catch(() => {});
  }
  return { success: true };
}

async function getMainWorktreePath(rootPath) {
  const worktrees = await worktreeList(rootPath);
  const main = worktrees.find((item) => item.isMainWorktree);
  if (!main) {
    throw new Error('No main worktree found');
  }
  return main.path;
}

async function getWorktreeBranch(rootPath, worktreePath) {
  const worktrees = await worktreeList(rootPath);
  const worktree = worktrees.find((item) => normalize(item.path) === normalize(worktreePath));
  if (!worktree || !worktree.branch) {
    throw new Error('No branch found for worktree: ' + worktreePath);
  }
  return worktree.branch;
}

async function deleteBranchSafely(rootPath, branchName) {
  try {
    await execCommand('git', ['branch', '-D', branchName], { cwd: rootPath });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return "Failed to delete branch '" + branchName + "': " + message;
  }
}

async function deleteWorktreeSafely(rootPath, worktreePath, options = {}) {
  const warnings = [];
  try {
    await execCommand('git', ['worktree', 'prune'], { cwd: rootPath });
    await execCommand('git', ['worktree', 'remove', '--force', worktreePath], { cwd: rootPath });
    if (options.deleteBranch && options.branchName) {
      const warning = await deleteBranchSafely(rootPath, options.branchName);
      if (warning) warnings.push(warning);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push('Failed to delete worktree: ' + message);
    if (options.deleteBranch && options.branchName) {
      const warning = await deleteBranchSafely(rootPath, options.branchName);
      if (warning) warnings.push(warning);
    }
  }
  return warnings;
}

async function gitGetCurrentBranch(workdir) {
  try {
    const { stdout } = await execCommand('git', ['branch', '--show-current'], { cwd: workdir });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function gitHasUncommittedChanges(workdir) {
  const status = await gitStatus(workdir);
  return !status.isClean;
}

async function gitStashPush(workdir, message) {
  await execCommand('git', ['stash', 'push', '-m', message], { cwd: workdir });
}

async function gitStashPop(workdir) {
  await execCommand('git', ['stash', 'pop'], { cwd: workdir });
}

async function worktreeMerge(rootPath, options) {
  const mainWorktreePath = await getMainWorktreePath(rootPath);
  const sourceBranch = await getWorktreeBranch(rootPath, options.worktreePath);
  let worktreeStashed = false;
  let mainStashed = false;
  const autoStash = options.autoStash !== false;

  const restoreStashes = async () => {
    let mainStashStatus = 'none';
    let worktreeStashStatus = 'none';

    if (mainStashed) {
      try {
        await gitStashPop(mainWorktreePath);
        mainStashStatus = 'applied';
      } catch {
        mainStashStatus = 'conflict';
        if (worktreeStashed) {
          worktreeStashStatus = 'stashed';
        }
        return { mainStashStatus, worktreeStashStatus };
      }
    }

    if (worktreeStashed) {
      try {
        await gitStashPop(options.worktreePath);
        worktreeStashStatus = 'applied';
      } catch {
        worktreeStashStatus = 'conflict';
      }
    }

    return { mainStashStatus, worktreeStashStatus };
  };

  const getStashedStatus = () => ({
    mainStashStatus: mainStashed ? 'stashed' : 'none',
    worktreeStashStatus: worktreeStashed ? 'stashed' : 'none',
  });

  const getStashPaths = () => ({
    mainWorktreePath: mainStashed ? mainWorktreePath : undefined,
    worktreePath: worktreeStashed ? options.worktreePath : undefined,
  });

  if (await gitHasUncommittedChanges(options.worktreePath)) {
    if (!autoStash) {
      return {
        success: false,
        merged: false,
        error: 'Worktree has uncommitted changes. Please commit or stash them first.',
      };
    }
    try {
      await gitStashPush(options.worktreePath, 'Auto stash before merge');
      worktreeStashed = true;
    } catch (error) {
      return {
        success: false,
        merged: false,
        error:
          'Failed to stash worktree changes: ' +
          (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  if (await gitHasUncommittedChanges(mainWorktreePath)) {
    if (!autoStash) {
      const stashResult = await restoreStashes();
      return {
        success: false,
        merged: false,
        error: 'Main worktree has uncommitted changes. Please commit or stash them first.',
        ...stashResult,
      };
    }
    try {
      await gitStashPush(mainWorktreePath, 'Auto stash before merge');
      mainStashed = true;
    } catch (error) {
      const stashResult = await restoreStashes();
      return {
        success: false,
        merged: false,
        error:
          'Failed to stash main worktree changes: ' +
          (error instanceof Error ? error.message : String(error)),
        ...stashResult,
      };
    }
  }

  const originalBranch = await gitGetCurrentBranch(mainWorktreePath);

  try {
    await gitCheckout(mainWorktreePath, options.targetBranch);
    const mergeArgs = [];

    if (options.strategy === 'squash') {
      mergeArgs.push('--squash');
    } else if (options.strategy === 'merge' && options.noFf !== false) {
      mergeArgs.push('--no-ff');
    }

    if (options.message) {
      mergeArgs.push('-m', options.message);
    }

    if (options.strategy === 'rebase') {
      try {
        await execCommand('git', ['rebase', sourceBranch], { cwd: mainWorktreePath });
        const { stdout } = await execCommand('git', ['rev-parse', 'HEAD'], { cwd: mainWorktreePath });
        const stashResult = await restoreStashes();
        return {
          success: true,
          merged: true,
          commitHash: stdout.trim(),
          ...stashResult,
        };
      } catch (error) {
        const conflicts = await worktreeGetConflicts(mainWorktreePath);
        if (conflicts.length > 0) {
          return {
            success: false,
            merged: false,
            conflicts,
            ...getStashedStatus(),
            ...getStashPaths(),
          };
        }
        await execCommand('git', ['rebase', '--abort'], { cwd: mainWorktreePath }).catch(() => {});
        const stashResult = await restoreStashes();
        return {
          success: false,
          merged: false,
          error: 'Rebase failed: ' + (error instanceof Error ? error.message : String(error)),
          ...stashResult,
        };
      }
    }

    try {
      await execCommand('git', ['merge', ...mergeArgs, sourceBranch], { cwd: mainWorktreePath });

      if (options.strategy === 'squash') {
        await execCommand(
          'git',
          ['commit', '-m', options.message || "Squash merge branch '" + sourceBranch + "'"],
          { cwd: mainWorktreePath }
        );
      }

      const { stdout } = await execCommand('git', ['rev-parse', 'HEAD'], { cwd: mainWorktreePath });
      let warnings = [];
      if (options.deleteWorktreeAfterMerge) {
        warnings = await deleteWorktreeSafely(mainWorktreePath, options.worktreePath, {
          deleteBranch: options.deleteBranchAfterMerge,
          branchName: sourceBranch,
        });
      } else if (options.deleteBranchAfterMerge) {
        const warning = await deleteBranchSafely(mainWorktreePath, sourceBranch);
        if (warning) warnings.push(warning);
      }

      const stashResult = await restoreStashes();
      if (stashResult.mainStashStatus === 'conflict') {
        warnings.push('Stash pop conflict in main worktree: ' + mainWorktreePath);
      }
      if (stashResult.worktreeStashStatus === 'conflict') {
        warnings.push('Stash pop conflict in worktree: ' + options.worktreePath);
      }
      if (
        stashResult.mainStashStatus === 'conflict' &&
        stashResult.worktreeStashStatus === 'stashed'
      ) {
        warnings.push(
          'Worktree stash pending - resolve main conflict first, then run "git stash pop" in: ' +
            options.worktreePath
        );
      }

      return {
        success: true,
        merged: true,
        commitHash: stdout.trim(),
        warnings: warnings.length > 0 ? warnings : undefined,
        ...stashResult,
      };
    } catch (error) {
      const conflicts = await worktreeGetConflicts(mainWorktreePath);
      if (conflicts.length > 0) {
        return {
          success: false,
          merged: false,
          conflicts,
          ...getStashedStatus(),
          ...getStashPaths(),
        };
      }
      throw error;
    }
  } catch (error) {
    if (originalBranch) {
      await gitCheckout(mainWorktreePath, originalBranch).catch(() => {});
    }
    const stashResult = await restoreStashes();
    return {
      success: false,
      merged: false,
      error: error instanceof Error ? error.message : String(error),
      ...stashResult,
    };
  }
}

async function worktreeGetMergeState(workdir) {
  const gitDir = getGitDirPath(workdir);
  const mergeHeadPath = path.join(gitDir, 'MERGE_HEAD');
  try {
    await fsp.access(mergeHeadPath);
  } catch {
    return { inProgress: false };
  }

  const conflicts = await worktreeGetConflicts(workdir);
  let targetBranch;
  let sourceBranch;

  try {
    targetBranch = await gitGetCurrentBranch(workdir);
    const mergeHead = (await fsp.readFile(mergeHeadPath, 'utf8')).trim();
    const { stdout } = await execCommand('git', ['branch', '-a', '--contains', mergeHead], {
      cwd: workdir,
    });
    const branch = stdout
      .split('\n')
      .map((line) => line.replace(/^[* ]+/, '').trim())
      .find(Boolean);
    if (branch) {
      sourceBranch = branch.replace('remotes/origin/', '');
    }
  } catch {}

  return {
    inProgress: true,
    targetBranch,
    sourceBranch,
    conflicts,
  };
}

async function worktreeGetConflicts(workdir) {
  const status = await gitStatus(workdir);
  return status.conflicted.map((file) => ({
    file,
    type: 'content',
  }));
}

async function worktreeGetConflictContent(workdir, filePath) {
  const safePath = resolvePathWithinRoot(workdir, filePath);
  const [ours, theirs, base] = await Promise.all([
    gitShowFile(workdir, ':2:' + safePath.relativePath),
    gitShowFile(workdir, ':3:' + safePath.relativePath),
    gitShowFile(workdir, ':1:' + safePath.relativePath),
  ]);

  return { file: safePath.relativePath, ours, theirs, base };
}

async function worktreeResolveConflict(workdir, resolution) {
  const safePath = resolvePathWithinRoot(workdir, resolution.file);
  await fsp.writeFile(safePath.absolutePath, resolution.content, 'utf8');
  await execCommand('git', ['add', '--', safePath.relativePath], { cwd: workdir });
  return { success: true };
}

async function worktreeAbortMerge(workdir) {
  const gitDir = getGitDirPath(workdir);
  if (fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply'))) {
    await execCommand('git', ['rebase', '--abort'], { cwd: workdir });
    return { success: true };
  }

  if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
    await execCommand('git', ['merge', '--abort'], { cwd: workdir });
    return { success: true };
  }

  await execCommand('git', ['reset', '--hard', 'HEAD'], { cwd: workdir });
  return { success: true };
}

async function worktreeContinueMerge(workdir, message, cleanupOptions) {
  const conflicts = await worktreeGetConflicts(workdir);
  if (conflicts.length > 0) {
    return {
      success: false,
      merged: false,
      conflicts,
      error: 'There are still unresolved conflicts',
    };
  }

  try {
    await execCommand('git', ['commit', '-m', message || 'Merge commit'], { cwd: workdir });
    const { stdout } = await execCommand('git', ['rev-parse', 'HEAD'], { cwd: workdir });
    let warnings = [];
    if (cleanupOptions?.deleteWorktreeAfterMerge && cleanupOptions.worktreePath) {
      const cleanupRoot =
        normalize(workdir) === normalize(cleanupOptions.worktreePath)
          ? await getMainWorktreePath(workdir)
          : workdir;
      warnings = await deleteWorktreeSafely(cleanupRoot, cleanupOptions.worktreePath, {
        deleteBranch: cleanupOptions.deleteBranchAfterMerge,
        branchName: cleanupOptions.sourceBranch,
      });
    } else if (cleanupOptions?.deleteBranchAfterMerge && cleanupOptions.sourceBranch) {
      const warning = await deleteBranchSafely(workdir, cleanupOptions.sourceBranch);
      if (warning) warnings.push(warning);
    }

    return {
      success: true,
      merged: true,
      commitHash: stdout.trim(),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      merged: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function searchFiles(rootPath, query, maxResults = 100) {
  const { stdout } = await execCommand('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: rootPath,
  });
  const entries = stdout
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({
      path: normalize(path.join(rootPath, item)),
      relativePath: item,
      name: path.basename(item),
      score: query ? (item.toLowerCase().includes(query.toLowerCase()) ? 100 : 0) : 0,
    }))
    .filter((entry) => !query || entry.score > 0)
    .slice(0, maxResults);
  return entries;
}

async function searchContent(
  rootPath,
  query,
  maxResults = 500,
  caseSensitive = false,
  wholeWord = false,
  regex = false,
  filePattern,
  useGitignore = true
) {
  const args = ['-n', '--column', '-I', '-m', String(maxResults)];
  if (!caseSensitive) args.push('-i');
  if (wholeWord) args.push('-w');
  if (!regex) args.push('-F');
  if (filePattern) args.push('--glob', filePattern);
  if (!useGitignore) args.push('--no-ignore');
  args.push(query, '.');
  const { stdout } = await execCommand('rg', args, { cwd: rootPath });
  const matches = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
      if (!match) return null;
      const relativePath = match[1];
      return {
        path: normalize(path.join(rootPath, relativePath)),
        relativePath,
        line: Number.parseInt(match[2], 10),
        column: Number.parseInt(match[3], 10) - 1,
        matchLength: query.length,
        content: match[4],
      };
    })
    .filter(Boolean);
  return {
    matches,
    totalMatches: matches.length,
    totalFiles: new Set(matches.map((item) => item.path)).size,
    truncated: false,
  };
}

async function watchStart(id, dirPath) {
  if (state.watchers.has(id)) {
    return { success: true };
  }
  const watcher = fs.watch(dirPath, { recursive: false }, (_eventType, filename) => {
    if (!filename) return;
    broadcast('file:change', {
      watcherId: id,
      type: 'update',
      path: normalize(path.join(dirPath, filename.toString())),
    });
  });
  state.watchers.set(id, watcher);
  return { success: true };
}

async function watchStop(id) {
  const watcher = state.watchers.get(id);
  if (watcher) {
    watcher.close();
    state.watchers.delete(id);
  }
  return { success: true };
}

function getDaemonInfoPath() {
  return path.join(path.dirname(__filename), DAEMON_INFO_FILE);
}

async function readDaemonInfo() {
  try {
    const raw = await fsp.readFile(getDaemonInfoPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeDaemonInfo(info) {
  const daemonInfoPath = getDaemonInfoPath();
  await fsp.writeFile(daemonInfoPath, JSON.stringify(info), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fsp.chmod(daemonInfoPath, 0o600).catch(() => {});
}

async function removeDaemonInfo() {
  await fsp.rm(getDaemonInfoPath(), { force: true }).catch(() => {});
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadNodePty() {
  if (cachedNodePty !== undefined) {
    return cachedNodePty;
  }

  try {
    cachedNodePty = require('node-pty');
    cachedNodePtyLoadError = null;
  } catch (error) {
    cachedNodePty = null;
    let detail = 'node-pty 未安装或加载失败';
    if (error instanceof Error && error.message) {
      detail = 'node-pty 加载失败: ' + error.message;
    }
    cachedNodePtyLoadError = detail + '，请重新安装 Linux 远端运行时 bundle';
  }

  return cachedNodePty;
}

function getPtyStatus() {
  const nodePty = loadNodePty();
  return {
    supported: nodePty !== null,
    error: nodePty ? null : cachedNodePtyLoadError,
  };
}

function createPtyUnavailableError(reason) {
  const detail = reason || cachedNodePtyLoadError || 'Linux PTY 不可用';
  return new Error(REMOTE_PTY_UNAVAILABLE + ': ' + detail);
}

function getRemoteSettingsFilePath() {
  return path.join(os.homedir(), REMOTE_SETTINGS_PATH);
}

function getRuntimeManifestPath() {
  return path.join(path.dirname(__filename), RUNTIME_MANIFEST_FILENAME);
}

async function readRuntimeManifest() {
  try {
    const content = await fsp.readFile(getRuntimeManifestPath(), 'utf8');
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function sha256File(filePath) {
  const content = await fsp.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function readStoredSettings() {
  try {
    const content = await fsp.readFile(getRemoteSettingsFilePath(), 'utf8');
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function readStoredShellConfig() {
  const settings = await readStoredSettings();
  const ensoSettings =
    settings && typeof settings === 'object' ? settings['enso-settings'] : undefined;
  const state =
    ensoSettings && typeof ensoSettings === 'object' ? ensoSettings.state : undefined;
  const shellConfig = state && typeof state === 'object' ? state.shellConfig : undefined;
  return shellConfig && typeof shellConfig === 'object' ? shellConfig : undefined;
}

function findAvailableShellPath(paths) {
  for (const candidate of paths) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      continue;
    }

    if (candidate.includes('/') || candidate.startsWith('.')) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    return candidate;
  }

  return null;
}

function adjustArgsForShell(shell, args) {
  if (typeof shell !== 'string') {
    return Array.isArray(args) ? [...args] : [];
  }

  const shellName = path.basename(shell).toLowerCase();
  if (shellName === 'sh' || shell.endsWith('/sh')) {
    return (Array.isArray(args) ? args : []).filter((arg) => arg !== '-l');
  }

  return Array.isArray(args) ? [...args] : [];
}

function defaultShellForPlatform() {
  if (process.platform === 'win32') {
    return { shell: 'powershell.exe', args: ['-NoLogo'] };
  }

  const shell = process.env.SHELL || '/bin/sh';
  return {
    shell,
    args: adjustArgsForShell(shell, ['-i', '-l']),
    execArgs: inferExecArgs(shell),
  };
}

function detectUnixShells() {
  const shells = [];
  const systemShell = process.env.SHELL;

  if (systemShell) {
    shells.push({
      id: 'system',
      name: 'System Default (' + (path.basename(systemShell) || 'shell') + ')',
      path: systemShell,
      args: adjustArgsForShell(systemShell, ['-i', '-l']),
      available: fs.existsSync(systemShell),
    });
  }

  for (const definition of UNIX_SHELLS) {
    const availablePath = findAvailableShellPath(definition.paths);
    shells.push({
      id: definition.id,
      name: definition.name,
      path: availablePath || definition.paths[0],
      args: definition.args,
      available: availablePath !== null,
    });
  }

  return shells;
}

function inferExecArgs(shellPath, customArgs) {
  const shellName = path.basename(typeof shellPath === 'string' ? shellPath : '').toLowerCase();

  for (const definition of UNIX_SHELLS) {
    if (definition.paths.some((candidate) => candidate.toLowerCase().includes(shellName))) {
      return [...definition.execArgs];
    }
  }

  if (shellName.includes('bash') || shellName.includes('zsh')) {
    return ['-i', '-l', '-c'];
  }

  if (shellName.includes('fish') || shellName === 'nu' || shellName.includes('nushell')) {
    return ['-l', '-c'];
  }

  if (Array.isArray(customArgs) && customArgs.length > 0) {
    return [...customArgs, '-c'];
  }

  return ['-c'];
}

function resolveShellConfig(config) {
  if (config && config.shellType === 'custom') {
    const customShell = config.customShellPath || defaultShellForPlatform().shell;
    return {
      shell: customShell,
      args: adjustArgsForShell(customShell, config.customShellArgs || []),
      execArgs: inferExecArgs(customShell, config.customShellArgs),
    };
  }

  if (config && config.shellType === 'system') {
    const systemShell = process.env.SHELL;
    if (systemShell && fs.existsSync(systemShell)) {
      return {
        shell: systemShell,
        args: adjustArgsForShell(systemShell, ['-i', '-l']),
        execArgs: inferExecArgs(systemShell),
      };
    }
  }

  if (config) {
    const definition = UNIX_SHELLS.find((item) => item.id === config.shellType);
    if (definition) {
      const availablePath = findAvailableShellPath(definition.paths);
      if (availablePath) {
        return {
          shell: availablePath,
          args: [...definition.args],
          execArgs: [...definition.execArgs],
        };
      }
    }
  }

  return defaultShellForPlatform();
}

function normalizeShellExecutable(shell) {
  if (!shell || typeof shell !== 'string') {
    return undefined;
  }
  return shell;
}

function buildTerminalInitialCommand(initialCommand, shell) {
  return initialCommand + '; exec ' + shellQuote(shell);
}

async function resolveLaunchShell(options) {
  if (options.shell) {
    const explicitShell = normalizeShellExecutable(options.shell);
    return {
      shell: explicitShell || defaultShellForPlatform().shell,
      args: [],
      execArgs: inferExecArgs(explicitShell || defaultShellForPlatform().shell, options.args),
    };
  }

  if (options.shellConfig && process.platform !== 'win32') {
    return resolveShellConfig(options.shellConfig);
  }

  if (process.platform !== 'win32') {
    const storedShellConfig = await readStoredShellConfig();
    if (storedShellConfig) {
      return resolveShellConfig(storedShellConfig);
    }
  }

  return defaultShellForPlatform();
}

async function buildSessionLaunch(options) {
  const resolvedShell = await resolveLaunchShell(options);
  const initialCommand =
    typeof options.initialCommand === 'string' ? options.initialCommand.trim() : '';
  let args = Array.isArray(options.args) ? [...options.args] : [];

  if (options.shell) {
    if (args.length === 0 && initialCommand) {
      args = [...resolvedShell.execArgs, initialCommand];
    }
  } else if (initialCommand) {
    const command =
      options.kind === 'agent'
        ? initialCommand
        : buildTerminalInitialCommand(initialCommand, resolvedShell.shell);
    args = [...resolvedShell.execArgs, command];
  } else {
    args = [...resolvedShell.args];
  }

  return {
    executable: resolvedShell.shell,
    args,
    env: {
      ...process.env,
      ...(options.env || {}),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
    },
  };
}

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
}

async function execInConfiguredShell(command, options = {}) {
  const nodePty = loadNodePty();
  if (!nodePty) {
    throw createPtyUnavailableError();
  }

  const timeout = Number.isFinite(options.timeout) ? options.timeout : 15000;
  const launchShell =
    options.shellConfig && typeof options.shellConfig === 'object'
      ? resolveShellConfig(options.shellConfig)
      : await resolveLaunchShell({});
  const shellArgs = [...launchShell.execArgs, command];

  return await new Promise((resolve, reject) => {
    const pty = nodePty.spawn(launchShell.shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: options.cwd || os.homedir(),
      env: {
        ...process.env,
        ...(options.env || {}),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
      },
    });

    let output = '';
    let exited = false;
    const timer = setTimeout(() => {
      if (exited) {
        return;
      }
      exited = true;
      try {
        pty.kill();
      } catch {}
      const cleaned = stripAnsi(output).trim();
      if (options.killOnTimeout) {
        resolve(cleaned);
        return;
      }
      reject(new Error('Detection timeout'));
    }, timeout);

    pty.onData((chunk) => {
      output += chunk;
    });
    pty.onExit(({ exitCode }) => {
      if (exited) {
        return;
      }
      exited = true;
      clearTimeout(timer);
      const cleaned = stripAnsi(output).trim();
      if (exitCode === 0) {
        resolve(cleaned);
        return;
      }
      const error = new Error(cleaned || ('命令退出，退出码 ' + exitCode));
      error.stdout = cleaned;
      reject(error);
    });
  });
}

async function detectBuiltinAgent(config, customPath) {
  try {
    const effectiveCommand = customPath
      ? shellQuote(customPath) + ' ' + config.versionFlag
      : config.command + ' ' + config.versionFlag;
    const stdout = await execInConfiguredShell(effectiveCommand, { timeout: 15000 });
    const match = config.versionRegex ? stdout.match(config.versionRegex) : null;

    return {
      id: config.id,
      name: config.name,
      command: config.command,
      installed: true,
      version: match ? match[1] : undefined,
      isBuiltin: true,
      environment: 'native',
    };
  } catch (error) {
    return {
      id: config.id,
      name: config.name,
      command: config.command,
      installed: false,
      isBuiltin: true,
      timedOut: error instanceof Error && error.message === 'Detection timeout',
    };
  }
}

async function detectCustomAgent(customAgent) {
  try {
    const stdout = await execInConfiguredShell(customAgent.command + ' --version', {
      timeout: 15000,
    });
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    return {
      id: customAgent.id,
      name: customAgent.name,
      command: customAgent.command,
      installed: true,
      version: match ? match[1] : undefined,
      isBuiltin: false,
      environment: 'native',
    };
  } catch (error) {
    return {
      id: customAgent.id,
      name: customAgent.name,
      command: customAgent.command,
      installed: false,
      isBuiltin: false,
      timedOut: error instanceof Error && error.message === 'Detection timeout',
    };
  }
}

async function detectCliOne({ agentId, customAgent, customPath }) {
  const builtinConfig = BUILTIN_AGENT_CONFIGS.find((item) => item.id === agentId);
  if (builtinConfig) {
    return detectBuiltinAgent(builtinConfig, customPath);
  }

  if (customAgent && typeof customAgent === 'object') {
    return detectCustomAgent(customAgent);
  }

  return {
    id: agentId,
    name: agentId,
    command: agentId,
    installed: false,
    isBuiltin: false,
  };
}

function getCachedStatus(kind, forceRefresh) {
  const currentTime = Date.now();
  if (kind === 'hapi') {
    if (
      !forceRefresh &&
      cachedHapiGlobalStatus &&
      currentTime - cachedHapiGlobalStatusAt < GLOBAL_STATUS_CACHE_TTL
    ) {
      return cachedHapiGlobalStatus;
    }
    return null;
  }

  if (
    !forceRefresh &&
    cachedHappyGlobalStatus &&
    currentTime - cachedHappyGlobalStatusAt < GLOBAL_STATUS_CACHE_TTL
  ) {
    return cachedHappyGlobalStatus;
  }

  return null;
}

function setCachedStatus(kind, value) {
  if (kind === 'hapi') {
    cachedHapiGlobalStatus = value;
    cachedHapiGlobalStatusAt = Date.now();
    return value;
  }

  cachedHappyGlobalStatus = value;
  cachedHappyGlobalStatusAt = Date.now();
  return value;
}

async function checkHapiGlobal({ forceRefresh }) {
  const cached = getCachedStatus('hapi', forceRefresh);
  if (cached) {
    return cached;
  }

  try {
    const stdout = await execInConfiguredShell('hapi --version', { timeout: 30000 });
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    return setCachedStatus('hapi', {
      installed: true,
      version: match ? match[1] : undefined,
    });
  } catch (error) {
    const stdout =
      error && typeof error === 'object' && typeof error.stdout === 'string' ? error.stdout : '';
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    if (match) {
      return setCachedStatus('hapi', {
        installed: true,
        version: match[1],
      });
    }

    return { installed: false };
  }
}

async function checkHappyGlobal({ forceRefresh }) {
  const cached = getCachedStatus('happy', forceRefresh);
  if (cached) {
    return cached;
  }

  try {
    const stdout = await execInConfiguredShell('happy --version', {
      timeout: 10000,
      killOnTimeout: true,
    });
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    if (match || stdout.toLowerCase().includes('happy')) {
      return setCachedStatus('happy', {
        installed: true,
        version: match ? match[1] : undefined,
      });
    }

    return { installed: false };
  } catch {
    return { installed: false };
  }
}

async function checkTmux({ forceRefresh }) {
  const currentTime = Date.now();
  if (
    !forceRefresh &&
    cachedTmuxStatus &&
    currentTime - cachedTmuxStatusAt < GLOBAL_STATUS_CACHE_TTL
  ) {
    return cachedTmuxStatus;
  }

  try {
    const stdout = await execInConfiguredShell('tmux -V', { timeout: 5000 });
    const match = stdout.match(/tmux\s+(\d+\.\d+[a-z]?)/i);
    cachedTmuxStatus = {
      installed: true,
      version: match ? match[1] : undefined,
    };
    cachedTmuxStatusAt = Date.now();
    return cachedTmuxStatus;
  } catch {
    cachedTmuxStatus = { installed: false };
    cachedTmuxStatusAt = Date.now();
    return cachedTmuxStatus;
  }
}

async function killTmuxSession({ name }) {
  try {
    await execInConfiguredShell('tmux -L enso kill-session -t ' + shellQuote(name), {
      timeout: 5000,
    });
  } catch {
    // Session may already be gone.
  }

  return { success: true };
}

function getClaudeDir() {
  return path.join(os.homedir(), '.claude');
}

function getPluginsDir() {
  return path.join(getClaudeDir(), 'plugins');
}

function getClaudeSettingsPath() {
  return path.join(getClaudeDir(), 'settings.json');
}

function getInstalledPluginsPath() {
  return path.join(getPluginsDir(), 'installed_plugins.json');
}

function getKnownMarketplacesPath() {
  return path.join(getPluginsDir(), 'known_marketplaces.json');
}

async function readJsonFile(targetPath, fallback) {
  try {
    const content = await fsp.readFile(targetPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(targetPath, data) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  return true;
}

async function readInstalledPlugins() {
  return readJsonFile(getInstalledPluginsPath(), { version: 2, plugins: {} });
}

async function readClaudeSettings() {
  return readJsonFile(getClaudeSettingsPath(), {});
}

async function writeClaudeSettings(data) {
  return writeJsonFile(getClaudeSettingsPath(), data);
}

async function readKnownMarketplaces() {
  return readJsonFile(getKnownMarketplacesPath(), {});
}

async function listClaudePlugins() {
  const installed = await readInstalledPlugins();
  const settings = await readClaudeSettings();
  const enabledPlugins = settings.enabledPlugins || {};
  const plugins = [];

  for (const [pluginId, installations] of Object.entries(installed.plugins || {})) {
    const installation = Array.isArray(installations) ? installations[0] : null;
    if (!installation) continue;
    const [name, marketplace] = pluginId.split('@');
    plugins.push({
      id: pluginId,
      name: name || pluginId,
      marketplace: marketplace || 'unknown',
      version: installation.version,
      installPath: installation.installPath,
      enabled: enabledPlugins[pluginId] ?? false,
      installedAt: installation.installedAt,
      lastUpdated: installation.lastUpdated,
    });
  }

  return plugins;
}

async function setClaudePluginEnabled(pluginId, enabled) {
  const settings = await readClaudeSettings();
  if (!settings.enabledPlugins || typeof settings.enabledPlugins !== 'object') {
    settings.enabledPlugins = {};
  }
  settings.enabledPlugins[pluginId] = enabled;
  await writeClaudeSettings(settings);
  return true;
}

async function listClaudeMarketplaces() {
  const known = await readKnownMarketplaces();
  return Object.entries(known).map(([name, data]) => ({
    name,
    repo: data.source?.repo,
    installLocation: data.installLocation,
    lastUpdated: data.lastUpdated,
  }));
}

async function listAvailableClaudePlugins(marketplaceName) {
  const marketplaces = await readKnownMarketplaces();
  const installed = await readInstalledPlugins();
  const installedIds = new Set(Object.keys(installed.plugins || {}));
  const plugins = [];
  const entries = marketplaceName
    ? Object.entries(marketplaces).filter(([name]) => name === marketplaceName)
    : Object.entries(marketplaces);

  for (const [mpName, mpData] of entries) {
    const marketplaceJsonPath = path.join(mpData.installLocation, '.claude-plugin', 'marketplace.json');
    if (await pathExists(marketplaceJsonPath)) {
      try {
        const marketplaceJson = await readJsonFile(marketplaceJsonPath, {});
        for (const plugin of marketplaceJson.plugins || []) {
          const pluginId = plugin.name + '@' + mpName;
          plugins.push({
            name: plugin.name,
            description: plugin.description,
            author: plugin.author,
            marketplace: mpName,
            installed: installedIds.has(pluginId),
          });
        }
        continue;
      } catch {}
    }

    const rootPluginJsonPath = path.join(mpData.installLocation, '.claude-plugin', 'plugin.json');
    if (await pathExists(rootPluginJsonPath)) {
      try {
        const pluginJson = await readJsonFile(rootPluginJsonPath, {});
        const pluginId = pluginJson.name + '@' + mpName;
        plugins.push({
          name: pluginJson.name,
          description: pluginJson.description,
          author: pluginJson.author,
          marketplace: mpName,
          installed: installedIds.has(pluginId),
        });
        continue;
      } catch {}
    }

    try {
      const dirs = await fsp.readdir(mpData.installLocation, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
        const pluginJsonPath = path.join(mpData.installLocation, dir.name, 'plugin.json');
        if (!(await pathExists(pluginJsonPath))) continue;
        try {
          const pluginJson = await readJsonFile(pluginJsonPath, {});
          const pluginId = pluginJson.name + '@' + mpName;
          plugins.push({
            name: pluginJson.name,
            description: pluginJson.description,
            author: pluginJson.author,
            marketplace: mpName,
            installed: installedIds.has(pluginId),
          });
        } catch {}
      }
    } catch {}
  }

  return plugins;
}

async function runClaudePluginCommand(command) {
  await execInConfiguredShell(command, { timeout: 30000 });
  return true;
}

async function addClaudeMarketplace(source) {
  return runClaudePluginCommand('claude plugin marketplace add ' + shellQuote(source));
}

async function removeClaudeMarketplace(name) {
  return runClaudePluginCommand('claude plugin marketplace remove ' + shellQuote(name));
}

async function refreshClaudeMarketplaces(name) {
  return runClaudePluginCommand(
    name ? 'claude plugin marketplace update ' + shellQuote(name) : 'claude plugin marketplace update'
  );
}

async function installClaudePlugin(pluginName, marketplace) {
  const pluginSpec = marketplace ? pluginName + '@' + marketplace : pluginName;
  return runClaudePluginCommand('claude plugin install ' + shellQuote(pluginSpec));
}

async function uninstallClaudePlugin(pluginId) {
  return runClaudePluginCommand('claude plugin uninstall ' + shellQuote(pluginId));
}

function createSessionDescriptor(session) {
  return {
    sessionId: session.sessionId,
    backend: 'remote',
    kind: session.kind,
    cwd: session.cwd,
    persistOnDisconnect: session.persistOnDisconnect,
    createdAt: session.createdAt,
    metadata: session.metadata,
  };
}

function appendReplay(session, chunk) {
  session.replay = (session.replay + chunk).slice(-MAX_SESSION_REPLAY_CHARS);
  session.lastDataAt = Date.now();
}

function emitSessionData(session, chunk) {
  if (!chunk) return;
  appendReplay(session, chunk);
  if (session.streamState !== 'live' || session.attachCount <= 0) {
    return;
  }
  broadcast('session:data', {
    sessionId: session.sessionId,
    data: chunk,
  });
}

function removeSession(sessionId) {
  const session = state.sessions.get(sessionId);
  if (!session) return;

  if (session.writable && typeof session.writable.end === 'function') {
    try {
      session.writable.end();
    } catch {}
  }

  state.sessions.delete(sessionId);
}

function emitSessionExit(session, exitCode, signal) {
  const normalizedExitCode = Number.isInteger(exitCode) ? exitCode : 0;
  const normalizedSignal = typeof signal === 'number' ? signal : undefined;
  broadcast('session:exit', {
    sessionId: session.sessionId,
    exitCode: normalizedExitCode,
    signal: normalizedSignal,
  });
}

function finalizeSessionExit(session, exitCode, signal) {
  if (session.exited) {
    return;
  }

  session.exited = true;
  session.handle = null;
  session.writable = null;
  session.pendingExit = {
    sessionId: session.sessionId,
    exitCode: Number.isInteger(exitCode) ? exitCode : 0,
    signal: typeof signal === 'number' ? signal : undefined,
  };

  if (session.streamState === 'live' && session.attachCount > 0) {
    emitSessionExit(session, session.pendingExit.exitCode, session.pendingExit.signal);
    removeSession(session.sessionId);
    return;
  }

  if (session.attachCount <= 0) {
    removeSession(session.sessionId);
  }
}

function activateSessionAfterAttach(sessionId, replayLength) {
  const session = state.sessions.get(sessionId);
  if (!session || session.streamState !== 'attaching') {
    return;
  }

  if (session.attachCount <= 0) {
    session.streamState = 'buffering';
    return;
  }

  session.streamState = 'live';
  const delta = session.replay.slice(replayLength);
  if (delta) {
    broadcast('session:data', {
      sessionId: session.sessionId,
      data: delta,
    });
  }

  if (session.pendingExit) {
    emitSessionExit(session, session.pendingExit.exitCode, session.pendingExit.signal);
    removeSession(session.sessionId);
  }
}

function pauseAttachedSessions() {
  if (state.clients.size > 0) {
    return;
  }

  for (const session of state.sessions.values()) {
    if (session.exited || session.attachCount <= 0) {
      continue;
    }
    session.streamState = 'buffering';
  }
}

function killChildTree(session) {
  if (!session) return;

  if (session.backend === 'pty') {
    try {
      session.handle.kill();
    } catch {}
    return;
  }

  const child = session.handle;
  if (!child || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    const pid = child.pid;
    if (pid) {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      return;
    }
  }

  try {
    if (typeof child.pid === 'number') {
      process.kill(-child.pid, 'SIGTERM');
      return;
    }
  } catch {}

  try {
    child.kill('SIGTERM');
  } catch {}
}

function spawnPipeSession(session, launch, options) {
  const child = spawn(launch.executable, launch.args, {
    cwd: options.cwd,
    env: launch.env,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    emitSessionData(session, chunk.toString());
  });
  child.stderr.on('data', (chunk) => {
    emitSessionData(session, chunk.toString());
  });
  child.on('error', (error) => {
    emitSessionData(session, String(error && error.message ? error.message : error));
    finalizeSessionExit(session, 1);
  });
  child.on('close', (code, signal) => {
    finalizeSessionExit(session, code, signal);
  });

  session.backend = 'pipe';
  session.handle = child;
  session.writable = child.stdin;
}

function spawnPtySession(session, launch, options) {
  const nodePty = loadNodePty();
  if (!nodePty) {
    if (process.platform === 'linux') {
      throw createPtyUnavailableError();
    }
    spawnPipeSession(session, launch, options);
    return;
  }

  const pty = nodePty.spawn(launch.executable, launch.args, {
    name: 'xterm-256color',
    cols: options.cols || 80,
    rows: options.rows || 24,
    cwd: options.cwd,
    env: launch.env,
  });
  pty.onData((chunk) => {
    emitSessionData(session, chunk);
  });
  pty.onExit(({ exitCode, signal }) => {
    finalizeSessionExit(session, exitCode, signal);
  });

  session.backend = 'pty';
  session.handle = pty;
  session.writable = {
    write: (data) => {
      pty.write(data);
    },
    end: () => {
      try {
        pty.kill();
      } catch {}
    },
  };
}

async function createSession(options = {}) {
  if (process.platform === 'linux' && getPtyStatus().supported === false) {
    throw createPtyUnavailableError();
  }

  const session = {
    sessionId: crypto.randomUUID(),
    kind: options.kind === 'agent' ? 'agent' : 'terminal',
    cwd: normalize(options.cwd || os.homedir()),
    persistOnDisconnect: options.persistOnDisconnect !== false,
    metadata: options.metadata,
    createdAt: Date.now(),
    replay: '',
    lastDataAt: 0,
    exited: false,
    attachCount: 0,
    streamState: 'buffering',
    pendingExit: null,
    backend: 'pipe',
    handle: null,
    writable: null,
  };

  const launch = await buildSessionLaunch(options);
  spawnPtySession(session, launch, {
    cwd: session.cwd,
    cols: options.cols,
    rows: options.rows,
  });

  state.sessions.set(session.sessionId, session);
  return {
    session: createSessionDescriptor(session),
  };
}

async function createAndAttachSession(options = {}) {
  const created = await createSession(options);
  const attached = await attachSession(created.session.sessionId);
  return {
    session: attached.session,
    replay: attached.replay,
  };
}

async function attachSession(sessionId) {
  const session = state.sessions.get(sessionId);
  if (!session) {
    throw new Error('远程会话不存在: ' + sessionId);
  }

  const replay = session.replay;
  session.attachCount += 1;
  const result = {
    session: createSessionDescriptor(session),
    replay,
  };

  if (session.streamState === 'buffering') {
    session.streamState = 'attaching';
    result.__postReply = {
      type: 'activate-session',
      sessionId,
      replayLength: replay.length,
    };
  }

  return result;
}

async function resumeSession(sessionId) {
  const session = state.sessions.get(sessionId);
  if (!session) {
    throw new Error('远程会话不存在: ' + sessionId);
  }

  const replay = session.replay;
  const result = {
    session: createSessionDescriptor(session),
    replay,
  };

  if (session.attachCount > 0 && session.streamState === 'buffering') {
    session.streamState = 'attaching';
    result.__postReply = {
      type: 'activate-session',
      sessionId,
      replayLength: replay.length,
    };
  }

  return result;
}

async function detachSession(sessionId) {
  const session = state.sessions.get(sessionId);
  if (!session) {
    return { success: true };
  }

  if (session.attachCount > 0) {
    session.attachCount -= 1;
  }

  if (session.attachCount === 0) {
    session.streamState = 'buffering';
  }

  if (!session.persistOnDisconnect && session.attachCount === 0) {
    killChildTree(session);
  }
  return { success: true };
}

async function killSession(sessionId) {
  const session = state.sessions.get(sessionId);
  if (!session) {
    return { success: true };
  }

  killChildTree(session);
  return { success: true };
}

async function writeSession(sessionId, data) {
  const session = state.sessions.get(sessionId);
  if (!session || !session.writable) {
    throw new Error('远程会话不存在: ' + sessionId);
  }
  session.writable.write(data);
  return { success: true };
}

async function resizeSession(sessionId, cols, rows) {
  const session = state.sessions.get(sessionId);
  if (!session) {
    return { success: true };
  }

  if (session.backend === 'pty' && session.handle && typeof session.handle.resize === 'function') {
    session.handle.resize(cols, rows);
  }
  return { success: true };
}

async function listSessions() {
  return [...state.sessions.values()].map((session) => createSessionDescriptor(session));
}

async function getSessionActivity(sessionId) {
  const session = state.sessions.get(sessionId);
  if (!session) {
    return false;
  }
  return Date.now() - session.lastDataAt < 1000;
}

async function authenticateDaemon(token) {
  const info = await readDaemonInfo();
  if (!info || typeof token !== 'string') {
    return false;
  }

  const provided = Buffer.from(token, 'utf8');
  const expected = Buffer.from(info.token, 'utf8');
  if (provided.length !== AUTH_TOKEN_BYTES || expected.length !== AUTH_TOKEN_BYTES) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

async function pingDaemon() {
  const env = await testEnvironment();
  return {
    ok: true,
    pid: process.pid,
    serverVersion: REMOTE_SERVER_VERSION,
    platform: env.platform,
    arch: process.arch,
    nodeVersion: env.nodeVersion,
    homeDir: env.homeDir,
    gitVersion: env.gitVersion,
    ptySupported: env.ptySupported,
    ptyError: env.ptyError,
  };
}

function createJsonLineDispatcher(stream, onMessage) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        if (stream.writable && !stream.destroyed) {
          sendMessage(stream, {
            type: 'parse-error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }
      onMessage(message);
    }
  });
}

async function dispatchRequest(stream, message, authState) {
  const method = message.method;
  if (method === 'daemon:auth') {
    const ok = await authenticateDaemon(message.params && message.params.token);
    authState.authenticated = ok;
    if (!ok) {
      replyError(stream, message.id, new Error('远程 daemon 鉴权失败'));
      stream.destroy();
      return;
    }
    if (message.params && message.params.subscribe && !authState.subscribed) {
      authState.subscribed = true;
      state.clients.add(stream);
    }
    reply(stream, message.id, { ok: true });
    return;
  }

  if (!authState.authenticated) {
    replyError(stream, message.id, new Error('远程 daemon 尚未鉴权'));
    return;
  }

  const handler = handlers[method];
  if (!handler) {
    replyError(stream, message.id, new Error('不支持的 server 方法: ' + method));
    return;
  }

  Promise.resolve(handler(message.params || {}))
    .then((rawResult) => {
      let result = rawResult;
      let postReply = null;

      if (result && typeof result === 'object' && result.__postReply) {
        postReply = result.__postReply;
        result = { ...result };
        delete result.__postReply;
      }

      reply(stream, message.id, result);

      if (postReply?.type === 'activate-session') {
        setTimeout(() => {
          activateSessionAfterAttach(postReply.sessionId, postReply.replayLength);
        }, 0);
      }
    })
    .catch((error) => replyError(stream, message.id, error));
}

async function requestDaemon(info, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: '127.0.0.1',
      port: info.port,
    });
    let buffer = '';
    let authed = false;
    let finished = false;
    const finish = (callback) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      callback();
    };

    socket.setEncoding('utf8');
    socket.on('connect', () => {
      sendMessage(socket, {
        id: 1,
        method: 'daemon:auth',
        params: { token: info.token, subscribe: true },
      });
    });
    socket.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch (error) {
          finish(() => reject(error));
          return;
        }

        if (!authed) {
          if (message.error) {
            finish(() => reject(new Error(message.error)));
            return;
          }
          authed = true;
          sendMessage(socket, {
            id: 2,
            method,
            params,
          });
          continue;
        }

        if (message.error) {
          finish(() => reject(new Error(message.error)));
          return;
        }

        finish(() => resolve(message.result));
        return;
      }
    });
    socket.on('error', (error) => {
      finish(() => reject(error));
    });
    socket.on('close', () => {
      if (!finished) {
        finished = true;
        reject(new Error('远程 daemon 连接已关闭'));
      }
    });
  });
}

async function ensureDaemon() {
  const existing = await readDaemonInfo();
  if (existing) {
    try {
      await requestDaemon(existing, 'daemon:ping');
      return existing;
    } catch {}
  }

  const child = spawn(process.execPath, [__filename, '--daemon'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await wait(100);
    const info = await readDaemonInfo();
    if (!info) continue;
    try {
      await requestDaemon(info, 'daemon:ping');
      return info;
    } catch {}
  }

  throw new Error('远程 daemon 启动超时');
}

function pipeBidirectional(source, target) {
  source.on('data', (chunk) => {
    if (!target.destroyed) {
      target.write(chunk);
    }
  });
}

async function startBridge() {
  const info = await ensureDaemon();

  await new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: '127.0.0.1',
      port: info.port,
    });
    let buffer = '';
    let authed = false;

    const fail = (error) => {
      if (!socket.destroyed) {
        socket.destroy();
      }
      reject(error);
    };

    socket.setEncoding('utf8');
    socket.on('connect', () => {
      sendMessage(socket, {
        id: 1,
        method: 'daemon:auth',
        params: { token: info.token, subscribe: true },
      });
    });
    socket.on('data', (chunk) => {
      if (authed) {
        process.stdout.write(chunk);
        return;
      }

      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch (error) {
          fail(error);
          return;
        }

        if (message.error) {
          fail(new Error(message.error));
          return;
        }

        authed = true;
        pipeBidirectional(process.stdin, socket);
        if (buffer) {
          process.stdout.write(buffer);
          buffer = '';
        }
        resolve();
      }
    });
    socket.on('error', fail);
    socket.on('close', () => {
      process.exit(0);
    });
  });
}

async function stopDaemon() {
  const info = await readDaemonInfo();
  if (!info) {
    return { success: true };
  }

  try {
    process.kill(info.pid, 'SIGTERM');
  } catch {}
  await removeDaemonInfo();
  return { success: true };
}

async function startDaemon() {
  const token = crypto.randomUUID();
  const server = net.createServer((socket) => {
    const authState = { authenticated: false, subscribed: false };

    createJsonLineDispatcher(socket, (message) => {
      void dispatchRequest(socket, message, authState);
    });

    socket.on('close', () => {
      if (authState.subscribed) {
        state.clients.delete(socket);
        pauseAttachedSessions();
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('远程 daemon 地址无效');
  }

  await writeDaemonInfo({
    host: '127.0.0.1',
    port: address.port,
    pid: process.pid,
    token,
  });

  const cleanup = async () => {
    for (const watcher of state.watchers.values()) {
      watcher.close();
    }
    state.watchers.clear();
    for (const session of state.sessions.values()) {
      killChildTree(session);
    }
    state.sessions.clear();
    for (const client of state.clients) {
      client.destroy();
    }
    state.clients.clear();
    server.close();
    await removeDaemonInfo();
  };

  process.on('SIGTERM', () => {
    void cleanup().finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void cleanup().finally(() => process.exit(0));
  });
}

const handlers = {
  'daemon:ping': () => pingDaemon(),
  'env:test': testEnvironment,
  'fs:list': ({ path }) => listDirectory(path),
  'fs:read': ({ path }) => readFileText(path),
  'fs:write': ({ path, content }) => writeFileText(path, content),
  'fs:createFile': ({ path, content, overwrite }) => createFile(path, content, overwrite),
  'fs:createDirectory': ({ path }) => createDirectory(path),
  'fs:rename': ({ fromPath, toPath }) => renamePath(fromPath, toPath),
  'fs:move': ({ fromPath, toPath }) => movePath(fromPath, toPath),
  'fs:copy': ({ sourcePath, targetPath }) => copyPath(sourcePath, targetPath),
  'fs:stat': ({ path }) => statPath(path),
  'fs:checkConflicts': ({ sources, targetDir }) => checkPathConflicts(sources, targetDir),
  'fs:batchCopy': ({ sources, targetDir, conflicts }) =>
    batchTransferPaths(sources, targetDir, conflicts, 'copy'),
  'fs:batchMove': ({ sources, targetDir, conflicts }) =>
    batchTransferPaths(sources, targetDir, conflicts, 'move'),
  'fs:delete': ({ path, recursive }) => removePath(path, recursive),
  'fs:exists': ({ path }) => pathExists(path),
  'fs:watchStart': ({ id, path }) => watchStart(id, path),
  'fs:watchStop': ({ id }) => watchStop(id),
  'git:status': ({ rootPath }) => gitStatus(rootPath),
  'git:resolveRoot': ({ rootPath }) => gitResolveRoot(rootPath),
  'git:branches': ({ rootPath }) => gitBranches(rootPath),
  'git:branchCreate': ({ rootPath, name, startPoint }) => gitBranchCreate(rootPath, name, startPoint),
  'git:checkout': ({ rootPath, branch }) => gitCheckout(rootPath, branch),
  'git:log': ({ rootPath, maxCount, skip }) => gitLog(rootPath, maxCount, skip),
  'git:diff': ({ rootPath, staged }) => gitDiff(rootPath, staged),
  'git:fileChanges': ({ rootPath }) => gitFileChanges(rootPath),
  'git:fileDiff': ({ rootPath, filePath, staged }) => gitFileDiff(rootPath, filePath, staged),
  'git:commitShow': ({ rootPath, hash }) => gitCommitShow(rootPath, hash),
  'git:commitFiles': ({ rootPath, hash }) => gitCommitFiles(rootPath, hash),
  'git:commitDiff': ({ rootPath, hash, filePath }) => gitCommitDiff(rootPath, hash, filePath),
  'git:diffStats': ({ rootPath }) => gitDiffStats(rootPath),
  'git:stage': ({ rootPath, paths }) => gitStage(rootPath, paths),
  'git:unstage': ({ rootPath, paths }) => gitUnstage(rootPath, paths),
  'git:discard': ({ rootPath, paths }) => gitDiscard(rootPath, paths),
  'git:commit': ({ rootPath, message }) => gitCommit(rootPath, message),
  'git:push': ({ rootPath, remote, branch, setUpstream }) =>
    gitPush(rootPath, remote, branch, setUpstream),
  'git:pull': ({ rootPath, remote, branch }) => gitPull(rootPath, remote, branch),
  'git:fetch': ({ rootPath, remote }) => gitFetch(rootPath, remote),
  'worktree:list': ({ rootPath }) => worktreeList(rootPath),
  'worktree:add': ({ rootPath, options }) => worktreeAdd(rootPath, options),
  'worktree:remove': ({ rootPath, options }) => worktreeRemove(rootPath, options),
  'worktree:merge': ({ rootPath, options }) => worktreeMerge(rootPath, options),
  'worktree:mergeState': ({ rootPath }) => worktreeGetMergeState(rootPath),
  'worktree:conflicts': ({ rootPath }) => worktreeGetConflicts(rootPath),
  'worktree:conflictContent': ({ rootPath, filePath }) =>
    worktreeGetConflictContent(rootPath, filePath),
  'worktree:resolveConflict': ({ rootPath, resolution }) =>
    worktreeResolveConflict(rootPath, resolution),
  'worktree:abortMerge': ({ rootPath }) => worktreeAbortMerge(rootPath),
  'worktree:continueMerge': ({ rootPath, message, cleanupOptions }) =>
    worktreeContinueMerge(rootPath, message, cleanupOptions),
  'search:files': ({ rootPath, query, maxResults }) => searchFiles(rootPath, query, maxResults),
  'search:content': ({
    rootPath,
    query,
    maxResults,
    caseSensitive,
    wholeWord,
    regex,
    filePattern,
    useGitignore,
  }) => searchContent(rootPath, query, maxResults, caseSensitive, wholeWord, regex, filePattern, useGitignore),
  'shell:detect': () => detectUnixShells(),
  'shell:resolveForCommand': ({ config }) => {
    const resolved = resolveShellConfig(config);
    return {
      shell: resolved.shell,
      execArgs: resolved.execArgs,
    };
  },
  'cli:detectOne': (payload) => detectCliOne(payload),
  'hapi:checkGlobal': ({ forceRefresh }) => checkHapiGlobal({ forceRefresh }),
  'happy:checkGlobal': ({ forceRefresh }) => checkHappyGlobal({ forceRefresh }),
  'tmux:check': ({ forceRefresh }) => checkTmux({ forceRefresh }),
  'tmux:killSession': ({ name }) => killTmuxSession({ name }),
  'claude:plugins:list': () => listClaudePlugins(),
  'claude:plugins:setEnabled': ({ pluginId, enabled }) => setClaudePluginEnabled(pluginId, enabled),
  'claude:plugins:available': ({ marketplace }) => listAvailableClaudePlugins(marketplace),
  'claude:plugins:install': ({ pluginName, marketplace }) =>
    installClaudePlugin(pluginName, marketplace),
  'claude:plugins:uninstall': ({ pluginId }) => uninstallClaudePlugin(pluginId),
  'claude:plugins:marketplaces:list': () => listClaudeMarketplaces(),
  'claude:plugins:marketplaces:add': ({ repo }) => addClaudeMarketplace(repo),
  'claude:plugins:marketplaces:remove': ({ name }) => removeClaudeMarketplace(name),
  'claude:plugins:marketplaces:refresh': ({ name }) => refreshClaudeMarketplaces(name),
  'session:create': ({ options }) => createSession(options),
  'session:createAndAttach': ({ options }) => createAndAttachSession(options),
  'session:attach': ({ sessionId }) => attachSession(sessionId),
  'session:resume': ({ sessionId }) => resumeSession(sessionId),
  'session:detach': ({ sessionId }) => detachSession(sessionId),
  'session:kill': ({ sessionId }) => killSession(sessionId),
  'session:write': ({ sessionId, data }) => writeSession(sessionId, data),
  'session:resize': ({ sessionId, cols, rows }) => resizeSession(sessionId, cols, rows),
  'session:list': () => listSessions(),
  'session:getActivity': ({ sessionId }) => getSessionActivity(sessionId),
};

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }

  if (process.argv.includes('--ensure-daemon')) {
    const info = await ensureDaemon();
    process.stdout.write(JSON.stringify(info) + '\n');
    return;
  }

  if (process.argv.includes('--stop-daemon')) {
    await stopDaemon();
    return;
  }

  if (process.argv.includes('--daemon')) {
    await startDaemon();
    return;
  }

  if (process.argv.includes('--bridge')) {
    await startBridge();
    return;
  }

  throw new Error('不支持的远程服务模式');
}

main().catch((error) => {
  exitWithFatalError(error);
});
`;
}

export const getRemoteHelperSource = getRemoteServerSource;
