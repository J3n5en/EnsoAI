import { exec } from 'node:child_process';
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
  PullRequest,
} from '@shared/types';
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';
import { getProxyEnvVars } from '../proxy/ProxyConfig';
import { getEnhancedPath } from '../terminal/PtyManager';

const execAsync = promisify(exec);

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

  async getStatus(): Promise<GitStatus> {
    const status: StatusResult = await this.git.status();
    return {
      isClean: status.isClean(),
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      deleted: status.deleted,
      untracked: status.not_added,
      conflicted: status.conflicted,
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

    return branches;
  }

  async getLog(maxCount = 50, skip = 0): Promise<GitLogEntry[]> {
    const options: string[] = [
      `-n${maxCount}`,
      '--pretty=format:%H%x01%ai%x01%an%x01%ae%x01%s%x01%D',
    ];
    if (skip > 0) {
      options.push(`--skip=${skip}`);
    }

    let result: string;
    try {
      result = await this.git.raw(['log', ...options]);
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

  async push(remote = 'origin', branch?: string): Promise<void> {
    await this.git.push(remote, branch);
  }

  async pull(remote = 'origin', branch?: string): Promise<void> {
    await this.git.pull(remote, branch);
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
    const status: StatusResult = await this.git.status();
    const changes: FileChange[] = [];

    // Directories to ignore (commonly large and should be in .gitignore)
    const ignoredPrefixes = ['node_modules/', '.pnpm/', 'dist/', 'out/', '.next/', 'build/'];
    const skippedDirsSet = new Set<string>();

    const checkIgnored = (filePath: string): boolean => {
      for (const prefix of ignoredPrefixes) {
        if (filePath.startsWith(prefix)) {
          skippedDirsSet.add(prefix.slice(0, -1)); // Remove trailing slash
          return true;
        }
      }
      return false;
    };

    // Build a map of renamed files for quick lookup
    const renamedMap = new Map<string, string>();
    for (const rename of status.renamed) {
      renamedMap.set(rename.to, rename.from);
    }

    // Use status.files for precise file status detection
    // Each file has 'index' (staging area vs HEAD) and 'working_dir' (working tree vs index)
    for (const file of status.files) {
      const filePath = file.path;

      // Skip files in ignored directories (performance optimization)
      if (checkIgnored(filePath)) {
        continue;
      }

      const indexStatus = file.index;
      const workingDirStatus = file.working_dir;

      // Check index status (staged changes) - compare staging area to HEAD
      // Valid index statuses: M (modified), A (added), D (deleted), R (renamed), C (copied), U (conflict)
      if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
        let fileStatus: FileChangeStatus;
        if (indexStatus === 'A') fileStatus = 'A';
        else if (indexStatus === 'D') fileStatus = 'D';
        else if (indexStatus === 'R') fileStatus = 'R';
        else if (indexStatus === 'C') fileStatus = 'C';
        else if (indexStatus === 'U')
          fileStatus = 'X'; // Conflict
        else fileStatus = 'M';

        const change: FileChange = {
          path: filePath,
          status: fileStatus,
          staged: true,
        };
        if (renamedMap.has(filePath)) {
          change.originalPath = renamedMap.get(filePath);
        }
        changes.push(change);
      }

      // Check working_dir status (unstaged changes) - compare working tree to index
      // Valid working_dir statuses: M (modified), D (deleted), ? (untracked), U (conflict)
      if (workingDirStatus && workingDirStatus !== ' ') {
        let fileStatus: FileChangeStatus;
        if (workingDirStatus === '?')
          fileStatus = 'U'; // Untracked
        else if (workingDirStatus === 'D') fileStatus = 'D';
        else if (workingDirStatus === 'U')
          fileStatus = 'X'; // Conflict
        else fileStatus = 'M';

        changes.push({
          path: filePath,
          status: fileStatus,
          staged: false,
        });
      }
    }

    const skippedDirs = skippedDirsSet.size > 0 ? Array.from(skippedDirsSet) : undefined;
    return { changes, skippedDirs };
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

    // Get original content from HEAD (or index for staged)
    if (staged) {
      // For staged: compare HEAD vs index
      original = await this.git.show([`HEAD:${filePath}`]).catch(() => '');
      modified = await this.git.show([`:${filePath}`]).catch(() => '');
    } else {
      // For unstaged: compare index vs working tree
      original = await this.git.show([`:${filePath}`]).catch(() => {
        // If not in index, try HEAD
        return this.git.show([`HEAD:${filePath}`]).catch(() => '');
      });
      modified = await fs.readFile(absolutePath, 'utf-8').catch(() => '');
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

  async getCommitFiles(hash: string): Promise<CommitFileChange[]> {
    // Use cat-file to reliably detect merge commits (check parent count)
    const commitInfo = await this.git.catFile(['-p', hash]);
    const isMergeCommit = (commitInfo.match(/^parent /gm) ?? []).length >= 2;

    const files: CommitFileChange[] = [];

    if (isMergeCommit) {
      // Merge commit: use git diff to compare with first parent
      const mergeDiff = await this.git.diff([`${hash}^1`, hash, '--name-status']);
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
      const commitShow = await this.git.show([hash, '--name-status', '--pretty=format:%P']);
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
    status?: FileChangeStatus
  ): Promise<FileDiff> {
    let originalContent = '';
    let modifiedContent = '';

    // Handle different file statuses
    if (status === 'A') {
      // Added file: original is empty, get from current commit
      modifiedContent = await this.git.show([`${hash}:${filePath}`]).catch(() => '');
      originalContent = '';
    } else if (status === 'D') {
      // Deleted file: modified is empty, get from parent commit
      originalContent = await this.git.show([`${hash}^:${filePath}`]).catch(() => '');
      modifiedContent = '';
    } else {
      // Modified or other: get from both parent and current commit
      const parentHash = `${hash}^`;
      originalContent = await this.git.show([`${parentHash}:${filePath}`]).catch(() => '');
      modifiedContent = await this.git.show([`${hash}:${filePath}`]).catch(() => '');
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
