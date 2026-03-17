import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { localSessionManager } from '../services/LocalSessionManager';
import { remoteSessionManager } from '../services/remote/RemoteSessionManager';
import * as todoService from '../services/todo/TodoService';

let readyPromise: Promise<void>;

/** Ensure DB is ready before processing any IPC call */
async function ensureReady(): Promise<void> {
  await readyPromise;
}

export function registerTodoHandlers(): void {
  readyPromise = todoService.initialize().catch((err) => {
    console.error('[Todo IPC] Failed to initialize TodoService:', err);
  });

  ipcMain.handle(IPC_CHANNELS.TODO_GET_TASKS, async (event, repoPath: string) => {
    if (remoteSessionManager.hasSession(event.sender)) {
      return remoteSessionManager.getTodoTasks(event.sender, repoPath);
    }
    return localSessionManager.getTodoTasks(repoPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.TODO_ADD_TASK,
    async (
      event,
      repoPath: string,
      task: {
        id: string;
        title: string;
        description: string;
        priority: string;
        status: string;
        order: number;
        createdAt: number;
        updatedAt: number;
      }
    ) => {
      if (remoteSessionManager.hasSession(event.sender)) {
        return remoteSessionManager.addTodoTask(event.sender, repoPath, task);
      }
      return localSessionManager.addTodoTask(repoPath, task);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TODO_UPDATE_TASK,
    async (
      event,
      repoPath: string,
      taskId: string,
      updates: { title?: string; description?: string; priority?: string; status?: string }
    ) => {
      if (remoteSessionManager.hasSession(event.sender)) {
        return remoteSessionManager.updateTodoTask(event.sender, repoPath, taskId, updates);
      }
      return localSessionManager.updateTodoTask(repoPath, taskId, updates);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TODO_DELETE_TASK, async (event, repoPath: string, taskId: string) => {
    if (remoteSessionManager.hasSession(event.sender)) {
      return remoteSessionManager.deleteTodoTask(event.sender, repoPath, taskId);
    }
    return localSessionManager.deleteTodoTask(repoPath, taskId);
  });

  ipcMain.handle(
    IPC_CHANNELS.TODO_MOVE_TASK,
    async (event, repoPath: string, taskId: string, newStatus: string, newOrder: number) => {
      if (remoteSessionManager.hasSession(event.sender)) {
        return remoteSessionManager.moveTodoTask(
          event.sender,
          repoPath,
          taskId,
          newStatus,
          newOrder
        );
      }
      return localSessionManager.moveTodoTask(repoPath, taskId, newStatus, newOrder);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TODO_REORDER_TASKS,
    async (event, repoPath: string, status: string, orderedIds: string[]) => {
      if (remoteSessionManager.hasSession(event.sender)) {
        return remoteSessionManager.reorderTodoTasks(event.sender, repoPath, status, orderedIds);
      }
      return localSessionManager.reorderTodoTasks(repoPath, status, orderedIds);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TODO_MIGRATE, async (_, boardsJson: string) => {
    await ensureReady();
    return todoService.migrateFromLocalStorage(boardsJson);
  });
}

export function cleanupTodo(): Promise<void> {
  return todoService.close();
}

export function cleanupTodoSync(): void {
  todoService.closeSync();
}
