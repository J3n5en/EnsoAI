import { type ClaudeSlashCompletionsSnapshot, IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import {
  getClaudeSlashCompletionsSnapshot,
  learnClaudeSlashCompletion,
  refreshClaudeSlashCompletions,
  startClaudeSlashCompletionsWatcher,
  stopClaudeSlashCompletionsWatcher,
} from '../services/claude/ClaudeCompletionsManager';

function broadcast(snapshot: ClaudeSlashCompletionsSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(IPC_CHANNELS.CLAUDE_COMPLETIONS_UPDATED, snapshot);
  }
}

export function registerClaudeCompletionsHandlers(): void {
  // Start watcher: when ~/.claude/commands or ~/.claude/skills changes, refresh completion items automatically.
  startClaudeSlashCompletionsWatcher((next) => {
    broadcast(next);
  }).catch((err) => {
    console.warn('[ClaudeCompletions] watcher 启动失败：', err);
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_COMPLETIONS_GET, () => {
    return getClaudeSlashCompletionsSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_COMPLETIONS_REFRESH, () => {
    return refreshClaudeSlashCompletions();
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_COMPLETIONS_LEARN, (_event, label: string) => {
    return learnClaudeSlashCompletion(label);
  });
}

export async function stopClaudeCompletionsWatchers(): Promise<void> {
  await stopClaudeSlashCompletionsWatcher();
}
