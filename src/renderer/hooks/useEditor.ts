import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { isUnsupportedBinaryFile } from '@/components/files/fileIcons';
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

  // Background refresh: re-read file from disk and silently update store (only if tab is not dirty)
  const refreshFileContent = useCallback(
    async (path: string) => {
      const currentTabs = useEditorStore.getState().tabs;
      const tab = currentTabs.find((t) => t.path === path);
      if (!tab || tab.isDirty) return;

      try {
        const { content, isBinary } = await window.electronAPI.file.read(path);
        if (isBinary) return;
        // Re-check after async IO to avoid race conditions
        const latestTab = useEditorStore.getState().tabs.find((t) => t.path === path);
        if (latestTab && !latestTab.isDirty && latestTab.content !== content) {
          updateFileContent(path, content, false);
        }
      } catch {
        // File may have been deleted or become inaccessible
      }
    },
    [updateFileContent]
  );

  const loadFile = useMutation({
    mutationFn: async (path: string) => {
      const { content, encoding, isBinary } = await window.electronAPI.file.read(path);
      openFile({
        path,
        content,
        encoding,
        isDirty: false,
        isUnsupported: isUnsupportedBinaryFile(path, isBinary),
      });
      return { content, encoding, isBinary };
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
        // Background refresh to pick up external modifications
        refreshFileContent(path);
      } else {
        try {
          const { content, encoding, isBinary } = await window.electronAPI.file.read(path);
          openFile({
            path,
            content,
            encoding,
            isDirty: false,
            isUnsupported: isUnsupportedBinaryFile(path, isBinary),
          });
        } catch {
          return;
        }
      }

      // Set pending cursor position if line is specified
      if (line !== undefined) {
        setPendingCursor({ path, line, column, matchLength, previewMode });
      }
    },
    [tabs, setActiveFile, openFile, setPendingCursor, refreshFileContent]
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
    refreshFileContent,
  };
}
