export type AgentTaskStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'paused';

export interface AgentTask {
  sessionId: string;
  sessionName: string;
  repoPath: string;
  repoName: string;
  cwd: string;

  status: AgentTaskStatus;
  description: string;

  startedAt: number; // timestamp ms
  completedAt?: number; // timestamp ms

  waitingReason?: string; // reason when status is 'waiting'
}
