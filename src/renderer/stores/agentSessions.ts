import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { normalizePath, pathsEqual } from '@/App/storage';
import type { Session } from '@/components/chat/SessionBar';
import type { AgentGroupState } from '@/components/chat/types';
import { createInitialGroupState } from '@/components/chat/types';

// Global storage key for all sessions across all repos
export const SESSIONS_STORAGE_KEY = 'enso-agent-sessions';

// Runtime output state for each session (not persisted)
export type OutputState = 'idle' | 'outputting' | 'unread';

export interface SessionRuntimeState {
  outputState: OutputState;
  lastActivityAt: number;
  wasActiveWhenOutputting: boolean; // Track if user was viewing this session during output
}

// Enhanced input state for each session (not persisted)
export interface EnhancedInputState {
  open: boolean;
  content: string;
  imagePaths: string[];
}

// Default state object (cached and frozen to prevent accidental mutation)
const DEFAULT_ENHANCED_INPUT_STATE: EnhancedInputState = Object.freeze({
  open: false,
  content: '',
  imagePaths: [],
});

// Aggregated state for UI display
export interface AggregatedOutputState {
  total: number;
  outputting: number;
  unread: number;
}

// Check if an agent command supports session persistence
function isResumableAgent(agentCommand: string): boolean {
  return agentCommand?.startsWith('claude') ?? false;
}

// Group states indexed by normalized worktree path
type WorktreeGroupStates = Record<string, AgentGroupState>;

interface AgentSessionsState {
  sessions: Session[];
  activeIds: Record<string, string | null>; // key = cwd (worktree path)
  groupStates: WorktreeGroupStates; // Group states per worktree (not persisted)
  runtimeStates: Record<string, SessionRuntimeState>; // Runtime output states (not persisted)
  enhancedInputStates: Record<string, EnhancedInputState>; // Enhanced input states per session (not persisted)

  // Actions
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  setActiveId: (cwd: string, sessionId: string | null) => void;
  reorderSessions: (repoPath: string, cwd: string, fromIndex: number, toIndex: number) => void;
  getSessions: (repoPath: string, cwd: string) => Session[];
  getActiveSessionId: (repoPath: string, cwd: string) => string | null;

  // Group state actions
  getGroupState: (cwd: string) => AgentGroupState;
  setGroupState: (cwd: string, state: AgentGroupState) => void;
  updateGroupState: (cwd: string, updater: (state: AgentGroupState) => AgentGroupState) => void;
  removeGroupState: (cwd: string) => void;

  // Runtime state actions
  setOutputState: (sessionId: string, outputState: OutputState, isActive?: boolean) => void;
  markAsRead: (sessionId: string) => void;
  markSessionActive: (sessionId: string) => void; // Call when user views a session
  getOutputState: (sessionId: string) => OutputState;
  getRuntimeState: (sessionId: string) => SessionRuntimeState | undefined;
  clearRuntimeState: (sessionId: string) => void;

  // Enhanced input state actions
  getEnhancedInputState: (sessionId: string) => EnhancedInputState;
  setEnhancedInputOpen: (sessionId: string, open: boolean) => void;
  setEnhancedInputContent: (sessionId: string, content: string) => void;
  setEnhancedInputImages: (sessionId: string, imagePaths: string[]) => void;
  clearEnhancedInput: (sessionId: string, keepOpen?: boolean) => void; // Clear content after sending

  // Aggregated state selectors
  getAggregatedByWorktree: (cwd: string) => AggregatedOutputState;
  getAggregatedByRepo: (repoPath: string) => AggregatedOutputState;
  getAggregatedGlobal: () => AggregatedOutputState;
}

function loadFromStorage(): { sessions: Session[]; activeIds: Record<string, string | null> } {
  try {
    const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.sessions?.length > 0) {
        // Migrate old sessions that don't have repoPath (backwards compatibility)
        const migratedSessions = data.sessions.map((s: Session) => ({
          ...s,
          repoPath: s.repoPath || s.cwd,
        }));
        return { sessions: migratedSessions, activeIds: data.activeIds || {} };
      }
    }
  } catch {}
  return { sessions: [], activeIds: {} };
}

