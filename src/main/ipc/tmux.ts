import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { tmuxDetector } from '../services/cli/TmuxDetector';

export function registerTmuxHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TMUX_CHECK, async (_, forceRefresh?: boolean) => {
    return await tmuxDetector.check(forceRefresh);
  });

  ipcMain.handle(IPC_CHANNELS.TMUX_KILL_SESSION, async (_, name: string) => {
    return await tmuxDetector.killSession(name);
  });
}

export async function cleanupTmux(): Promise<void> {
  await tmuxDetector.killServer();
}

export function cleanupTmuxSync(): void {
  tmuxDetector.killServerSync();
}
