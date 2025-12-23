import type { GitBranch, GitLogEntry, GitStatus } from '@shared/types';
import { create } from 'zustand';

interface RepositoryState {
  status: GitStatus | null;
  branches: GitBranch[];
  logs: GitLogEntry[];
  isLoading: boolean;
  error: string | null;

  setStatus: (status: GitStatus | null) => void;
  setBranches: (branches: GitBranch[]) => void;
  setLogs: (logs: GitLogEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useRepositoryStore = create<RepositoryState>((set) => ({
  status: null,
  branches: [],
  logs: [],
  isLoading: false,
  error: null,

  setStatus: (status) => set({ status }),
  setBranches: (branches) => set({ branches }),
  setLogs: (logs) => set({ logs }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      status: null,
      branches: [],
      logs: [],
      isLoading: false,
      error: null,
    }),
}));
