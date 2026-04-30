import type { AgentTask, AgentTaskStatus } from '@shared/types';
import { getPathBasename } from '@shared/utils/path';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Session } from '@/components/chat/SessionBar';
import { useAgentSessionsStore } from './agentSessions';
import { useAgentStatusStore } from './agentStatus';
import { type AgentActivityState, useWorktreeActivityStore } from './worktreeActivity';

// Storage key for task descriptions
const TASK_DESCRIPTIONS_STORAGE_KEY = 'enso-agent-task-descriptions';
const MAX_DESCRIPTION_LENGTH = 100;

function loadDescriptions(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TASK_DESCRIPTIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDescriptions(descriptions: Record<string, string>) {
  try {
    localStorage.setItem(TASK_DESCRIPTIONS_STORAGE_KEY, JSON.stringify(descriptions));
  } catch {
    // ignore storage errors
  }
}

// Map worktreeActivity state to AgentTaskStatus
function mapActivityToTaskStatus(activityState: AgentActivityState): AgentTaskStatus {
  switch (activityState) {
    case 'running':
      return 'running';
    case 'waiting_input':
      return 'waiting';
    case 'completed':
      return 'completed';
    default:
      return 'idle';
  }
}

function hasNewStatusKeys(
  current: Record<string, unknown>,
  next: Record<string, unknown>
): boolean {
  const nextKeys = Object.keys(next);
  if (nextKeys.length !== Object.keys(current).length) return true;
  return !nextKeys.every((k) => k in current);
}

interface AgentTasksState {
  tasks: Record<string, AgentTask>;

  // Cached derived arrays (stable references)
  _allTasksCache: AgentTask[];
  _activeTasksCache: AgentTask[];
  _completedTasksCache: AgentTask[];
  _idleTasksCache: AgentTask[];
  _activeTaskCountCache: number;

  // Track start times per session
  startTimes: Record<string, number>;
  // Track completion times per session
  completionTimes: Record<string, number>;
  // Track waiting reasons per session
  waitingReasons: Record<string, string>;
  // Track descriptions per session (persisted)
  descriptions: Record<string, string>;

  // Computed (return cached values)
  getAllTasks: () => AgentTask[];
  getActiveTasks: () => AgentTask[];
  getCompletedTasks: () => AgentTask[];
  getIdleTasks: () => AgentTask[];
  getActiveTaskCount: () => number;

  // Actions
  updateTaskStatus: (sessionId: string, status: AgentTaskStatus, reason?: string) => void;
  updateTaskDescription: (sessionId: string, description: string) => void;
  clearTask: (sessionId: string) => void;
  clearCompletedTasks: () => void;
  syncFromSessions: () => void;
}

function computeDerivedArrays(tasks: Record<string, AgentTask>) {
  // Sort by start time only, tasks stay in place when status changes
  const all = Object.values(tasks).sort((a, b) => {
    return (b.startedAt || 0) - (a.startedAt || 0);
  });

  const active = all.filter(
    (t) => t.status === 'running' || t.status === 'waiting' || t.status === 'paused'
  );
  const completed = all.filter((t) => t.status === 'completed');
  const idle = all.filter((t) => t.status === 'idle');
  const activeTaskCount = all.filter((t) => t.status !== 'completed').length;

  return {
    _allTasksCache: all,
    _activeTasksCache: active,
    _completedTasksCache: completed,
    _idleTasksCache: idle,
    _activeTaskCountCache: activeTaskCount,
  };
}

export const useAgentTasksStore = create<AgentTasksState>()(
  subscribeWithSelector((set, get) => ({
    tasks: {},
    _allTasksCache: [],
    _activeTasksCache: [],
    _completedTasksCache: [],
    _idleTasksCache: [],
    _activeTaskCountCache: 0,
    startTimes: {},
    completionTimes: {},
    waitingReasons: {},
    descriptions: loadDescriptions(),

    getAllTasks: () => get()._allTasksCache,
    getActiveTasks: () => get()._activeTasksCache,
    getCompletedTasks: () => get()._completedTasksCache,
    getIdleTasks: () => get()._idleTasksCache,
    getActiveTaskCount: () => get()._activeTaskCountCache,

    updateTaskStatus: (sessionId, status, reason) => {
      set((state) => {
        const task = state.tasks[sessionId];
        if (!task) return state;

        const updates: Partial<AgentTask> = { status };

        if (status === 'running' && !state.startTimes[sessionId]) {
          updates.startedAt = Date.now();
        }

        if (status === 'completed') {
          updates.completedAt = Date.now();
        }

        if (status === 'waiting' && reason) {
          updates.waitingReason = reason;
        }

        if (status === 'idle') {
          updates.waitingReason = undefined;
        }

        const newTasks = {
          ...state.tasks,
          [sessionId]: { ...task, ...updates },
        };

        const newStartTimes =
          status === 'running' && !state.startTimes[sessionId]
            ? { ...state.startTimes, [sessionId]: Date.now() }
            : state.startTimes;

        const newCompletionTimes =
          status === 'completed'
            ? { ...state.completionTimes, [sessionId]: Date.now() }
            : state.completionTimes;

        const newWaitingReasons =
          status === 'waiting' && reason
            ? { ...state.waitingReasons, [sessionId]: reason }
            : status === 'idle'
              ? (() => {
                  const { [sessionId]: _, ...rest } = state.waitingReasons;
                  return rest;
                })()
              : state.waitingReasons;

        const derived = computeDerivedArrays(newTasks);

        return {
          tasks: newTasks,
          startTimes: newStartTimes,
          completionTimes: newCompletionTimes,
          waitingReasons: newWaitingReasons,
          ...derived,
        };
      });
    },

    updateTaskDescription: (sessionId, description) => {
      set((state) => {
        const task = state.tasks[sessionId];
        if (!task) return state;

        const truncatedDesc =
          description.length > MAX_DESCRIPTION_LENGTH
            ? `${description.slice(0, MAX_DESCRIPTION_LENGTH)}…`
            : description;

        const newTasks = {
          ...state.tasks,
          [sessionId]: { ...task, description: truncatedDesc },
        };

        const newDescriptions = {
          ...state.descriptions,
          [sessionId]: truncatedDesc,
        };

        // Persist to localStorage
        saveDescriptions(newDescriptions);

        const derived = computeDerivedArrays(newTasks);
        return { tasks: newTasks, descriptions: newDescriptions, ...derived };
      });
    },

    clearTask: (sessionId) => {
      set((state) => {
        const { [sessionId]: _, ...restTasks } = state.tasks;
        const { [sessionId]: __, ...restStartTimes } = state.startTimes;
        const { [sessionId]: ___, ...restCompletionTimes } = state.completionTimes;
        const { [sessionId]: ____, ...restWaitingReasons } = state.waitingReasons;
        const { [sessionId]: _____, ...restDescriptions } = state.descriptions;
        saveDescriptions(restDescriptions);
        const derived = computeDerivedArrays(restTasks);
        return {
          tasks: restTasks,
          startTimes: restStartTimes,
          completionTimes: restCompletionTimes,
          waitingReasons: restWaitingReasons,
          descriptions: restDescriptions,
          ...derived,
        };
      });
    },

    clearCompletedTasks: () => {
      set((state) => {
        const completedIds = Object.values(state.tasks)
          .filter((t) => t.status === 'completed')
          .map((t) => t.sessionId);

        const newTasks = { ...state.tasks };
        const newStartTimes = { ...state.startTimes };
        const newCompletionTimes = { ...state.completionTimes };
        const newWaitingReasons = { ...state.waitingReasons };
        const newDescriptions = { ...state.descriptions };

        for (const id of completedIds) {
          delete newTasks[id];
          delete newStartTimes[id];
          delete newCompletionTimes[id];
          delete newWaitingReasons[id];
          delete newDescriptions[id];
        }

        saveDescriptions(newDescriptions);

        const derived = computeDerivedArrays(newTasks);
        return {
          tasks: newTasks,
          startTimes: newStartTimes,
          completionTimes: newCompletionTimes,
          waitingReasons: newWaitingReasons,
          descriptions: newDescriptions,
          ...derived,
        };
      });
    },

    syncFromSessions: () => {
      const sessions = useAgentSessionsStore.getState().sessions;
      const activityStates = useWorktreeActivityStore.getState().activityStates;
      const statuses = useAgentStatusStore.getState().statuses;

      set((state) => {
        const newTasks: Record<string, AgentTask> = {};

        for (const session of sessions) {
          const activityState = activityStates[session.cwd] || 'idle';
          const statusData = statuses[session.id] || statuses[session.sessionId || ''];

          const existingTask = state.tasks[session.id];
          const startTime = state.startTimes[session.id];
          const completionTime = state.completionTimes[session.id];
          const waitingReason = state.waitingReasons[session.id];
          const persistedDescription = state.descriptions[session.id];

          const taskStatus = mapActivityToTaskStatus(activityState);
          const model = statusData?.model?.id;

          newTasks[session.id] = {
            sessionId: session.id,
            sessionName: session.name,
            repoPath: session.repoPath,
            repoName: getPathBasename(session.repoPath),
            cwd: session.cwd,
            status: taskStatus,
            description: persistedDescription || session.name,
            startedAt: startTime || existingTask?.startedAt || Date.now(),
            completedAt: completionTime || existingTask?.completedAt,
            model: model || existingTask?.model,
            waitingReason: waitingReason || existingTask?.waitingReason,
          };
        }

        const derived = computeDerivedArrays(newTasks);
        return { tasks: newTasks, ...derived };
      });
    },
  }))
);

function findSessionById(sessions: Session[], id: string) {
  return sessions.find((s) => s.sessionId === id || s.id === id);
}

/**
 * Initialize agent tasks listener.
 * Subscribes to session and activity state changes to keep tasks in sync.
 * Call this once on app startup.
 */
export function initAgentTasksListener(): () => void {
  // Sync when sessions change
  const unsubSessions = useAgentSessionsStore.subscribe(
    (state) => state.sessions,
    () => {
      useAgentTasksStore.getState().syncFromSessions();
    }
  );

  // Sync when activity states change
  const unsubActivity = useWorktreeActivityStore.subscribe(
    (state) => state.activityStates,
    () => {
      useAgentTasksStore.getState().syncFromSessions();
    }
  );

  // Sync when status data changes
  const unsubStatus = useAgentStatusStore.subscribe((state) => {
    if (hasNewStatusKeys(useAgentTasksStore.getState().tasks, state.statuses)) {
      useAgentTasksStore.getState().syncFromSessions();
    }
  });

  // Listen for PreToolUse -> running
  const unsubPreToolUse = window.electronAPI.notification.onPreToolUse(
    (data: { sessionId: string; toolName: string; cwd?: string }) => {
      const session = findSessionById(useAgentSessionsStore.getState().sessions, data.sessionId);
      if (session) {
        useAgentTasksStore.getState().updateTaskStatus(session.id, 'running');
      }
    }
  );

  // Listen for Stop -> completed
  const unsubStop = window.electronAPI.notification.onAgentStop(
    (data: { sessionId: string; cwd?: string }) => {
      const session = findSessionById(useAgentSessionsStore.getState().sessions, data.sessionId);
      if (session) {
        useAgentTasksStore.getState().updateTaskStatus(session.id, 'completed');
      }
    }
  );

  // Listen for AskUserQuestion -> waiting
  const unsubAsk = window.electronAPI.notification.onAskUserQuestion(
    (data: { sessionId: string; toolInput: unknown; cwd?: string }) => {
      const session = findSessionById(useAgentSessionsStore.getState().sessions, data.sessionId);
      if (session) {
        const reason =
          data.toolInput && typeof data.toolInput === 'string'
            ? extractWaitingReason(data.toolInput)
            : undefined;
        useAgentTasksStore.getState().updateTaskStatus(session.id, 'waiting', reason);
      }
    }
  );

  // Listen for UserPromptSubmit -> update description
  const unsubUserPrompt = window.electronAPI.notification.onUserPrompt(
    (data: { sessionId: string; prompt: string; cwd?: string }) => {
      const session = findSessionById(useAgentSessionsStore.getState().sessions, data.sessionId);
      if (session && data.prompt) {
        useAgentTasksStore.getState().updateTaskDescription(session.id, data.prompt);
      }
    }
  );

  // Initial sync
  useAgentTasksStore.getState().syncFromSessions();

  return () => {
    unsubSessions();
    unsubActivity();
    unsubStatus();
    unsubPreToolUse();
    unsubStop();
    unsubAsk();
    unsubUserPrompt();
  };
}

// Extract a brief waiting reason from tool input (e.g. AskUserQuestion JSON)
function extractWaitingReason(toolInput: string): string | undefined {
  try {
    const parsed = JSON.parse(toolInput);
    if (parsed.questions && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      const firstQuestion = parsed.questions[0];
      if (firstQuestion.question) {
        return firstQuestion.question.slice(0, MAX_DESCRIPTION_LENGTH);
      }
    }
    for (const value of Object.values(parsed)) {
      if (typeof value === 'string' && value.length > 0) {
        return value.slice(0, MAX_DESCRIPTION_LENGTH);
      }
    }
  } catch {
    if (toolInput.length > 0) {
      return toolInput.slice(0, MAX_DESCRIPTION_LENGTH);
    }
  }
  return undefined;
}
