import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { GitService } from '../services/git/GitService';

const gitServices = new Map<string, GitService>();

function getGitService(workdir: string): GitService {
  if (!gitServices.has(workdir)) {
    gitServices.set(workdir, new GitService(workdir));
  }
  return gitServices.get(workdir)!;
}

export function registerGitHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_, workdir: string) => {
    const git = getGitService(workdir);
    return git.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (_, workdir: string, maxCount?: number) => {
    const git = getGitService(workdir);
    return git.getLog(maxCount);
  });

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
    async (_, workdir: string, remote?: string, branch?: string) => {
      const git = getGitService(workdir);
      await git.push(remote, branch);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PULL,
    async (_, workdir: string, remote?: string, branch?: string) => {
      const git = getGitService(workdir);
      await git.pull(remote, branch);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF,
    async (_, workdir: string, options?: { staged?: boolean }) => {
      const git = getGitService(workdir);
      return git.getDiff(options);
    }
  );
}
