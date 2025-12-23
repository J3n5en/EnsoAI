import { useTerminalStore } from '@/stores/terminal';
import type { TerminalCreateOptions } from '@shared/types';
import { useCallback, useEffect } from 'react';

export function useTerminal() {
  const { sessions, activeSessionId, addSession, removeSession, setActiveSession } =
    useTerminalStore();

  const createTerminal = useCallback(
    async (options?: TerminalCreateOptions) => {
      const id = await window.electronAPI.terminal.create(options);
      addSession({
        id,
        title: 'Terminal',
        cwd: options?.cwd || process.env.HOME || '/',
        shell: options?.shell || 'zsh',
        cols: options?.cols || 80,
        rows: options?.rows || 24,
      });
      return id;
    },
    [addSession]
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
