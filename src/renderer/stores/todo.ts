import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { normalizePath, STORAGE_KEYS } from '@/App/storage';
import type { TaskStatus, TodoTask } from '@/components/todo/types';

const EMPTY_TASKS: TodoTask[] = [];

interface TodoState {
  /** In-memory cache: key = normalized repoPath, value = tasks array */
  tasks: Record<string, TodoTask[]>;

  /** Track which repos have been loaded from DB */
  _loaded: Set<string>;

  // Actions
  loadTasks: (repoPath: string) => Promise<void>;
  addTask: (
    repoPath: string,
    task: Omit<TodoTask, 'id' | 'createdAt' | 'updatedAt' | 'order'>
  ) => TodoTask;
  updateTask: (
    repoPath: string,
    taskId: string,
    updates: Partial<Pick<TodoTask, 'title' | 'description' | 'priority' | 'status'>>
  ) => void;
  deleteTask: (repoPath: string, taskId: string) => void;
  moveTask: (repoPath: string, taskId: string, newStatus: TaskStatus, newOrder: number) => void;
  reorderTasks: (repoPath: string, status: TaskStatus, orderedIds: string[]) => void;
}

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
  }))
);

/** Stable selector: returns cached EMPTY_TASKS when repo has no tasks */
export function selectTasks(state: TodoState, repoPath: string): TodoTask[] {
  const key = getKey(repoPath);
  return state.tasks[key] ?? EMPTY_TASKS;
}
