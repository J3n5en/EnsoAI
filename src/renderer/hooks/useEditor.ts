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
    closeOtherFiles,
    closeFilesToLeft,
    closeFilesToRight,
    closeAllFiles,
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
      const { content, encoding } = await window.electronAPI.file.read(path);
      openFile({ path, content, encoding, isDirty: false });
      return { content, encoding };
    },
  });

  const saveFile = useMutation({
    mutationFn: async (path: string) => {
      // Get latest tabs from store to avoid stale closure issue
      const currentTabs = useEditorStore.getState().tabs;
      const file = currentTabs.find((f) => f.path === path);
      if (!file) throw new Error('File not found');
      await window.electronAPI.file.write(path, file.content, file.encoding);
      markFileSaved(path);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file', 'list'] });
    },
  });

  // Load file and navigate to specific line/column
  const navigateToFile = useCallback(
    async (
      path: string,
      line?: number,
      column?: number,
      matchLength?: number,
      previewMode?: 'off' | 'split' | 'fullscreen'
    ) => {
      const existingTab = tabs.find((t) => t.path === path);

      if (existingTab) {
        setActiveFile(path);
      } else {
        try {
          const { content, encoding } = await window.electronAPI.file.read(path);
          openFile({ path, content, encoding, isDirty: false });
        } catch {
          return;
        }
      }

      // Set pending cursor position if line is specified
      if (line !== undefined) {
        setPendingCursor({ path, line, column, matchLength, previewMode });
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
    closeOtherFiles,
    closeFilesToLeft,
    closeFilesToRight,
    closeAllFiles,
    setActiveFile,
    updateFileContent,
    setTabViewState,
    reorderTabs,
    setPendingCursor,
    navigateToFile,
  };
}
