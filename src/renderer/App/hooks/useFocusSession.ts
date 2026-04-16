import { useEffect } from 'react';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import type { TabId } from '../constants';

interface FocusSessionParams {
  sessionId: string;
}

interface UseFocusSessionOptions {
  onSwitchWorktree: (path: string) => void;
  onSwitchTab: (tab: TabId) => void;
}

export function useFocusSession({ onSwitchWorktree, onSwitchTab }: UseFocusSessionOptions) {
  useEffect(() => {
    const cleanup = window.electronAPI.app.onFocusSession((params: FocusSessionParams) => {
      const { sessionId } = params;

      const sessions = useAgentSessionsStore.getState().sessions;
      const session = sessions.find((s) => s.id === sessionId);

      if (session) {
        // Switch to the session's worktree first, then set active session (same as RunningProjectsPopover)
        onSwitchWorktree(session.cwd);
        useAgentSessionsStore.getState().setActiveId(session.repoPath, session.cwd, sessionId);
        onSwitchTab('chat');
      }
    });

    return cleanup;
  }, [onSwitchWorktree, onSwitchTab]);
}
