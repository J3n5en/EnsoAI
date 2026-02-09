import type { FileChange } from '@shared/types';
import { useCallback, useMemo } from 'react';

interface UseChangesActionsParams {
  staged: FileChange[];
  trackedChanges: FileChange[];
  untrackedChanges: FileChange[];
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
  onDeleteUntracked?: (paths: string[]) => void;
}

interface UseChangesActionsReturn {
  handleUnstageAll: () => void;
  handleStageTracked: () => void;
  handleDiscardTracked: () => void;
  handleStageUntracked: () => void;
  handleDeleteAllUntracked: () => void;
}

/**
 * Custom hook for batch operations on file changes.
 * Extracts common logic used by both ChangesList and ChangesTree components.
 */
export function useChangesActions({
  staged,
  trackedChanges,
  untrackedChanges,
  onStage,
  onUnstage,
  onDiscard,
  onDeleteUntracked,
}: UseChangesActionsParams): UseChangesActionsReturn {
  const handleUnstageAll = useCallback(() => {
    const paths = staged.map((f) => f.path);
    if (paths.length > 0 && onUnstage) onUnstage(paths);
  }, [staged, onUnstage]);

  const handleStageTracked = useCallback(() => {
    const paths = trackedChanges.map((f) => f.path);
    if (paths.length > 0 && onStage) onStage(paths);
  }, [trackedChanges, onStage]);

  const handleDiscardTracked = useCallback(() => {
    const paths = trackedChanges.map((f) => f.path);
    if (paths.length > 0 && onDiscard) onDiscard(paths);
  }, [trackedChanges, onDiscard]);

  const handleStageUntracked = useCallback(() => {
    const paths = untrackedChanges.map((f) => f.path);
    if (paths.length > 0 && onStage) onStage(paths);
  }, [untrackedChanges, onStage]);

  const handleDeleteAllUntracked = useCallback(() => {
    const paths = untrackedChanges.map((f) => f.path);
    if (paths.length > 0 && onDeleteUntracked) onDeleteUntracked(paths);
  }, [untrackedChanges, onDeleteUntracked]);

  return useMemo(
    () => ({
      handleUnstageAll,
      handleStageTracked,
      handleDiscardTracked,
      handleStageUntracked,
      handleDeleteAllUntracked,
    }),
    [
      handleUnstageAll,
      handleStageTracked,
      handleDiscardTracked,
      handleStageUntracked,
      handleDeleteAllUntracked,
    ]
  );
}
