import {
  IPC_CHANNELS,
  type WorktreeCreateOptions,
  type WorktreeRemoveOptions,
} from '@shared/types';
import { ipcMain } from 'electron';
import { WorktreeService } from '../services/git/WorktreeService';

const worktreeServices = new Map<string, WorktreeService>();

function getWorktreeService(workdir: string): WorktreeService {
  if (!worktreeServices.has(workdir)) {
    worktreeServices.set(workdir, new WorktreeService(workdir));
  }
  return worktreeServices.get(workdir)!;
}

export function registerWorktreeHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WORKTREE_LIST, async (_, workdir: string) => {
    const service = getWorktreeService(workdir);
    return service.list();
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
      const service = getWorktreeService(workdir);
      await service.remove(options);
    }
  );
}
