import { useCallback } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useGitPull, useGitPush, useGitStatus } from './useGit';

interface UseGitSyncOptions {
  workdir: string;
  enabled?: boolean;
}

/**
 * Custom hook for git sync operations (pull/push/publish).
 * Consolidates sync logic used across TreeSidebar, WorktreePanel, and SourceControlPanel.
 */
export function useGitSync({ workdir, enabled = true }: UseGitSyncOptions) {
  const { t } = useI18n();
  const { data: gitStatus, refetch: refetchStatus } = useGitStatus(workdir, enabled);
  const pullMutation = useGitPull();
  const pushMutation = useGitPush();

  const isSyncing = pullMutation.isPending || pushMutation.isPending;
  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;
  const tracking = gitStatus?.tracking ?? null;
  const currentBranch = gitStatus?.current ?? null;

  // Sync handler: pull first (if behind), then push (if ahead)
  const handleSync = useCallback(async () => {
    // Early return if already syncing (uses React Query's reactive isPending state)
    if (pullMutation.isPending || pushMutation.isPending) return;

    try {
      let pulled = false;
      let pushed = false;

      // Pull first if behind
      if (behind > 0) {
        await pullMutation.mutateAsync({ workdir });
        pulled = true;
      }
      // Then push if ahead
      if (ahead > 0) {
        await pushMutation.mutateAsync({ workdir });
        pushed = true;
      }
      refetchStatus();

      if (pulled || pushed) {
        const actions = [pulled && t('Pulled'), pushed && t('Pushed')].filter(Boolean).join(' & ');
        toastManager.add({
          title: t('Sync completed'),
          description: actions,
          type: 'success',
          timeout: 3000,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toastManager.add({
        title: t('Sync failed'),
        description: message,
        type: 'error',
        timeout: 5000,
      });
    }
  }, [behind, ahead, pullMutation, pushMutation, workdir, refetchStatus, t]);

  // Publish branch handler: push with --set-upstream
  const handlePublish = useCallback(async () => {
    if (!currentBranch || pushMutation.isPending) return;

    try {
      await pushMutation.mutateAsync({
        workdir,
        remote: 'origin',
        branch: currentBranch,
        setUpstream: true,
      });
      refetchStatus();

      toastManager.add({
        title: t('Branch published'),
        description: t('Branch {{branch}} is now tracking origin/{{branch}}', {
          branch: currentBranch,
        }),
        type: 'success',
        timeout: 3000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toastManager.add({
        title: t('Publish failed'),
        description: message,
        type: 'error',
        timeout: 5000,
      });
    }
  }, [currentBranch, pushMutation, workdir, refetchStatus, t]);

  return {
    gitStatus,
    refetchStatus,
    isSyncing,
    ahead,
    behind,
    tracking,
    currentBranch,
    handleSync,
    handlePublish,
  };
}
