import type { AppCloseRequestPayload } from '@shared/types';
import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';

export function useAppLifecycle(setCloseDialogOpen: (open: boolean) => void) {
  const pendingRequestIdRef = useRef<string | null>(null);
  const getDirtyPaths = useCallback(() => {
    const state = useEditorStore.getState();
    const editorSettings = useSettingsStore.getState().editorSettings;
    const allTabs = [...state.tabs, ...Object.values(state.worktreeStates).flatMap((s) => s.tabs)];

    return editorSettings.autoSave === 'off'
      ? Array.from(new Set(allTabs.filter((t) => t.isDirty).map((t) => t.path)))
      : [];
  }, []);

  // Called by the close confirmation dialog when user confirms
  const confirmCloseAndRespond = useCallback(() => {
    const requestId = pendingRequestIdRef.current;
    if (!requestId) return;
    pendingRequestIdRef.current = null;

    window.electronAPI.app.respondCloseRequest(requestId, {
      confirmed: true,
      dirtyPaths: getDirtyPaths(),
    });
  }, [getDirtyPaths]);

  // Called by the close confirmation dialog when user cancels (or dismisses)
  const cancelCloseAndRespond = useCallback(() => {
    const requestId = pendingRequestIdRef.current;
    if (!requestId) return;
    pendingRequestIdRef.current = null;

    window.electronAPI.app.respondCloseRequest(requestId, { confirmed: false, dirtyPaths: [] });
  }, []);

  // Listen for close request from main process
  useEffect(() => {
    const cleanup = window.electronAPI.app.onCloseRequest((payload: AppCloseRequestPayload) => {
      if (payload.reason === 'replace-window') {
        window.electronAPI.app.respondCloseRequest(payload.requestId, {
          confirmed: true,
          dirtyPaths: getDirtyPaths(),
        });
        return;
      }

      pendingRequestIdRef.current = payload.requestId;
      setCloseDialogOpen(true);
    });
    return cleanup;
  }, [getDirtyPaths, setCloseDialogOpen]);

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

  return { confirmCloseAndRespond, cancelCloseAndRespond };
}
