import type { WorkspaceRecord } from '@shared/types';
import { create } from 'zustand';

interface WorkspaceState {
  workspaces: WorkspaceRecord[];
  currentWorkspace: WorkspaceRecord | null;
  isLoading: boolean;

  setWorkspaces: (workspaces: WorkspaceRecord[]) => void;
  setCurrentWorkspace: (workspace: WorkspaceRecord | null) => void;
  addWorkspace: (workspace: WorkspaceRecord) => void;
  removeWorkspace: (id: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  currentWorkspace: null,
  isLoading: false,

  setWorkspaces: (workspaces) => set({ workspaces }),
  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
  addWorkspace: (workspace) => set((state) => ({ workspaces: [...state.workspaces, workspace] })),
  removeWorkspace: (id) =>
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      currentWorkspace: state.currentWorkspace?.id === id ? null : state.currentWorkspace,
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
