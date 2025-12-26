import { useCallback, useEffect, useMemo, useState } from 'react';
import { matchesKeybinding } from '@/lib/keybinding';
import { BUILTIN_AGENT_IDS, useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { AgentTerminal } from './AgentTerminal';
import { type Session, SessionBar } from './SessionBar';

interface AgentPanelProps {
  repoPath: string; // repository path (workspace identifier)
  cwd: string; // current worktree path
  isActive?: boolean;
  onSwitchWorktree?: (worktreePath: string) => void;
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
  // Handle WSL agent IDs (e.g., 'codex-wsl' -> base is 'codex')
  const isWsl = agentId.endsWith('-wsl');
  const baseId = isWsl ? agentId.slice(0, -4) : agentId;

  // Check if it's a custom agent
  const customAgent = customAgents.find((a) => a.id === baseId);
  const info = customAgent
    ? { name: customAgent.name, command: customAgent.command }
    : AGENT_INFO[baseId] || { name: 'Claude', command: 'claude' };

  return {
    id: crypto.randomUUID(),
    name: info.name,
    agentId,
    agentCommand: info.command,
    initialized: false,
    cwd,
    environment: isWsl ? 'wsl' : 'native',
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
  // Only persist sessions that are:
  // 1. Using agents that support resumption (e.g., claude)
  // 2. Activated (user has pressed Enter at least once)
  const persistableSessions = sessions.filter(
    (s) => RESUMABLE_AGENTS.has(s.agentCommand) && s.activated
  );
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

export function AgentPanel({ repoPath, cwd, isActive = false, onSwitchWorktree }: AgentPanelProps) {
  const { agentSettings, customAgents, agentKeybindings } = useSettingsStore();
  const defaultAgentId = useMemo(() => getDefaultAgentId(agentSettings), [agentSettings]);
  const { setAgentCount, registerAgentCloseHandler } = useWorktreeActivityStore();

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

  // Sync initialized agent session counts to worktree activity store
  useEffect(() => {
    // Group initialized sessions by worktree path and update counts
    const countsByWorktree = new Map<string, number>();
    for (const session of allSessions) {
      if (session.initialized) {
        countsByWorktree.set(session.cwd, (countsByWorktree.get(session.cwd) || 0) + 1);
      }
    }
    for (const [worktreePath, count] of countsByWorktree) {
      setAgentCount(worktreePath, count);
    }
  }, [allSessions, setAgentCount]);

  // Register close handler for external close requests
  useEffect(() => {
    const handleCloseAll = (worktreePath: string) => {
      setState((prev) => {
        // Close all initialized sessions for this worktree
        const initializedSessions = prev.sessions.filter(
          (s) => s.cwd === worktreePath && s.initialized
        );
        if (initializedSessions.length === 0) return prev;

        // Keep uninitialized sessions, remove initialized ones
        const newSessions = prev.sessions.filter((s) => s.cwd !== worktreePath || !s.initialized);
        const newActiveIds = { ...prev.activeIds };

        // Update active id if needed
        const remainingForWorktree = newSessions.filter((s) => s.cwd === worktreePath);
        if (remainingForWorktree.length > 0) {
          newActiveIds[worktreePath] = remainingForWorktree[0].id;
        } else {
          // Create a new empty session only if no sessions remain
          const newSession = createSession(worktreePath, defaultAgentId, customAgents);
          // Explicitly set count to 0 since new session is not initialized
          setAgentCount(worktreePath, 0);
          return {
            sessions: [...newSessions, newSession],
            activeIds: { ...newActiveIds, [worktreePath]: newSession.id },
          };
        }

        // Explicitly set count to 0 since we removed all initialized sessions
        setAgentCount(worktreePath, 0);
        return { sessions: newSessions, activeIds: newActiveIds };
      });
    };

    return registerAgentCloseHandler(handleCloseAll);
  }, [registerAgentCloseHandler, defaultAgentId, customAgents, setAgentCount]);

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

  // 监听通知点击，激活对应 session 并切换 worktree
  useEffect(() => {
    const unsubscribe = window.electronAPI.notification.onClick((sessionId) => {
      const session = state.sessions.find((s) => s.id === sessionId);
      if (session && session.cwd !== cwd && onSwitchWorktree) {
        onSwitchWorktree(session.cwd);
      }
      handleSelectSession(sessionId);
    });
    return unsubscribe;
  }, [handleSelectSession, state.sessions, cwd, onSwitchWorktree]);

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

  const handleActivated = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, activated: true } : s)),
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
      // Handle WSL agent IDs (e.g., 'codex-wsl' -> base is 'codex')
      const isWsl = agentId.endsWith('-wsl');
      const baseId = isWsl ? agentId.slice(0, -4) : agentId;

      // Get agent name for display
      const customAgent = customAgents.find((a) => a.id === baseId);
      const name = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? 'Agent';

      const newSession: Session = {
        id: crypto.randomUUID(),
        name,
        agentId,
        agentCommand,
        initialized: false,
        cwd,
        environment: isWsl ? 'wsl' : 'native',
      };

      setState((prev) => ({
        sessions: [...prev.sessions, newSession],
        activeIds: { ...prev.activeIds, [cwd]: newSession.id },
      }));
    },
    [cwd, customAgents]
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
              environment={session.environment || 'native'}
              initialized={session.initialized}
              activated={session.activated}
              isActive={isSessionActive}
              onInitialized={() => handleInitialized(session.id)}
              onActivated={() => handleActivated(session.id)}
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
