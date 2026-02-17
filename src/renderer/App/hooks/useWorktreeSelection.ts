import type { GitWorktree } from '@shared/types';
import { useQueryClient } from '@tanstack/react-query';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { requestUnsavedChoice } from '@/stores/unsavedPrompt';
import type { TabId } from '../constants';

export function useWorktreeSelection(
  activeWorktree: GitWorktree | null,
  setActiveWorktree: (worktree: GitWorktree | null) => void,
  currentWorktreePathRef: MutableRefObject<string | null>,
  worktreeTabMap: Record<string, TabId>,
  setWorktreeTabMap: (fn: (prev: Record<string, TabId>) => Record<string, TabId>) => void,
  activeTab: TabId,
  setActiveTab: (tab: TabId) => void,
  selectedRepo: string | null,
  setSelectedRepo: (repo: string) => void
) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const editorSettings = useSettingsStore((s) => s.editorSettings);
  const switchEditorWorktree = useEditorStore((s) => s.switchWorktree);
  const currentEditorWorktree = useEditorStore((s) => s.currentWorktreePath);

  // Sync editor state with active worktree
  useEffect(() => {
    const targetPath = activeWorktree?.path ?? null;
    if (targetPath !== currentEditorWorktree) {
      switchEditorWorktree(targetPath);
    }
  }, [activeWorktree, currentEditorWorktree, switchEditorWorktree]);

  // Helper function to refresh git data for a worktree
  const refreshGitData = useCallback(
    (worktreePath: string) => {
      // Update ref to track current worktree for race condition prevention
      currentWorktreePathRef.current = worktreePath;

      // Immediately refresh local git data
      const localKeys = [
        'status',
        'file-changes',
        'file-diff',
        'log',
        'log-infinite',
        'submodules',
      ];
      for (const key of localKeys) {
        queryClient.invalidateQueries({ queryKey: ['git', key, worktreePath] });
      }
      queryClient.invalidateQueries({
        queryKey: ['git', 'submodule', 'changes', worktreePath],
      });

      // Fetch remote then refresh branch data (with race condition check)
      window.electronAPI.git
        .fetch(worktreePath)
        .then(() => {
          // Only refresh if this is still the current worktree
          if (currentWorktreePathRef.current === worktreePath) {
            queryClient.invalidateQueries({
              queryKey: ['git', 'branches', worktreePath],
            });
            queryClient.invalidateQueries({
              queryKey: ['git', 'status', worktreePath],
            });
          }
        })
        .catch(() => {
          // Silent fail - fetch errors are not critical
        });
    },
    [queryClient, currentWorktreePathRef]
  );

  const handleSelectWorktree = useCallback(
    async (worktree: GitWorktree, nextRepoPath?: string) => {
      if (editorSettings.autoSave === 'off') {
        const editorState = useEditorStore.getState();
        const dirtyTabs = editorState.tabs.filter((tab) => tab.isDirty);

        for (const tab of dirtyTabs) {
          const fileName = tab.path.split(/[/\\]/).pop() ?? tab.path;
          const choice = await requestUnsavedChoice(fileName);

          if (choice === 'cancel') {
            return;
          }

          if (choice === 'save') {
            try {
              await window.electronAPI.file.write(tab.path, tab.content, tab.encoding);
              useEditorStore.getState().markFileSaved(tab.path);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              toastManager.add({
                type: 'error',
                title: t('Save failed'),
                description: message,
              });
              return;
            }
          } else {
            try {
              const { content, isBinary } = await window.electronAPI.file.read(tab.path);
              if (!isBinary) {
                useEditorStore.getState().updateFileContent(tab.path, content, false);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              toastManager.add({
                type: 'error',
                title: t('File read failed'),
                description: message,
              });
              return;
            }
          }
        }
      }

      if (nextRepoPath && nextRepoPath !== selectedRepo) {
        setSelectedRepo(nextRepoPath);
      }

      // Save current worktree's tab state before switching
      if (activeWorktree?.path) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: activeTab,
        }));
      }

      // Switch to new worktree
      setActiveWorktree(worktree);

      // Restore the new worktree's tab state
      const savedTab = worktreeTabMap[worktree.path] || 'chat';
      setActiveTab(savedTab);

      // Refresh git data for the new worktree
      refreshGitData(worktree.path);
    },
    [
      activeWorktree,
      activeTab,
      worktreeTabMap,
      editorSettings.autoSave,
      t,
      refreshGitData,
      selectedRepo,
      setSelectedRepo,
      setActiveWorktree,
      setWorktreeTabMap,
      setActiveTab,
    ]
  );

  return {
    refreshGitData,
    handleSelectWorktree,
  };
}
