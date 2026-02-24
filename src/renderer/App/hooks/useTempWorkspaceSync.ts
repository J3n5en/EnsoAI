import type { GitWorktree } from '@shared/types';
import { useEffect } from 'react';
import { TEMP_REPO_ID } from '../constants';

export function useTempWorkspaceSync(
  temporaryWorkspaceEnabled: boolean,
  selectedRepo: string | null,
  activeWorktree: GitWorktree | null,
  tempWorkspaces: Array<{ path: string }>,
  repositories: Array<{ path: string }>,
  setSelectedRepo: (repo: string | null) => void,
  setActiveWorktree: (worktree: GitWorktree | null) => void
) {
  // Switch away from temp repo if disabled
  useEffect(() => {
    if (!temporaryWorkspaceEnabled && selectedRepo === TEMP_REPO_ID) {
      setSelectedRepo(repositories[0]?.path ?? null);
    }
  }, [temporaryWorkspaceEnabled, selectedRepo, repositories, setSelectedRepo]);

  // Clear active worktree if temp workspace was deleted
  useEffect(() => {
    if (selectedRepo !== TEMP_REPO_ID || !activeWorktree?.path) return;
    const exists = tempWorkspaces.some((item) => item.path === activeWorktree.path);
    if (!exists) {
      setActiveWorktree(null);
    }
  }, [selectedRepo, activeWorktree?.path, tempWorkspaces, setActiveWorktree]);
}
