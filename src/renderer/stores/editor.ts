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
}

interface EditorState {
  tabs: EditorTab[];
  activeTabPath: string | null;
  pendingCursor: PendingCursor | null;

  openFile: (file: Omit<EditorTab, 'title' | 'viewState'> & { title?: string }) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileSaved: (path: string) => void;
  setTabViewState: (path: string, viewState: unknown) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  setPendingCursor: (cursor: PendingCursor | null) => void;
}

const getTabTitle = (path: string) => path.split(/[/\\]/).pop() || path;

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [],
  activeTabPath: null,
  pendingCursor: null,

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

  setActiveFile: (path) => set({ activeTabPath: path }),

  updateFileContent: (path, content) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, content, isDirty: true } : tab)),
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
}));
