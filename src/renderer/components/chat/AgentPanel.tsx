import { Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizePath, pathsEqual } from '@/App/storage';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { matchesKeybinding } from '@/lib/keybinding';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
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

// Agent display names and commands
const AGENT_INFO: Record<string, { name: string; command: string }> = {
  claude: { name: 'Claude', command: 'claude' },
  codex: { name: 'Codex', command: 'codex' },
  droid: { name: 'Droid', command: 'droid' },
  gemini: { name: 'Gemini', command: 'gemini' },
  auggie: { name: 'Auggie', command: 'auggie' },
  cursor: { name: 'Cursor', command: 'cursor-agent' },
  opencode: { name: 'OpenCode', command: 'opencode' },
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
  repoPath: string,
  cwd: string,
  agentId: string,
  customAgents: Array<{ id: string; name: string; command: string }>,
  agentSettings: Record<
    string,
    { enabled: boolean; isDefault: boolean; customPath?: string; customArgs?: string }
  >
): Session {
  // Handle Hapi and Happy agent IDs
  // e.g., 'claude-hapi' -> base is 'claude', 'claude-happy' -> base is 'claude'
  const isHapi = agentId.endsWith('-hapi');
  const isHappy = agentId.endsWith('-happy');
  const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

  // Check if it's a custom agent
  const customAgent = customAgents.find((a) => a.id === baseId);
  const info = customAgent
    ? { name: customAgent.name, command: customAgent.command }
    : AGENT_INFO[baseId] || { name: 'Claude', command: 'claude' };

  // Build display name with environment suffix
  const displayName = isHapi ? `${info.name} (Hapi)` : isHappy ? `${info.name} (Happy)` : info.name;

  // Determine environment
  const environment = isHapi ? 'hapi' : isHappy ? 'happy' : 'native';

  // Get custom path and args from settings (for builtin agents)
  const agentConfig = agentSettings[baseId];
  const customPath = agentConfig?.customPath;
  const customArgs = agentConfig?.customArgs;

  return {
    id: crypto.randomUUID(),
    name: displayName,
    agentId,
    agentCommand: info.command,
    customPath,
    customArgs,
    initialized: false,
    repoPath,
    cwd,
    environment,
  };
}

