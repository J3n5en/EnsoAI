import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CommitFileChange,
  FileChange,
  FileChangeStatus,
  FileDiff,
  GitBranch,
  GitLogEntry,
  GitStatus,
} from '@shared/types';
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';

export class GitService {
  private git: SimpleGit;
  private workdir: string;

  constructor(workdir: string) {
    this.git = simpleGit(workdir);
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
    return Object.entries(result.branches).map(([name, info]) => ({
      name,
      current: info.current,
      commit: info.commit,
      label: info.label,
    }));
  }

  async getLog(maxCount = 50, skip = 0): Promise<GitLogEntry[]> {
    const options: string[] = [`--max-count=${maxCount}`];
    if (skip > 0) {
      options.push(`--skip=${skip}`);
    }
    const log = await this.git.log(options);
    return log.all.map((entry) => ({
      hash: entry.hash,
      date: entry.date,
      message: entry.message,
      author_name: entry.author_name,
      author_email: entry.author_email,
      refs: entry.refs,
    }));
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

  async getFileChanges(): Promise<FileChange[]> {
    const status: StatusResult = await this.git.status();
    const changes: FileChange[] = [];

    // Build a map of renamed files for quick lookup
    const renamedMap = new Map<string, string>();
    for (const rename of status.renamed) {
      renamedMap.set(rename.to, rename.from);
    }

    // Helper to determine status for staged files
    const getStagedStatus = (file: string): FileChangeStatus => {
      if (status.created.includes(file)) return 'A';
      if (renamedMap.has(file)) return 'R';
      if (status.conflicted.includes(file)) return 'X';
      // For staged files, check if the file exists in the files array with deleted status
      // simple-git marks staged deletions in the 'staged' array
      return 'M';
    };

    // Staged files
    for (const file of status.staged) {
      const change: FileChange = {
        path: file,
        status: getStagedStatus(file),
        staged: true,
      };
      // Add originalPath for renamed files
      if (renamedMap.has(file)) {
        change.originalPath = renamedMap.get(file);
      }
      changes.push(change);
    }

    // Unstaged modified files (include even if staged - partial staging case)
    for (const file of status.modified) {
      changes.push({ path: file, status: 'M', staged: false });
    }

    // Unstaged deleted files (include even if staged - partial staging case)
    for (const file of status.deleted) {
      changes.push({ path: file, status: 'D', staged: false });
    }

    // Untracked files
    for (const file of status.not_added) {
      changes.push({ path: file, status: 'U', staged: false });
    }

    // Conflicted files (add if not already present)
    for (const file of status.conflicted) {
      if (!changes.some((c) => c.path === file)) {
        changes.push({ path: file, status: 'X', staged: false });
      }
    }

    return changes;
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

  async discard(filePath: string): Promise<void> {
    // 1. First check for symbolic links on the original path (before resolving)
    const initialPath = path.join(this.workdir, filePath);
    const initialStats = await fs.lstat(initialPath).catch(() => null);
    if (initialStats?.isSymbolicLink()) {
      throw new Error('Cannot discard symbolic links');
    }

    // 2. Then validate path to prevent path traversal attacks
    const absolutePath = path.resolve(this.workdir, filePath);
    const relativePath = path.relative(this.workdir, absolutePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Invalid file path: path traversal detected');
    }

    // 3. Check if file is untracked and perform discard
    const status = await this.git.status();
    if (status.not_added.includes(filePath)) {
      // Delete untracked file
      await fs.unlink(absolutePath);
    } else {
      // Restore tracked file
      await this.git.checkout(['--', filePath]);
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
}
