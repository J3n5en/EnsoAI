import { create } from 'zustand';

type WriteFunction = (data: string) => void;
type FocusFunction = () => void;

interface TerminalWriteStore {
  writers: Map<string, WriteFunction>;
  focusers: Map<string, FocusFunction>;
  activeSessionId: string | null;
  register: (sessionId: string, write: WriteFunction, focus?: FocusFunction) => void;
  unregister: (sessionId: string) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  write: (sessionId: string, data: string) => void;
  writeToActive: (data: string) => boolean;
  focus: (sessionId: string) => void;
  focusActive: () => void;
}

/**
 * Terminal write store providing cross-component access to terminal write and focus functions.
 * Used by DiffReviewModal and other components to send messages to specific session terminals.
 */
export const useTerminalWriteStore = create<TerminalWriteStore>((set, get) => ({
  writers: new Map(),
  focusers: new Map(),
  activeSessionId: null,

  register: (sessionId, write, focus) => {
    set((state) => {
      const writers = new Map(state.writers);
      const focusers = new Map(state.focusers);
      writers.set(sessionId, write);
      if (focus) {
        focusers.set(sessionId, focus);
      }
      return { writers, focusers };
    });
  },

  unregister: (sessionId) => {
    set((state) => {
      const writers = new Map(state.writers);
      const focusers = new Map(state.focusers);
      writers.delete(sessionId);
      focusers.delete(sessionId);
      return { writers, focusers };
    });
  },

  setActiveSessionId: (sessionId) => {
    // Avoid redundant updates if value hasn't changed
    if (get().activeSessionId === sessionId) return;
    set({ activeSessionId: sessionId });
  },

  write: (sessionId, data) => {
    const writer = get().writers.get(sessionId);
    if (writer) {
      writer(data);
    }
  },

  writeToActive: (data) => {
    const { activeSessionId, writers } = get();
    if (!activeSessionId) return false;
    const writer = writers.get(activeSessionId);
    if (writer) {
      writer(data);
      return true;
    }
    return false;
  },

  focus: (sessionId) => {
    const focuser = get().focusers.get(sessionId);
    if (focuser) {
      focuser();
    }
  },

  focusActive: () => {
    const { activeSessionId, focusers } = get();
    if (!activeSessionId) return;
    const focuser = focusers.get(activeSessionId);
    if (focuser) {
      focuser();
    }
  },
}));
