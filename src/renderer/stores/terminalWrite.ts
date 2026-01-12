import { create } from 'zustand';

type WriteFunction = (data: string) => void;
type FocusFunction = () => void;

interface TerminalWriteStore {
  writers: Map<string, WriteFunction>;
  focusers: Map<string, FocusFunction>;
  register: (sessionId: string, write: WriteFunction, focus?: FocusFunction) => void;
  unregister: (sessionId: string) => void;
  write: (sessionId: string, data: string) => void;
  focus: (sessionId: string) => void;
}

/**
 * 终端写入 store，提供跨组件访问终端写入和聚焦功能
 * 用于 DiffReviewModal 等组件向特定 session 的终端发送消息
 */
export const useTerminalWriteStore = create<TerminalWriteStore>((set, get) => ({
  writers: new Map(),
  focusers: new Map(),

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

  write: (sessionId, data) => {
    const writer = get().writers.get(sessionId);
    if (writer) {
      writer(data);
    }
  },

  focus: (sessionId) => {
    const focuser = get().focusers.get(sessionId);
    if (focuser) {
      focuser();
    }
  },
}));
