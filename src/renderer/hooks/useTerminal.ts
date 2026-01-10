import type { TerminalCreateOptions } from '@shared/types';
import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';

export function useTerminal() {
  const { sessions, activeSessionId, addSession, removeSession, setActiveSession } =
    useTerminalStore();
  const shellConfig = useSettingsStore((s) => s.shellConfig);

  // Listen for terminal exit events from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI.terminal.onExit(({ id }) => {
      removeSession(id);
    });
    return unsubscribe;
  }, [removeSession]);

  const createTerminal = useCallback(
    async (options?: TerminalCreateOptions) => {
      const createOptions: TerminalCreateOptions = {
        ...options,
        shellConfig: options?.shell ? undefined : shellConfig,
      };
      const id = await window.electronAPI.terminal.create(createOptions);
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
      await window.electronAPI.terminal.destroy(id);
      removeSession(id);
    },
    [removeSession]
  );

  const writeToTerminal = useCallback(async (id: string, data: string) => {
    await window.electronAPI.terminal.write(id, data);
  }, []);

  const resizeTerminal = useCallback(async (id: string, cols: number, rows: number) => {
    await window.electronAPI.terminal.resize(id, { cols, rows });
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
    const unsubscribe = window.electronAPI.terminal.onData(({ id, data }) => {
      onData(id, data);
    });
    return unsubscribe;
  }, [onData]);
}
