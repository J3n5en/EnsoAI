import type { GitWorktree } from '@shared/types';
import { useEffect } from 'react';

export function useWorktreeSync(
  worktrees: GitWorktree[],
  activeWorktree: GitWorktree | null,
  worktreesFetching: boolean,
  setActiveWorktree: (worktree: GitWorktree | null) => void
) {
  useEffect(() => {
    if (worktrees.length > 0 && activeWorktree) {
      const found = worktrees.find((wt) => wt.path === activeWorktree.path);
      if (found && found !== activeWorktree) {
        setActiveWorktree(found);
      } else if (!found && !worktreesFetching) {
        setActiveWorktree(null);
      }
    }
  }, [worktrees, activeWorktree, worktreesFetching, setActiveWorktree]);
}
