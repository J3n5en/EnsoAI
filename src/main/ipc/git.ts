import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { type FileChangeStatus, IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import {
  type AIProvider,
  generateBranchName,
  generateCommitMessage,
  type ModelId,
  type ReasoningEffort,
  startCodeReview as startCodeReviewService,
  stopCodeReview as stopCodeReviewService,
} from '../services/ai';
import { GitService } from '../services/git/GitService';

const gitServices = new Map<string, GitService>();

// Authorized workdirs (registered when worktrees are loaded)
const authorizedWorkdirs = new Set<string>();

export function registerAuthorizedWorkdir(workdir: string): void {
  authorizedWorkdirs.add(path.resolve(workdir));
}

export function unregisterAuthorizedWorkdir(workdir: string): void {
  const resolved = path.resolve(workdir);
  authorizedWorkdirs.delete(resolved);
  gitServices.delete(resolved);
}

export function clearAllGitServices(): void {
  gitServices.clear();
  authorizedWorkdirs.clear();
}

function validateWorkdir(workdir: string): string {
  const resolved = path.resolve(workdir);

  // Check if workdir is authorized
  if (!authorizedWorkdirs.has(resolved)) {
    // Fallback: check if it's a valid git directory
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error('Invalid workdir: path does not exist or is not a directory');
    }
    // Check for .git folder
    const gitDir = path.join(resolved, '.git');
    if (!existsSync(gitDir)) {
      throw new Error('Invalid workdir: not a git repository');
    }
  }

  return resolved;
}

function getGitService(workdir: string): GitService {
  const resolved = validateWorkdir(workdir);
  if (!gitServices.has(resolved)) {
    gitServices.set(resolved, new GitService(resolved));
  }
  return gitServices.get(resolved)!;
}

