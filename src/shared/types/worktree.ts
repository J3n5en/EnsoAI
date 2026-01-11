export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  isMainWorktree: boolean;
  isLocked: boolean;
  prunable: boolean;
}

export interface WorktreeCreateOptions {
  path: string;
  branch?: string;
  newBranch?: string;
  checkout?: boolean;
}

export interface WorktreeRemoveOptions {
  path: string;
  force?: boolean;
  deleteBranch?: boolean;
  branch?: string;
}

// Merge types
export type MergeStrategy = 'merge' | 'squash' | 'rebase';

export interface WorktreeMergeOptions {
  worktreePath: string;
  targetBranch: string;
  strategy: MergeStrategy;
  noFf?: boolean; // default true for merge strategy
  message?: string;
  deleteWorktreeAfterMerge?: boolean;
  deleteBranchAfterMerge?: boolean;
  autoStash?: boolean; // automatically stash uncommitted changes before merge
}

export interface MergeConflict {
  file: string;
  type: 'content' | 'binary' | 'rename' | 'delete';
}

export interface MergeConflictContent {
  file: string;
  ours: string; // target branch content
  theirs: string; // worktree branch content
  base: string; // common ancestor content
}

// Stash status:
// - none: no stash was created
// - stashed: changes were stashed but not yet restored (e.g., during conflict resolution)
// - applied: stash was successfully popped and changes restored
// - conflict: stash pop had conflicts, user needs to resolve manually
export type StashStatus = 'none' | 'stashed' | 'applied' | 'conflict';

export interface WorktreeMergeResult {
  success: boolean;
  merged: boolean;
  conflicts?: MergeConflict[];
  commitHash?: string;
  error?: string;
  warnings?: string[];
  // Stash status for each worktree
  mainStashStatus?: StashStatus;
  worktreeStashStatus?: StashStatus;
  // Paths for UI to show user where to run stash pop
  mainWorktreePath?: string;
  worktreePath?: string;
}

export interface ConflictResolution {
  file: string;
  content: string;
}

export interface MergeState {
  inProgress: boolean;
  targetBranch?: string;
  sourceBranch?: string;
  conflicts?: MergeConflict[];
}

export interface WorktreeMergeCleanupOptions {
  worktreePath?: string;
  sourceBranch?: string;
  deleteWorktreeAfterMerge?: boolean;
  deleteBranchAfterMerge?: boolean;
}
