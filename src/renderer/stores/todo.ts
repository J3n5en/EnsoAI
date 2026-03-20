import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { normalizePath, STORAGE_KEYS } from '@/App/storage';
import type { AutoExecuteState, TaskStatus, TodoTask } from '@/components/todo/types';

const EMPTY_TASKS: TodoTask[] = [];

interface TodoState {
  /** In-memory cache: key = normalized repoPath, value = tasks array */
  tasks: Record<string, TodoTask[]>;

  /** Track which repos have been loaded from DB */
  _loaded: Set<string>;

  /** Auto-execute state per repo path */
  autoExecute: Record<string, AutoExecuteState>;

  // Task Actions
  loadTasks: (repoPath: string) => Promise<void>;
  addTask: (
    repoPath: string,
    task: Omit<TodoTask, 'id' | 'createdAt' | 'updatedAt' | 'order'>
  ) => TodoTask;
  updateTask: (
    repoPath: string,
    taskId: string,
    updates: Partial<Pick<TodoTask, 'title' | 'description' | 'priority' | 'status' | 'sessionId'>>
  ) => void;
  deleteTask: (repoPath: string, taskId: string) => void;
  moveTask: (repoPath: string, taskId: string, newStatus: TaskStatus, newOrder: number) => void;
  reorderTasks: (repoPath: string, status: TaskStatus, orderedIds: string[]) => void;

  // Auto-Execute Actions
  startAutoExecute: (repoPath: string, taskIds: string[]) => void;
  stopAutoExecute: (repoPath: string) => void;
  setCurrentExecution: (repoPath: string, taskId: string | null, sessionId: string | null) => void;
  advanceQueue: (repoPath: string) => string | null;
  reorderAutoExecuteQueue: (repoPath: string, fromIndex: number, toIndex: number) => void;
  removeFromAutoExecuteQueue: (repoPath: string, taskId: string) => void;
}

/** Initial auto-execute state (exported for use in useAutoExecuteTask hook) */
export const INITIAL_AUTO_EXECUTE: AutoExecuteState = {
  running: false,
  queue: [],
  currentTaskId: null,
  currentSessionId: null,
};

function getKey(repoPath: string): string {
  return normalizePath(repoPath);
}

/** One-time migration from localStorage to SQLite */
async function migrateLocalStorage(): Promise<void> {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.TODO_BOARDS);
    if (!saved) return;
    await window.electronAPI.todo.migrate(saved);
    localStorage.removeItem(STORAGE_KEYS.TODO_BOARDS);
    console.log('[TodoStore] Migrated localStorage data to SQLite');
  } catch (err) {
    console.error('[TodoStore] Migration failed:', err);
  }
}

// Run migration on module load
migrateLocalStorage();