export function registerGitHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getStatus();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_LOG,
    async (_, workdir: string, maxCount?: number, skip?: number) => {
      const git = getGitService(workdir);
      return git.getLog(maxCount, skip);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_LIST, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getBranches();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_BRANCH_CREATE,
    async (_, workdir: string, name: string, startPoint?: string) => {
      const git = getGitService(workdir);
      await git.createBranch(name, startPoint);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_CHECKOUT, async (_, workdir: string, branch: string) => {
    const git = getGitService(workdir);
    await git.checkout(branch);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_COMMIT,
    async (_, workdir: string, message: string, files?: string[]) => {
      const git = getGitService(workdir);
      return git.commit(message, files);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PUSH,
    async (_, workdir: string, remote?: string, branch?: string, setUpstream?: boolean) => {
      const git = getGitService(workdir);
      await git.push(remote, branch, setUpstream);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PULL,
    async (_, workdir: string, remote?: string, branch?: string) => {
      const git = getGitService(workdir);
      await git.pull(remote, branch);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_FETCH, async (_, workdir: string, remote?: string) => {
    const git = getGitService(workdir);
    await git.fetch(remote);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF,
    async (_, workdir: string, options?: { staged?: boolean }) => {
      const git = getGitService(workdir);
      return git.getDiff(options);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (_, workdir: string) => {
    const resolved = path.resolve(workdir);

    // For git init, only validate path exists and is a directory (no .git check)
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error('Invalid workdir: path does not exist or is not a directory');
    }

    // Create GitService and init
    const git = new GitService(resolved);
    await git.init();

    // Register as authorized and cache the service
    authorizedWorkdirs.add(resolved);
    gitServices.set(resolved, git);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_FILE_CHANGES, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getFileChanges();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_FILE_DIFF,
    async (_, workdir: string, filePath: string, staged: boolean) => {
      const git = getGitService(workdir);
      return git.getFileDiff(filePath, staged);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, async (_, workdir: string, paths: string[]) => {
    const git = getGitService(workdir);
    await git.stage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, async (_, workdir: string, paths: string[]) => {
    const git = getGitService(workdir);
    await git.unstage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD, async (_, workdir: string, paths: string[]) => {
    const git = getGitService(workdir);
    await git.discard(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_SHOW, async (_, workdir: string, hash: string) => {
    const git = getGitService(workdir);
    return git.showCommit(hash);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_FILES, async (_, workdir: string, hash: string) => {
    const git = getGitService(workdir);
    return git.getCommitFiles(hash);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_COMMIT_DIFF,
    async (_, workdir: string, hash: string, filePath: string, status?: FileChangeStatus) => {
      const git = getGitService(workdir);
      return git.getCommitDiff(hash, filePath, status);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_DIFF_STATS, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getDiffStats();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG,
    async (
      _,
      workdir: string,
      options: {
        maxDiffLines: number;
        timeout: number;
        provider: string;
        model: string;
        reasoningEffort?: string;
      }
    ): Promise<{ success: boolean; message?: string; error?: string }> => {
      const resolved = validateWorkdir(workdir);
      return generateCommitMessage({
        workdir: resolved,
        maxDiffLines: options.maxDiffLines,
        timeout: options.timeout,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
      });
    }
  );

  // Code Review - Start
  ipcMain.handle(
    IPC_CHANNELS.GIT_CODE_REVIEW_START,
    async (
      event,
      workdir: string,
      options: {
        provider: string;
        model: string;
        reasoningEffort?: string;
        language?: string;
        reviewId: string;
      }
    ): Promise<{ success: boolean; error?: string }> => {
      const resolved = validateWorkdir(workdir);
      const sender = event.sender;

      startCodeReviewService({
        workdir: resolved,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
        language: options.language ?? '中文',
        reviewId: options.reviewId,
        onChunk: (chunk) => {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
              reviewId: options.reviewId,
              type: 'data',
              data: chunk,
            });
          }
        },
        onComplete: () => {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
              reviewId: options.reviewId,
              type: 'exit',
              exitCode: 0,
            });
          }
        },
        onError: (error) => {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
              reviewId: options.reviewId,
              type: 'error',
              data: error,
            });
          }
        },
      });

      return { success: true };
    }
  );

  // Code Review - Stop
  ipcMain.handle(IPC_CHANNELS.GIT_CODE_REVIEW_STOP, async (_, reviewId: string): Promise<void> => {
    stopCodeReviewService(reviewId);
  });

  // GitHub CLI - Status
  ipcMain.handle(IPC_CHANNELS.GIT_GH_STATUS, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getGhCliStatus();
  });

  // GitHub CLI - List PRs
  ipcMain.handle(IPC_CHANNELS.GIT_PR_LIST, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.listPullRequests();
  });

  // GitHub CLI - Fetch PR (without checkout)
  ipcMain.handle(
    IPC_CHANNELS.GIT_PR_FETCH,
    async (_, workdir: string, prNumber: number, localBranch: string) => {
      const git = getGitService(workdir);
      return git.fetchPullRequest(prNumber, localBranch);
    }
  );

  // Git Clone - Validate URL
  ipcMain.handle(
    IPC_CHANNELS.GIT_VALIDATE_URL,
    async (_, url: string): Promise<{ valid: boolean; repoName?: string }> => {
      const valid = GitService.isValidGitUrl(url);
      return {
        valid,
        repoName: valid ? GitService.extractRepoName(url) : undefined,
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_GENERATE_BRANCH_NAME,
    async (
      _,
      workdir: string,
      options: {
        prompt: string;
        provider: string;
        model: string;
        reasoningEffort?: string;
      }
    ): Promise<{ success: boolean; branchName?: string; error?: string }> => {
      const resolved = validateWorkdir(workdir);
      return generateBranchName({
        workdir: resolved,
        prompt: options.prompt,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
      });
    }
  );

  // Git Clone - Clone repository
  ipcMain.handle(
    IPC_CHANNELS.GIT_CLONE,
    async (
      event,
      remoteUrl: string,
      targetPath: string
    ): Promise<{ success: boolean; path: string; error?: string }> => {
      try {
        await GitService.clone(remoteUrl, targetPath, (progress) => {
          // Send progress updates to renderer
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.GIT_CLONE_PROGRESS, progress);
          }
        });

        // Register as authorized workdir
        registerAuthorizedWorkdir(targetPath);

        return { success: true, path: targetPath };
      } catch (error) {
        return {
          success: false,
          path: targetPath,
          error: error instanceof Error ? error.message : 'Clone failed',
        };
      }
    }
  );
}
