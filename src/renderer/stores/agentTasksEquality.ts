import type { AgentTask } from '@shared/types';

function areAgentTasksEqual(a: AgentTask, b: AgentTask): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.sessionName === b.sessionName &&
    a.repoPath === b.repoPath &&
    a.repoName === b.repoName &&
    a.cwd === b.cwd &&
    a.status === b.status &&
    a.description === b.description &&
    a.startedAt === b.startedAt &&
    a.completedAt === b.completedAt &&
    a.waitingReason === b.waitingReason
  );
}

export function areAgentTaskRecordsEqual(
  current: Record<string, AgentTask>,
  next: Record<string, AgentTask>
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);

  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  return nextKeys.every((key) => {
    const currentTask = current[key];
    const nextTask = next[key];
    return (
      currentTask !== undefined &&
      nextTask !== undefined &&
      areAgentTasksEqual(currentTask, nextTask)
    );
  });
}
