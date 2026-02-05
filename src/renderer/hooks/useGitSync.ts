import { useCallback, useRef } from 'react';
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

  // Performance optimization: Use ref to store frequently changing values.
  // This avoids unnecessary callback rebuilds while ensuring callbacks always
  // access the latest values. The ref is updated on every render (line below),
  // so there's no stale closure issue.
  // Note: mutateAsync from React Query is a stable reference.
  const syncStateRef = useRef({ ahead, behind, currentBranch, isSyncing });
  syncStateRef.current = { ahead, behind, currentBranch, isSyncing };

  // Sync handler: pull first (if behind), then push (if ahead)
  const handleSync = useCallback(async () => {
    const { ahead: aheadVal, behind: behindVal, isSyncing: isSyncingVal } = syncStateRef.current;
    if (isSyncingVal) return;

    try {
      let pulled = false;
      let pushed = false;

      // Pull first if behind
      if (behindVal > 0) {
        await pullMutation.mutateAsync({ workdir });
        pulled = true;
      }
      // Then push if ahead
      if (aheadVal > 0) {
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
  }, [pullMutation.mutateAsync, pushMutation.mutateAsync, workdir, refetchStatus, t]);

  // Publish branch handler: push with --set-upstream
  const handlePublish = useCallback(async () => {
    const { currentBranch: branch, isSyncing: isSyncingVal } = syncStateRef.current;
    if (!branch || isSyncingVal) return;

    try {
      await pushMutation.mutateAsync({
        workdir,
        remote: 'origin',
        branch,
        setUpstream: true,
      });
      refetchStatus();

      toastManager.add({
        title: t('Branch published'),
        description: t('Branch {{branch}} is now tracking origin/{{branch}}', {
          branch,
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
  }, [pushMutation.mutateAsync, workdir, refetchStatus, t]);

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
