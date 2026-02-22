export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface TodoTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export const TASK_STATUS_LIST: TaskStatus[] = ['todo', 'in-progress', 'done'];
