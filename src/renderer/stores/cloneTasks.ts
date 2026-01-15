import type { CloneProgress } from '@shared/types';
import { create } from 'zustand';

export interface CloneTask {
  id: string;
  remoteUrl: string;
  targetPath: string;
  repoName: string;
  groupId: string | null;
  progress: CloneProgress | null;
  status: 'cloning' | 'completed' | 'error';
  error?: string;
  startTime: number;
}

interface CloneTasksState {
  tasks: CloneTask[];
  // Track the currently active task that receives progress updates
  activeTaskId: string | null;

  // Actions
  addTask: (task: Omit<CloneTask, 'id' | 'status' | 'progress' | 'startTime'>) => string;
  updateProgress: (id: string, progress: CloneProgress) => void;
  updateActiveProgress: (progress: CloneProgress) => void;
  completeTask: (id: string) => void;
  failTask: (id: string, error: string) => void;
  removeTask: (id: string) => void;
  getTask: (id: string) => CloneTask | undefined;
  setActiveTaskId: (id: string | null) => void;

  // Query helpers
  hasActiveTasks: () => boolean;
  getActiveTasks: () => CloneTask[];
}

export const useCloneTasksStore = create<CloneTasksState>()((set, get) => ({
  tasks: [],
  activeTaskId: null,

  addTask: (taskData) => {
    const id = `clone-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const task: CloneTask = {
      ...taskData,
      id,
      status: 'cloning',
      progress: null,
      startTime: Date.now(),
    };
    set((state) => ({
      tasks: [...state.tasks, task],
      activeTaskId: id,
    }));
    return id;
  },

  updateProgress: (id, progress) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, progress } : task)),
    })),

  updateActiveProgress: (progress) => {
    const activeId = get().activeTaskId;
    if (activeId) {
      set((state) => ({
        tasks: state.tasks.map((task) => (task.id === activeId ? { ...task, progress } : task)),
      }));
    }
  },

  completeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              status: 'completed' as const,
              progress: { stage: 'completed', progress: 100 },
            }
          : task
      ),
      activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
    })),

  failTask: (id, error) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, status: 'error' as const, error } : task
      ),
      activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
    })),

  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
      activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
    })),

  getTask: (id) => get().tasks.find((task) => task.id === id),

  setActiveTaskId: (id) => set({ activeTaskId: id }),

  hasActiveTasks: () => get().tasks.some((task) => task.status === 'cloning'),

  getActiveTasks: () => get().tasks.filter((task) => task.status === 'cloning'),
}));

// Global progress listener - call this once at app startup
let progressListenerInitialized = false;

export function initCloneProgressListener() {
  if (progressListenerInitialized) return;
  progressListenerInitialized = true;

  window.electronAPI.git.onCloneProgress((progress) => {
    useCloneTasksStore.getState().updateActiveProgress(progress);
  });
}
