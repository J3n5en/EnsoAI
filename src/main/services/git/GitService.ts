import { exec, spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  CloneProgress,
  CommitFileChange,
  FileChange,
  FileChangeStatus,
  FileChangesResult,
  FileDiff,
  GhCliStatus,
  GitBranch,
  GitLogEntry,
  GitStatus,
  GitSubmodule,
  PullRequest,
  SubmoduleStatus,
} from '@shared/types';
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';
import { getProxyEnvVars } from '../proxy/ProxyConfig';
import { getEnhancedPath } from '../terminal/PtyManager';
import { decodeBuffer, gitShow } from './encoding';

const execAsync = promisify(exec);

const MAX_GIT_STATUS_ENTRIES = 5000;
const MAX_GIT_FILE_CHANGES = 5000;
const GIT_STATUS_STREAM_TIMEOUT_MS = 15000;

type PorcelainBranchInfo = {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
};

type LimitedGitStatus = PorcelainBranchInfo & {
  staged: string[];
  modified: string[];
  deleted: string[];
  untracked: string[];
  conflicted: string[];
  truncated: boolean;
};

export class GitService {
  private git: SimpleGit;
  private workdir: string;

  constructor(workdir: string) {
    this.git = simpleGit(workdir).env({
      ...process.env,
      ...getProxyEnvVars(),
      PATH: getEnhancedPath(),
    });
    this.workdir = workdir;
  }

