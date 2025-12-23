import {
  IPC_CHANNELS,
  type TerminalCreateOptions,
  type TerminalResizeOptions,
} from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import { PtyManager } from '../services/terminal/PtyManager';

const ptyManager = new PtyManager();

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
          window.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { id, data });
        },
        (exitCode, signal) => {
          window.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { id, exitCode, signal });
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
}
