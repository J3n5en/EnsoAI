import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClaudeTerminal } from './ClaudeTerminal';
import { type Session, SessionBar } from './SessionBar';

interface ChatPanelProps {
  repoPath: string; // repository path (workspace identifier)
  cwd: string; // current worktree path
}

const SESSIONS_STORAGE_PREFIX = 'enso-chat-sessions:';

function createSession(cwd: string): Session {
  return {
    id: crypto.randomUUID(),
    name: 'Claude',
    initialized: false,
    cwd,
  };
}

function loadSessions(repoPath: string): {
  sessions: Session[];
  activeIds: Record<string, string | null>;
} {
  try {
    const saved = localStorage.getItem(SESSIONS_STORAGE_PREFIX + repoPath);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.sessions?.length > 0) {
        return { sessions: data.sessions, activeIds: data.activeIds || {} };
      }
    }
  } catch {}
  return { sessions: [], activeIds: {} };
}

function saveSessions(
  repoPath: string,
  sessions: Session[],
  activeIds: Record<string, string | null>
): void {
  localStorage.setItem(SESSIONS_STORAGE_PREFIX + repoPath, JSON.stringify({ sessions, activeIds }));
}

export function ChatPanel({ repoPath, cwd }: ChatPanelProps) {
  const [state, setState] = useState(() => {
    const loaded = loadSessions(repoPath);
    // Create initial session for current worktree if none exists
    const hasSessionForCwd = loaded.sessions.some((s) => s.cwd === cwd);
    if (!hasSessionForCwd && cwd) {
      const newSession = createSession(cwd);
      return {
        sessions: [...loaded.sessions, newSession],
        activeIds: { ...loaded.activeIds, [cwd]: newSession.id },
      };
    }
    return { sessions: loaded.sessions, activeIds: loaded.activeIds };
  });
  const allSessions = state.sessions;
  const activeIds = state.activeIds;

  // Get current worktree's active session id (fallback to first session if not set)
  const activeSessionId = activeIds[cwd] || allSessions.find((s) => s.cwd === cwd)?.id || null;

  // Filter sessions for current worktree (for SessionBar display)
  const currentWorktreeSessions = useMemo(() => {
    return allSessions.filter((s) => s.cwd === cwd);
  }, [allSessions, cwd]);

  // Create initial session when switching to a new worktree
  useEffect(() => {
    if (currentWorktreeSessions.length === 0 && cwd) {
      setState((prev) => {
        // Double check to prevent duplicates
        if (prev.sessions.some((s) => s.cwd === cwd)) return prev;
        const newSession = createSession(cwd);
        return {
          sessions: [...prev.sessions, newSession],
          activeIds: { ...prev.activeIds, [cwd]: newSession.id },
        };
      });
    }
  }, [cwd, currentWorktreeSessions.length]);

  // Persist sessions on change
  useEffect(() => {
    saveSessions(repoPath, allSessions, activeIds);
  }, [repoPath, allSessions, activeIds]);

  const handleNewSession = useCallback(() => {
    const newSession = createSession(cwd);
    setState((prev) => ({
      sessions: [...prev.sessions, newSession],
      activeIds: { ...prev.activeIds, [cwd]: newSession.id },
    }));
  }, [cwd]);

  const handleCloseSession = useCallback((id: string) => {
    setState((prev) => {
      const session = prev.sessions.find((s) => s.id === id);
      if (!session) return prev;

      const worktreeCwd = session.cwd;
      const newSessions = prev.sessions.filter((s) => s.id !== id);
      const remainingInWorktree = newSessions.filter((s) => s.cwd === worktreeCwd);

      const newActiveIds = { ...prev.activeIds };

      // If closing active session in this worktree, switch to another
      if (prev.activeIds[worktreeCwd] === id) {
        if (remainingInWorktree.length > 0) {
          const closedIndex = prev.sessions
            .filter((s) => s.cwd === worktreeCwd)
            .findIndex((s) => s.id === id);
          const newActiveIndex = Math.min(closedIndex, remainingInWorktree.length - 1);
          newActiveIds[worktreeCwd] = remainingInWorktree[newActiveIndex].id;
        } else {
          // Create a new session if all closed in this worktree
          const newSession = createSession(worktreeCwd);
          return {
            sessions: [...newSessions, newSession],
            activeIds: { ...newActiveIds, [worktreeCwd]: newSession.id },
          };
        }
      }

      return { sessions: newSessions, activeIds: newActiveIds };
    });
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setState((prev) => {
      const session = prev.sessions.find((s) => s.id === id);
      if (!session) return prev;
      return { ...prev, activeIds: { ...prev.activeIds, [session.cwd]: id } };
    });
  }, []);

  const handleInitialized = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, initialized: true } : s)),
    }));
  }, []);

  const handleRenameSession = useCallback((id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, name } : s)),
    }));
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* Render all terminals across all worktrees, keep them mounted */}
      {allSessions.map((session) => {
        const isActive = session.cwd === cwd && activeSessionId === session.id;
        return (
          <div
            key={session.id}
            className={isActive ? 'h-full w-full' : 'invisible absolute inset-0'}
          >
            <ClaudeTerminal
              cwd={session.cwd}
              sessionId={session.id}
              initialized={session.initialized}
              isActive={isActive}
              onInitialized={() => handleInitialized(session.id)}
              onExit={() => handleCloseSession(session.id)}
            />
          </div>
        );
      })}

      {/* Floating session bar - shows only current worktree's sessions */}
      <SessionBar
        sessions={currentWorktreeSessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onCloseSession={handleCloseSession}
        onNewSession={handleNewSession}
        onRenameSession={handleRenameSession}
      />
    </div>
  );
}
