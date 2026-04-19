import {
  type ConflictResolution,
  IPC_CHANNELS,
  type WorktreeCreateOptions,
  type WorktreeMergeCleanupOptions,
  type WorktreeMergeOptions,
  type WorktreeRemoveOptions,
} from '@shared/types';
import { ipcMain } from 'electron';
import { updateClaudeWorkspaceFolders } from '../services/claude/ClaudeIdeBridge';
import { gitAutoFetchService } from '../services/git/GitAutoFetchService';
import { WorktreeService } from '../services/git/WorktreeService';
import { stopWatchersInDirectory } from './files';
import { ptyManager } from './terminal';

const worktreeServices = new Map<string, WorktreeService>();

function getWorktreeService(workdir: string): WorktreeService {
  if (!worktreeServices.has(workdir)) {
    worktreeServices.set(workdir, new WorktreeService(workdir));
  }
  return worktreeServices.get(workdir)!;
}

export function clearWorktreeService(workdir: string): void {
  worktreeServices.delete(workdir);
}

export function clearAllWorktreeServices(): void {
  worktreeServices.clear();
}

export function registerWorktreeHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WORKTREE_LIST, async (_, workdir: string) => {
    const service = getWorktreeService(workdir);
    const worktrees = await service.list();

    // Register all worktrees with auto-fetch service
    gitAutoFetchService.clearWorktrees();
    for (const wt of worktrees) {
      gitAutoFetchService.registerWorktree(wt.path);
    }

    return worktrees;
  });

  ipcMain.handle(
    IPC_CHANNELS.WORKTREE_ADD,
    async (_, workdir: string, options: WorktreeCreateOptions) => {
      const service = getWorktreeService(workdir);
      await service.add(options);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKTREE_REMOVE,
    async (_, workdir: string, options: WorktreeRemoveOptions) => {
      // Stop all resources using the worktree directory before removal
      await stopWatchersInDirectory(options.path);
      ptyManager.destroyByWorkdir(options.path);

      // Unregister from auto-fetch service
      gitAutoFetchService.unregisterWorktree(options.path);

      // Wait for processes to fully terminate
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const service = getWorktreeService(workdir);
      await service.remove(options);
    }
  );

  ipcMain.handle(IPC_CHANNELS.WORKTREE_ACTIVATE, async (_, worktreePaths: string[]) => {
    updateClaudeWorkspaceFolders(worktreePaths);
  });

  // Merge handlers
  ipcMain.handle(
    IPC_CHANNELS.WORKTREE_MERGE,
    async (_, workdir: string, options: WorktreeMergeOptions) => {
      const service = getWorktreeService(workdir);
      return service.merge(options);
    }
  );

  ipcMain.handle(IPC_CHANNELS.WORKTREE_MERGE_STATE, async (_, workdir: string) => {
    const service = getWorktreeService(workdir);
    return service.getMergeState(workdir);
  });

  ipcMain.handle(IPC_CHANNELS.WORKTREE_MERGE_CONFLICTS, async (_, workdir: string) => {
    const service = getWorktreeService(workdir);
    return service.getConflicts(workdir);
  });

  ipcMain.handle(
    IPC_CHANNELS.WORKTREE_MERGE_CONFLICT_CONTENT,
    async (_, workdir: string, filePath: string) => {
      const service = getWorktreeService(workdir);
      return service.getConflictContent(workdir, filePath);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKTREE_MERGE_RESOLVE,
    async (_, workdir: string, resolution: ConflictResolution) => {
      const service = getWorktreeService(workdir);
      await service.resolveConflict(workdir, resolution);
    }
  );

  ipcMain.handle(IPC_CHANNELS.WORKTREE_MERGE_ABORT, async (_, workdir: string) => {
    const service = getWorktreeService(workdir);
    await service.abortMerge(workdir);
  });

  ipcMain.handle(
    IPC_CHANNELS.WORKTREE_MERGE_CONTINUE,
    async (_, workdir: string, message?: string, cleanupOptions?: WorktreeMergeCleanupOptions) => {
      const service = getWorktreeService(workdir);
      return service.continueMerge(workdir, message, cleanupOptions);
    }
  );
}
