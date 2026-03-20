export interface AgentMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  binary: string;
  defaultModel?: string;
  capabilities: {
    chat: boolean;
    codeEdit: boolean;
    terminal: boolean;
    fileRead: boolean;
    fileWrite: boolean;
  };
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: unknown;
  output?: unknown;
}

export interface AgentSession {
  id: string;
  agentId: string;
  workdir: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

/** Task completion marker used in auto-execute mode */
export const TASK_COMPLETION_MARKER = '[ENSO_TASK_COMPLETE]';

/** Data sent with agent stop notification */
export interface AgentStopNotificationData {
  sessionId: string;
  cwd?: string;
  /** Task completion status from session log analysis */
  taskCompletionStatus?: 'completed' | 'unknown';
}
