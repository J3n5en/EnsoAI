import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Agent activity state for tree sidebar display
export type AgentActivityState = 'idle' | 'running' | 'waiting_input' | 'completed';

interface WorktreeActivity {
  agentCount: number;
  terminalCount: number;
}

interface DiffStats {
  insertions: number;
  deletions: number;
}

type CloseHandler = (worktreePath: string) => void;

interface WorktreeActivityState {
  activities: Record<string, WorktreeActivity>;
  diffStats: Record<string, DiffStats>;
  activityStates: Record<string, AgentActivityState>; // Agent activity states per worktree

  // Agent session tracking
  incrementAgent: (worktreePath: string) => void;
  decrementAgent: (worktreePath: string) => void;
  setAgentCount: (worktreePath: string, count: number) => void;

  // Terminal session tracking
  incrementTerminal: (worktreePath: string) => void;
  decrementTerminal: (worktreePath: string) => void;
  setTerminalCount: (worktreePath: string, count: number) => void;

  // Diff stats tracking
  setDiffStats: (worktreePath: string, stats: DiffStats) => void;
  fetchDiffStats: (worktreePaths: string[]) => Promise<void>;

  // Activity state tracking
  setActivityState: (worktreePath: string, state: AgentActivityState) => void;
  getActivityState: (worktreePath: string) => AgentActivityState;
  clearActivityState: (worktreePath: string) => void;

  // Query helpers
  hasActivity: (worktreePath: string) => boolean;
  getActivity: (worktreePath: string) => WorktreeActivity;
  getDiffStats: (worktreePath: string) => DiffStats;

  // Clean up
  clearWorktree: (worktreePath: string) => void;

  // Close handlers - panels register to receive close events
  agentCloseHandlers: Set<CloseHandler>;
  terminalCloseHandlers: Set<CloseHandler>;
  registerAgentCloseHandler: (handler: CloseHandler) => () => void;
  registerTerminalCloseHandler: (handler: CloseHandler) => () => void;
  closeAgentSessions: (worktreePath: string) => void;
  closeTerminalSessions: (worktreePath: string) => void;
}

const defaultActivity: WorktreeActivity = { agentCount: 0, terminalCount: 0 };
const defaultDiffStats: DiffStats = { insertions: 0, deletions: 0 };

export const useWorktreeActivityStore = create<WorktreeActivityState>()(
  subscribeWithSelector((set, get) => ({
    activities: {},
    diffStats: {},
    activityStates: {},

    incrementAgent: (worktreePath) =>
      set((state) => {
        const current = state.activities[worktreePath] || defaultActivity;
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, agentCount: current.agentCount + 1 },
          },
        };
      }),

    decrementAgent: (worktreePath) =>
      set((state) => {
        const current = state.activities[worktreePath] || defaultActivity;
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, agentCount: Math.max(0, current.agentCount - 1) },
          },
        };
      }),

    setAgentCount: (worktreePath, count) =>
      set((state) => {
        const current = state.activities[worktreePath] || defaultActivity;
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, agentCount: count },
          },
        };
      }),

    incrementTerminal: (worktreePath) =>
      set((state) => {
        const current = state.activities[worktreePath] || defaultActivity;
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, terminalCount: current.terminalCount + 1 },
          },
        };
      }),

    decrementTerminal: (worktreePath) =>
      set((state) => {
        const current = state.activities[worktreePath] || defaultActivity;
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, terminalCount: Math.max(0, current.terminalCount - 1) },
          },
        };
      }),

    setTerminalCount: (worktreePath, count) =>
      set((state) => {
        const current = state.activities[worktreePath] || defaultActivity;
        return {
          activities: {
            ...state.activities,
            [worktreePath]: { ...current, terminalCount: count },
          },
        };
      }),

    setDiffStats: (worktreePath, stats) =>
      set((state) => ({
        diffStats: {
          ...state.diffStats,
          [worktreePath]: stats,
        },
      })),

    fetchDiffStats: async (worktreePaths) => {
      // Fetch diff stats for all worktrees in parallel
      const results = await Promise.all(
        worktreePaths.map(async (path) => {
          try {
            const stats = await window.electronAPI.git.getDiffStats(path);
            return { path, stats };
          } catch {
            return { path, stats: defaultDiffStats };
          }
        })
      );
      // Batch update all stats at once
      set((state) => {
        const newDiffStats = { ...state.diffStats };
        for (const { path, stats } of results) {
          newDiffStats[path] = stats;
        }
        return { diffStats: newDiffStats };
      });
    },

    hasActivity: (worktreePath) => {
      const activity = get().activities[worktreePath];
      return activity ? activity.agentCount > 0 || activity.terminalCount > 0 : false;
    },

    getActivity: (worktreePath) => {
      return get().activities[worktreePath] || defaultActivity;
    },

    getDiffStats: (worktreePath) => {
      return get().diffStats[worktreePath] || defaultDiffStats;
    },

    // Activity state methods
    setActivityState: (worktreePath, state) =>
      set((prev) => {
        // Skip update if state hasn't changed to avoid unnecessary re-renders
        if (prev.activityStates[worktreePath] === state) return prev;
        const pathShort = worktreePath.split('/').slice(-2).join('/');
        console.log(`[WorktreeActivity] ${pathShort} → ${state}`);
        return { activityStates: { ...prev.activityStates, [worktreePath]: state } };
      }),

    getActivityState: (worktreePath) => {
      return get().activityStates[worktreePath] || 'idle';
    },

    clearActivityState: (worktreePath) =>
      set((prev) => {
        const { [worktreePath]: _, ...rest } = prev.activityStates;
        return { activityStates: rest };
      }),

    clearWorktree: (worktreePath) =>
      set((state) => {
        // Clean up session mappings - agentSessions handles session cleanup
        const { [worktreePath]: _, ...restActivities } = state.activities;
        const { [worktreePath]: __, ...restActivityStates } = state.activityStates;
        return { activities: restActivities, activityStates: restActivityStates };
      }),

    // Close handler registry
    agentCloseHandlers: new Set(),
    terminalCloseHandlers: new Set(),

    registerAgentCloseHandler: (handler) => {
      get().agentCloseHandlers.add(handler);
      return () => {
        get().agentCloseHandlers.delete(handler);
      };
    },

    registerTerminalCloseHandler: (handler) => {
      get().terminalCloseHandlers.add(handler);
      return () => {
        get().terminalCloseHandlers.delete(handler);
      };
    },

    closeAgentSessions: (worktreePath) => {
      for (const handler of get().agentCloseHandlers) {
        handler(worktreePath);
      }
    },

    closeTerminalSessions: (worktreePath) => {
      for (const handler of get().terminalCloseHandlers) {
        handler(worktreePath);
      }
    },
  }))
);

