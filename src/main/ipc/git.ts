import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { type FileChangeStatus, IPC_CHANNELS } from '@shared/types';
import type { ClaudeEffort } from '@shared/types/ai';
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
import { gitAutoFetchService } from '../services/git/GitAutoFetchService';
import { GitService } from '../services/git/GitService';
import {
  createUnsupportedRemoteFeatureError,
  type RemoteUnsupportedFeature,
} from '../services/remote/RemoteI18n';
import { isRemoteVirtualPath } from '../services/remote/RemotePath';
import { remoteRepositoryBackend } from '../services/remote/RemoteRepositoryBackend';

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

function isRemoteWorkdir(workdir: string): boolean {
  return isRemoteVirtualPath(workdir);
}

function assertRemoteUnsupported(feature: RemoteUnsupportedFeature): never {
  throw createUnsupportedRemoteFeatureError(feature);
}

function assertRemoteGitMutationUnsupported(): never {
  throw new Error('Git blame, revert, and reset are not supported for remote repositories yet');
}

export function registerGitHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_, workdir: string) => {
    if (isRemoteWorkdir(workdir)) {
      return remoteRepositoryBackend.getStatus(workdir);
    }
    const git = getGitService(workdir);
    return git.getStatus();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_LOG,
    async (_, workdir: string, maxCount?: number, skip?: number, submodulePath?: string) => {
      if (isRemoteWorkdir(workdir)) {
        if (submodulePath) {
          assertRemoteUnsupported('submoduleHistory');
        }
        return remoteRepositoryBackend.getLog(workdir, maxCount, skip);
      }
      const git = getGitService(workdir);
      return git.getLog(maxCount, skip, submodulePath);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_LIST, async (_, workdir: string) => {
    if (isRemoteWorkdir(workdir)) {
      return remoteRepositoryBackend.getBranches(workdir);
    }
    const git = getGitService(workdir);
    return git.getBranches();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_BRANCH_CREATE,
    async (_, workdir: string, name: string, startPoint?: string) => {
      if (isRemoteWorkdir(workdir)) {
        await remoteRepositoryBackend.createBranch(workdir, name, startPoint);
        return;
      }
      const git = getGitService(workdir);
      await git.createBranch(name, startPoint);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_CHECKOUT, async (_, workdir: string, branch: string) => {
    if (isRemoteWorkdir(workdir)) {
      await remoteRepositoryBackend.checkout(workdir, branch);
      return;
    }
    const git = getGitService(workdir);
    await git.checkout(branch);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_COMMIT,
    async (_, workdir: string, message: string, files?: string[]) => {
      if (isRemoteWorkdir(workdir)) {
        if (files?.length) {
          assertRemoteUnsupported('partialCommit');
        }
        return remoteRepositoryBackend.commit(workdir, message);
      }
      const git = getGitService(workdir);
      return git.commit(message, files);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PUSH,
    async (_, workdir: string, remote?: string, branch?: string, setUpstream?: boolean) => {
      if (isRemoteWorkdir(workdir)) {
        await remoteRepositoryBackend.push(workdir, remote, branch, setUpstream);
        return;
      }
      const git = getGitService(workdir);
      await git.push(remote, branch, setUpstream);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PULL,
    async (_, workdir: string, remote?: string, branch?: string) => {
      if (isRemoteWorkdir(workdir)) {
        await remoteRepositoryBackend.pull(workdir, remote, branch);
        return;
      }
      const git = getGitService(workdir);
      await git.pull(remote, branch);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_FETCH, async (_, workdir: string, remote?: string) => {
    if (isRemoteWorkdir(workdir)) {
      await remoteRepositoryBackend.fetch(workdir, remote);
      return;
    }
    const git = getGitService(workdir);
    await git.fetch(remote);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF,
    async (_, workdir: string, options?: { staged?: boolean }) => {
      if (isRemoteWorkdir(workdir)) {
        return remoteRepositoryBackend.getDiff(workdir, options?.staged);
      }
      const git = getGitService(workdir);
      return git.getDiff(options);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (_, workdir: string) => {
    if (isRemoteWorkdir(workdir)) {
      assertRemoteUnsupported('gitInit');
    }
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
    if (isRemoteWorkdir(workdir)) {
      return remoteRepositoryBackend.getFileChanges(workdir);
    }
    const git = getGitService(workdir);
    return git.getFileChanges();
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_FILE_DIFF,
    async (_, workdir: string, filePath: string, staged: boolean) => {
      if (isRemoteWorkdir(workdir)) {
        return remoteRepositoryBackend.getFileDiff(workdir, filePath, staged);
      }
      const git = getGitService(workdir);
      return git.getFileDiff(filePath, staged);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, async (_, workdir: string, paths: string[]) => {
    if (isRemoteWorkdir(workdir)) {
      await remoteRepositoryBackend.stage(workdir, paths);
      return;
    }
    const git = getGitService(workdir);
    await git.stage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, async (_, workdir: string, paths: string[]) => {
    if (isRemoteWorkdir(workdir)) {
      await remoteRepositoryBackend.unstage(workdir, paths);
      return;
    }
    const git = getGitService(workdir);
    await git.unstage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD, async (_, workdir: string, paths: string[]) => {
    if (isRemoteWorkdir(workdir)) {
      await remoteRepositoryBackend.discard(workdir, paths);
      return;
    }
    const git = getGitService(workdir);
    await git.discard(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_SHOW, async (_, workdir: string, hash: string) => {
    if (isRemoteWorkdir(workdir)) {
      return remoteRepositoryBackend.showCommit(workdir, hash);
    }
    const git = getGitService(workdir);
    return git.showCommit(hash);
  });

  ipcMain.handle(
    IPC_CHANNELS.GIT_COMMIT_FILES,
    async (_, workdir: string, hash: string, submodulePath?: string) => {
      if (isRemoteWorkdir(workdir)) {
        if (submodulePath) {
          assertRemoteUnsupported('submoduleCommitFiles');
        }
        return remoteRepositoryBackend.getCommitFiles(workdir, hash);
      }
      const git = getGitService(workdir);
      return git.getCommitFiles(hash, submodulePath);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_COMMIT_DIFF,
    async (
      _,
      workdir: string,
      hash: string,
      filePath: string,
      status?: FileChangeStatus,
      submodulePath?: string
    ) => {
      if (isRemoteWorkdir(workdir)) {
        if (status || submodulePath) {
          assertRemoteUnsupported('commitDiffVariants');
        }
        return remoteRepositoryBackend.getCommitDiff(workdir, hash, filePath);
      }
      const git = getGitService(workdir);
      return git.getCommitDiff(hash, filePath, status, submodulePath);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GIT_DIFF_STATS, async (_, workdir: string) => {
    if (isRemoteWorkdir(workdir)) {
      return remoteRepositoryBackend.getDiffStats(workdir);
    }
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
        prompt?: string;
        // AI Performance settings from renderer
        bareEnabled?: boolean;
        effortEnabled?: boolean;
        effortLevel?: string;
      }
    ): Promise<{ success: boolean; message?: string; error?: string }> => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('aiCommitMessageGeneration');
      }
      const resolved = validateWorkdir(workdir);
      return generateCommitMessage({
        workdir: resolved,
        maxDiffLines: options.maxDiffLines,
        timeout: options.timeout,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
        bare: options.bareEnabled,
        claudeEffort: options.effortEnabled
          ? ((options.effortLevel as ClaudeEffort) ?? 'low')
          : undefined,
        prompt: options.prompt,
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
        sessionId?: string; // Support sessionId for "Continue Conversation"
        prompt?: string; // Custom prompt template
        // AI Performance settings from renderer
        bareEnabled?: boolean;
        effortEnabled?: boolean;
        effortLevel?: string;
      }
    ): Promise<{ success: boolean; error?: string; sessionId?: string }> => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('codeReview');
      }
      const resolved = validateWorkdir(workdir);
      const sender = event.sender;

      startCodeReviewService({
        workdir: resolved,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
        bare: options.bareEnabled,
        claudeEffort: options.effortEnabled
          ? ((options.effortLevel as ClaudeEffort) ?? 'low')
          : undefined,
        language: options.language ?? '中文',
        reviewId: options.reviewId,
        sessionId: options.sessionId, // Pass sessionId for session preservation
        prompt: options.prompt, // Pass custom prompt template
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

      return { success: true, sessionId: options.sessionId };
    }
  );

  // Code Review - Stop
  ipcMain.handle(IPC_CHANNELS.GIT_CODE_REVIEW_STOP, async (_, reviewId: string): Promise<void> => {
    stopCodeReviewService(reviewId);
  });

  // GitHub CLI - Status
  ipcMain.handle(IPC_CHANNELS.GIT_GH_STATUS, async (_, workdir: string) => {
    if (isRemoteWorkdir(workdir)) {
      assertRemoteUnsupported('githubCliIntegration');
    }
    const git = getGitService(workdir);
    return git.getGhCliStatus();
  });

  // GitHub CLI - List PRs
  ipcMain.handle(IPC_CHANNELS.GIT_PR_LIST, async (_, workdir: string) => {
    if (isRemoteWorkdir(workdir)) {
      assertRemoteUnsupported('pullRequestListing');
    }
    const git = getGitService(workdir);
    return git.listPullRequests();
  });

  // GitHub CLI - Fetch PR (without checkout)
  ipcMain.handle(
    IPC_CHANNELS.GIT_PR_FETCH,
    async (_, workdir: string, prNumber: number, localBranch: string) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('pullRequestFetch');
      }
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
        // AI Performance settings from renderer
        bareEnabled?: boolean;
        effortEnabled?: boolean;
        effortLevel?: string;
      }
    ): Promise<{ success: boolean; branchName?: string; error?: string }> => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('aiBranchNameGeneration');
      }
      const resolved = validateWorkdir(workdir);
      return generateBranchName({
        workdir: resolved,
        prompt: options.prompt,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
        bare: options.bareEnabled,
        claudeEffort: options.effortEnabled
          ? ((options.effortLevel as ClaudeEffort) ?? 'low')
          : undefined,
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

  // Git Blame
  ipcMain.handle(IPC_CHANNELS.GIT_BLAME, async (_, workdir: string, filePath: string) => {
    if (isRemoteWorkdir(workdir)) {
      assertRemoteGitMutationUnsupported();
    }
    const git = getGitService(workdir);
    return git.blame(filePath);
  });

  // Git Revert
  ipcMain.handle(IPC_CHANNELS.GIT_REVERT, async (_, workdir: string, commitHash: string) => {
    if (isRemoteWorkdir(workdir)) {
      assertRemoteGitMutationUnsupported();
    }
    const git = getGitService(workdir);
    await git.revert(commitHash);
  });

  // Git Reset
  ipcMain.handle(
    IPC_CHANNELS.GIT_RESET,
    async (_, workdir: string, commitHash: string, mode?: 'soft' | 'mixed' | 'hard') => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteGitMutationUnsupported();
      }
      const git = getGitService(workdir);
      await git.reset(commitHash, mode);
    }
  );

  // Git Auto Fetch
  ipcMain.handle(IPC_CHANNELS.GIT_AUTO_FETCH_SET_ENABLED, async (_, enabled: boolean) => {
    gitAutoFetchService.setEnabled(enabled);
  });

  // Git Submodule - List
  ipcMain.handle(IPC_CHANNELS.GIT_SUBMODULE_LIST, async (_, workdir: string) => {
    if (isRemoteWorkdir(workdir)) {
      assertRemoteUnsupported('submodules');
    }
    const git = getGitService(workdir);
    return git.listSubmodules();
  });

  // Git Submodule - Init
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_INIT,
    async (_, workdir: string, recursive?: boolean) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.initSubmodules(recursive);
    }
  );

  // Git Submodule - Update
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_UPDATE,
    async (_, workdir: string, recursive?: boolean) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.updateSubmodules(recursive);
    }
  );

  // Git Submodule - Sync
  ipcMain.handle(IPC_CHANNELS.GIT_SUBMODULE_SYNC, async (_, workdir: string) => {
    if (isRemoteWorkdir(workdir)) {
      assertRemoteUnsupported('submodules');
    }
    const git = getGitService(workdir);
    await git.syncSubmodules();
  });

  // Git Submodule - Fetch
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_FETCH,
    async (_, workdir: string, submodulePath: string) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.fetchSubmodule(submodulePath);
    }
  );

  // Git Submodule - Pull
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_PULL,
    async (_, workdir: string, submodulePath: string) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.pullSubmodule(submodulePath);
    }
  );

  // Git Submodule - Push
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_PUSH,
    async (_, workdir: string, submodulePath: string) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.pushSubmodule(submodulePath);
    }
  );

  // Git Submodule - Commit
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_COMMIT,
    async (_, workdir: string, submodulePath: string, message: string) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      return git.commitSubmodule(submodulePath, message);
    }
  );

  // Git Submodule - Stage
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_STAGE,
    async (_, workdir: string, submodulePath: string, paths: string[]) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.stageSubmodule(submodulePath, paths);
    }
  );

  // Git Submodule - Unstage
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_UNSTAGE,
    async (_, workdir: string, submodulePath: string, paths: string[]) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.unstageSubmodule(submodulePath, paths);
    }
  );

  // Git Submodule - Discard
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_DISCARD,
    async (_, workdir: string, submodulePath: string, paths: string[]) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.discardSubmodule(submodulePath, paths);
    }
  );

  // Git Submodule - Changes
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_CHANGES,
    async (_, workdir: string, submodulePath: string) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      return git.getSubmoduleChanges(submodulePath);
    }
  );

  // Git Submodule - File Diff
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_FILE_DIFF,
    async (_, workdir: string, submodulePath: string, filePath: string, staged: boolean) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      return git.getSubmoduleFileDiff(submodulePath, filePath, staged);
    }
  );

  // Git Submodule - Branches
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_BRANCHES,
    async (_, workdir: string, submodulePath: string) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      return git.getSubmoduleBranches(submodulePath);
    }
  );

  // Git Submodule - Checkout
  ipcMain.handle(
    IPC_CHANNELS.GIT_SUBMODULE_CHECKOUT,
    async (_, workdir: string, submodulePath: string, branch: string) => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('submodules');
      }
      const git = getGitService(workdir);
      await git.checkoutSubmoduleBranch(submodulePath, branch);
    }
  );
}
