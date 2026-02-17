import { useEffect } from 'react';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';

export function useAppLifecycle() {
  // Listen for close request from main process
  useEffect(() => {
    const cleanup = window.electronAPI.app.onCloseRequest((requestId) => {
      const state = useEditorStore.getState();
      const editorSettings = useSettingsStore.getState().editorSettings;

      const allTabs = [
        ...state.tabs,
        ...Object.values(state.worktreeStates).flatMap((s) => s.tabs),
      ];

      const dirtyPaths =
        editorSettings.autoSave === 'off'
          ? Array.from(new Set(allTabs.filter((t) => t.isDirty).map((t) => t.path)))
          : [];

      window.electronAPI.app.respondCloseRequest(requestId, { dirtyPaths });
    });
    return cleanup;
  }, []);

  // Main process asks renderer to save a specific dirty file before closing
  useEffect(() => {
    const cleanup = window.electronAPI.app.onCloseSaveRequest(async (requestId, path) => {
      try {
        const state = useEditorStore.getState();
        const allTabs = [
          ...state.tabs,
          ...Object.values(state.worktreeStates).flatMap((s) => s.tabs),
        ];
        const tab = allTabs.find((t) => t.path === path);
        if (!tab) {
          window.electronAPI.app.respondCloseSaveRequest(requestId, {
            ok: false,
            error: 'File not found in editor tabs',
          });
          return;
        }

        await window.electronAPI.file.write(path, tab.content, tab.encoding);
        useEditorStore.getState().markFileSaved(path);

        window.electronAPI.app.respondCloseSaveRequest(requestId, {
          ok: true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        window.electronAPI.app.respondCloseSaveRequest(requestId, {
          ok: false,
          error: message,
        });
      }
    });
    return cleanup;
  }, []);
}