function saveToStorage(sessions: Session[], activeIds: Record<string, string | null>): void {
  // Only persist sessions that are:
  // 1. Using agents that support resumption (e.g., claude)
  // 2. Activated (user has pressed Enter at least once)
  const persistableSessions = sessions.filter(
    (s) => isResumableAgent(s.agentCommand) && s.activated
  );
  const persistableIds = new Set(persistableSessions.map((s) => s.id));
  // Only keep activeIds that reference persistable sessions
  const persistableActiveIds: Record<string, string | null> = {};
  for (const [cwd, id] of Object.entries(activeIds)) {
    persistableActiveIds[cwd] = id && persistableIds.has(id) ? id : null;
  }
  localStorage.setItem(
    SESSIONS_STORAGE_KEY,
    JSON.stringify({ sessions: persistableSessions, activeIds: persistableActiveIds })
  );
}

const initialState = loadFromStorage();

/**
 * Compute aggregated output state counts from sessions.
 * Returns counts for total, outputting, and unread sessions.
 */
export function computeAggregatedState(
  sessions: { id: string }[],
  runtimeStates: Record<string, { outputState?: OutputState }>
): AggregatedOutputState {
  let outputting = 0;
  let unread = 0;
  for (const session of sessions) {
    const state = runtimeStates[session.id]?.outputState ?? 'idle';
    if (state === 'outputting') outputting++;
    else if (state === 'unread') unread++;
  }
  return { total: sessions.length, outputting, unread };
}

/**
 * Compute the highest priority output state from sessions.
 * Priority: outputting > unread > idle
 * Used for UI glow effects.
 */
export function computeHighestOutputState(
  sessions: { id: string }[],
  runtimeStates: Record<string, { outputState?: OutputState }>
): OutputState {
  let hasOutputting = false;
  let hasUnread = false;
  for (const session of sessions) {
    const state = runtimeStates[session.id]?.outputState ?? 'idle';
    if (state === 'outputting') hasOutputting = true;
    else if (state === 'unread') hasUnread = true;
  }
  if (hasOutputting) return 'outputting';
  if (hasUnread) return 'unread';
  return 'idle';
}

