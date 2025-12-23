import type { GitWorktree, WorktreeCreateOptions, WorktreeRemoveOptions } from '@shared/types';
import simpleGit, { type SimpleGit } from 'simple-git';

export class WorktreeService {
  private git: SimpleGit;

  constructor(workdir: string) {
    this.git = simpleGit(workdir);
  }

  async list(): Promise<GitWorktree[]> {
    const result = await this.git.raw(['worktree', 'list', '--porcelain']);
    const worktrees: GitWorktree[] = [];
    let current: Partial<GitWorktree> = {};

    for (const line of result.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current as GitWorktree);
        }
        current = {
          path: line.substring(9),
          isMainWorktree: false,
          isLocked: false,
          prunable: false,
        };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7);
      } else if (line === 'bare') {
        current.isMainWorktree = true;
      } else if (line === 'locked') {
        current.isLocked = true;
      } else if (line === 'prunable') {
        current.prunable = true;
      }
    }

    if (current.path) {
      worktrees.push(current as GitWorktree);
    }

    // Mark first worktree as main
    if (worktrees.length > 0) {
      worktrees[0].isMainWorktree = true;
    }

    return worktrees;
  }

  async add(options: WorktreeCreateOptions): Promise<void> {
    const args = ['worktree', 'add'];

    if (options.newBranch) {
      args.push('-b', options.newBranch);
    }

    args.push(options.path);

    if (options.branch) {
      args.push(options.branch);
    }

    await this.git.raw(args);
  }

  async remove(options: WorktreeRemoveOptions): Promise<void> {
    const args = ['worktree', 'remove'];

    if (options.force) {
      args.push('--force');
    }

    args.push(options.path);
    await this.git.raw(args);
  }

  async prune(): Promise<void> {
    await this.git.raw(['worktree', 'prune']);
  }
}
