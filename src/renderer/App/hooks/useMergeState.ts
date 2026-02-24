import type { GitWorktree, WorktreeMergeCleanupOptions, WorktreeMergeResult } from '@shared/types';
import { useState } from 'react';

export function useMergeState() {
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeWorktree, setMergeWorktree] = useState<GitWorktree | null>(null);
  const [mergeConflicts, setMergeConflicts] = useState<WorktreeMergeResult | null>(null);
  const [pendingMergeOptions, setPendingMergeOptions] = useState<
    | (Required<Pick<WorktreeMergeCleanupOptions, 'worktreePath' | 'sourceBranch'>> &
        Pick<WorktreeMergeCleanupOptions, 'deleteWorktreeAfterMerge' | 'deleteBranchAfterMerge'>)
    | null
  >(null);

  const handleOpenMergeDialog = (worktree: GitWorktree) => {
    setMergeWorktree(worktree);
    setMergeDialogOpen(true);
  };

  const clearMergeState = () => {
    setMergeConflicts(null);
    setPendingMergeOptions(null);
  };

  return {
    mergeDialogOpen,
    mergeWorktree,
    mergeConflicts,
    pendingMergeOptions,
    setMergeDialogOpen,
    setMergeWorktree,
    setMergeConflicts,
    setPendingMergeOptions,
    handleOpenMergeDialog,
    clearMergeState,
  };
}
