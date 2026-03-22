import type { SessionTodoTask } from '@shared/types';
import {
  getSharedLocalStorageSnapshot,
  markLegacyLocalStorageMigrated,
  readSharedTodoTasks,
  updateSharedSessionState,
  writeSharedLocalStorageSnapshot,
} from './SharedSessionState';

function now(): number {
  return Date.now();
}

export class LocalSessionManager {
  getSessionState(): { localStorage: Record<string, string> } {
    return {
      localStorage: getSharedLocalStorageSnapshot(),
    };
  }

  syncLocalStorage(localStorage: Record<string, string>): void {
    writeSharedLocalStorageSnapshot(localStorage);
  }

  importLegacyLocalStorage(localStorage: Record<string, string>): void {
    writeSharedLocalStorageSnapshot(localStorage);
    markLegacyLocalStorageMigrated();
  }

  getTodoTasks(repoPath: string): SessionTodoTask[] {
    return readSharedTodoTasks(repoPath);
  }

  addTodoTask(repoPath: string, task: SessionTodoTask): SessionTodoTask {
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: [...(current.todos[repoPath] ?? []), task],
      },
    }));
    return task;
  }

  updateTodoTask(
    repoPath: string,
    taskId: string,
    updates: Partial<Pick<SessionTodoTask, 'title' | 'description' | 'priority' | 'status'>>
  ): void {
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: (current.todos[repoPath] ?? []).map((task) =>
          task.id === taskId ? { ...task, ...updates, updatedAt: now() } : task
        ),
      },
    }));
  }

  deleteTodoTask(repoPath: string, taskId: string): void {
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: (current.todos[repoPath] ?? []).filter((task) => task.id !== taskId),
      },
    }));
  }

  moveTodoTask(repoPath: string, taskId: string, newStatus: string, newOrder: number): void {
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: (current.todos[repoPath] ?? []).map((task) =>
          task.id === taskId
            ? { ...task, status: newStatus, order: newOrder, updatedAt: now() }
            : task
        ),
      },
    }));
  }

  reorderTodoTasks(repoPath: string, status: string, orderedIds: string[]): void {
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    updateSharedSessionState((current) => ({
      ...current,
      updatedAt: now(),
      todos: {
        ...current.todos,
        [repoPath]: (current.todos[repoPath] ?? []).map((task) =>
          task.status === status && orderMap.has(task.id)
            ? { ...task, order: orderMap.get(task.id) ?? task.order, updatedAt: now() }
            : task
        ),
      },
    }));
  }
}

export const localSessionManager = new LocalSessionManager();
