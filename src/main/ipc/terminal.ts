import {
  IPC_CHANNELS,
  type TerminalCreateOptions,
  type TerminalResizeOptions,
} from '@shared/types';
import { ipcMain, type WebContents } from 'electron';
import { PtyManager } from '../services/terminal/PtyManager';

export const ptyManager = new PtyManager();
const terminalCleanupOwners = new Set<number>();

function ensureTerminalCleanup(sender: WebContents): void {
  const ownerId = sender.id;
  if (terminalCleanupOwners.has(ownerId)) {
    return;
  }

  terminalCleanupOwners.add(ownerId);
  sender.once('destroyed', () => {
    terminalCleanupOwners.delete(ownerId);
    ptyManager.destroyByOwner(ownerId);
  });
}

export function destroyAllTerminals(): void {
  terminalCleanupOwners.clear();
  ptyManager.destroyAll();
}

/**
 * Destroy all terminals and wait for them to fully exit.
 * This should be used during app shutdown to prevent crashes.
 */
export async function destroyAllTerminalsAndWait(): Promise<void> {
  terminalCleanupOwners.clear();
  await ptyManager.destroyAllAndWait();
}

export function registerTerminalHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (event, options: TerminalCreateOptions = {}) => {
      ensureTerminalCleanup(event.sender);
      const ownerId = event.sender.id;

      const id = ptyManager.create(
        options,
        (data) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.TERMINAL_DATA, { id, data });
          }
        },
        (exitCode, signal) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.TERMINAL_EXIT, { id, exitCode, signal });
          }
        },
        ownerId
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