export function AgentPanel({ repoPath, cwd, isActive = false, onSwitchWorktree }: AgentPanelProps) {
  const { t } = useI18n();
  const { agentSettings, agentDetectionStatus, customAgents, agentKeybindings, hapiSettings } =
    useSettingsStore();
  const defaultAgentId = useMemo(() => getDefaultAgentId(agentSettings), [agentSettings]);
  const { setAgentCount, registerAgentCloseHandler } = useWorktreeActivityStore();

  // Use zustand store for sessions - state persists even when component unmounts
  const allSessions = useAgentSessionsStore((state) => state.sessions);
  const activeIds = useAgentSessionsStore((state) => state.activeIds);
  const addSession = useAgentSessionsStore((state) => state.addSession);
  const removeSession = useAgentSessionsStore((state) => state.removeSession);
  const updateSession = useAgentSessionsStore((state) => state.updateSession);
  const setActiveId = useAgentSessionsStore((state) => state.setActiveId);
  const reorderSessions = useAgentSessionsStore((state) => state.reorderSessions);

  // Get current worktree's active session id (fallback to first session if not set)
  const activeSessionId = useMemo(() => {
    const activeId = activeIds[normalizePath(cwd)];
    if (activeId) {
      // Verify the session exists and matches repoPath
      const session = allSessions.find((s) => s.id === activeId);
      if (session && session.repoPath === repoPath) {
        return activeId;
      }
    }
    // Fallback to first session for this repo+cwd
    const firstSession = allSessions.find((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd));
    return firstSession?.id || null;
  }, [activeIds, allSessions, repoPath, cwd]);

  // Filter sessions for current repo+worktree (for SessionBar display, sorted by displayOrder)
  const currentWorktreeSessions = useMemo(() => {
    return allSessions
      .filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [allSessions, repoPath, cwd]);

  // Empty state agent menu
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());

  // Build installed agents set from persisted detection status
  useEffect(() => {
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    const newInstalled = new Set<string>();

    for (const agentId of enabledAgentIds) {
      // Handle Hapi agents: check if base CLI is detected as installed
      if (agentId.endsWith('-hapi')) {
        if (!hapiSettings.enabled) continue;
        const baseId = agentId.slice(0, -5);
        if (agentDetectionStatus[baseId]?.installed) {
          newInstalled.add(agentId);
        }
        continue;
      }

      // Handle Happy agents: check if base CLI is detected as installed
      if (agentId.endsWith('-happy')) {
        const baseId = agentId.slice(0, -6);
        if (agentDetectionStatus[baseId]?.installed) {
          newInstalled.add(agentId);
        }
        continue;
      }

      // Regular agents: use persisted detection status
      if (agentDetectionStatus[agentId]?.installed) {
        newInstalled.add(agentId);
      }
    }

    setInstalledAgents(newInstalled);
  }, [agentSettings, agentDetectionStatus, hapiSettings.enabled]);

  // Filter to only enabled AND installed agents
  const enabledAgents = useMemo(() => {
    return Object.keys(agentSettings).filter((id) => {
      if (!agentSettings[id]?.enabled || !installedAgents.has(id)) return false;
      if (id.endsWith('-hapi') && !hapiSettings.enabled) return false;
      return true;
    });
  }, [agentSettings, installedAgents, hapiSettings.enabled]);

  // Sync initialized agent session counts to worktree activity store
  useEffect(() => {
    // Always set current worktree count (even if 0)
    if (cwd) {
      const count = allSessions.filter((s) => s.cwd === cwd && s.initialized).length;
      setAgentCount(cwd, count);
    }
  }, [allSessions, cwd, setAgentCount]);

  // Register close handler for external close requests
  useEffect(() => {
    const handleCloseAll = (worktreePath: string) => {
      // Close all initialized sessions for this worktree
      const initializedSessions = allSessions.filter(
        (s) => s.cwd === worktreePath && s.initialized
      );
      if (initializedSessions.length === 0) return;

      // Remove initialized sessions
      for (const session of initializedSessions) {
        removeSession(session.id);
      }

      // Set count to 0
      setAgentCount(worktreePath, 0);
    };

    return registerAgentCloseHandler(handleCloseAll);
  }, [registerAgentCloseHandler, setAgentCount, allSessions, removeSession]);

  const handleNewSession = useCallback(() => {
    const newSession = createSession(repoPath, cwd, defaultAgentId, customAgents, agentSettings);
    addSession(newSession);
  }, [repoPath, cwd, defaultAgentId, customAgents, agentSettings, addSession]);

  const handleCloseSession = useCallback(
    (id: string) => {
      const session = allSessions.find((s) => s.id === id);
      if (!session) return;

      const sessionRepoPath = session.repoPath;
      const worktreeCwd = session.cwd;

      // Remove the session
      removeSession(id);

      // Check remaining sessions for this worktree
      const remainingInWorktree = allSessions.filter(
        (s) => s.id !== id && s.repoPath === sessionRepoPath && pathsEqual(s.cwd, worktreeCwd)
      );

      // If closing active session, switch to another if available
      if (activeIds[normalizePath(worktreeCwd)] === id && remainingInWorktree.length > 0) {
        const closedIndex = allSessions
          .filter((s) => s.repoPath === sessionRepoPath && pathsEqual(s.cwd, worktreeCwd))
          .findIndex((s) => s.id === id);
        const newActiveIndex = Math.min(closedIndex, remainingInWorktree.length - 1);
        setActiveId(worktreeCwd, remainingInWorktree[newActiveIndex].id);
      }
    },
    [allSessions, activeIds, removeSession, setActiveId]
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      const session = allSessions.find((s) => s.id === id);
      if (!session) return;
      setActiveId(session.cwd, id);
    },
    [allSessions, setActiveId]
  );

  // 监听通知点击，激活对应 session 并切换 worktree
  useEffect(() => {
    const unsubscribe = window.electronAPI.notification.onClick((sessionId) => {
      const session = allSessions.find((s) => s.id === sessionId);
      if (session && !pathsEqual(session.cwd, cwd) && onSwitchWorktree) {
        onSwitchWorktree(session.cwd);
      }
      handleSelectSession(sessionId);
    });
    return unsubscribe;
  }, [handleSelectSession, allSessions, cwd, onSwitchWorktree]);

  // 监听 code review 继续对话请求
  const pendingSessionId = useCodeReviewContinueStore((s) => s.pendingSessionId);
  const clearContinueRequest = useCodeReviewContinueStore((s) => s.clearRequest);

  useEffect(() => {
    if (pendingSessionId && cwd) {
      // 创建新 session 继续 code review 对话
      const newSession: Session = {
        id: pendingSessionId, // 使用 code review 的 sessionId
        name: 'Code Review',
        agentId: 'claude',
        agentCommand: 'claude',
        initialized: true, // 已初始化，使用 --resume
        repoPath,
        cwd,
        environment: 'native',
      };
      addSession(newSession);
      clearContinueRequest();
    }
  }, [pendingSessionId, cwd, repoPath, addSession, clearContinueRequest]);

  const handleNextSession = useCallback(() => {
    const sessions = allSessions.filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd));
    if (sessions.length <= 1) return;
    const currentIndex = sessions.findIndex((s) => s.id === activeIds[normalizePath(cwd)]);
    const nextIndex = (currentIndex + 1) % sessions.length;
    setActiveId(cwd, sessions[nextIndex].id);
  }, [allSessions, repoPath, cwd, activeIds, setActiveId]);

  const handlePrevSession = useCallback(() => {
    const sessions = allSessions.filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd));
    if (sessions.length <= 1) return;
    const currentIndex = sessions.findIndex((s) => s.id === activeIds[normalizePath(cwd)]);
    const prevIndex = currentIndex <= 0 ? sessions.length - 1 : currentIndex - 1;
    setActiveId(cwd, sessions[prevIndex].id);
  }, [allSessions, repoPath, cwd, activeIds, setActiveId]);

  const handleInitialized = useCallback(
    (id: string) => {
      updateSession(id, { initialized: true });
    },
    [updateSession]
  );

  const handleActivated = useCallback(
    (id: string) => {
      updateSession(id, { activated: true });
    },
    [updateSession]
  );

  const handleRenameSession = useCallback(
    (id: string, name: string) => {
      updateSession(id, { name });
    },
    [updateSession]
  );

  const handleReorderSessions = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderSessions(repoPath, cwd, fromIndex, toIndex);
    },
    [reorderSessions, repoPath, cwd]
  );

  const handleNewSessionWithAgent = useCallback(
    (agentId: string, agentCommand: string) => {
      // Handle Hapi and Happy agent IDs
      const isHapi = agentId.endsWith('-hapi');
      const isHappy = agentId.endsWith('-happy');
      const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

      // Get agent name for display
      const customAgent = customAgents.find((a) => a.id === baseId);
      const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? 'Agent';
      const name = isHapi ? `${baseName} (Hapi)` : isHappy ? `${baseName} (Happy)` : baseName;

      // Determine environment
      const environment = isHapi ? 'hapi' : isHappy ? 'happy' : 'native';

      // Get custom path and args from settings (for builtin agents)
      const agentConfig = agentSettings[baseId];
      const customPath = agentConfig?.customPath;
      const customArgs = agentConfig?.customArgs;

      const newSession: Session = {
        id: crypto.randomUUID(),
        name,
        agentId,
        agentCommand,
        customPath,
        customArgs,
        initialized: false,
        repoPath,
        cwd,
        environment,
      };

      addSession(newSession);
    },
    [repoPath, cwd, customAgents, agentSettings, addSession]
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
        const sessions = allSessions.filter((s) => s.repoPath === repoPath && s.cwd === cwd);
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
    repoPath,
    cwd,
    handleSelectSession,
  ]);

  // Check if current worktree has no sessions
  const hasNoCurrentSessions = currentWorktreeSessions.length === 0;

  return (
    <div className="relative h-full w-full">
      {/* Render all terminals across all repos/worktrees, keep them mounted */}
      {/* Use opacity-0 instead of invisible to avoid WebGL rendering artifacts */}
      {allSessions.map((session) => {
        const isSessionActive =
          session.repoPath === repoPath && session.cwd === cwd && activeSessionId === session.id;
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
              customPath={session.customPath}
              customArgs={session.customArgs}
              environment={session.environment || 'native'}
              initialized={session.initialized}
              activated={session.activated}
              isActive={isActive && isSessionActive}
              onInitialized={() => handleInitialized(session.id)}
              onActivated={() => handleActivated(session.id)}
              onExit={() => handleCloseSession(session.id)}
            />
          </div>
        );
      })}

      {/* Empty state overlay when current worktree has no sessions */}
      {hasNoCurrentSessions && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-background">
          <Sparkles className="h-12 w-12 opacity-50" />
          <p className="text-sm">{t('No agent sessions')}</p>
          <div
            className="relative"
            onMouseEnter={() => setShowAgentMenu(true)}
            onMouseLeave={() => setShowAgentMenu(false)}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleNewSession();
                setShowAgentMenu(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('New Session')}
            </Button>
            {showAgentMenu && enabledAgents.length > 0 && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full pt-1 z-50 min-w-40">
                <div className="rounded-lg border bg-popover p-1 shadow-lg">
                  <div className="px-2 py-1 text-xs text-muted-foreground">{t('Select Agent')}</div>
                  {enabledAgents.map((agentId) => {
                    const isHapi = agentId.endsWith('-hapi');
                    const isHappy = agentId.endsWith('-happy');
                    const baseId = isHapi
                      ? agentId.slice(0, -5)
                      : isHappy
                        ? agentId.slice(0, -6)
                        : agentId;
                    const customAgent = customAgents.find((a) => a.id === baseId);
                    const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? baseId;
                    const name = isHapi
                      ? `${baseName} (Hapi)`
                      : isHappy
                        ? `${baseName} (Happy)`
                        : baseName;
                    const isDefault = agentSettings[agentId]?.isDefault;
                    return (
                      <button
                        type="button"
                        key={agentId}
                        onClick={() => {
                          handleNewSessionWithAgent(
                            agentId,
                            customAgent?.command ?? AGENT_INFO[baseId]?.command ?? 'claude'
                          );
                          setShowAgentMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <span>{name}</span>
                        {isDefault && (
                          <span className="text-xs text-muted-foreground">{t('(default)')}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating session bar - shows only current worktree's sessions */}
      {!hasNoCurrentSessions && (
        <SessionBar
          sessions={currentWorktreeSessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onCloseSession={handleCloseSession}
          onNewSession={handleNewSession}
          onNewSessionWithAgent={handleNewSessionWithAgent}
          onRenameSession={handleRenameSession}
          onReorderSessions={handleReorderSessions}
        />
      )}
    </div>
  );
}
