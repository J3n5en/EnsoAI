import { IPC_CHANNELS } from '@shared/types';
import type { ClaudeEffort } from '@shared/types/ai';
import { ipcMain } from 'electron';
import type { AIProvider, ModelId, ReasoningEffort } from '../services/ai';
import { polishTodoTask } from '../services/ai';
import { localSessionManager } from '../services/LocalSessionManager';
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

  ipcMain.handle(IPC_CHANNELS.TODO_GET_TASKS, async (_, repoPath: string) => {
    return localSessionManager.getTodoTasks(repoPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.TODO_ADD_TASK,
    async (
      _event,
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
      return localSessionManager.addTodoTask(repoPath, task);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TODO_UPDATE_TASK,
    async (
      _event,
      repoPath: string,
      taskId: string,
      updates: { title?: string; description?: string; priority?: string; status?: string }
    ) => {
      return localSessionManager.updateTodoTask(repoPath, taskId, updates);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TODO_DELETE_TASK, async (_, repoPath: string, taskId: string) => {
    return localSessionManager.deleteTodoTask(repoPath, taskId);
  });

  ipcMain.handle(
    IPC_CHANNELS.TODO_MOVE_TASK,
    async (_, repoPath: string, taskId: string, newStatus: string, newOrder: number) => {
      return localSessionManager.moveTodoTask(repoPath, taskId, newStatus, newOrder);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TODO_REORDER_TASKS,
    async (_, repoPath: string, status: string, orderedIds: string[]) => {
      return localSessionManager.reorderTodoTasks(repoPath, status, orderedIds);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TODO_MIGRATE, async (_, boardsJson: string) => {
    await ensureReady();
    return todoService.migrateFromLocalStorage(boardsJson);
  });

  ipcMain.handle(
    IPC_CHANNELS.TODO_AI_POLISH,
    async (
      _,
      options: {
        text: string;
        timeout: number;
        provider: string;
        model: string;
        reasoningEffort?: string;
        bare?: boolean;
        claudeEffort?: string;
        prompt?: string;
      }
    ): Promise<{ success: boolean; title?: string; description?: string; error?: string }> => {
      return polishTodoTask({
        text: options.text,
        timeout: options.timeout,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
        bare: options.bare,
        claudeEffort: options.claudeEffort as ClaudeEffort | undefined,
        prompt: options.prompt,
      });
    }
  );
}

export function cleanupTodo(): Promise<void> {
  return todoService.close();
}

export function cleanupTodoSync(): void {
  todoService.closeSync();
}
