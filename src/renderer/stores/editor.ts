import { create } from 'zustand';

export interface EditorTab {
  path: string;
  title: string;
  content: string;
  isDirty: boolean;
  viewState?: unknown; // Monaco editor view state
}

export interface PendingCursor {
  path: string;
  line: number;
  column?: number;
  matchLength?: number;
}

interface WorktreeEditorState {
  tabs: EditorTab[];
  activeTabPath: string | null;
}

interface EditorState {
  // Current active state
  tabs: EditorTab[];
  activeTabPath: string | null;
  pendingCursor: PendingCursor | null;
  currentCursorLine: number | null; // Current cursor line in active editor

  // Per-worktree state storage
  worktreeStates: Record<string, WorktreeEditorState>;
  currentWorktreePath: string | null;

  openFile: (file: Omit<EditorTab, 'title' | 'viewState'> & { title?: string }) => void;
  closeFile: (path: string) => void;
  closeOtherFiles: (keepPath: string) => void;
  closeFilesToLeft: (path: string) => void;
  closeFilesToRight: (path: string) => void;
  closeAllFiles: () => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string, isDirty?: boolean) => void;
  markFileSaved: (path: string) => void;
  setTabViewState: (path: string, viewState: unknown) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  setPendingCursor: (cursor: PendingCursor | null) => void;
  setCurrentCursorLine: (line: number | null) => void;
  switchWorktree: (worktreePath: string | null) => void;
  clearAllWorktreeStates: () => void;
  clearWorktreeState: (worktreePath: string) => void;
}

const getTabTitle = (path: string) => path.split(/[/\\]/).pop() || path;

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabPath: null,
  pendingCursor: null,
  currentCursorLine: null,
  worktreeStates: {},
  currentWorktreePath: null,

  openFile: (file) =>
    set((state) => {
      const exists = state.tabs.some((tab) => tab.path === file.path);
      if (exists) {
        return {
          tabs: state.tabs.map((tab) =>
            tab.path === file.path ? { ...tab, ...file, title: file.title ?? tab.title } : tab
          ),
          activeTabPath: file.path,
        };
      }
      return {
        tabs: [
          ...state.tabs,
          {
            ...file,
            title: file.title ?? getTabTitle(file.path),
          },
        ],
        activeTabPath: file.path,
      };
    }),

  closeFile: (path) =>
    set((state) => {
      const newTabs = state.tabs.filter((tab) => tab.path !== path);
      const newActive =
        state.activeTabPath === path
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].path
            : null
          : state.activeTabPath;
      return { tabs: newTabs, activeTabPath: newActive };
    }),

  closeOtherFiles: (keepPath) =>
    set((state) => {
      const keepTab = state.tabs.find((tab) => tab.path === keepPath);
      if (!keepTab) return { tabs: state.tabs, activeTabPath: state.activeTabPath };
      return { tabs: [keepTab], activeTabPath: keepPath };
    }),

  closeFilesToLeft: (path) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.path === path);
      if (index <= 0) return { tabs: state.tabs, activeTabPath: state.activeTabPath };
      const newTabs = state.tabs.slice(index);
      const activeStillOpen = state.activeTabPath
        ? newTabs.some((t) => t.path === state.activeTabPath)
        : false;
      const newActive = activeStillOpen ? state.activeTabPath : (newTabs[0]?.path ?? null);
      return { tabs: newTabs, activeTabPath: newActive };
    }),

  closeFilesToRight: (path) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.path === path);
      if (index < 0 || index >= state.tabs.length - 1) {
        return { tabs: state.tabs, activeTabPath: state.activeTabPath };
      }
      const newTabs = state.tabs.slice(0, index + 1);
      const activeStillOpen = state.activeTabPath
        ? newTabs.some((t) => t.path === state.activeTabPath)
        : false;
      const newActive = activeStillOpen
        ? state.activeTabPath
        : (newTabs[newTabs.length - 1]?.path ?? null);
      return { tabs: newTabs, activeTabPath: newActive };
    }),

  closeAllFiles: () =>
    set({ tabs: [], activeTabPath: null, pendingCursor: null, currentCursorLine: null }),

  setActiveFile: (path) => set({ activeTabPath: path }),

  updateFileContent: (path, content, isDirty = true) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, content, isDirty } : tab)),
    })),

  markFileSaved: (path) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, isDirty: false } : tab)),
    })),

  setTabViewState: (path, viewState) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, viewState } : tab)),
    })),

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex === toIndex) return { tabs: state.tabs };
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      if (!moved) return { tabs: state.tabs };
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    }),

  setPendingCursor: (cursor) => set({ pendingCursor: cursor }),

  setCurrentCursorLine: (line) => set({ currentCursorLine: line }),

  switchWorktree: (worktreePath) => {
    const state = get();
    const currentPath = state.currentWorktreePath;

    // Save current worktree state (if we have one)
    let newWorktreeStates = state.worktreeStates;
    if (currentPath) {
      newWorktreeStates = {
        ...newWorktreeStates,
        [currentPath]: {
          tabs: state.tabs,
          activeTabPath: state.activeTabPath,
        },
      };
    }

    // Load new worktree state (or empty if none)
    const savedState = worktreePath ? newWorktreeStates[worktreePath] : null;

    set({
      worktreeStates: newWorktreeStates,
      currentWorktreePath: worktreePath,
      tabs: savedState?.tabs ?? [],
      activeTabPath: savedState?.activeTabPath ?? null,
      pendingCursor: null,
      currentCursorLine: null,
    });
  },

  clearAllWorktreeStates: () => {
    set({
      worktreeStates: {},
      currentWorktreePath: null,
      tabs: [],
      activeTabPath: null,
      pendingCursor: null,
      currentCursorLine: null,
    });
  },

  clearWorktreeState: (worktreePath) => {
    set((state) => {
      const { [worktreePath]: _, ...rest } = state.worktreeStates;
      return { worktreeStates: rest };
    });
  },
}));
