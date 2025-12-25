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
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
}

export const useSourceControlStore = create<SourceControlState>((set) => ({
  selectedFile: null,
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  navigationDirection: null,
  setNavigationDirection: (navigationDirection) => set({ navigationDirection }),
  viewMode: 'list',
  setViewMode: (viewMode) => set({ viewMode }),
  expandedFolders: new Set<string>(),
  toggleFolder: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedFolders);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { expandedFolders: newExpanded };
    }),
}));
