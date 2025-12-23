import type { GitBranch, GitLogEntry, GitStatus } from '@shared/types';
import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';

export class GitService {
  private git: SimpleGit;

  constructor(workdir: string) {
    this.git = simpleGit(workdir);
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

  async getLog(maxCount = 50): Promise<GitLogEntry[]> {
    const log = await this.git.log({ maxCount });
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
}
