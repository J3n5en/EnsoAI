import { useEffect } from 'react';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import type { TabId } from '../constants';

interface FocusSessionParams {
  sessionId?: string;
  cwd?: string;
}

interface UseFocusSessionOptions {
  onSwitchWorktree: (path: string) => void;
  onSwitchTab: (tab: TabId) => void;
}

export function useFocusSession({ onSwitchWorktree, onSwitchTab }: UseFocusSessionOptions) {
  useEffect(() => {
    const cleanup = window.electronAPI.app.onFocusSession((params: FocusSessionParams) => {
      const { sessionId, cwd } = params;

      // If sessionId provided, try to focus that session
      if (sessionId) {
        const sessions = useAgentSessionsStore.getState().sessions;
        const session = sessions.find((s) => s.id === sessionId);

        if (session) {
          // Use session's cwd if no cwd provided
          const targetCwd = cwd || session.cwd;
          // Activate the session
          useAgentSessionsStore.getState().setActiveId(targetCwd, sessionId);
          // Switch to chat tab
          onSwitchTab('chat');
          return;
        }
        // Session not found - silently ignore if cwd also not provided
        if (!cwd) {
          return;
        }
      }

      // If cwd provided (and no session or session not found), switch worktree
      if (cwd) {
        onSwitchWorktree(cwd);
      }
    });

    return cleanup;
  }, [onSwitchWorktree, onSwitchTab]);
}
