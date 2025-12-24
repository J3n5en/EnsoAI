import { useCallback, useEffect, useMemo, useState } from 'react';
import { BUILTIN_AGENT_IDS, useSettingsStore } from '@/stores/settings';
import { AgentTerminal } from './AgentTerminal';
import { type Session, SessionBar } from './SessionBar';

interface AgentPanelProps {
  repoPath: string; // repository path (workspace identifier)
  cwd: string; // current worktree path
  isActive?: boolean;
}

const SESSIONS_STORAGE_PREFIX = 'enso-chat-sessions:';

// Agent display names and commands
const AGENT_INFO: Record<string, { name: string; command: string }> = {
  claude: { name: 'Claude', command: 'claude' },
  codex: { name: 'Codex', command: 'codex' },
  droid: { name: 'Droid', command: 'droid' },
  gemini: { name: 'Gemini', command: 'gemini' },
  auggie: { name: 'Auggie', command: 'auggie' },
  cursor: { name: 'Cursor', command: 'cursor-agent' },
};

function getDefaultAgentId(
  agentSettings: Record<string, { enabled: boolean; isDefault: boolean }>
): string {
  // Find the default agent
  for (const [id, config] of Object.entries(agentSettings)) {
    if (config.isDefault && config.enabled) {
      return id;
    }
  }
  // Fallback to first enabled builtin agent
  for (const id of BUILTIN_AGENT_IDS) {
    if (agentSettings[id]?.enabled) {
      return id;
    }
  }
  // Ultimate fallback
  return 'claude';
}