export const useTodoStore = create<TodoState>()(
  subscribeWithSelector((set, get) => ({
    tasks: {},
    _loaded: new Set<string>(),
    autoExecute: {},

    loadTasks: async (repoPath) => {
      const key = getKey(repoPath);
      if (get()._loaded.has(key)) return;

      try {
        const tasks = (await window.electronAPI.todo.getTasks(key)) as TodoTask[];
        set((state) => {
          const newLoaded = new Set(state._loaded);
          newLoaded.add(key);
          return {
            tasks: { ...state.tasks, [key]: tasks },
            _loaded: newLoaded,
          };
        });
      } catch (err) {
        console.error('[TodoStore] Failed to load tasks for', key, err);
      }
    },

    addTask: (repoPath, taskData) => {
      const key = getKey(repoPath);
      const existing = get().tasks[key] ?? [];
      const tasksInColumn = existing.filter((t) => t.status === taskData.status);
      const maxOrder = tasksInColumn.reduce((max, t) => Math.max(max, t.order), -1);

      const newTask: TodoTask = {
        id: crypto.randomUUID(),
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority,
        status: taskData.status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        order: maxOrder + 1,
      };

      // Optimistic update
      set((state) => ({
        tasks: { ...state.tasks, [key]: [...(state.tasks[key] ?? []), newTask] },
      }));

      // Persist to SQLite
      window.electronAPI.todo
        .addTask(key, newTask)
        .catch((err) => console.error('[TodoStore] addTask IPC failed:', err));

      return newTask;
    },

    updateTask: (repoPath, taskId, updates) => {
      const key = getKey(repoPath);
      const existing = get().tasks[key];
      if (!existing) return;

      const now = Date.now();
      set((state) => ({
        tasks: {
          ...state.tasks,
          [key]: (state.tasks[key] ?? []).map((t) =>
            t.id === taskId ? { ...t, ...updates, updatedAt: now } : t
          ),
        },
      }));

      window.electronAPI.todo
        .updateTask(key, taskId, updates)
        .catch((err) => console.error('[TodoStore] updateTask IPC failed:', err));
    },

    deleteTask: (repoPath, taskId) => {
      const key = getKey(repoPath);
      const existing = get().tasks[key];
      if (!existing) return;

      set((state) => ({
        tasks: {
          ...state.tasks,
          [key]: (state.tasks[key] ?? []).filter((t) => t.id !== taskId),
        },
      }));

      window.electronAPI.todo
        .deleteTask(key, taskId)
        .catch((err) => console.error('[TodoStore] deleteTask IPC failed:', err));
    },

    moveTask: (repoPath, taskId, newStatus, newOrder) => {
      const key = getKey(repoPath);
      const existing = get().tasks[key];
      if (!existing) return;

      const now = Date.now();
      set((state) => ({
        tasks: {
          ...state.tasks,
          [key]: (state.tasks[key] ?? []).map((t) =>
            t.id === taskId ? { ...t, status: newStatus, order: newOrder, updatedAt: now } : t
          ),
        },
      }));

      window.electronAPI.todo
        .moveTask(key, taskId, newStatus, newOrder)
        .catch((err) => console.error('[TodoStore] moveTask IPC failed:', err));
    },

    reorderTasks: (repoPath, status, orderedIds) => {
      const key = getKey(repoPath);
      const existing = get().tasks[key];
      if (!existing) return;

      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      const now = Date.now();
      set((state) => ({
        tasks: {
          ...state.tasks,
          [key]: (state.tasks[key] ?? []).map((t) => {
            if (t.status === status && orderMap.has(t.id)) {
              return { ...t, order: orderMap.get(t.id)!, updatedAt: now };
            }
            return t;
          }),
        },
      }));

      window.electronAPI.todo
        .reorderTasks(key, status, orderedIds)
        .catch((err) => console.error('[TodoStore] reorderTasks IPC failed:', err));
    },

    // Auto-Execute Actions
    startAutoExecute: (repoPath, taskIds) => {
      const key = getKey(repoPath);
      if (taskIds.length === 0) return;

      set((state) => ({
        autoExecute: {
          ...state.autoExecute,
          [key]: {
            running: true,
            queue: taskIds,
            currentTaskId: null,
            currentSessionId: null,
          },
        },
      }));
    },

    stopAutoExecute: (repoPath) => {
      const key = getKey(repoPath);
      set((state) => ({
        autoExecute: {
          ...state.autoExecute,
          [key]: {
            running: false,
            queue: [],
            currentTaskId: null,
            currentSessionId: null,
          },
        },
      }));
    },

    setCurrentExecution: (repoPath, taskId, sessionId) => {
      const key = getKey(repoPath);
      set((state) => {
        const current = state.autoExecute[key];
        if (!current) return state;
        // Skip update if values haven't changed
        if (current.currentTaskId === taskId && current.currentSessionId === sessionId) {
          return state;
        }
        return {
          autoExecute: {
            ...state.autoExecute,
            [key]: { ...current, currentTaskId: taskId, currentSessionId: sessionId },
          },
        };
      });
    },

    advanceQueue: (repoPath) => {
      const key = getKey(repoPath);
      const current = get().autoExecute[key];
      if (!current || current.queue.length === 0) {
        // No more tasks, stop auto-execute
        set((state) => ({
          autoExecute: {
            ...state.autoExecute,
            [key]: {
              running: false,
              queue: [],
              currentTaskId: null,
              currentSessionId: null,
            },
          },
        }));
        return null;
      }

      const [nextTaskId, ...remaining] = current.queue;
      set((state) => ({
        autoExecute: {
          ...state.autoExecute,
          [key]: {
            ...current,
            queue: remaining,
            currentTaskId: nextTaskId,
          },
        },
      }));

      return nextTaskId;
    },

    reorderAutoExecuteQueue: (repoPath, fromIndex, toIndex) => {
      const key = getKey(repoPath);
      set((state) => {
        const current = state.autoExecute[key];
        if (!current) return state;

        const queue = [...current.queue];
        const [removed] = queue.splice(fromIndex, 1);
        queue.splice(toIndex, 0, removed);

        return {
          autoExecute: {
            ...state.autoExecute,
            [key]: { ...current, queue },
          },
        };
      });
    },

    removeFromAutoExecuteQueue: (repoPath, taskId) => {
      const key = getKey(repoPath);
      set((state) => {
        const current = state.autoExecute[key];
        if (!current) return state;

        return {
          autoExecute: {
            ...state.autoExecute,
            [key]: {
              ...current,
              queue: current.queue.filter((id) => id !== taskId),
            },
          },
        };
      });
    },
  }))
);

/** Stable selector: returns cached EMPTY_TASKS when repo has no tasks */
export function selectTasks(state: TodoState, repoPath: string): TodoTask[] {
  const key = getKey(repoPath);
  return state.tasks[key] ?? EMPTY_TASKS;
}

/** Selector: get auto-execute state for a repo */
export function selectAutoExecute(state: TodoState, repoPath: string): AutoExecuteState {
  const key = getKey(repoPath);
  return state.autoExecute[key] ?? INITIAL_AUTO_EXECUTE;
}
