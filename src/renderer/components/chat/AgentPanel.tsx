import type { AIProvider } from '@shared/types';
import { Plus, Settings, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEMP_REPO_ID } from '@/App/constants';
import { normalizePath, pathsEqual } from '@/App/storage';
import { ResizeHandle } from '@/components/terminal/ResizeHandle';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { initAgentStatusListener } from '@/stores/agentStatus';
import { useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
import { BUILTIN_AGENT_IDS, useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { AgentGroup } from './AgentGroup';
import { AgentTerminal } from './AgentTerminal';
import { QuickTerminalModal } from './QuickTerminalModal';
import type { Session } from './SessionBar';
import { StatusLine } from './StatusLine';
import type { AgentGroupState, AgentGroup as AgentGroupType } from './types';
import { createInitialGroupState } from './types';

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
  const panelRef = useRef<HTMLDivElement>(null); // 容器引用
  const {
    agentSettings,
    agentDetectionStatus,
    customAgents,
    xtermKeybindings,
    hapiSettings,
    autoCreateSessionOnActivate,
    autoCreateSessionOnTempActivate,
    claudeCodeIntegration,
    terminalTheme,
  } = useSettingsStore();
  // 添加 ?? true 回退，兼容老用户可能没有 enabled 字段的情况
  const quickTerminalEnabled = useSettingsStore((s) => s.quickTerminal.enabled ?? true);
  const quickTerminalOpen = useSettingsStore((s) => s.quickTerminal.isOpen);
  const setQuickTerminalOpen = useSettingsStore((s) => s.setQuickTerminalOpen);
  const { getQuickTerminalSession, setQuickTerminalSession, removeQuickTerminalSession } =
    useTerminalStore();
  const currentQuickTerminalSession = getQuickTerminalSession(cwd);

  // 用于强制重新创建 QuickTerminalModal 的 key
  // 当功能被禁用再启用时递增，确保创建全新的 terminal
  const [quickTerminalMountKey, setQuickTerminalMountKey] = useState(0);
  const prevQuickTerminalEnabled = useRef(quickTerminalEnabled);
  useEffect(() => {
    if (quickTerminalEnabled && !prevQuickTerminalEnabled.current) {
      // 功能从禁用变为启用，递增 key 强制重新创建
      setQuickTerminalMountKey((k) => k + 1);
    }
    if (!quickTerminalEnabled && prevQuickTerminalEnabled.current) {
      // 功能从启用变为禁用，清理 session
      if (currentQuickTerminalSession) {
        window.electronAPI.terminal.destroy(currentQuickTerminalSession).catch(console.error);
      }
      removeQuickTerminalSession(cwd);
      setQuickTerminalOpen(false);
    }
    prevQuickTerminalEnabled.current = quickTerminalEnabled;
  }, [
    quickTerminalEnabled,
    cwd,
    currentQuickTerminalSession,
    removeQuickTerminalSession,
    setQuickTerminalOpen,
  ]);

  const bgImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const terminalBgColor = useMemo(() => {
    if (bgImageEnabled) return 'transparent';
    return getXtermTheme(terminalTheme)?.background ?? defaultDarkTheme.background;
  }, [terminalTheme, bgImageEnabled]);
  const statusLineEnabled = claudeCodeIntegration.statusLineEnabled;
  const defaultAgentId = useMemo(() => getDefaultAgentId(agentSettings), [agentSettings]);
  const { setAgentCount, registerAgentCloseHandler } = useWorktreeActivityStore();

  const [hasRunningProcess, setHasRunningProcess] = useState(false);

  const handleToggleQuickTerminal = useCallback(() => {
    setQuickTerminalOpen(!quickTerminalOpen);
  }, [quickTerminalOpen, setQuickTerminalOpen]);

  const handleQuickTerminalSessionInit = useCallback(
    (sessionId: string) => {
      // 总是更新 session，覆盖可能存在的旧记录（对应已销毁的 PTY）
      setQuickTerminalSession(cwd, sessionId);
    },
    [cwd, setQuickTerminalSession]
  );

  const handleCloseQuickTerminal = useCallback(() => {
    // 关闭 modal
    setQuickTerminalOpen(false);

    // 清除 session 记录（PTY 由 ShellTerminal 组件卸载时的 cleanup 销毁，这里不要重复调用 destroy）
    if (currentQuickTerminalSession) {
      removeQuickTerminalSession(cwd);
    }
  }, [currentQuickTerminalSession, cwd, setQuickTerminalOpen, removeQuickTerminalSession]);

  // 监听终端会话状态
  useEffect(() => {
    // 只要有 session 存在就认为是 active（有 PTY 在运行）
    setHasRunningProcess(!!currentQuickTerminalSession);
  }, [currentQuickTerminalSession]);

  // Global session IDs to keep terminals mounted across group moves
  const [globalSessionIds, setGlobalSessionIds] = useState<Set<string>>(new Set());

  const [statusLineHeight, setStatusLineHeight] = useState(0);

  useEffect(() => {
    if (!statusLineEnabled) {
      setStatusLineHeight(0);
    }
  }, [statusLineEnabled]);

  // Use zustand store for sessions and group states - state persists even when component unmounts
  const allSessions = useAgentSessionsStore((state) => state.sessions);
  const addSession = useAgentSessionsStore((state) => state.addSession);
  const removeSession = useAgentSessionsStore((state) => state.removeSession);
  const updateSession = useAgentSessionsStore((state) => state.updateSession);
  const setActiveId = useAgentSessionsStore((state) => state.setActiveId);

  // Group states from store (persists across component remounts)
  const worktreeGroupStates = useAgentSessionsStore((state) => state.groupStates);
  const setGroupState = useAgentSessionsStore((state) => state.setGroupState);
  const updateGroupState = useAgentSessionsStore((state) => state.updateGroupState);
  const removeGroupState = useAgentSessionsStore((state) => state.removeGroupState);

  // Get current worktree's group state
  const currentGroupState = useMemo(() => {
    if (!cwd) return createInitialGroupState();
    const normalizedCwd = normalizePath(cwd);
    return worktreeGroupStates[normalizedCwd] || createInitialGroupState();
  }, [cwd, worktreeGroupStates]);

  const { groups, activeGroupId } = currentGroupState;

  // Update group state helper - uses store instead of local state
  const updateCurrentGroupState = useCallback(
    (updater: (state: AgentGroupState) => AgentGroupState) => {
      if (!cwd) return;
      updateGroupState(cwd, updater);
    },
    [cwd, updateGroupState]
  );

  // Filter sessions for current repo+worktree (for SessionBar display, sorted by displayOrder)
  const currentWorktreeSessions = useMemo(() => {
    return allSessions
      .filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [allSessions, repoPath, cwd]);

  // Sync activeIds from store to group state when changed externally (e.g., from RunningProjectsPopover)
  useEffect(() => {
    if (!cwd || groups.length === 0) return;

    const normalizedCwd = normalizePath(cwd);
    const unsubscribe = useAgentSessionsStore.subscribe(
      (state) => state.activeIds[normalizedCwd],
      (storeActiveId) => {
        if (!storeActiveId) return;

        // Find which group contains this session
        const targetGroup = groups.find((g) => g.sessionIds.includes(storeActiveId));
        if (!targetGroup) return;

        // Only update if different from current group's activeSessionId
        if (targetGroup.activeSessionId !== storeActiveId) {
          updateCurrentGroupState((state) => ({
            ...state,
            groups: state.groups.map((g) =>
              g.id === targetGroup.id ? { ...g, activeSessionId: storeActiveId } : g
            ),
            activeGroupId: targetGroup.id,
          }));
        }
      }
    );

    return unsubscribe;
  }, [cwd, groups, updateCurrentGroupState]);

  // Empty state agent menu
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());

  // Build installed agents set from persisted detection status
  useEffect(() => {
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    const newInstalled = new Set<string>();

    for (const agentId of enabledAgentIds) {
      // Default agent is always considered installed (no detection needed)
      // This ensures the default agent shows in menu even if user never ran detection
      if (agentSettings[agentId]?.isDefault) {
        newInstalled.add(agentId);
        continue;
      }

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

  // Listen for code review continue conversation request
  const pendingContinueSessionId = useCodeReviewContinueStore(
    (s) => s.continueConversation.sessionId
  );
  const pendingContinueProvider = useCodeReviewContinueStore(
    (s) => s.continueConversation.provider
  );
  const clearContinueRequest = useCodeReviewContinueStore((s) => s.clearContinueRequest);

  // Map AI provider (code review) to agent id for "Continue Conversation"
  const continueAgentId = useMemo(() => {
    const map: Record<AIProvider, string> = {
      'claude-code': 'claude',
      'codex-cli': 'codex',
      'cursor-cli': 'cursor',
      'gemini-cli': 'gemini',
    };
    return pendingContinueProvider != null ? (map[pendingContinueProvider] ?? 'claude') : 'claude';
  }, [pendingContinueProvider]);

  useEffect(() => {
    if (pendingContinueSessionId && cwd) {
      const info = AGENT_INFO[continueAgentId] ?? { name: 'Claude', command: 'claude' };
      const newSession: Session = {
        id: crypto.randomUUID(), // Generate new session ID
        sessionId: pendingContinueSessionId, // Use code review's sessionId for --resume
        name: 'Code Review',
        agentId: continueAgentId,
        agentCommand: info.command,
        repoPath,
        cwd,
        initialized: true, // Mark as initialized to use --resume
        environment: 'native',
      };

      addSession(newSession);

      updateCurrentGroupState((state) => {
        const groupId = state.activeGroupId || state.groups[0]?.id;
        if (!groupId) {
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [newSession.id],
            activeSessionId: newSession.id,
          };
          return {
            groups: [newGroup],
            activeGroupId: newGroup.id,
            flexPercents: [100],
          };
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  sessionIds: [...g.sessionIds, newSession.id],
                  activeSessionId: newSession.id,
                }
              : g
          ),
        };
      });

      setActiveId(cwd, newSession.id);
      clearContinueRequest();
    }
  }, [
    pendingContinueSessionId,
    continueAgentId,
    cwd,
    repoPath,
    addSession,
    updateCurrentGroupState,
    setActiveId,
    clearContinueRequest,
  ]);

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

      // Remove group state for this worktree
      removeGroupState(worktreePath);

      // Set count to 0
      setAgentCount(worktreePath, 0);
    };

    return registerAgentCloseHandler(handleCloseAll);
  }, [registerAgentCloseHandler, setAgentCount, allSessions, removeSession, removeGroupState]);

  // Handle new session in active group
  const handleNewSession = useCallback(
    (targetGroupId?: string) => {
      const newSession = createSession(repoPath, cwd, defaultAgentId, customAgents, agentSettings);
      addSession(newSession);

      // Add session to group
      updateCurrentGroupState((state) => {
        const groupId = targetGroupId || state.activeGroupId || state.groups[0]?.id;
        if (!groupId) {
          // No groups exist - create first group with this session
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [newSession.id],
            activeSessionId: newSession.id,
          };
          return {
            groups: [newGroup],
            activeGroupId: newGroup.id,
            flexPercents: [100],
          };
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  sessionIds: [...g.sessionIds, newSession.id],
                  activeSessionId: newSession.id,
                }
              : g
          ),
        };
      });
    },
    [
      repoPath,
      cwd,
      defaultAgentId,
      customAgents,
      agentSettings,
      addSession,
      updateCurrentGroupState,
    ]
  );

  // Handle close session
  const handleCloseSession = useCallback(
    (id: string, groupId?: string) => {
      const session = allSessions.find((s) => s.id === id);
      if (!session) return;

      // Remove the session from Zustand store
      removeSession(id);

      // Update group state
      updateCurrentGroupState((state) => {
        const targetGroupId = groupId || state.groups.find((g) => g.sessionIds.includes(id))?.id;
        if (!targetGroupId) return state;

        const group = state.groups.find((g) => g.id === targetGroupId);
        if (!group) return state;

        const newSessionIds = group.sessionIds.filter((sid) => sid !== id);

        // If group becomes empty, remove the group
        if (newSessionIds.length === 0) {
          const newGroups = state.groups.filter((g) => g.id !== targetGroupId);

          if (newGroups.length === 0) {
            // All groups empty - reset state
            return createInitialGroupState();
          }

          // Recalculate flex percentages
          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          // Update active group if needed
          let newActiveGroupId = state.activeGroupId;
          if (state.activeGroupId === targetGroupId) {
            const removedIndex = state.groups.findIndex((g) => g.id === targetGroupId);
            const newIndex = Math.min(removedIndex, newGroups.length - 1);
            newActiveGroupId = newGroups[newIndex]?.id || null;
          }

          return {
            groups: newGroups,
            activeGroupId: newActiveGroupId,
            flexPercents: newFlexPercents,
          };
        }

        // Update active session in group if needed
        let newActiveSessionId = group.activeSessionId;
        if (group.activeSessionId === id) {
          const closedIndex = group.sessionIds.indexOf(id);
          const newIndex = Math.min(closedIndex, newSessionIds.length - 1);
          newActiveSessionId = newSessionIds[newIndex];
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === targetGroupId
              ? { ...g, sessionIds: newSessionIds, activeSessionId: newActiveSessionId }
              : g
          ),
        };
      });
    },
    [allSessions, removeSession, updateCurrentGroupState]
  );

  // Handle session selection
  const handleSelectSession = useCallback(
    (id: string, groupId?: string) => {
      setActiveId(cwd, id);

      updateCurrentGroupState((state) => {
        const targetGroupId = groupId || state.groups.find((g) => g.sessionIds.includes(id))?.id;
        if (!targetGroupId) return state;

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === targetGroupId ? { ...g, activeSessionId: id } : g
          ),
          activeGroupId: targetGroupId,
        };
      });
    },
    [cwd, setActiveId, updateCurrentGroupState]
  );

  // Notification payload may carry either UI session id or Claude sessionId.
  const findSessionByNotificationId = useCallback(
    (incomingSessionId: string) =>
      allSessions.find((s) => s.id === incomingSessionId || s.sessionId === incomingSessionId),
    [allSessions]
  );

  // 监听通知点击，激活对应 session 并切换 worktree
  useEffect(() => {
    const unsubscribe = window.electronAPI.notification.onClick((sessionId) => {
      const session = findSessionByNotificationId(sessionId);
      if (session && !pathsEqual(session.cwd, cwd) && onSwitchWorktree) {
        onSwitchWorktree(session.cwd);
      }
      if (session) {
        handleSelectSession(session.id);
      }
    });
    return unsubscribe;
  }, [handleSelectSession, findSessionByNotificationId, cwd, onSwitchWorktree]);

  // 监听 Claude stop hook 通知，精确更新 output state 并发送完成通知
  const setOutputState = useAgentSessionsStore((s) => s.setOutputState);
  useEffect(() => {
    const unsubscribe = window.electronAPI.notification.onAgentStop(({ sessionId }) => {
      const session = findSessionByNotificationId(sessionId);
      if (session) {
        // Check if user is currently viewing this session
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        const isViewingSession =
          activeGroup?.activeSessionId === session.id && pathsEqual(session.cwd, cwd) && isActive;

        // Update output state to idle (will become 'unread' if user is not viewing)
        setOutputState(session.id, 'idle', isViewingSession);

        // Send system notification
        const projectName = session.cwd.split('/').pop() || 'Unknown';
        const agentName = AGENT_INFO[session.agentId]?.name || session.agentCommand;
        // Use terminal title as body, fall back to project name
        const notificationBody = session.terminalTitle || projectName;
        window.electronAPI.notification.show({
          title: t('{{command}} completed', { command: agentName }),
          body: notificationBody,
          sessionId: session.id,
        });
      }
    });
    return unsubscribe;
  }, [findSessionByNotificationId, t, groups, activeGroupId, cwd, isActive, setOutputState]);

  // 监听 Claude AskUserQuestion 通知
  useEffect(() => {
    const unsubscribe = window.electronAPI.notification.onAskUserQuestion(
      ({ sessionId, toolInput }) => {
        const session = findSessionByNotificationId(sessionId);
        if (session) {
          const agentName = AGENT_INFO[session.agentId]?.name || session.agentCommand;

          // Extract first question text if available
          let questionPreview = '需要回答问题';
          if (toolInput && typeof toolInput === 'object' && 'questions' in toolInput) {
            const questions = (toolInput as { questions: Array<{ question: string }> }).questions;
            if (questions?.[0]?.question) {
              questionPreview = questions[0].question;
            }
          }

          window.electronAPI.notification.show({
            title: `${agentName} 等待输入`,
            body: questionPreview,
            sessionId: session.id,
          });
        }
      }
    );
    return unsubscribe;
  }, [findSessionByNotificationId]);

  // 监听 Claude status line 更新
  useEffect(() => {
    const unsubscribe = initAgentStatusListener();
    return unsubscribe;
  }, []);

  const handleNextSession = useCallback(() => {
    const activeGroup = groups.find((g) => g.id === activeGroupId);
    if (!activeGroup || activeGroup.sessionIds.length <= 1) return;

    const currentIndex = activeGroup.sessionIds.indexOf(activeGroup.activeSessionId || '');
    const nextIndex = (currentIndex + 1) % activeGroup.sessionIds.length;
    const nextSessionId = activeGroup.sessionIds[nextIndex];

    setActiveId(cwd, nextSessionId);
    updateCurrentGroupState((state) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === activeGroupId ? { ...g, activeSessionId: nextSessionId } : g
      ),
    }));
  }, [groups, activeGroupId, cwd, setActiveId, updateCurrentGroupState]);

  const handlePrevSession = useCallback(() => {
    const activeGroup = groups.find((g) => g.id === activeGroupId);
    if (!activeGroup || activeGroup.sessionIds.length <= 1) return;

    const currentIndex = activeGroup.sessionIds.indexOf(activeGroup.activeSessionId || '');
    const prevIndex = currentIndex <= 0 ? activeGroup.sessionIds.length - 1 : currentIndex - 1;
    const prevSessionId = activeGroup.sessionIds[prevIndex];

    setActiveId(cwd, prevSessionId);
    updateCurrentGroupState((state) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === activeGroupId ? { ...g, activeSessionId: prevSessionId } : g
      ),
    }));
  }, [groups, activeGroupId, cwd, setActiveId, updateCurrentGroupState]);

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
    (groupId: string, fromIndex: number, toIndex: number) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const newSessionIds = [...group.sessionIds];
      const [removed] = newSessionIds.splice(fromIndex, 1);
      newSessionIds.splice(toIndex, 0, removed);

      // Update group.sessionIds order (immediate visual)
      updateCurrentGroupState((state) => ({
        ...state,
        groups: state.groups.map((g) =>
          g.id === groupId ? { ...g, sessionIds: newSessionIds } : g
        ),
      }));

      // Update displayOrder in store for persistence
      for (let i = 0; i < newSessionIds.length; i++) {
        updateSession(newSessionIds[i], { displayOrder: i });
      }
    },
    [groups, updateCurrentGroupState, updateSession]
  );

  const handleNewSessionWithAgent = useCallback(
    (agentId: string, agentCommand: string, targetGroupId?: string) => {
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

      // Add to target group or active group
      updateCurrentGroupState((state) => {
        const groupId = targetGroupId || state.activeGroupId || state.groups[0]?.id;
        if (!groupId) {
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [newSession.id],
            activeSessionId: newSession.id,
          };
          return {
            groups: [newGroup],
            activeGroupId: newGroup.id,
            flexPercents: [100],
          };
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  sessionIds: [...g.sessionIds, newSession.id],
                  activeSessionId: newSession.id,
                }
              : g
          ),
        };
      });
    },
    [repoPath, cwd, customAgents, agentSettings, addSession, updateCurrentGroupState]
  );

  // Handle group click
  const handleGroupClick = useCallback(
    (groupId: string) => {
      updateCurrentGroupState((state) => ({
        ...state,
        activeGroupId: groupId,
      }));
    },
    [updateCurrentGroupState]
  );

  // Handle split - create new group to the right
  // If source group has multiple sessions, move the active session to new group
  // If source group has only 1 session, create a new session in new group
  const handleSplit = useCallback(
    (fromGroupId: string) => {
      if (!cwd) return;

      updateCurrentGroupState((state) => {
        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex === -1) return state;

        const sourceGroup = state.groups[fromIndex];

        // If source group has multiple sessions, move the active session to new group
        if (sourceGroup.sessionIds.length > 1 && sourceGroup.activeSessionId) {
          const sessionToMove = sourceGroup.activeSessionId;

          // Remove session from source group
          const newSourceSessionIds = sourceGroup.sessionIds.filter((id) => id !== sessionToMove);
          const closedIndex = sourceGroup.sessionIds.indexOf(sessionToMove);
          const newSourceActiveIndex = Math.min(closedIndex, newSourceSessionIds.length - 1);
          const newSourceActiveSessionId = newSourceSessionIds[newSourceActiveIndex] || null;

          // Create new group with the moved session
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [sessionToMove],
            activeSessionId: sessionToMove,
          };

          const newGroups = state.groups.map((g) =>
            g.id === fromGroupId
              ? { ...g, sessionIds: newSourceSessionIds, activeSessionId: newSourceActiveSessionId }
              : g
          );
          newGroups.splice(fromIndex + 1, 0, newGroup);

          // Recalculate flex percentages evenly
          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          return {
            ...state,
            groups: newGroups,
            activeGroupId: newGroup.id,
            flexPercents: newFlexPercents,
          };
        }

        // Source group has only 1 session, create a new session in new group
        const newSession = createSession(
          repoPath,
          cwd,
          defaultAgentId,
          customAgents,
          agentSettings
        );
        addSession(newSession);

        const newGroup: AgentGroupType = {
          id: crypto.randomUUID(),
          sessionIds: [newSession.id],
          activeSessionId: newSession.id,
        };

        const newGroups = [...state.groups];
        newGroups.splice(fromIndex + 1, 0, newGroup);

        // Recalculate flex percentages evenly
        const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

        return {
          ...state,
          groups: newGroups,
          activeGroupId: newGroup.id,
          flexPercents: newFlexPercents,
        };
      });
    },
    [
      cwd,
      repoPath,
      defaultAgentId,
      customAgents,
      agentSettings,
      addSession,
      updateCurrentGroupState,
    ]
  );

  // Handle merge - move active session from current group to previous group
  const handleMerge = useCallback(
    (fromGroupId: string) => {
      updateCurrentGroupState((state) => {
        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex <= 0) return state; // Can't merge first group

        const fromGroup = state.groups[fromIndex];
        const targetGroup = state.groups[fromIndex - 1];

        if (!fromGroup.activeSessionId) return state;

        const movingSessionId = fromGroup.activeSessionId;
        const remainingSessionIds = fromGroup.sessionIds.filter((id) => id !== movingSessionId);

        // If from group becomes empty, remove it
        if (remainingSessionIds.length === 0) {
          const newGroups = state.groups.filter((g) => g.id !== fromGroupId);
          newGroups[fromIndex - 1] = {
            ...targetGroup,
            sessionIds: [...targetGroup.sessionIds, movingSessionId],
            activeSessionId: movingSessionId,
          };

          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          return {
            groups: newGroups,
            activeGroupId: targetGroup.id,
            flexPercents: newFlexPercents,
          };
        }

        // From group still has sessions
        const newActiveInFromGroup = remainingSessionIds[0] || null;
        const newGroups = state.groups.map((g) => {
          if (g.id === targetGroup.id) {
            return {
              ...g,
              sessionIds: [...g.sessionIds, movingSessionId],
              activeSessionId: movingSessionId,
            };
          }
          if (g.id === fromGroupId) {
            return {
              ...g,
              sessionIds: remainingSessionIds,
              activeSessionId: newActiveInFromGroup,
            };
          }
          return g;
        });

        return {
          ...state,
          groups: newGroups,
          activeGroupId: targetGroup.id,
        };
      });
    },
    [updateCurrentGroupState]
  );

  // Handle resize between groups
  const handleResize = useCallback(
    (index: number, deltaPercent: number) => {
      updateCurrentGroupState((state) => {
        if (state.groups.length < 2) return state;

        const newFlexPercents = [...state.flexPercents];
        const minPercent = 20;

        // Adjust the two adjacent groups
        const leftNew = newFlexPercents[index] + deltaPercent;
        const rightNew = newFlexPercents[index + 1] - deltaPercent;

        // Clamp to minimum
        if (leftNew >= minPercent && rightNew >= minPercent) {
          newFlexPercents[index] = leftNew;
          newFlexPercents[index + 1] = rightNew;
        }

        return {
          ...state,
          flexPercents: newFlexPercents,
        };
      });
    },
    [updateCurrentGroupState]
  );

  const shouldAutoCreateSession =
    repoPath === TEMP_REPO_ID ? autoCreateSessionOnTempActivate : autoCreateSessionOnActivate;

  // Auto-create first session when panel becomes active and empty (if enabled in settings)
  useEffect(() => {
    if (
      shouldAutoCreateSession &&
      isActive &&
      cwd &&
      groups.length === 0 &&
      currentWorktreeSessions.length === 0
    ) {
      handleNewSession();
    }
  }, [
    shouldAutoCreateSession,
    isActive,
    cwd,
    groups.length,
    currentWorktreeSessions.length,
    handleNewSession,
  ]);

  // Sync sessions to groups on initial load or when sessions change externally
  useEffect(() => {
    if (!cwd || currentWorktreeSessions.length === 0) return;

    const normalizedCwd = normalizePath(cwd);
    const currentState = worktreeGroupStates[normalizedCwd];

    // If no groups exist but sessions do, create a group with all sessions
    if (!currentState || currentState.groups.length === 0) {
      const sessionIds = currentWorktreeSessions.map((s) => s.id);
      const newGroup: AgentGroupType = {
        id: crypto.randomUUID(),
        sessionIds,
        activeSessionId: sessionIds[0] || null,
      };
      setGroupState(cwd, {
        groups: [newGroup],
        activeGroupId: newGroup.id,
        flexPercents: [100],
      });
    }
  }, [cwd, currentWorktreeSessions, worktreeGroupStates, setGroupState]);

  // Maintain global session IDs - include ALL sessions across all repos
  // This ensures terminals stay mounted when switching between repos
  useEffect(() => {
    const allSessionIds = allSessions.map((s) => s.id);
    const allSessionIdSet = new Set(allSessionIds);

    setGlobalSessionIds((prev) => {
      const next = new Set(prev);
      // Add new sessions
      for (const id of allSessionIds) {
        next.add(id);
      }
      // Remove sessions that no longer exist
      for (const id of next) {
        if (!allSessionIdSet.has(id)) {
          next.delete(id);
        }
      }
      return next;
    });
  }, [allSessions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      if (matchesKeybinding(e, xtermKeybindings.newTab)) {
        e.preventDefault();
        handleNewSession();
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.closeTab)) {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup?.activeSessionId) {
          handleCloseSession(activeGroup.activeSessionId, activeGroup.id);
        }
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.nextTab)) {
        e.preventDefault();
        handleNextSession();
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.prevTab)) {
        e.preventDefault();
        handlePrevSession();
        return;
      }

      if (e.metaKey && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup) {
          const index = Number.parseInt(e.key, 10) - 1;
          if (index < activeGroup.sessionIds.length) {
            e.preventDefault();
            handleSelectSession(activeGroup.sessionIds[index], activeGroup.id);
            return;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    groups,
    activeGroupId,
    xtermKeybindings,
    handleNewSession,
    handleCloseSession,
    handleNextSession,
    handlePrevSession,
    handleSelectSession,
  ]);

  // Quick Terminal 快捷键监听
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+` 或 Cmd+` (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        handleToggleQuickTerminal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleToggleQuickTerminal]);

  if (!cwd) return null;

  // Check if current worktree has any groups (used for empty state detection)
  const hasAnyGroups = groups.length > 0;

  // Helper to find session info (which worktree, group, index)
  const findSessionInfo = (sessionId: string) => {
    for (const [worktreePath, state] of Object.entries(worktreeGroupStates)) {
      for (let groupIndex = 0; groupIndex < state.groups.length; groupIndex++) {
        const group = state.groups[groupIndex];
        if (group.sessionIds.includes(sessionId)) {
          const session = allSessions.find((s) => s.id === sessionId);
          if (session) {
            return { worktreePath, state, group, groupIndex, session };
          }
        }
      }
    }
    return null;
  };

  // Calculate cumulative left positions for groups
  const getGroupPositions = (state: AgentGroupState) => {
    const positions: { left: number; width: number }[] = [];
    let cumulative = 0;
    for (const percent of state.flexPercents) {
      positions.push({ left: cumulative, width: percent });
      cumulative += percent;
    }
    return positions;
  };

  // Check if current worktree has no sessions (for empty state overlay)
  const showEmptyState = !hasAnyGroups && currentWorktreeSessions.length === 0;

  // Get current worktree's group positions for terminal placement
  const currentGroupPositions = getGroupPositions(currentGroupState);

  return (
    <div
      ref={panelRef}
      className="relative h-full w-full"
      style={{ backgroundColor: terminalBgColor }}
    >
      {/* Empty state overlay - shown when current worktree has no sessions */}
      {/* IMPORTANT: Don't use early return here - terminals must stay mounted to prevent PTY destruction */}
      {showEmptyState && (
        <div className={cn("absolute inset-0 z-20 flex items-center justify-center", !bgImageEnabled && "bg-background")}>
          <Empty className="border-0">
            <EmptyMedia variant="icon">
              <Sparkles className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{t('No agent sessions')}</EmptyTitle>
              <EmptyDescription>{t('Create a session to start using AI Agent')}</EmptyDescription>
            </EmptyHeader>
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
                <div className="absolute left-0 top-full pt-1 z-50 min-w-40 text-left">
                  <div className="rounded-lg border bg-popover p-1 shadow-lg">
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-xs text-muted-foreground">{t('Select Agent')}</span>
                      <Tooltip>
                        <TooltipTrigger>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAgentMenu(false);
                              window.dispatchEvent(new CustomEvent('open-settings-agent'));
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipPopup side="right">{t('Manage Agents')}</TooltipPopup>
                      </Tooltip>
                    </div>
                    {[...enabledAgents]
                      .sort((a, b) => {
                        const aDefault = agentSettings[a]?.isDefault ? 1 : 0;
                        const bDefault = agentSettings[b]?.isDefault ? 1 : 0;
                        return bDefault - aDefault;
                      })
                      .map((agentId) => {
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
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground whitespace-nowrap"
                          >
                            <span>{name}</span>
                            {isDefault && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {t('(default)')}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </Empty>
        </div>
      )}
      {/* Resize handles - only for current worktree */}
      {currentGroupState.groups.length > 1 &&
        currentGroupState.groups.map((group, index) => {
          if (index >= currentGroupState.groups.length - 1) return null;
          const leftPos = currentGroupPositions
            .slice(0, index + 1)
            .reduce((sum, p) => sum + p.width, 0);
          return (
            <ResizeHandle
              key={`resize-${group.id}`}
              style={{ left: `${leftPos}%` }}
              onResize={(delta) => handleResize(index, delta)}
            />
          );
        })}

      {/* All terminals - rendered in a SINGLE container with stable sessionId keys */}
      {/* This container is NOT inside any worktree-specific wrapper, ensuring stable mounting */}
      {/* All sessions across ALL repos are rendered here to keep them mounted */}
      {/* bottom is dynamically set based on StatusLine height */}
      <div className="absolute top-2 left-2 right-2 z-0" style={{ bottom: statusLineHeight + 8 }}>
        {Array.from(globalSessionIds).map((sessionId) => {
          const session = allSessions.find((s) => s.id === sessionId);
          if (!session) return null;

          // Check if this session belongs to current repo
          const isCurrentRepo = session.repoPath === repoPath;

          // Find session's group info for positioning
          const info = findSessionInfo(sessionId);

          // Determine if this session belongs to current worktree
          const isCurrentWorktree = isCurrentRepo && pathsEqual(session.cwd, cwd);

          // Calculate position - if no group info, use full width
          let left = 0;
          let width = 100;
          let isSessionVisible = true;
          let groupId: string | null = null;

          if (info) {
            const positions = getGroupPositions(info.state);
            const position = positions[info.groupIndex];
            if (position) {
              left = position.left;
              width = position.width;
            }
            isSessionVisible = info.group.activeSessionId === sessionId;
            groupId = info.group.id;
          }

          const isGroupActive = groupId === currentGroupState.activeGroupId;
          const isTerminalActive =
            isActive && isCurrentWorktree && isSessionVisible && isGroupActive;

          // Only show terminals from current repo + current worktree + active session
          const shouldShow = isCurrentRepo && isCurrentWorktree && isSessionVisible;

          return (
            <div
              key={sessionId}
              className={
                shouldShow ? 'absolute h-full' : 'absolute h-full opacity-0 pointer-events-none'
              }
              style={{
                left: `${left}%`,
                width: `${width}%`,
              }}
            >
              {/* Inactive overlay - like TerminalGroup */}
              {shouldShow && !isGroupActive && (
                <div className="absolute inset-0 z-10 bg-background/10 pointer-events-none" />
              )}
              <AgentTerminal
                id={session.id}
                cwd={session.cwd}
                sessionId={session.sessionId || session.id}
                agentCommand={session.agentCommand || 'claude'}
                customPath={session.customPath}
                customArgs={session.customArgs}
                environment={session.environment || 'native'}
                initialized={session.initialized}
                activated={session.activated}
                isActive={isTerminalActive}
                onInitialized={() => handleInitialized(sessionId)}
                onActivated={() => handleActivated(sessionId)}
                onExit={() => handleCloseSession(sessionId, groupId || undefined)}
                onTerminalTitleChange={(title) =>
                  updateSession(sessionId, { terminalTitle: title })
                }
                onSplit={() => groupId && handleSplit(groupId)}
                canMerge={info ? info.groupIndex > 0 : false}
                onMerge={() => groupId && handleMerge(groupId)}
                onFocus={() => groupId && handleSelectSession(sessionId, groupId)}
              />
            </div>
          );
        })}
      </div>

      {/* Session bars (floating) - rendered for each group in current worktree */}
      {/* pointer-events-none on container, AgentGroup handles its own pointer-events */}
      {currentGroupState.groups.map((group, index) => {
        const position = currentGroupPositions[index];
        if (!position) return null;

        return (
          <div
            key={`group-ui-${group.id}`}
            className="absolute top-0 bottom-0 z-10 pointer-events-none overflow-hidden flex flex-col"
            style={{
              left: `${position.left}%`,
              width: `${position.width}%`,
            }}
          >
            <AgentGroup
              group={group}
              sessions={currentWorktreeSessions}
              enabledAgents={enabledAgents}
              customAgents={customAgents}
              agentSettings={agentSettings}
              agentInfo={AGENT_INFO}
              onSessionSelect={(id) => handleSelectSession(id, group.id)}
              onSessionClose={(id) => handleCloseSession(id, group.id)}
              onSessionNew={() => handleNewSession(group.id)}
              onSessionNewWithAgent={(agentId, cmd) =>
                handleNewSessionWithAgent(agentId, cmd, group.id)
              }
              onSessionRename={handleRenameSession}
              onSessionReorder={(from, to) => handleReorderSessions(group.id, from, to)}
              onGroupClick={() => handleGroupClick(group.id)}
              quickTerminalOpen={quickTerminalOpen}
              quickTerminalHasProcess={hasRunningProcess}
              onToggleQuickTerminal={quickTerminalEnabled ? handleToggleQuickTerminal : undefined}
            />
            {/* Status Line at bottom of each group - only render container when enabled */}
            {statusLineEnabled && (
              <div className="mt-auto pointer-events-auto">
                <StatusLine
                  sessionId={group.activeSessionId}
                  onHeightChange={setStatusLineHeight}
                />
              </div>
            )}
          </div>
        );
      })}
      {/* Quick Terminal Modal - 始终挂载以保持 terminal 运行状态 */}
      {quickTerminalEnabled && (
        <QuickTerminalModal
          key={`quick-terminal-${quickTerminalMountKey}`}
          open={quickTerminalOpen && isActive}
          onOpenChange={setQuickTerminalOpen}
          onClose={handleCloseQuickTerminal}
          cwd={cwd}
          onSessionInit={handleQuickTerminalSessionInit}
        />
      )}
    </div>
  );
}