// Subscribe to activities changes and notify main process
useWorktreeActivityStore.subscribe(
  (state) => state.activities,
  (activities) => {
    // Get all worktree paths that have activity (green light)
    const activeWorktrees = Object.entries(activities)
      .filter(([, activity]) => activity.agentCount > 0 || activity.terminalCount > 0)
      .map(([path]) => path);

    // Notify main process
    window.electronAPI?.worktree.activate(activeWorktrees);
  },
  {
    equalityFn: (a, b) => {
      // Compare active worktree paths
      const getActivePaths = (activities: Record<string, WorktreeActivity>) =>
        Object.entries(activities)
          .filter(([, act]) => act.agentCount > 0 || act.terminalCount > 0)
          .map(([path]) => path)
          .sort()
          .join(',');
      return getActivePaths(a) === getActivePaths(b);
    },
  }
);

/**
 * Initialize agent activity state listener
 * Listens for agent stop, ask user question, and user prompt submit notifications
 * Call this once on app startup
 */
export function initAgentActivityListener(): () => void {
  // Listen for user prompt submit notification -> set 'running'
  const unsubPreToolUse = window.electronAPI.notification.onPreToolUse(
    (data: { sessionId: string; toolName: string; cwd?: string }) => {
      if (!data.cwd) {
        console.warn(
          `[WorktreeActivity] UserPromptSubmit hook missing cwd: session ${data.sessionId.slice(0, 8)}`
        );
        return;
      }

      useWorktreeActivityStore.getState().setActivityState(data.cwd, 'running');
    }
  );

  // Listen for agent stop notification -> set 'completed'
  const unsubStop = window.electronAPI.notification.onAgentStop(
    (data: { sessionId: string; cwd?: string }) => {
      if (!data.cwd) {
        console.warn(
          `[WorktreeActivity] Stop hook missing cwd: session ${data.sessionId.slice(0, 8)}`
        );
        return;
      }

      useWorktreeActivityStore.getState().setActivityState(data.cwd, 'completed');
    }
  );

  // Listen for ask user question notification -> set 'waiting_input'
  const unsubAsk = window.electronAPI.notification.onAskUserQuestion(
    (data: { sessionId: string; cwd?: string }) => {
      if (!data.cwd) {
        console.warn(
          `[WorktreeActivity] AskUserQuestion hook missing cwd: session ${data.sessionId.slice(0, 8)}`
        );
        return;
      }

      useWorktreeActivityStore.getState().setActivityState(data.cwd, 'waiting_input');
    }
  );

  return () => {
    unsubPreToolUse();
    unsubStop();
    unsubAsk();
  };
}
