import type { GitWorktree } from '@shared/types';
import { create } from 'zustand';

interface WorktreeState {
  worktrees: GitWorktree[];
  currentWorktree: GitWorktree | null;
  isLoading: boolean;
  error: string | null;

  setWorktrees: (worktrees: GitWorktree[]) => void;
  setCurrentWorktree: (worktree: GitWorktree | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useWorktreeStore = create<WorktreeState>((set) => ({
  worktrees: [],
  currentWorktree: null,
  isLoading: false,
  error: null,

  setWorktrees: (worktrees) => set({ worktrees }),
  setCurrentWorktree: (worktree) => set({ currentWorktree: worktree }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
