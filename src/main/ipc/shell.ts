import { IPC_CHANNELS, type ShellConfig } from '@shared/types';
import { ipcMain } from 'electron';
import { shellDetector } from '../services/terminal/ShellDetector';

export function registerShellHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_DETECT, async () => {
    return await shellDetector.detectShells();
  });

  ipcMain.handle(
    IPC_CHANNELS.SHELL_RESOLVE_FOR_COMMAND,
    (_, config: ShellConfig): { shell: string; execArgs: string[] } => {
      return shellDetector.resolveShellForCommand(config);
    }
  );
}
