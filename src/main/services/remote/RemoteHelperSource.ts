export const REMOTE_HELPER_VERSION = '0.1.0';

export function getRemoteHelperSource(): string {
  return String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const state = {
  watchers: new Map(),
};

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function reply(id, result) {
  send({ type: 'response', id, result });
}

function replyError(id, error) {
  send({
    type: 'response',
    id,
    error: error instanceof Error ? error.message : String(error),
  });
}

function normalize(p) {
  if (typeof p !== 'string' || p.length === 0) return '';
  const replaced = p.replace(/\\\\/g, '/').replace(/\/+$/g, '');
  if (/^[A-Za-z]:$/.test(replaced)) {
    return replaced + '/';
  }
  return replaced || '/';
}

function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || \`\${command} 已退出，退出码 \${code}\`));
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
  await fsp.rename(fromPath, toPath);
  return { success: true };
}

async function removePath(targetPath, recursive = true) {
  await fsp.rm(targetPath, { recursive, force: false });
  return { success: true };
}

async function fileExists(filePath) {
  try {
    const stats = await fsp.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function testEnvironment() {
  const git = await execCommand('git', ['--version']);
  const nodeVersion = process.version;
  return {
    platform: process.platform,
    homeDir: normalize(os.homedir()),
    nodeVersion,
    gitVersion: git.stdout.trim(),
  };
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

async function gitStatus(rootPath) {
  const { stdout } = await execCommand('git', ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'], { cwd: rootPath });
  return parsePorcelainStatus(stdout);
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
  const args = ['log', \`-n\${maxCount}\`, '--pretty=format:%H%x01%ai%x01%an%x01%ae%x01%s%x01%D'];
  if (skip > 0) {
    args.push(\`--skip=\${skip}\`);
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
  await execCommand('git', ['add', ...paths], { cwd: rootPath });
  return { success: true };
}

async function gitUnstage(rootPath, paths) {
  await execCommand('git', ['restore', '--staged', ...paths], { cwd: rootPath });
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

async function gitFileDiff(rootPath, filePath, staged) {
  const args = staged ? ['show', \`HEAD:\${filePath}\`] : ['show', \`HEAD:\${filePath}\`];
  let original = '';
  try {
    const result = await execCommand('git', args, { cwd: rootPath });
    original = result.stdout;
  } catch {
    original = '';
  }
  const modified = await fsp.readFile(path.join(rootPath, filePath), 'utf8').catch(() => '');
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
    send({
      type: 'event',
      event: 'file:change',
      payload: {
        watcherId: id,
        type: 'update',
        path: normalize(path.join(dirPath, filename.toString())),
      },
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

const handlers = {
  'env:test': testEnvironment,
  'fs:list': ({ path }) => listDirectory(path),
  'fs:read': ({ path }) => readFileText(path),
  'fs:write': ({ path, content }) => writeFileText(path, content),
  'fs:createFile': ({ path, content, overwrite }) => createFile(path, content, overwrite),
  'fs:createDirectory': ({ path }) => createDirectory(path),
  'fs:rename': ({ fromPath, toPath }) => renamePath(fromPath, toPath),
  'fs:move': ({ fromPath, toPath }) => renamePath(fromPath, toPath),
  'fs:delete': ({ path, recursive }) => removePath(path, recursive),
  'fs:exists': ({ path }) => fileExists(path),
  'fs:watchStart': ({ id, path }) => watchStart(id, path),
  'fs:watchStop': ({ id }) => watchStop(id),
  'git:status': ({ rootPath }) => gitStatus(rootPath),
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
};

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      send({ type: 'parse-error', error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const handler = handlers[message.method];
    if (!handler) {
      replyError(message.id, new Error('不支持的 helper 方法: ' + message.method));
      continue;
    }
    Promise.resolve(handler(message.params || {}))
      .then((result) => reply(message.id, result))
      .catch((error) => replyError(message.id, error));
  }
});

process.stdin.on('end', () => {
  for (const watcher of state.watchers.values()) {
    watcher.close();
  }
  state.watchers.clear();
});
`;
}
