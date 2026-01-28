import type { TerminalSession } from '@shared/types';
import { create } from 'zustand';

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  quickTerminalSessions: Map<string, string>; // worktreePath -> sessionId

  addSession: (session: TerminalSession) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateSession: (id: string, updates: Partial<TerminalSession>) => void;
  syncSessions: (sessions: TerminalSession[]) => void;

  // Quick Terminal session management
  setQuickTerminalSession: (worktreePath: string, sessionId: string) => void;
  getQuickTerminalSession: (worktreePath: string) => string | undefined;
  removeQuickTerminalSession: (worktreePath: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  quickTerminalSessions: new Map(),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId:
        state.activeSessionId === id
          ? state.sessions.find((s) => s.id !== id)?.id || null
          : state.activeSessionId,
    })),
  setActiveSession: (id) => set({ activeSessionId: id }),
  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  syncSessions: (sessions) => set({ sessions }),

  setQuickTerminalSession: (worktreePath, sessionId) =>
    set((state) => {
      const newMap = new Map(state.quickTerminalSessions);
      newMap.set(worktreePath, sessionId);
      return { quickTerminalSessions: newMap };
    }),
  getQuickTerminalSession: (worktreePath) => {
    const state = get();
    return state.quickTerminalSessions.get(worktreePath);
  },
  removeQuickTerminalSession: (worktreePath) =>
    set((state) => {
      const newMap = new Map(state.quickTerminalSessions);
      newMap.delete(worktreePath);
      return { quickTerminalSessions: newMap };
    }),
}));