function createSession(
  cwd: string,
  agentId: string,
  customAgents: Array<{ id: string; name: string; command: string }>
): Session {
  // Check if it's a custom agent
  const customAgent = customAgents.find((a) => a.id === agentId);
  const info = customAgent
    ? { name: customAgent.name, command: customAgent.command }
    : AGENT_INFO[agentId] || { name: 'Claude', command: 'claude' };

  return {
    id: crypto.randomUUID(),
    name: info.name,
    agentId,
    agentCommand: info.command,
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

// Agents that support session persistence
const RESUMABLE_AGENTS = new Set(['claude']);

function saveSessions(
  repoPath: string,
  sessions: Session[],
  activeIds: Record<string, string | null>
): void {
  // Only persist sessions for agents that support resumption
  const persistableSessions = sessions.filter((s) => RESUMABLE_AGENTS.has(s.agentCommand));
  const persistableIds = new Set(persistableSessions.map((s) => s.id));
  // Only keep activeIds that reference persistable sessions
  const persistableActiveIds: Record<string, string | null> = {};
  for (const [cwd, id] of Object.entries(activeIds)) {
    persistableActiveIds[cwd] = id && persistableIds.has(id) ? id : null;
  }
  localStorage.setItem(
    SESSIONS_STORAGE_PREFIX + repoPath,
    JSON.stringify({ sessions: persistableSessions, activeIds: persistableActiveIds })
  );
}

export function AgentPanel({ repoPath, cwd, isActive = false }: AgentPanelProps) {
  const { agentSettings, customAgents, agentKeybindings } = useSettingsStore();
  const defaultAgentId = useMemo(() => getDefaultAgentId(agentSettings), [agentSettings]);

  const [state, setState] = useState(() => {
    const loaded = loadSessions(repoPath);
    // Create initial session for current worktree if none exists
    const hasSessionForCwd = loaded.sessions.some((s) => s.cwd === cwd);
    if (!hasSessionForCwd && cwd) {
      const agentId = getDefaultAgentId(agentSettings);
      const newSession = createSession(cwd, agentId, customAgents);
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
        const newSession = createSession(cwd, defaultAgentId, customAgents);
        return {
          sessions: [...prev.sessions, newSession],
          activeIds: { ...prev.activeIds, [cwd]: newSession.id },
        };
      });
    }
  }, [cwd, currentWorktreeSessions.length, defaultAgentId, customAgents]);

  // Persist sessions on change
  useEffect(() => {
    saveSessions(repoPath, allSessions, activeIds);
  }, [repoPath, allSessions, activeIds]);

  const handleNewSession = useCallback(() => {
    const newSession = createSession(cwd, defaultAgentId, customAgents);
    setState((prev) => ({
      sessions: [...prev.sessions, newSession],
      activeIds: { ...prev.activeIds, [cwd]: newSession.id },
    }));
  }, [cwd, defaultAgentId, customAgents]);

  const handleCloseSession = useCallback(
    (id: string) => {
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
            const newSession = createSession(worktreeCwd, defaultAgentId, customAgents);
            return {
              sessions: [...newSessions, newSession],
              activeIds: { ...newActiveIds, [worktreeCwd]: newSession.id },
            };
          }
        }

        return { sessions: newSessions, activeIds: newActiveIds };
      });
    },
    [defaultAgentId, customAgents]
  );

  const handleSelectSession = useCallback((id: string) => {
    setState((prev) => {
      const session = prev.sessions.find((s) => s.id === id);
      if (!session) return prev;
      return { ...prev, activeIds: { ...prev.activeIds, [session.cwd]: id } };
    });
  }, []);

  const handleNextSession = useCallback(() => {
    setState((prev) => {
      const sessions = prev.sessions.filter((s) => s.cwd === cwd);
      if (sessions.length <= 1) return prev;
      const currentIndex = sessions.findIndex((s) => s.id === prev.activeIds[cwd]);
      const nextIndex = (currentIndex + 1) % sessions.length;
      return { ...prev, activeIds: { ...prev.activeIds, [cwd]: sessions[nextIndex].id } };
    });
  }, [cwd]);

  const handlePrevSession = useCallback(() => {
    setState((prev) => {
      const sessions = prev.sessions.filter((s) => s.cwd === cwd);
      if (sessions.length <= 1) return prev;
      const currentIndex = sessions.findIndex((s) => s.id === prev.activeIds[cwd]);
      const prevIndex = currentIndex <= 0 ? sessions.length - 1 : currentIndex - 1;
      return { ...prev, activeIds: { ...prev.activeIds, [cwd]: sessions[prevIndex].id } };
    });
  }, [cwd]);

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

  const handleNewSessionWithAgent = useCallback(
    (agentId: string, agentCommand: string) => {
      // Get agent name for display
      const customAgent = customAgents.find((a) => a.id === agentId);
      const name = customAgent?.name ?? AGENT_INFO[agentId]?.name ?? 'Agent';

      const newSession: Session = {
        id: crypto.randomUUID(),
        name,
        agentId,
        agentCommand,
        initialized: false,
        cwd,
      };

      setState((prev) => ({
        sessions: [...prev.sessions, newSession],
        activeIds: { ...prev.activeIds, [cwd]: newSession.id },
      }));
    },
    [cwd, customAgents]
  );

  // Check if a keyboard event matches a keybinding
  const matchesKeybinding = useCallback(
    (
      e: KeyboardEvent,
      binding: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }
    ) => {
      const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase();
      const ctrlMatch = binding.ctrl !== undefined ? e.ctrlKey === binding.ctrl : true;
      const altMatch = binding.alt !== undefined ? e.altKey === binding.alt : true;
      const shiftMatch = binding.shift !== undefined ? e.shiftKey === binding.shift : true;
      const metaMatch = binding.meta !== undefined ? e.metaKey === binding.meta : true;

      return keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;
    },
    []
  );

  // Agent session keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      // New session
      if (matchesKeybinding(e, agentKeybindings.newSession)) {
        e.preventDefault();
        handleNewSession();
        return;
      }

      // Close session
      if (matchesKeybinding(e, agentKeybindings.closeSession)) {
        e.preventDefault();
        if (activeSessionId) {
          handleCloseSession(activeSessionId);
        }
        return;
      }

      // Next session
      if (matchesKeybinding(e, agentKeybindings.nextSession)) {
        e.preventDefault();
        handleNextSession();
        return;
      }

      // Prev session
      if (matchesKeybinding(e, agentKeybindings.prevSession)) {
        e.preventDefault();
        handlePrevSession();
        return;
      }

      // Bonus: Cmd/Win+1-9 to switch to specific session (if not intercepted by main tab)
      if (e.metaKey && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const sessions = allSessions.filter((s) => s.cwd === cwd);
        const index = Number.parseInt(e.key, 10) - 1;
        if (index < sessions.length) {
          e.preventDefault();
          handleSelectSession(sessions[index].id);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    activeSessionId,
    agentKeybindings,
    matchesKeybinding,
    handleNewSession,
    handleCloseSession,
    handleNextSession,
    handlePrevSession,
    allSessions,
    cwd,
    handleSelectSession,
  ]);

  return (
    <div className="relative h-full w-full">
      {/* Render all terminals across all worktrees, keep them mounted */}
      {/* Use opacity-0 instead of invisible to avoid WebGL rendering artifacts */}
      {allSessions.map((session) => {
        const isSessionActive = session.cwd === cwd && activeSessionId === session.id;
        return (
          <div
            key={session.id}
            className={
              isSessionActive ? 'h-full w-full' : 'absolute inset-0 opacity-0 pointer-events-none'
            }
          >
            <AgentTerminal
              cwd={session.cwd}
              sessionId={session.id}
              agentCommand={session.agentCommand || 'claude'}
              initialized={session.initialized}
              isActive={isSessionActive}
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
        onNewSessionWithAgent={handleNewSessionWithAgent}
        onRenameSession={handleRenameSession}
      />
    </div>
  );
}