export const useAgentSessionsStore = create<AgentSessionsState>()(
  subscribeWithSelector((set, get) => ({
    sessions: initialState.sessions,
    activeIds: initialState.activeIds,
    groupStates: {}, // Not persisted - will be recreated from sessions on mount
    runtimeStates: {}, // Not persisted - runtime output states
    enhancedInputStates: {}, // Not persisted - enhanced input states per session

    addSession: (session) =>
      set((state) => {
        console.log('[AgentSessions] Creating session:', session.sessionId, 'at', session.cwd);

        // Calculate displayOrder: max order in same worktree + 1
        const worktreeSessions = state.sessions.filter(
          (s) => s.repoPath === session.repoPath && pathsEqual(s.cwd, session.cwd)
        );
        const maxOrder = worktreeSessions.reduce(
          (max, s) => Math.max(max, s.displayOrder ?? 0),
          -1
        );
        const newSession = { ...session, displayOrder: maxOrder + 1 };
        return {
          sessions: [...state.sessions, newSession],
          activeIds: { ...state.activeIds, [normalizePath(session.cwd)]: session.id },
          // Initialize enhanced input state for new session to ensure auto-popup works
          enhancedInputStates: {
            ...state.enhancedInputStates,
            [session.id]: { open: false, content: '', imagePaths: [] },
          },
        };
      }),

    removeSession: (id) =>
      set((state) => {
        const removedSession = state.sessions.find((s) => s.id === id);
        console.log('[AgentSessions] Removing session:', removedSession?.sessionId);

        const newSessions = state.sessions.filter((s) => s.id !== id);
        // Clean up runtime states
        const newRuntimeStates = { ...state.runtimeStates };
        delete newRuntimeStates[id];
        // Clean up enhanced input states
        const newEnhancedInputStates = { ...state.enhancedInputStates };
        delete newEnhancedInputStates[id];
        return {
          sessions: newSessions,
          runtimeStates: newRuntimeStates,
          enhancedInputStates: newEnhancedInputStates,
        };
      }),

    updateSession: (id, updates) =>
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      })),

    setActiveId: (cwd, sessionId) =>
      set((state) => ({
        activeIds: { ...state.activeIds, [normalizePath(cwd)]: sessionId },
      })),

    reorderSessions: (repoPath, cwd, fromIndex, toIndex) =>
      set((state) => {
        // Get sessions for current worktree, sorted by displayOrder
        const worktreeSessions = state.sessions
          .filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd))
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        if (fromIndex < 0 || fromIndex >= worktreeSessions.length) return state;
        if (toIndex < 0 || toIndex >= worktreeSessions.length) return state;

        // Build new order array
        const orderedIds = worktreeSessions.map((s) => s.id);
        const [movedId] = orderedIds.splice(fromIndex, 1);
        orderedIds.splice(toIndex, 0, movedId);

        // Create id -> new displayOrder map
        const newOrderMap = new Map<string, number>();
        for (let i = 0; i < orderedIds.length; i++) {
          newOrderMap.set(orderedIds[i], i);
        }

        // Update displayOrder for affected sessions only (don't reorder array)
        return {
          sessions: state.sessions.map((s) => {
            if (s.repoPath === repoPath && pathsEqual(s.cwd, cwd)) {
              const newOrder = newOrderMap.get(s.id);
              if (newOrder !== undefined && newOrder !== s.displayOrder) {
                return { ...s, displayOrder: newOrder };
              }
            }
            return s;
          }),
        };
      }),

    getSessions: (repoPath, cwd) => {
      return get()
        .sessions.filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd))
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    },

    getActiveSessionId: (repoPath, cwd) => {
      const state = get();
      const activeId = state.activeIds[normalizePath(cwd)];
      if (activeId) {
        // Verify the session exists and matches repoPath
        const session = state.sessions.find((s) => s.id === activeId);
        if (session && session.repoPath === repoPath) {
          return activeId;
        }
      }
      // Fallback to first session for this repo+cwd
      const firstSession = state.sessions.find(
        (s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd)
      );
      return firstSession?.id || null;
    },

    // Group state actions
    getGroupState: (cwd) => {
      const normalized = normalizePath(cwd);
      return get().groupStates[normalized] || createInitialGroupState();
    },

    setGroupState: (cwd, state) =>
      set((prev) => ({
        groupStates: { ...prev.groupStates, [normalizePath(cwd)]: state },
      })),

    updateGroupState: (cwd, updater) =>
      set((prev) => {
        const normalized = normalizePath(cwd);
        const currentState = prev.groupStates[normalized] || createInitialGroupState();
        return {
          groupStates: { ...prev.groupStates, [normalized]: updater(currentState) },
        };
      }),

    removeGroupState: (cwd) =>
      set((prev) => {
        const normalized = normalizePath(cwd);
        const newStates = { ...prev.groupStates };
        delete newStates[normalized];
        return { groupStates: newStates };
      }),

    // Runtime state actions
    setOutputState: (sessionId, outputState, isActive = false) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];

        // Handle state transitions
        if (outputState === 'outputting') {
          // Starting to output: just track the state
          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                outputState: 'outputting',
                lastActivityAt: Date.now(),
                wasActiveWhenOutputting: isActive,
              },
            },
          };
        }

        if (outputState === 'idle') {
          // If already unread, don't override to idle (preserve unread state)
          // This prevents process activity polling from overriding Stop Hook result
          if (currentState?.outputState === 'unread') {
            return prev;
          }

          // Transitioning to idle: check if we need to mark as unread
          const wasOutputting = currentState?.outputState === 'outputting';
          // Only check if user is CURRENTLY viewing the session
          // If user is not viewing when AI finishes, mark as unread
          const shouldMarkUnread = wasOutputting && !isActive;

          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                outputState: shouldMarkUnread ? 'unread' : 'idle',
                lastActivityAt: Date.now(),
                wasActiveWhenOutputting: false,
              },
            },
          };
        }

        // For other states (unread), just set directly
        if (currentState?.outputState === outputState) {
          return prev;
        }
        return {
          runtimeStates: {
            ...prev.runtimeStates,
            [sessionId]: {
              outputState,
              lastActivityAt: Date.now(),
              wasActiveWhenOutputting: false,
            },
          },
        };
      }),

    markAsRead: (sessionId) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];
        if (!currentState || currentState.outputState !== 'unread') {
          return prev;
        }
        return {
          runtimeStates: {
            ...prev.runtimeStates,
            [sessionId]: {
              ...currentState,
              outputState: 'idle',
            },
          },
        };
      }),

    markSessionActive: (sessionId) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];
        if (!currentState) {
          return prev;
        }
        // If currently outputting, mark that user is now viewing
        // If unread, mark as read
        if (currentState.outputState === 'outputting') {
          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                ...currentState,
                wasActiveWhenOutputting: true,
              },
            },
          };
        }
        if (currentState.outputState === 'unread') {
          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                ...currentState,
                outputState: 'idle',
              },
            },
          };
        }
        return prev;
      }),

    getOutputState: (sessionId) => {
      return get().runtimeStates[sessionId]?.outputState ?? 'idle';
    },

    getRuntimeState: (sessionId) => {
      return get().runtimeStates[sessionId];
    },

    clearRuntimeState: (sessionId) =>
      set((prev) => {
        const newStates = { ...prev.runtimeStates };
        delete newStates[sessionId];
        return { runtimeStates: newStates };
      }),

    // Aggregated state selectors
    getAggregatedByWorktree: (cwd) => {
      const state = get();
      const normalizedCwd = normalizePath(cwd);
      const worktreeSessions = state.sessions.filter((s) => normalizePath(s.cwd) === normalizedCwd);
      return computeAggregatedState(worktreeSessions, state.runtimeStates);
    },

    getAggregatedByRepo: (repoPath) => {
      const state = get();
      const repoSessions = state.sessions.filter((s) => s.repoPath === repoPath);
      return computeAggregatedState(repoSessions, state.runtimeStates);
    },

    getAggregatedGlobal: () => {
      const state = get();
      return computeAggregatedState(state.sessions, state.runtimeStates);
    },

    // Enhanced input state actions
    getEnhancedInputState: (sessionId) => {
      return get().enhancedInputStates[sessionId] ?? DEFAULT_ENHANCED_INPUT_STATE;
    },

    setEnhancedInputOpen: (sessionId, open) =>
      set((prev) => {
        const current = prev.enhancedInputStates[sessionId] ?? DEFAULT_ENHANCED_INPUT_STATE;
        return {
          enhancedInputStates: {
            ...prev.enhancedInputStates,
            [sessionId]: { ...current, open },
          },
        };
      }),

    setEnhancedInputContent: (sessionId, content) =>
      set((prev) => {
        const current = prev.enhancedInputStates[sessionId] ?? DEFAULT_ENHANCED_INPUT_STATE;
        return {
          enhancedInputStates: {
            ...prev.enhancedInputStates,
            [sessionId]: { ...current, content },
          },
        };
      }),

    setEnhancedInputImages: (sessionId, imagePaths) =>
      set((prev) => {
        const current = prev.enhancedInputStates[sessionId] ?? DEFAULT_ENHANCED_INPUT_STATE;
        return {
          enhancedInputStates: {
            ...prev.enhancedInputStates,
            [sessionId]: { ...current, imagePaths },
          },
        };
      }),

    clearEnhancedInput: (sessionId, keepOpen = false) =>
      set((prev) => {
        const current = prev.enhancedInputStates[sessionId];
        if (!current) return prev;
        return {
          enhancedInputStates: {
            ...prev.enhancedInputStates,
            [sessionId]: { open: keepOpen, content: '', imagePaths: [] },
          },
        };
      }),
  }))
);

// Subscribe to state changes and persist to localStorage
useAgentSessionsStore.subscribe(
  (state) => ({ sessions: state.sessions, activeIds: state.activeIds }),
  ({ sessions, activeIds }) => {
    saveToStorage(sessions, activeIds);
  },
  { equalityFn: (a, b) => a.sessions === b.sessions && a.activeIds === b.activeIds }
);
