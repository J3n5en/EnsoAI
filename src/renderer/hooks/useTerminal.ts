import type { TerminalCreateOptions } from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';

export function useTerminal() {
  const { sessions, activeSessionId, addSession, removeSession, setActiveSession } =
    useTerminalStore();
  const shellConfig = useSettingsStore((s) => s.shellConfig);

  // Listen for terminal exit events from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI.session.onExit(({ sessionId }) => {
      removeSession(sessionId);
    });
    return unsubscribe;
  }, [removeSession]);

  const createTerminal = useCallback(
    async (options?: TerminalCreateOptions) => {
      const createOptions: TerminalCreateOptions = {
        ...options,
        shellConfig: options?.shell ? undefined : shellConfig,
      };
      const session = await window.electronAPI.session.create({
        ...createOptions,
        kind: 'terminal',
      });
      const id = session.session.sessionId;
      if (!createOptions.cwd || !isRemoteVirtualPath(createOptions.cwd)) {
        await window.electronAPI.session.attach({
          sessionId: id,
          cwd: createOptions.cwd,
        });
      }
      addSession({
        id,
        title: 'Terminal',
        cwd: options?.cwd || window.electronAPI.env.HOME || '/',
      });
      return id;
    },
    [addSession, shellConfig]
  );

  const destroyTerminal = useCallback(
    async (id: string) => {
      await window.electronAPI.session.kill(id);
      removeSession(id);
    },
    [removeSession]
  );

  const writeToTerminal = useCallback(async (id: string, data: string) => {
    await window.electronAPI.session.write(id, data);
  }, []);

  const resizeTerminal = useCallback(async (id: string, cols: number, rows: number) => {
    await window.electronAPI.session.resize(id, { cols, rows });
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSession,
    createTerminal,
    destroyTerminal,
    writeToTerminal,
    resizeTerminal,
  };
}

export function useTerminalData(onData: (id: string, data: string) => void) {
  useEffect(() => {
    const unsubscribe = window.electronAPI.session.onData(({ sessionId, data }) => {
      onData(sessionId, data);
    });
    return unsubscribe;
  }, [onData]);
}
