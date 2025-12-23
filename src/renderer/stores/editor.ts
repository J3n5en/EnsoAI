import { create } from 'zustand';

interface EditorFile {
  path: string;
  content: string;
  isDirty: boolean;
  language?: string;
}

interface EditorState {
  openFiles: EditorFile[];
  activeFilePath: string | null;

  openFile: (file: EditorFile) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileSaved: (path: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  openFiles: [],
  activeFilePath: null,

  openFile: (file) =>
    set((state) => {
      const exists = state.openFiles.some((f) => f.path === file.path);
      if (exists) {
        return { activeFilePath: file.path };
      }
      return {
        openFiles: [...state.openFiles, file],
        activeFilePath: file.path,
      };
    }),
  closeFile: (path) =>
    set((state) => {
      const newFiles = state.openFiles.filter((f) => f.path !== path);
      const newActive =
        state.activeFilePath === path
          ? newFiles.length > 0
            ? newFiles[newFiles.length - 1].path
            : null
          : state.activeFilePath;
      return { openFiles: newFiles, activeFilePath: newActive };
    }),
  setActiveFile: (path) => set({ activeFilePath: path }),
  updateFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, isDirty: true } : f
      ),
    })),
  markFileSaved: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) => (f.path === path ? { ...f, isDirty: false } : f)),
    })),
}));