  private getGitEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...getProxyEnvVars(),
      PATH: getEnhancedPath(),
    };
  }

  private async readPorcelainV2Limited(maxEntries: number): Promise<LimitedGitStatus> {
    const branchInfo: PorcelainBranchInfo = {
      current: null,
      tracking: null,
      ahead: 0,
      behind: 0,
    };

    const staged: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    const untracked: string[] = [];
    const conflicted: string[] = [];

    let entries = 0;
    let truncated = false;
    let remainder = '';
    let stderr = '';
    let pendingRename: { xy: string } | null = null;

    const killIfTruncated = (proc: ReturnType<typeof spawn>) => {
      if (!truncated) return;
      if (!proc.killed) proc.kill('SIGTERM');
    };

    const processRecord = (recordRaw: string, proc: ReturnType<typeof spawn>) => {
      const record = recordRaw.trim();
      if (!record) return;

      if (pendingRename) {
        const p = record;
        const xy = pendingRename.xy;
        pendingRename = null;

        const x = xy[0] ?? '.';
        const y = xy[1] ?? '.';

        if (x !== '.' && x !== '?' && x !== '!') {
          staged.push(p);
        }

        if (y === 'D') {
          deleted.push(p);
        } else if (y !== '.' && y !== '?' && y !== '!' && y !== 'U') {
          modified.push(p);
        }

        if (x === 'U' || y === 'U') {
          conflicted.push(p);
        }

        entries++;
        if (entries >= maxEntries) {
          truncated = true;
          killIfTruncated(proc);
        }
        return;
      }

      if (record.startsWith('# ')) {
        const parts = record.split(' ');
        const key = parts[1];
        if (key === 'branch.head') {
          const head = parts.slice(2).join(' ');
          branchInfo.current = head === '(detached)' ? null : head || null;
        } else if (key === 'branch.upstream') {
          branchInfo.tracking = parts.slice(2).join(' ') || null;
        } else if (key === 'branch.ab') {
          const aheadToken = parts[2] || '+0';
          const behindToken = parts[3] || '-0';
          branchInfo.ahead = Number.parseInt(aheadToken.replace(/^\+/, ''), 10) || 0;
          branchInfo.behind = Number.parseInt(behindToken.replace(/^-/, ''), 10) || 0;
        }
        return;
      }

      if (entries >= maxEntries) {
        truncated = true;
        killIfTruncated(proc);
        return;
      }

      if (record.startsWith('? ')) {
        const p = record.slice(2);
        if (p) untracked.push(p);
        entries++;
        if (entries >= maxEntries) {
          truncated = true;
          killIfTruncated(proc);
        }
        return;
      }

      if (record.startsWith('! ')) {
        return;
      }

      const type = record[0];
      if (type !== '1' && type !== '2' && type !== 'u') {
        return;
      }

      const parts = record.split(' ');
      const xy = parts[1] ?? '..';
      const p = parts[parts.length - 1] ?? '';
      if (!p) return;

      if (type === '2') {
        pendingRename = { xy };
        return;
      }

      const x = xy[0] ?? '.';
      const y = xy[1] ?? '.';

      if (type === 'u' || x === 'U' || y === 'U') {
        conflicted.push(p);
      }

      if (x !== '.' && x !== '?' && x !== '!') {
        staged.push(p);
      }

      if (y === 'D') {
        deleted.push(p);
      } else if (y !== '.' && y !== '?' && y !== '!' && y !== 'U') {
        modified.push(p);
      }

      entries++;
      if (entries >= maxEntries) {
        truncated = true;
        killIfTruncated(proc);
      }
    };

    return new Promise((resolve, reject) => {
      const proc = spawn(
        'git',
        ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'],
        { cwd: this.workdir, env: this.getGitEnv() }
      );

      const timeout = setTimeout(() => {
        truncated = true;
        if (!proc.killed) proc.kill('SIGKILL');
      }, GIT_STATUS_STREAM_TIMEOUT_MS);

      proc.stdout.on('data', (chunk: Buffer) => {
        if (truncated) return;
        remainder += chunk.toString('utf8');
        const records = remainder.split('\0');
        remainder = records.pop() ?? '';
        for (const record of records) {
          processRecord(record, proc);
          if (truncated) break;
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length > 8192) return;
        stderr += chunk.toString('utf8');
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (!truncated && code && code !== 0) {
          reject(new Error(stderr.trim() || `git status failed (${code})`));
          return;
        }
        resolve({
          ...branchInfo,
          staged,
          modified,
          deleted,
          untracked,
          conflicted,
          truncated,
        });
      });
    });
  }

  async getStatus(): Promise<GitStatus> {
    const limited = await this.readPorcelainV2Limited(MAX_GIT_STATUS_ENTRIES);
    const totalListed =
      limited.staged.length +
      limited.modified.length +
      limited.deleted.length +
      limited.untracked.length +
      limited.conflicted.length;

    return {
      isClean: totalListed === 0 && !limited.truncated,
      current: limited.current,
      tracking: limited.tracking,
      ahead: limited.ahead,
      behind: limited.behind,
      staged: limited.staged,
      modified: limited.modified,
      deleted: limited.deleted,
      untracked: limited.untracked,
      conflicted: limited.conflicted,
      truncated: limited.truncated,
      truncatedLimit: limited.truncated ? MAX_GIT_STATUS_ENTRIES : undefined,
    };
  }

  async getBranches(): Promise<GitBranch[]> {
    const result = await this.git.branch(['-a', '-v']);
    const branches = Object.entries(result.branches).map(([name, info]) => ({
      name,
      current: info.current,
      commit: info.commit,
      label: info.label,
    }));

    // Empty repo (no commits yet) - return placeholder for current branch
    if (branches.length === 0) {
      try {
        // Use symbolic-ref to get branch name in empty repo (rev-parse fails without commits)
        const currentBranch = await this.git.raw(['symbolic-ref', '--short', 'HEAD']);
        return [
          {
            name: currentBranch.trim(),
            current: true,
            commit: '',
            label: '(no commits yet)',
          },
        ];
      } catch {
        return [];
      }
    }

    // Determine base branch for merge detection
    let baseBranch: string | null = null;

    // 1. Try to get remote default branch (origin/HEAD)
    try {
      const originHead = await this.git.raw([
        'symbolic-ref',
        '--quiet',
        'refs/remotes/origin/HEAD',
      ]);
      // Example output: "refs/remotes/origin/main"
      const match = originHead.trim().match(/^refs\/remotes\/(.+)$/);
      if (match) {
        baseBranch = match[1]; // "origin/main"
      }
    } catch {
      // origin/HEAD not set, fall through to fallback
    }

    // 2. Fallback to common main branch names
    if (!baseBranch) {
      const localNames = ['main', 'master', 'develop'];
      const found = branches.find((b) => localNames.includes(b.name));
      if (found) {
        baseBranch = found.name;
      }
    }

    // 3. If still no base branch, skip merged detection
    if (!baseBranch) {
      return branches;
    }

    // Get merged PR information from GitHub CLI
    const mergedPRBranches = new Set<string>();
    try {
      const { stdout } = await execAsync(
        'gh pr list --state merged --json headRefName --limit 200',
        {
          cwd: this.workdir,
          env: { ...process.env, ...getProxyEnvVars(), PATH: getEnhancedPath() },
          timeout: 5000,
        }
      );
      const prs = JSON.parse(stdout) as Array<{ headRefName: string }>;
      for (const pr of prs) {
        mergedPRBranches.add(pr.headRefName);
      }
    } catch {
      // gh CLI not available or not authenticated, skip PR detection
    }

    // Mark branches as merged (only via PR detection)
    return branches.map((branch) => {
      const branchNameWithoutRemote = branch.name.replace(/^(remotes\/)?origin\//, '');
      return {
        ...branch,
        merged: mergedPRBranches.has(branchNameWithoutRemote),
      };
    });
  }

  async getLog(maxCount = 50, skip = 0, submodulePath?: string): Promise<GitLogEntry[]> {
    const git = this.getGitInstance(submodulePath);
    const options: string[] = [
      `-n${maxCount}`,
      '--pretty=format:%H%x01%ai%x01%an%x01%ae%x01%s%x01%D',
    ];
    if (skip > 0) {
      options.push(`--skip=${skip}`);
    }

    let result: string;
    try {
      result = await git.raw(['log', ...options]);
    } catch (error) {
      // Empty repo (no commits yet) - return empty array
      if (error instanceof Error && error.message.includes('does not have any commits yet')) {
        return [];
      }
      throw error;
    }
    const entries = result
      .trim()
      .split('\n')
      .filter((line) => line.trim());

    return entries.map((line) => {
      const parts = line.split('\x01');
      const hash = parts[0] || '';
      const date = parts[1] || '';
      const author_name = parts[2] || '';
      const author_email = parts[3] || '';
      const message = parts[4] || '';
      const refs = parts[5] || '';

      return {
        hash,
        date,
        message: message.trim(),
        author_name,
        author_email,
        refs: refs ? refs.replace('HEAD ->', '').trim() || undefined : undefined,
      };
    });
  }

  async commit(message: string, files?: string[]): Promise<string> {
    if (files && files.length > 0) {
      await this.git.add(files);
    }
    const result = await this.git.commit(message);
    return result.commit;
  }

  async push(remote = 'origin', branch?: string, setUpstream = false): Promise<void> {
    const doPush = async () => {
      if (setUpstream && branch) {
        await this.git.push(['-u', remote, branch]);
      } else {
        await this.git.push(remote, branch);
      }
    };
    await this.smartPush(doPush, () => this.smartPull(this.git));
  }

  async pull(remote = 'origin', branch?: string): Promise<void> {
    // 如果指定了 remote/branch，使用原始方式
    if (branch) {
      await this.git.pull(remote, branch);
    } else {
      await this.smartPull(this.git);
    }
  }

  async fetch(remote = 'origin'): Promise<void> {
    await this.git.fetch(remote);
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  async createBranch(name: string, startPoint?: string): Promise<void> {
    await this.git.checkoutBranch(name, startPoint || 'HEAD');
  }

  async getDiff(options?: { staged?: boolean }): Promise<string> {
    if (options?.staged) {
      return this.git.diff(['--staged']);
    }
    return this.git.diff();
  }

  async init(): Promise<void> {
    await this.git.init();
  }

  async getFileChanges(): Promise<FileChangesResult> {
    const ignoredPrefixes = ['node_modules/', '.pnpm/', 'dist/', 'out/', '.next/', 'build/'];
    const skippedDirsSet = new Set<string>();

    const changes: FileChange[] = [];
    let truncated = false;
    let remainder = '';
    let stderr = '';
    let pendingRename: { xy: string; originalPath?: string } | null = null;

    const env = this.getGitEnv();

    const shouldSkip = (p: string) => {
      for (const prefix of ignoredPrefixes) {
        if (p.startsWith(prefix)) {
          skippedDirsSet.add(prefix.slice(0, -1));
          return true;
        }
      }
      return false;
    };

    const pushIndexChange = (statusChar: string, filePath: string, originalPath?: string) => {
      if (changes.length >= MAX_GIT_FILE_CHANGES) {
        truncated = true;
        return;
      }

      let status: FileChangeStatus;
      if (statusChar === 'A') status = 'A';
      else if (statusChar === 'D') status = 'D';
      else if (statusChar === 'R') status = 'R';
      else if (statusChar === 'C') status = 'C';
      else if (statusChar === 'U') status = 'X';
      else status = 'M';

      const change: FileChange = { path: filePath, status, staged: true };
      if (originalPath) change.originalPath = originalPath;
      changes.push(change);
    };

    const pushWorkingChange = (statusChar: string, filePath: string) => {
      if (changes.length >= MAX_GIT_FILE_CHANGES) {
        truncated = true;
        return;
      }

      let status: FileChangeStatus;
      if (statusChar === 'D') status = 'D';
      else if (statusChar === 'U') status = 'X';
      else status = 'M';

      changes.push({ path: filePath, status, staged: false });
    };

    const processRecord = (recordRaw: string, proc: ReturnType<typeof spawn>) => {
      const record = recordRaw.trim();
      if (!record) return;
      if (record.startsWith('# ') || record.startsWith('! ')) return;

      if (pendingRename) {
        const filePath = record;
        const { xy, originalPath } = pendingRename;
        pendingRename = null;

        if (!filePath || shouldSkip(filePath)) return;

        const indexStatus = xy[0] ?? '.';
        const workingDirStatus = xy[1] ?? '.';

        if (indexStatus !== '.' && indexStatus !== '?' && indexStatus !== '!') {
          pushIndexChange(indexStatus, filePath, originalPath);
        }
        if (workingDirStatus !== '.' && workingDirStatus !== ' ') {
          pushWorkingChange(workingDirStatus, filePath);
        }

        if (truncated && !proc.killed) proc.kill('SIGTERM');
        return;
      }

      if (changes.length >= MAX_GIT_FILE_CHANGES) {
        truncated = true;
        if (!proc.killed) proc.kill('SIGTERM');
        return;
      }

      if (record.startsWith('? ')) {
        const p = record.slice(2);
        if (!p || shouldSkip(p)) return;
        changes.push({ path: p, status: 'U', staged: false });
        if (changes.length >= MAX_GIT_FILE_CHANGES) {
          truncated = true;
          if (!proc.killed) proc.kill('SIGTERM');
        }
        return;
      }

      const type = record[0];
      if (type !== '1' && type !== '2' && type !== 'u') return;

      const parts = record.split(' ');
      const xy = parts[1] ?? '..';
      const p = parts[parts.length - 1] ?? '';
      if (!p) return;

      const indexStatus = xy[0] ?? '.';
      const workingDirStatus = xy[1] ?? '.';

      if (type === '2') {
        pendingRename = { xy, originalPath: p };
        return;
      }

      if (shouldSkip(p)) return;

      if (indexStatus !== '.' && indexStatus !== '?' && indexStatus !== '!') {
        pushIndexChange(indexStatus, p);
      }
      if (workingDirStatus !== '.' && workingDirStatus !== ' ') {
        pushWorkingChange(workingDirStatus, p);
      }

      if (truncated && !proc.killed) proc.kill('SIGTERM');
    };

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'git',
        ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'],
        { cwd: this.workdir, env }
      );

      const timeout = setTimeout(() => {
        truncated = true;
        if (!proc.killed) proc.kill('SIGKILL');
      }, GIT_STATUS_STREAM_TIMEOUT_MS);

      proc.stdout.on('data', (chunk: Buffer) => {
        if (truncated) return;
        remainder += chunk.toString('utf8');
        const records = remainder.split('\0');
        remainder = records.pop() ?? '';
        for (const record of records) {
          processRecord(record, proc);
          if (truncated) break;
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length > 8192) return;
        stderr += chunk.toString('utf8');
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (!truncated && code && code !== 0) {
          reject(new Error(stderr.trim() || `git status failed (${code})`));
          return;
        }
        resolve();
      });
    });

    const skippedDirs = skippedDirsSet.size > 0 ? Array.from(skippedDirsSet) : undefined;
    return {
      changes,
      skippedDirs,
      truncated,
      truncatedLimit: truncated ? MAX_GIT_FILE_CHANGES : undefined,
    };
  }

  async getFileDiff(filePath: string, staged: boolean): Promise<FileDiff> {
    // 1. Check for symbolic links first (before resolving path)
    const initialPath = path.join(this.workdir, filePath);
    const stats = await fs.lstat(initialPath).catch(() => null);
    if (stats?.isSymbolicLink()) {
      throw new Error('Cannot read symbolic links');
    }

    // 2. Validate path to prevent path traversal attacks
    const absolutePath = path.resolve(this.workdir, filePath);
    const relativePath = path.relative(this.workdir, absolutePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Invalid file path: path traversal detected');
    }

    let original = '';
    let modified = '';

    if (staged) {
      [original, modified] = await Promise.all([
        gitShow(this.workdir, `HEAD:${filePath}`),
        gitShow(this.workdir, `:${filePath}`),
      ]);
    } else {
      original = await gitShow(this.workdir, `:${filePath}`);
      if (!original) {
        original = await gitShow(this.workdir, `HEAD:${filePath}`);
      }
      modified = await fs
        .readFile(absolutePath)
        .then((buffer) => decodeBuffer(buffer))
        .catch(() => '');
    }

    return { path: filePath, original, modified };
  }

  async stage(paths: string[]): Promise<void> {
    await this.git.add(paths);
  }

  async unstage(paths: string[]): Promise<void> {
    await this.git.raw(['reset', 'HEAD', '--', ...paths]);
  }

  async discard(filePaths: string | string[]): Promise<void> {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const trackedPaths: string[] = [];
    const untrackedPaths: string[] = [];

    const status = await this.git.status();

    for (const filePath of paths) {
      // 1. First check for symbolic links on the original path (before resolving)
      const initialPath = path.join(this.workdir, filePath);
      const initialStats = await fs.lstat(initialPath).catch(() => null);
      if (initialStats?.isSymbolicLink()) {
        throw new Error(`Cannot discard symbolic links: ${filePath}`);
      }

      // 2. Then validate path to prevent path traversal attacks
      const absolutePath = path.resolve(this.workdir, filePath);
      const relativePath = path.relative(this.workdir, absolutePath);

      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Invalid file path: path traversal detected - ${filePath}`);
      }

      // 3. Categorize files
      if (status.not_added.includes(filePath)) {
        untrackedPaths.push(absolutePath);
      } else {
        trackedPaths.push(filePath);
      }
    }

    // Delete untracked files
    for (const absolutePath of untrackedPaths) {
      await fs.unlink(absolutePath);
    }

    // Restore tracked files in one git command
    if (trackedPaths.length > 0) {
      await this.git.checkout(['--', ...trackedPaths]);
    }
  }

  async showCommit(hash: string): Promise<string> {
    return this.git.show([hash, '--pretty=format:%H%n%an%n%ae%n%ad%n%s%n%b', '--stat']);
  }

  async getCommitFiles(hash: string, submodulePath?: string): Promise<CommitFileChange[]> {
    const git = this.getGitInstance(submodulePath);
    // Use cat-file to reliably detect merge commits (check parent count)
    const commitInfo = await git.catFile(['-p', hash]);
    const isMergeCommit = (commitInfo.match(/^parent /gm) ?? []).length >= 2;

    const files: CommitFileChange[] = [];

    if (isMergeCommit) {
      // Merge commit: use git diff to compare with first parent
      const mergeDiff = await git.diff([`${hash}^1`, hash, '--name-status']);
      const diffLines = mergeDiff.split('\n').filter((line) => line.trim());

      for (const line of diffLines) {
        // Match: status (with optional percentage for R/C) and file path(s)
        // Format: R100\told\tnew or M\tfile or A\tfile
        const match = line.match(/^([MADRCUX])(\d+)?\t(.+)$/);
        if (match) {
          const [, status, , filePath] = match;
          // For rename/copy with two paths, take the new path
          const finalPath = filePath.includes('\t') ? filePath.split('\t')[1] : filePath;
          files.push({
            path: finalPath,
            status: status as FileChangeStatus,
          });
        }
      }
    } else {
      // Regular commit: use show --name-status
      const commitShow = await git.show([hash, '--name-status', '--pretty=format:%P']);
      const lines = commitShow.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        // Match: status (with optional percentage for R/C) and file path(s)
        const match = line.match(/^([MADRCUX])(\d+)?\t(.+)$/);
        if (match) {
          const [, status, , filePath] = match;
          // For rename/copy with two paths, take the new path
          const finalPath = filePath.includes('\t') ? filePath.split('\t')[1] : filePath;
          files.push({
            path: finalPath,
            status: status as FileChangeStatus,
          });
        }
      }
    }

    return files;
  }

  async checkIgnored(paths: string[]): Promise<Set<string>> {
    if (paths.length === 0) return new Set();
    try {
      // git check-ignore 返回被忽略的文件列表
      const result = await this.git.checkIgnore(paths);
      return new Set(result);
    } catch {
      // 没有被忽略的文件时会抛出错误（exit code 1）
      return new Set();
    }
  }

  async getCommitDiff(
    hash: string,
    filePath: string,
    status?: FileChangeStatus,
    submodulePath?: string
  ): Promise<FileDiff> {
    const git = this.getGitInstance(submodulePath);
    let originalContent = '';
    let modifiedContent = '';

    // Handle different file statuses
    if (status === 'A') {
      // Added file: original is empty, get from current commit
      modifiedContent = await git.show([`${hash}:${filePath}`]).catch(() => '');
      originalContent = '';
    } else if (status === 'D') {
      // Deleted file: modified is empty, get from parent commit
      originalContent = await git.show([`${hash}^:${filePath}`]).catch(() => '');
      modifiedContent = '';
    } else {
      // Modified or other: get from both parent and current commit
      const parentHash = `${hash}^`;
      originalContent = await git.show([`${parentHash}:${filePath}`]).catch(() => '');
      modifiedContent = await git.show([`${hash}:${filePath}`]).catch(() => '');
    }

    return {
      path: filePath,
      original: originalContent,
      modified: modifiedContent,
    };
  }

  async getDiffStats(): Promise<{ insertions: number; deletions: number }> {
    try {
      // Get stats for both staged and unstaged changes
      const output = await this.git.diff(['--shortstat', 'HEAD']);
      // Output format: " 3 files changed, 10 insertions(+), 5 deletions(-)"
      // or empty if no changes
      if (!output.trim()) {
        return { insertions: 0, deletions: 0 };
      }
      const insertionsMatch = output.match(/(\d+)\s+insertion/);
      const deletionsMatch = output.match(/(\d+)\s+deletion/);
      return {
        insertions: insertionsMatch ? Number.parseInt(insertionsMatch[1], 10) : 0,
        deletions: deletionsMatch ? Number.parseInt(deletionsMatch[1], 10) : 0,
      };
    } catch {
      // Repository might not have HEAD (empty repo) or other issues
      return { insertions: 0, deletions: 0 };
    }
  }

  // GitHub CLI methods
  async getGhCliStatus(): Promise<GhCliStatus> {
    try {
      // Check if gh is installed
      await execAsync('gh --version', {
        cwd: this.workdir,
        env: { ...process.env, PATH: getEnhancedPath() },
      });
    } catch {
      return { installed: false, authenticated: false, error: 'gh CLI not installed' };
    }

    try {
      // Check if gh is authenticated
      await execAsync('gh auth status', {
        cwd: this.workdir,
        env: { ...process.env, ...getProxyEnvVars(), PATH: getEnhancedPath() },
      });
      return { installed: true, authenticated: true };
    } catch {
      return { installed: true, authenticated: false, error: 'gh CLI not authenticated' };
    }
  }

  async listPullRequests(): Promise<PullRequest[]> {
    try {
      const { stdout } = await execAsync(
        'gh pr list --state open --json number,title,headRefName,state,author,updatedAt,isDraft --limit 50',
        {
          cwd: this.workdir,
          env: { ...process.env, ...getProxyEnvVars(), PATH: getEnhancedPath() },
        }
      );

      const prs = JSON.parse(stdout) as Array<{
        number: number;
        title: string;
        headRefName: string;
        state: string;
        author: { login: string };
        updatedAt: string;
        isDraft: boolean;
      }>;

      return prs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        headRefName: pr.headRefName,
        state: pr.state as 'OPEN' | 'CLOSED' | 'MERGED',
        author: pr.author.login,
        updatedAt: pr.updatedAt,
        isDraft: pr.isDraft,
      }));
    } catch (error) {
      throw new Error(
        `Failed to list PRs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async fetchPullRequest(prNumber: number, localBranch: string): Promise<void> {
    try {
      // Fetch PR head to local branch without checking out
      // This creates the branch locally pointing to the PR's head commit
      await this.git.fetch(['origin', `pull/${prNumber}/head:${localBranch}`]);
    } catch (error) {
      throw new Error(
        `Failed to fetch PR #${prNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Submodule methods

  /**
   * List all submodules in the repository
   */
  async listSubmodules(): Promise<GitSubmodule[]> {
    const submodules: GitSubmodule[] = [];

    try {
      // Get submodule status using git submodule status
      const statusOutput = await this.git.raw(['submodule', 'status', '--recursive']);

      if (!statusOutput.trim()) {
        return [];
      }

      // Parse status output
      // Format: [+-U ]<sha1> <path> (<describe>)
      // - = not initialized, + = different commit, U = merge conflict, space = clean
      const lines = statusOutput.trim().split('\n');

      for (const line of lines) {
        const match = line.match(/^([-+U ])?([a-f0-9]+)\s+(\S+)(?:\s+\((.+)\))?$/);
        if (!match) continue;

        const [, statusChar, head, subPath] = match;
        const initialized = statusChar !== '-';

        // Determine status
        let status: SubmoduleStatus;
        if (!initialized) {
          status = 'uninitialized';
        } else if (statusChar === '+') {
          status = 'outdated';
        } else if (statusChar === 'U') {
          status = 'modified';
        } else {
          status = 'clean';
        }

        // Get URL and branch from .gitmodules
        let url = '';
        let branch: string | undefined;

        try {
          url = await this.git.raw(['config', '-f', '.gitmodules', `submodule.${subPath}.url`]);
          url = url.trim();
        } catch {
          // URL not found in .gitmodules
        }

        try {
          branch = await this.git.raw([
            'config',
            '-f',
            '.gitmodules',
            `submodule.${subPath}.branch`,
          ]);
          branch = branch.trim() || undefined;
        } catch {
          // Branch not specified
        }

        submodules.push({
          name: subPath.split('/').pop() || subPath,
          path: subPath,
          url,
          branch,
          head,
          status,
          initialized,
          // 默认值，后续会更新
          tracking: undefined,
          ahead: 0,
          behind: 0,
          hasChanges: false,
          stagedCount: 0,
          unstagedCount: 0,
        });
      }

      // 为已初始化的子模块获取详细状态
      for (const submodule of submodules) {
        if (submodule.initialized) {
          try {
            const subGit = simpleGit(path.join(this.workdir, submodule.path)).env({
              ...process.env,
              ...getProxyEnvVars(),
              PATH: getEnhancedPath(),
            });
            const subStatus = await subGit.status();
            submodule.branch = subStatus.current || undefined;
            submodule.tracking = subStatus.tracking || undefined;
            submodule.ahead = subStatus.ahead;
            submodule.behind = subStatus.behind;
            submodule.hasChanges = !subStatus.isClean();
            submodule.stagedCount = subStatus.staged.length;
            submodule.unstagedCount =
              subStatus.modified.length + subStatus.deleted.length + subStatus.not_added.length;
          } catch (error) {
            console.debug(`Failed to get status for submodule ${submodule.path}:`, error);
            // 子模块状态获取失败，保持默认值
          }
        }
      }
    } catch (error) {
      // No submodules or error reading them
      console.debug('Failed to list submodules:', error);
    }

    return submodules;
  }

  /**
   * Initialize submodules
   */
  async initSubmodules(recursive = true): Promise<void> {
    await this.git.submoduleInit();
    if (recursive) {
      await this.git.submoduleUpdate(['--init', '--recursive']);
    }
  }

  /**
   * Update submodules to the commit recorded in the superproject
   */
  async updateSubmodules(recursive = true): Promise<void> {
    const args = recursive ? ['--recursive'] : [];
    await this.git.submoduleUpdate(args);
  }

  /**
   * Sync submodule URLs from .gitmodules to .git/config
   */
  async syncSubmodules(): Promise<void> {
    await this.git.raw(['submodule', 'sync', '--recursive']);
  }

  /**
   * Get Git instance for main repo or submodule
   * @param submodulePath Optional submodule path
   * @returns SimpleGit instance
   */
  private getGitInstance(submodulePath?: string): SimpleGit {
    return submodulePath ? this.getSubmoduleGit(submodulePath) : this.git;
  }

  /**
   * Get Git instance for a submodule
   */
  private getSubmoduleGit(submodulePath: string): SimpleGit {
    // Validate path to prevent path traversal attacks
    const absolutePath = path.resolve(this.workdir, submodulePath);
    const relativePath = path.relative(this.workdir, absolutePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Invalid submodule path: path traversal detected');
    }

    return simpleGit(absolutePath).env({
      ...process.env,
      ...getProxyEnvVars(),
      PATH: getEnhancedPath(),
    });
  }

  /**
   * 智能 Pull（公共逻辑）
   * 1. 先尝试 fast-forward only
   * 2. 失败则尝试 rebase
   * 3. 冲突则 abort 并抛出错误
   */
  private async smartPull(git: SimpleGit): Promise<void> {
    try {
      await git.pull(['--ff-only']);
    } catch {
      try {
        await git.pull(['--rebase']);
      } catch (rebaseError) {
        try {
          await git.rebase(['--abort']);
        } catch {
          // ignore abort error
        }
        throw rebaseError;
      }
    }
  }

  /**
   * 智能 Push（公共逻辑）
   * 如果 non-fast-forward，自动先 pull 再重试
   */
  private async smartPush(
    pushFn: () => Promise<unknown>,
    pullFn: () => Promise<void>
  ): Promise<void> {
    try {
      await pushFn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('non-fast-forward') || msg.includes('rejected')) {
        await pullFn();
        await pushFn();
      } else {
        throw error;
      }
    }
  }

  /**
   * Fetch 单个子模块
   */
  async fetchSubmodule(submodulePath: string): Promise<void> {
    const subGit = this.getSubmoduleGit(submodulePath);
    await subGit.fetch();
  }

  /**
   * Pull 单个子模块
   */
  async pullSubmodule(submodulePath: string): Promise<void> {
    const subGit = this.getSubmoduleGit(submodulePath);
    await this.smartPull(subGit);
  }

  /**
   * Push 单个子模块
   */
  async pushSubmodule(submodulePath: string): Promise<void> {
    const subGit = this.getSubmoduleGit(submodulePath);
    await this.smartPush(
      () => subGit.push(),
      () => this.smartPull(subGit)
    );
  }

  /**
   * Commit changes in a submodule
   */
  async commitSubmodule(submodulePath: string, message: string): Promise<string> {
    const subGit = this.getSubmoduleGit(submodulePath);
    const result = await subGit.commit(message);
    return result.commit;
  }

  /**
   * 暂存子模块文件
   */
  async stageSubmodule(submodulePath: string, paths: string[]): Promise<void> {
    const subGit = this.getSubmoduleGit(submodulePath);
    await subGit.add(paths);
  }

  /**
   * 取消暂存子模块文件
   */
  async unstageSubmodule(submodulePath: string, paths: string[]): Promise<void> {
    const subGit = this.getSubmoduleGit(submodulePath);
    await subGit.reset(['HEAD', '--', ...paths]);
  }

  /**
   * 丢弃子模块文件变更
   */
  async discardSubmodule(submodulePath: string, paths: string[]): Promise<void> {
    const subGit = this.getSubmoduleGit(submodulePath);
    const submoduleDir = path.join(this.workdir, submodulePath);
    const status = await subGit.status();

    const trackedPaths: string[] = [];
    const untrackedPaths: string[] = [];

    for (const filePath of paths) {
      // 检查符号链接
      const initialPath = path.join(submoduleDir, filePath);
      const initialStats = await fs.lstat(initialPath).catch(() => null);
      if (initialStats?.isSymbolicLink()) {
        throw new Error(`Cannot discard symbolic links: ${filePath}`);
      }

      if (status.not_added.includes(filePath)) {
        untrackedPaths.push(initialPath);
      } else {
        trackedPaths.push(filePath);
      }
    }

    // 删除 untracked 文件/目录
    for (const absolutePath of untrackedPaths) {
      const stat = await fs.stat(absolutePath).catch(() => null);
      if (stat?.isDirectory()) {
        await fs.rm(absolutePath, { recursive: true });
      } else {
        await fs.unlink(absolutePath);
      }
    }

    // 恢复 tracked 文件
    if (trackedPaths.length > 0) {
      await subGit.checkout(['--', ...trackedPaths]);
    }
  }

  /**
   * 从 git status 结果解析文件变更列表（共用逻辑）
   */
  private parseStatusToChanges(status: StatusResult): FileChange[] {
    const changes: FileChange[] = [];

    // Build a map of renamed files for quick lookup
    const renamedMap = new Map<string, string>();
    for (const rename of status.renamed) {
      renamedMap.set(rename.to, rename.from);
    }

    // Use status.files for precise file status detection
    for (const file of status.files) {
      const filePath = file.path;
      const indexStatus = file.index;
      const workingDirStatus = file.working_dir;

      // Check index status (staged changes)
      if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
        let fileStatus: FileChangeStatus;
        if (indexStatus === 'A') fileStatus = 'A';
        else if (indexStatus === 'D') fileStatus = 'D';
        else if (indexStatus === 'R') fileStatus = 'R';
        else if (indexStatus === 'C') fileStatus = 'C';
        else if (indexStatus === 'U') fileStatus = 'X';
        else fileStatus = 'M';

        const change: FileChange = { path: filePath, status: fileStatus, staged: true };
        if (renamedMap.has(filePath)) {
          change.originalPath = renamedMap.get(filePath);
        }
        changes.push(change);
      }

      // Check working_dir status (unstaged changes)
      if (workingDirStatus && workingDirStatus !== ' ') {
        let fileStatus: FileChangeStatus;
        if (workingDirStatus === '?') fileStatus = 'U';
        else if (workingDirStatus === 'D') fileStatus = 'D';
        else if (workingDirStatus === 'U') fileStatus = 'X';
        else fileStatus = 'M';

        changes.push({ path: filePath, status: fileStatus, staged: false });
      }
    }

    return changes;
  }

  /**
   * Get file changes list for a submodule
   */
  async getSubmoduleChanges(submodulePath: string): Promise<FileChange[]> {
    const subGit = this.getSubmoduleGit(submodulePath);
    const status = await subGit.status();
    return this.parseStatusToChanges(status);
  }

  /**
   * Get file diff for a submodule
   */
  async getSubmoduleFileDiff(
    submodulePath: string,
    filePath: string,
    staged: boolean
  ): Promise<FileDiff> {
    // Validate submodule path
    const fullSubPath = path.resolve(this.workdir, submodulePath);
    const relativeSubPath = path.relative(this.workdir, fullSubPath);
    if (relativeSubPath.startsWith('..') || path.isAbsolute(relativeSubPath)) {
      throw new Error('Invalid submodule path: path traversal detected');
    }

    // Validate file path within submodule
    const fullFilePath = path.resolve(fullSubPath, filePath);
    const relativeFilePath = path.relative(fullSubPath, fullFilePath);
    if (relativeFilePath.startsWith('..') || path.isAbsolute(relativeFilePath)) {
      throw new Error('Invalid file path: path traversal detected');
    }

    let original = '';
    let modified = '';

    try {
      // 获取 HEAD 版本
      original = await gitShow(fullSubPath, `HEAD:${filePath}`);
    } catch {
      // 新文件，没有 HEAD 版本
    }

    try {
      if (staged) {
        // 暂存区版本
        modified = await gitShow(fullSubPath, `:${filePath}`);
      } else {
        // 工作区版本
        modified = await fs.readFile(fullFilePath).then((buffer) => decodeBuffer(buffer));
      }
    } catch {
      // 删除的文件
    }

    return { path: filePath, original, modified };
  }

  /**
   * Get branch list for a submodule
   */
  async getSubmoduleBranches(submodulePath: string): Promise<GitBranch[]> {
    const subGit = this.getSubmoduleGit(submodulePath);
    const result = await subGit.branch(['-a', '-v']);
    return Object.entries(result.branches).map(([name, info]) => ({
      name,
      current: info.current,
      commit: info.commit,
      label: info.label,
    }));
  }

  /**
   * 切换子模块分支
   */
  async checkoutSubmoduleBranch(submodulePath: string, branch: string): Promise<void> {
    const subGit = this.getSubmoduleGit(submodulePath);
    await subGit.checkout(branch);
  }

  // Static methods for clone operations

  /**
   * Validate if a URL is a valid Git URL (HTTPS or SSH)
   * Supports:
   * - HTTPS with optional port, username, and multi-level paths
   * - SSH with optional port and multi-level paths
   */
  static isValidGitUrl(url: string): boolean {
    // HTTPS: supports port, username, multi-level paths
    // e.g., https://github.com/user/repo.git
    //       https://git.example.com:8443/user/repo
    //       https://user@github.com/user/repo.git
    //       https://gitlab.com/group/subgroup/repo
    const httpsPattern = /^https?:\/\/(?:[\w-]+@)?[\w.-]+(?::\d+)?(?:\/[\w.-]+)+(?:\.git)?$/;
    // SSH: supports port, multi-level paths
    // e.g., git@github.com:user/repo.git
    //       ssh://git@github.com:22/user/repo.git
    //       git@gitlab.com:group/subgroup/repo.git
    const sshPattern =
      /^(?:ssh:\/\/)?(?:[\w-]+@)?[\w.-]+(?::\d+)?[:/](?:[\w.-]+\/)+[\w.-]+(?:\.git)?$/;

    return httpsPattern.test(url) || sshPattern.test(url);
  }

  /**
   * Extract repository name from Git URL
   */
  static extractRepoName(url: string): string {
    // Remove .git suffix and extract last path segment
    const cleaned = url.replace(/\.git$/, '');
    // Handle both SSH (git@...:user/repo) and HTTPS (https://.../user/repo)
    const parts = cleaned.split(/[/:]/).filter(Boolean);
    return parts[parts.length - 1] || 'repository';
  }

  /**
   * Clone a remote repository to local path
   */
  static async clone(
    remoteUrl: string,
    targetPath: string,
    onProgress?: (progress: CloneProgress) => void
  ): Promise<void> {
    // Validate URL format
    if (!GitService.isValidGitUrl(remoteUrl)) {
      throw new Error('Invalid Git URL format');
    }

    // Check if target directory already exists
    if (existsSync(targetPath)) {
      throw new Error('Target directory already exists');
    }

    // Create simple-git instance with progress callback
    const git = simpleGit({
      progress: ({ method, stage, progress }) => {
        if (method === 'clone' && onProgress) {
          onProgress({ stage, progress });
        }
      },
    }).env({
      ...process.env,
      ...getProxyEnvVars(),
      PATH: getEnhancedPath(),
    });

    // Execute clone with progress flag
    await git.clone(remoteUrl, targetPath, ['--progress']);
  }
}
