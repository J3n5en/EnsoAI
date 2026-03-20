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
  /** ID of the session executing this task (set when auto-execute starts) */
  sessionId?: string;
}

export const TASK_STATUS_LIST: TaskStatus[] = ['todo', 'in-progress', 'done'];

/** Auto-execute state per repo */
export interface AutoExecuteState {
  /** Whether auto-execute is running */
  running: boolean;
  /** Queue of task IDs to execute (in order) */
  queue: string[];
  /** Currently executing task ID */
  currentTaskId: string | null;
  /** Session ID of the current execution */
  currentSessionId: string | null;
}
