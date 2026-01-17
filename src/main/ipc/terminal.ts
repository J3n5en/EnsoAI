import {
  IPC_CHANNELS,
  type TerminalCreateOptions,
  type TerminalResizeOptions,
} from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import { PtyManager } from '../services/terminal/PtyManager';

export const ptyManager = new PtyManager();

export function destroyAllTerminals(): void {
  ptyManager.destroyAll();
}

/**
 * Destroy all terminals and wait for them to fully exit.
 * This should be used during app shutdown to prevent crashes.
 */
export async function destroyAllTerminalsAndWait(): Promise<void> {
  await ptyManager.destroyAllAndWait();
}

export function registerTerminalHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (event, options: TerminalCreateOptions = {}) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        throw new Error('No window found');
      }

      const id = ptyManager.create(
        options,
        (data) => {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { id, data });
          }
        },
        (exitCode, signal) => {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { id, exitCode, signal });
          }
        }
      );

      return id;
    }
  );

  ipcMain.handle(IPC_CHANNELS.TERMINAL_WRITE, async (_, id: string, data: string) => {
    ptyManager.write(id, data);
  });

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_RESIZE,
    async (_, id: string, size: TerminalResizeOptions) => {
      ptyManager.resize(id, size.cols, size.rows);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TERMINAL_DESTROY, async (_, id: string) => {
    ptyManager.destroy(id);
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_GET_ACTIVITY, async (_, id: string) => {
    return ptyManager.getProcessActivity(id);
  });
}
