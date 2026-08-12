import { create } from 'zustand';

interface SelectedFile {
  path: string;
  staged: boolean;
}

type NavigationDirection = 'next' | 'prev' | null;
type ViewMode = 'list' | 'tree';

interface SourceControlState {
  selectedFile: SelectedFile | null;
  setSelectedFile: (file: SelectedFile | null) => void;
  navigationDirection: NavigationDirection;
  setNavigationDirection: (direction: NavigationDirection) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  // Expanded folders of the active worktree (view over expandedByRoot)
  expandedFolders: Set<string>;
  // Expanded folder paths stored per worktree root, so different worktrees
  // don't share/pollute each other's expand state
  expandedByRoot: Record<string, Set<string>>;
  activeRoot: string | null;
  setActiveRoot: (rootPath: string | null) => void;
  toggleFolder: (path: string) => void;
  // Drop stored expand state for a removed worktree
  clearRootFolders: (rootPath: string) => void;
}

const EMPTY_EXPANDED = new Set<string>();

export const useSourceControlStore = create<SourceControlState>((set) => ({
  selectedFile: null,
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  navigationDirection: null,
  setNavigationDirection: (navigationDirection) => set({ navigationDirection }),
  viewMode: 'list',
  setViewMode: (viewMode) => set({ viewMode }),
  expandedFolders: EMPTY_EXPANDED,
  expandedByRoot: {},
  activeRoot: null,

  setActiveRoot: (rootPath) =>
    set((state) => {
      if (state.activeRoot === rootPath) return state;
      return {
        activeRoot: rootPath,
        expandedFolders: (rootPath && state.expandedByRoot[rootPath]) || EMPTY_EXPANDED,
      };
    }),

  toggleFolder: (path) =>
    set((state) => {
      const key = state.activeRoot ?? '';
      const newExpanded = new Set(state.expandedByRoot[key] ?? state.expandedFolders);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return {
        expandedFolders: newExpanded,
        expandedByRoot: { ...state.expandedByRoot, [key]: newExpanded },
      };
    }),

  clearRootFolders: (rootPath) =>
    set((state) => {
      const { [rootPath]: _, ...rest } = state.expandedByRoot;
      return {
        expandedByRoot: rest,
        ...(state.activeRoot === rootPath ? { expandedFolders: EMPTY_EXPANDED } : {}),
      };
    }),
}));
