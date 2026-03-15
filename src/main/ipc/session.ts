import {
  IPC_CHANNELS,
  type SessionAttachOptions,
  type SessionCreateOptions,
  type SessionResizeOptions,
  type TerminalCreateOptions,
  type TerminalResizeOptions,
} from '@shared/types';
import { ipcMain } from 'electron';
import { sessionManager } from '../services/session/SessionManager';

function toSessionCreateOptions(options: TerminalCreateOptions = {}): SessionCreateOptions {
  return {
    ...options,
    kind: 'terminal',
  };
}

export function destroyAllTerminals(): void {
  sessionManager.destroyAllLocal();
}

export async function destroyAllTerminalsAndWait(): Promise<void> {
  await sessionManager.destroyAllLocalAndWait();
}

export function registerSessionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async (event, options: SessionCreateOptions = {}) => {
    return sessionManager.create(event.sender, options);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_ATTACH, async (event, options: SessionAttachOptions) => {
    return sessionManager.attach(event.sender, options);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DETACH, async (event, sessionId: string) => {
    await sessionManager.detach(event.sender, sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_KILL, async (_, sessionId: string) => {
    await sessionManager.kill(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_WRITE, async (_, sessionId: string, data: string) => {
    sessionManager.write(sessionId, data);
  });

  ipcMain.handle(
    IPC_CHANNELS.SESSION_RESIZE,
    async (_, sessionId: string, size: SessionResizeOptions) => {
      sessionManager.resize(sessionId, size.cols, size.rows);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async (event) => {
    return sessionManager.list(event.sender);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_ACTIVITY, async (_, sessionId: string) => {
    return sessionManager.getActivity(sessionId);
  });

  // Compatibility wrappers for legacy terminal callers while renderer migrates.
  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (event, options: TerminalCreateOptions = {}) => {
      const created = await sessionManager.create(event.sender, toSessionCreateOptions(options));
      const sessionId = created.session.sessionId;
      const attached = await sessionManager.attach(event.sender, {
        sessionId,
        cwd: options.cwd,
      });
      if (attached.replay) {
        event.sender.send(IPC_CHANNELS.SESSION_DATA, {
          sessionId,
          data: attached.replay,
        });
      }
      return sessionId;
    }
  );

  ipcMain.handle(IPC_CHANNELS.TERMINAL_WRITE, async (_, id: string, data: string) => {
    sessionManager.write(id, data);
  });

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_RESIZE,
    async (_, id: string, size: TerminalResizeOptions) => {
      sessionManager.resize(id, size.cols, size.rows);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TERMINAL_DESTROY, async (_, id: string) => {
    await sessionManager.kill(id);
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_GET_ACTIVITY, async (_, id: string) => {
    return sessionManager.getActivity(id);
  });
}
