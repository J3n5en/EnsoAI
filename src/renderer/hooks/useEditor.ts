import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useEditorStore } from '@/stores/editor';

export function useEditor() {
  const {
    tabs,
    activeTabPath,
    pendingCursor,
    openFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    markFileSaved,
    setTabViewState,
    reorderTabs,
    setPendingCursor,
  } = useEditorStore();

  const queryClient = useQueryClient();

  const loadFile = useMutation({
    mutationFn: async (path: string) => {
      const content = await window.electronAPI.file.read(path);
      openFile({ path, content, isDirty: false });
      return content;
    },
  });

  const saveFile = useMutation({
    mutationFn: async (path: string) => {
      const file = tabs.find((f) => f.path === path);
      if (!file) throw new Error('File not found');
      await window.electronAPI.file.write(path, file.content);
      markFileSaved(path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file', 'list'] });
    },
  });

  // Load file and navigate to specific line/column
  const navigateToFile = useCallback(
    async (path: string, line?: number, column?: number) => {
      const existingTab = tabs.find((t) => t.path === path);

      if (existingTab) {
        setActiveFile(path);
      } else {
        try {
          const content = await window.electronAPI.file.read(path);
          openFile({ path, content, isDirty: false });
        } catch {
          // File doesn't exist or can't be read
          return;
        }
      }

      // Set pending cursor position if line is specified
      if (line !== undefined) {
        setPendingCursor({ path, line, column });
      }
    },
    [tabs, setActiveFile, openFile, setPendingCursor]
  );

  const activeTab = tabs.find((f) => f.path === activeTabPath) || null;

  return {
    tabs,
    activeTab,
    pendingCursor,
    loadFile,
    saveFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    setTabViewState,
    reorderTabs,
    setPendingCursor,
    navigateToFile,
  };
}
