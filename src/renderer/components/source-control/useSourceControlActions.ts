import { useCallback, useState } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useGitCommit, useGitDiscard, useGitStage, useGitUnstage } from '@/hooks/useSourceControl';
import { useI18n } from '@/i18n';
import { useSourceControlStore } from '@/stores/sourceControl';

export interface ConfirmAction {
  paths: string[];
  type: 'discard' | 'delete';
}

interface UseSourceControlActionsOptions {
  rootPath: string | undefined;
  stagedCount: number;
}

export function useSourceControlActions({ rootPath, stagedCount }: UseSourceControlActionsOptions) {
  const { t } = useI18n();
  const { selectedFile, setSelectedFile } = useSourceControlStore();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  // 使用单独的 dialogOpen 状态来控制对话框的可见性
  // 这样可以避免在关闭动画期间清除 confirmAction 导致内容闪烁
  const [dialogOpen, setDialogOpen] = useState(false);

  const stageMutation = useGitStage();
  const unstageMutation = useGitUnstage();
  const discardMutation = useGitDiscard();
  const commitMutation = useGitCommit();

  const handleStage = useCallback(
    (paths: string[]) => {
      if (rootPath) {
        stageMutation.mutate({ workdir: rootPath, paths });
      }
    },
    [rootPath, stageMutation]
  );

  const handleUnstage = useCallback(
    (paths: string[]) => {
      if (rootPath) {
        unstageMutation.mutate({ workdir: rootPath, paths });
      }
    },
    [rootPath, unstageMutation]
  );

  const handleDiscard = useCallback((paths: string[]) => {
    setConfirmAction({ paths, type: 'discard' });
    setDialogOpen(true);
  }, []);

  const handleDeleteUntracked = useCallback((paths: string[]) => {
    setConfirmAction({ paths, type: 'delete' });
    setDialogOpen(true);
  }, []);

  const handleConfirmAction = useCallback(async () => {
    if (!rootPath || !confirmAction) return;

    try {
      if (confirmAction.type === 'discard') {
        // 批量 discard，一次 git 调用避免锁冲突
        await discardMutation.mutateAsync({ workdir: rootPath, paths: confirmAction.paths });
      } else {
        // Delete untracked files
        for (const path of confirmAction.paths) {
          await window.electronAPI.file.delete(`${rootPath}/${path}`, {
            recursive: false,
          });
        }
        // Invalidate queries to refresh the file list
        stageMutation.mutate({ workdir: rootPath, paths: [] });
      }

      // Clear selection if affecting selected file
      if (selectedFile && confirmAction.paths.includes(selectedFile.path)) {
        setSelectedFile(null);
      }
    } catch (error) {
      toastManager.add({
        title: confirmAction.type === 'discard' ? t('Discard failed') : t('Delete failed'),
        description: error instanceof Error ? error.message : t('Unknown error'),
        type: 'error',
        timeout: 5000,
      });
    }

    // 只关闭对话框，保留 confirmAction 的值直到对话框完全关闭
    // 这样可以避免在关闭动画期间内容闪烁
    setDialogOpen(false);
  }, [rootPath, confirmAction, discardMutation, selectedFile, setSelectedFile, stageMutation, t]);

  // 当对话框关闭后清除 confirmAction
  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      // 对话框关闭后清除 confirmAction
      setConfirmAction(null);
    }
  }, []);

  const handleCommit = useCallback(
    async (message: string) => {
      if (!rootPath || stagedCount === 0) return;

      try {
        await commitMutation.mutateAsync({ workdir: rootPath, message });
        toastManager.add({
          title: t('Commit successful'),
          description: t('Committed {{count}} files', { count: stagedCount }),
          type: 'success',
          timeout: 3000,
        });
        setSelectedFile(null);
      } catch (error) {
        toastManager.add({
          title: t('Commit failed'),
          description: error instanceof Error ? error.message : t('Unknown error'),
          type: 'error',
          timeout: 5000,
        });
      }
    },
    [rootPath, stagedCount, commitMutation, setSelectedFile, t]
  );

  return {
    // Actions
    handleStage,
    handleUnstage,
    handleDiscard,
    handleDeleteUntracked,
    handleCommit,
    // Confirmation dialog
    confirmAction,
    dialogOpen,
    handleDialogOpenChange,
    handleConfirmAction,
    // Mutation state
    isCommitting: commitMutation.isPending,
  };
}
