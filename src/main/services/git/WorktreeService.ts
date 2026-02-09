import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  ConflictResolution,
  GitWorktree,
  MergeConflict,
  MergeConflictContent,
  MergeState,
  StashStatus,
  WorktreeCreateOptions,
  WorktreeMergeCleanupOptions,
  WorktreeMergeOptions,
  WorktreeMergeResult,
  WorktreeRemoveOptions,
} from '@shared/types';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';
import simpleGit, { type SimpleGit } from 'simple-git';
import { getProxyEnvVars } from '../proxy/ProxyConfig';
import { getEnhancedPath } from '../terminal/PtyManager';
import { gitShow } from './encoding';
import { withSafeDirectoryEnv } from './safeDirectory';

const execAsync = promisify(exec);

/**
 * Create a simpleGit instance with enhanced PATH for git-lfs and other tools
 */
function createGit(workdir: string): SimpleGit {
  return simpleGit(workdir).env(
    withSafeDirectoryEnv(
      {
        ...process.env,
        ...getProxyEnvVars(),
        PATH: getEnhancedPath(),
      },
      workdir
    )
  );
}

/**
 * Kill processes that have their working directory under the specified path (Windows only)
 */
async function killProcessesInDirectory(dirPath: string): Promise<void> {
  if (process.platform !== 'win32') return;

  try {
    // Use PowerShell to find and kill node.exe processes with working directory under the path
    const normalizedPath = dirPath.replace(/\//g, '\\');
    const psScript = `
      Get-Process node -ErrorAction SilentlyContinue | Where-Object {
        try {
          $cwd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
          $cwd -like "*${normalizedPath.replace(/\\/g, '\\\\')}*"
        } catch { $false }
      } | Stop-Process -Force -ErrorAction SilentlyContinue
    `;
    await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
  } catch {
    // Ignore errors - process killing is best effort
  }
}

export class WorktreeService {
  private git: SimpleGit;

  constructor(workdir: string) {
    this.git = createGit(workdir);
  }

  /**
   * Safely delete a branch, ignoring errors if branch doesn't exist or is in use
   */
  private async deleteBranchSafely(git: SimpleGit, branchName: string): Promise<string | null> {
    try {
      await git.raw(['branch', '-D', branchName]);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Failed to delete branch '${branchName}': ${msg}`;
    }
  }

  /**
   * Safely delete a worktree and optionally its branch
   */
  private async deleteWorktreeSafely(
    git: SimpleGit,
    worktreePath: string,
    options?: { deleteBranch?: boolean; branchName?: string }
  ): Promise<string[]> {
    const warnings: string[] = [];

    try {
      await git.raw(['worktree', 'prune']);
      await git.raw(['worktree', 'remove', '--force', worktreePath]);

      // Delete branch if requested
      if (options?.deleteBranch && options.branchName) {
        const branchWarning = await this.deleteBranchSafely(git, options.branchName);
        if (branchWarning) {
          warnings.push(branchWarning);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to delete worktree: ${msg}`);

      // Still try to delete the branch if worktree deletion failed
      if (options?.deleteBranch && options.branchName) {
        const branchWarning = await this.deleteBranchSafely(git, options.branchName);
        if (branchWarning) {
          warnings.push(branchWarning);
        }
      }
    }

    return warnings;
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
        current.branch = line.substring(7).replace('refs/heads/', '');
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
    // Check if repository has any commits
    try {
      await this.git.raw(['rev-parse', 'HEAD']);
    } catch {
      throw new Error(
        'Cannot create worktree: repository has no commits. Please create an initial commit first.'
      );
    }

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
    // Prune stale worktree entries first
    await this.prune();

    const args = ['worktree', 'remove'];
    if (options.force) {
      args.push('--force');
    }
    args.push(options.path);

    try {
      await this.git.raw(args);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle "Permission denied" or "not a working tree" errors
      const isPermissionDenied = errorMessage.includes('Permission denied');
      const isNotWorktree = errorMessage.includes('is not a working tree');

      if (isPermissionDenied || isNotWorktree) {
        // Try to clean up the directory manually
        if (existsSync(options.path)) {
          // First attempt: try to kill processes using the directory
          await killProcessesInDirectory(options.path);

          // Wait a bit for processes to terminate
          await new Promise((resolve) => setTimeout(resolve, 500));

          try {
            if (process.platform === 'win32') {
              // Use Windows rmdir which can be more effective for locked files
              await execAsync(`rmdir /s /q "${options.path}"`);
            } else {
              await rm(options.path, { recursive: true, force: true });
            }
          } catch {
            // If manual deletion also fails, throw a more helpful error
            throw new Error(
              `Failed to remove worktree directory: ${options.path}. ` +
                `Please close any programs using this directory and try again.`
            );
          }
        }
        // Prune again to clean up any stale entries
        await this.prune();
      } else {
        throw error;
      }
    }

    // Delete branch if requested
    if (options.deleteBranch && options.branch) {
      try {
        await this.git.raw(['branch', '-D', options.branch]);
      } catch {
        // Ignore branch deletion errors (branch may not exist or be in use)
      }
    }
  }

  async prune(): Promise<void> {
    await this.git.raw(['worktree', 'prune']);
  }

  /**
   * Get the main worktree path
   */
  async getMainWorktreePath(): Promise<string> {
    const worktrees = await this.list();
    const main = worktrees.find((wt) => wt.isMainWorktree);
    if (!main) {
      throw new Error('No main worktree found');
    }
    return main.path;
  }

  /**
   * Get the branch name for a worktree
   */
  async getWorktreeBranch(worktreePath: string): Promise<string> {
    const worktrees = await this.list();
    const worktree = worktrees.find((wt) => wt.path === worktreePath);
    if (!worktree || !worktree.branch) {
      throw new Error(`No branch found for worktree: ${worktreePath}`);
    }
    return worktree.branch;
  }

  /**
   * Merge a worktree's branch into the target branch
   * Executes in the main worktree
   */
  async merge(options: WorktreeMergeOptions): Promise<WorktreeMergeResult> {
    const mainWorktreePath = await this.getMainWorktreePath();
    const mainGit = createGit(mainWorktreePath);

    // Get the source branch from the worktree
    const sourceBranch = await this.getWorktreeBranch(options.worktreePath);

    // Track stash state for both worktrees
    let worktreeStashed = false;
    let mainStashed = false;
    const autoStash = options.autoStash !== false; // Default to true (IDEA-style)

    // Check if worktree has uncommitted changes
    const worktreeGit = createGit(options.worktreePath);

    // Helper function to restore stashes
    // IMPORTANT: Git stash is a shared stack across all worktrees in the same repository.
    // Push order: worktree first, then main (so main is on top of stack)
    // Pop order must be LIFO: main first, then worktree
    // CRITICAL: If main pop fails, we must NOT continue to pop worktree,
    // because the failed stash entry remains at stack top and would be wrongly applied.
    type StashRestoreResult = {
      mainStashStatus: StashStatus;
      worktreeStashStatus: StashStatus;
    };

    const restoreStashes = async (): Promise<StashRestoreResult> => {
      let mainStashStatus: StashStatus = 'none';
      let worktreeStashStatus: StashStatus = 'none';

      // LIFO order: main was pushed last, so pop it first
      if (mainStashed) {
        try {
          await mainGit.stash(['pop']);
          mainStashStatus = 'applied';
        } catch {
          // Pop failed (likely conflict) - stash entry remains at stack top
          mainStashStatus = 'conflict';
          // CRITICAL: Do NOT continue to pop worktree!
          // The failed main stash is still at stash@{0}, popping now would apply
          // main's changes to worktree directory, causing data corruption.
          // Mark worktree as still stashed so user knows to handle it manually.
          if (worktreeStashed) {
            worktreeStashStatus = 'stashed';
          }
          return { mainStashStatus, worktreeStashStatus };
        }
      }

      // Only pop worktree stash if main pop succeeded (or main wasn't stashed)
      if (worktreeStashed) {
        try {
          await worktreeGit.stash(['pop']);
          worktreeStashStatus = 'applied';
        } catch {
          worktreeStashStatus = 'conflict';
        }
      }

      return { mainStashStatus, worktreeStashStatus };
    };

    // Helper to get stash status when changes are still stashed (not yet popped)
    const getStashedStatus = (): StashRestoreResult => ({
      mainStashStatus: mainStashed ? 'stashed' : 'none',
      worktreeStashStatus: worktreeStashed ? 'stashed' : 'none',
    });

    // Helper to get paths for stash status (for UI to show user where to run stash pop)
    const getStashPaths = () => ({
      mainWorktreePath: mainStashed ? mainWorktreePath : undefined,
      worktreePath: worktreeStashed ? options.worktreePath : undefined,
    });

    const worktreeStatus = await worktreeGit.status();
    if (!worktreeStatus.isClean()) {
      if (autoStash) {
        try {
          await worktreeGit.stash(['push', '-m', 'Auto stash before merge']);
          worktreeStashed = true;
        } catch (stashError) {
          return {
            success: false,
            merged: false,
            error: `Failed to stash worktree changes: ${stashError instanceof Error ? stashError.message : String(stashError)}`,
          };
        }
      } else {
        return {
          success: false,
          merged: false,
          error: 'Worktree has uncommitted changes. Please commit or stash them first.',
        };
      }
    }

    // Check if main worktree has uncommitted changes
    const mainStatus = await mainGit.status();
    if (!mainStatus.isClean()) {
      if (autoStash) {
        try {
          await mainGit.stash(['push', '-m', 'Auto stash before merge']);
          mainStashed = true;
        } catch (stashError) {
          // Restore worktree stash if we stashed it (reuse restoreStashes)
          const stashResult = await restoreStashes();
          return {
            success: false,
            merged: false,
            error: `Failed to stash main worktree changes: ${stashError instanceof Error ? stashError.message : String(stashError)}`,
            ...stashResult,
          };
        }
      } else {
        // Restore worktree stash if we stashed it
        const stashResult = await restoreStashes();
        return {
          success: false,
          merged: false,
          error: 'Main worktree has uncommitted changes. Please commit or stash them first.',
          ...stashResult,
        };
      }
    }
    const originalBranch = mainStatus.current;

    try {
      // Checkout target branch in main worktree
      await mainGit.checkout(options.targetBranch);

      // Build merge command
      const mergeArgs: string[] = [];

      if (options.strategy === 'squash') {
        mergeArgs.push('--squash');
      } else if (options.strategy === 'merge') {
        if (options.noFf !== false) {
          mergeArgs.push('--no-ff');
        }
      }

      if (options.message) {
        mergeArgs.push('-m', options.message);
      }

      mergeArgs.push(sourceBranch);

      if (options.strategy === 'rebase') {
        // For rebase strategy, we need different handling
        try {
          await mainGit.rebase([sourceBranch]);
          const log = await mainGit.log({ maxCount: 1 });
          const stashResult = await restoreStashes();
          return {
            success: true,
            merged: true,
            commitHash: log.latest?.hash,
            ...stashResult,
          };
        } catch (rebaseError) {
          // Check for conflicts
          const conflicts = await this.getConflicts(mainWorktreePath);
          if (conflicts.length > 0) {
            // Don't restore stashes when there are conflicts - user needs to resolve first
            // Return 'stashed' status so UI knows changes are safely stashed
            return {
              success: false,
              merged: false,
              conflicts,
              ...getStashedStatus(),
              ...getStashPaths(),
            };
          }
          // Rebase failed without conflicts - abort and return error
          try {
            await mainGit.rebase(['--abort']);
          } catch {
            // Ignore abort errors
          }
          const stashResult = await restoreStashes();
          const errorMessage =
            rebaseError instanceof Error ? rebaseError.message : String(rebaseError);
          return {
            success: false,
            merged: false,
            error: `Rebase failed: ${errorMessage}`,
            ...stashResult,
          };
        }
      }

      // Execute merge
      try {
        await mainGit.merge(mergeArgs);

        // For squash, we need to commit manually
        if (options.strategy === 'squash') {
          const message = options.message || `Squash merge branch '${sourceBranch}'`;
          await mainGit.commit(message);
        }

        const log = await mainGit.log({ maxCount: 1 });

        // Handle post-merge cleanup
        // IMPORTANT: Use mainGit for worktree removal to avoid issues when
        // the current workdir is the worktree being deleted
        let warnings: string[] = [];
        if (options.deleteWorktreeAfterMerge) {
          warnings = await this.deleteWorktreeSafely(mainGit, options.worktreePath, {
            deleteBranch: options.deleteBranchAfterMerge,
            branchName: sourceBranch,
          });
        } else if (options.deleteBranchAfterMerge) {
          const branchWarning = await this.deleteBranchSafely(mainGit, sourceBranch);
          if (branchWarning) {
            warnings.push(branchWarning);
          }
        }

        // Restore stashes after successful merge
        const stashResult = await restoreStashes();

        // Provide specific warnings for each worktree with conflicts
        if (stashResult.mainStashStatus === 'conflict') {
          warnings.push(`Stash pop conflict in main worktree: ${mainWorktreePath}`);
        }
        if (stashResult.worktreeStashStatus === 'conflict') {
          warnings.push(`Stash pop conflict in worktree: ${options.worktreePath}`);
        }
        // If main failed and worktree is still stashed, inform user
        if (
          stashResult.mainStashStatus === 'conflict' &&
          stashResult.worktreeStashStatus === 'stashed'
        ) {
          warnings.push(
            `Worktree stash pending - resolve main conflict first, then run "git stash pop" in: ${options.worktreePath}`
          );
        }

        return {
          success: true,
          merged: true,
          commitHash: log.latest?.hash,
          warnings: warnings.length > 0 ? warnings : undefined,
          ...stashResult,
        };
      } catch (mergeError) {
        // Check for conflicts
        const conflicts = await this.getConflicts(mainWorktreePath);
        if (conflicts.length > 0) {
          // Don't restore stashes when there are conflicts - user needs to resolve first
          // Return 'stashed' status so UI knows changes are safely stashed
          return {
            success: false,
            merged: false,
            conflicts,
            ...getStashedStatus(),
            ...getStashPaths(),
          };
        }
        throw mergeError;
      }
    } catch (error) {
      // Restore original branch if possible
      if (originalBranch) {
        try {
          await mainGit.checkout(originalBranch);
        } catch {
          // Ignore checkout errors during error recovery
        }
      }

      // Restore stashes on error
      const stashResult = await restoreStashes();

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        merged: false,
        error: errorMessage,
        ...stashResult,
      };
    }
  }

  /**
   * Get the current merge state
   */
  async getMergeState(workdir: string): Promise<MergeState> {
    const git = createGit(workdir);

    // Check if we're in a merge state by looking for MERGE_HEAD
    try {
      await git.raw(['rev-parse', 'MERGE_HEAD']);
      // We're in a merge state
      const conflicts = await this.getConflicts(workdir);

      // Get branch names
      let targetBranch: string | undefined;
      let sourceBranch: string | undefined;

      try {
        const status = await git.status();
        targetBranch = status.current || undefined;

        // Try to get source branch from MERGE_HEAD
        const mergeHead = await git.raw(['rev-parse', 'MERGE_HEAD']);
        const branches = await git.branch(['-a', '--contains', mergeHead.trim()]);
        if (branches.all.length > 0) {
          sourceBranch = branches.all[0].replace('remotes/origin/', '');
        }
      } catch {
        // Ignore errors getting branch names
      }

      return {
        inProgress: true,
        targetBranch,
        sourceBranch,
        conflicts,
      };
    } catch {
      // Not in a merge state
      return { inProgress: false };
    }
  }

  /**
   * Get list of conflicted files
   */
  async getConflicts(workdir: string): Promise<MergeConflict[]> {
    const git = createGit(workdir);
    const status = await git.status();

    return status.conflicted.map((file) => ({
      file,
      type: 'content' as const, // Default to content conflict, could be enhanced
    }));
  }

  async getConflictContent(workdir: string, filePath: string): Promise<MergeConflictContent> {
    const [ours, theirs, base] = await Promise.all([
      gitShow(workdir, `:2:${filePath}`),
      gitShow(workdir, `:3:${filePath}`),
      gitShow(workdir, `:1:${filePath}`),
    ]);

    return { file: filePath, ours, theirs, base };
  }

  async resolveConflict(workdir: string, resolution: ConflictResolution): Promise<void> {
    const filePath = join(workdir, resolution.file);

    let encoding = 'utf-8';
    try {
      const buffer = await readFile(filePath);
      const detected = jschardet.detect(buffer);
      if (detected?.encoding) {
        encoding = detected.encoding.toLowerCase();
      }
    } catch {}

    const buffer = iconv.encode(resolution.content, encoding);
    await writeFile(filePath, buffer);

    const git = createGit(workdir);
    await git.add(resolution.file);
  }

  /**
   * Abort the current merge/rebase
   */
  async abortMerge(workdir: string): Promise<void> {
    const git = createGit(workdir);
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');

    // Determine git dir (could be .git file for worktrees)
    const gitDir = join(workdir, '.git');

    // Check for rebase in progress
    const rebaseDir = existsSync(join(gitDir, 'rebase-merge'))
      ? join(gitDir, 'rebase-merge')
      : existsSync(join(gitDir, 'rebase-apply'))
        ? join(gitDir, 'rebase-apply')
        : null;

    if (rebaseDir) {
      await git.rebase(['--abort']);
      return;
    }

    // Check for merge in progress
    const mergeHeadExists = existsSync(join(gitDir, 'MERGE_HEAD'));
    if (mergeHeadExists) {
      await git.merge(['--abort']);
      return;
    }

    // Fallback: reset staged changes (for squash merge conflicts)
    await git.reset(['--hard', 'HEAD']);
  }

  /**
   * Continue merge after resolving all conflicts
   */
  async continueMerge(
    workdir: string,
    message?: string,
    cleanupOptions?: WorktreeMergeCleanupOptions
  ): Promise<WorktreeMergeResult> {
    const git = createGit(workdir);

    // Check if there are still unresolved conflicts
    const conflicts = await this.getConflicts(workdir);
    if (conflicts.length > 0) {
      return {
        success: false,
        merged: false,
        conflicts,
        error: 'There are still unresolved conflicts',
      };
    }

    try {
      // Commit the merge
      const commitMessage = message || 'Merge commit';
      await git.commit(commitMessage);

      const log = await git.log({ maxCount: 1 });

      // Handle post-merge cleanup if options provided
      let warnings: string[] = [];
      if (cleanupOptions?.deleteWorktreeAfterMerge && cleanupOptions.worktreePath) {
        // If current workdir is the worktree being deleted, use main worktree's git instead
        const cleanupGit =
          workdir === cleanupOptions.worktreePath
            ? createGit(await this.getMainWorktreePath())
            : git;
        warnings = await this.deleteWorktreeSafely(cleanupGit, cleanupOptions.worktreePath, {
          deleteBranch: cleanupOptions.deleteBranchAfterMerge,
          branchName: cleanupOptions.sourceBranch,
        });
      } else if (cleanupOptions?.deleteBranchAfterMerge && cleanupOptions.sourceBranch) {
        const branchWarning = await this.deleteBranchSafely(git, cleanupOptions.sourceBranch);
        if (branchWarning) {
          warnings.push(branchWarning);
        }
      }

      return {
        success: true,
        merged: true,
        commitHash: log.latest?.hash,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        merged: false,
        error: errorMessage,
      };
    }
  }
}
