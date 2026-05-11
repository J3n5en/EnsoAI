import type { AgentTask } from '@shared/types';
import { Clock, Folder } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { TaskStatusBadge } from './TaskStatusBadge';

interface AgentTaskItemProps {
  task: AgentTask;
  onClick?: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AgentTaskItemComponent({ task, onClick }: AgentTaskItemProps) {
  const isClickable = !!onClick;
  const duration = task.completedAt
    ? task.completedAt - task.startedAt
    : Date.now() - task.startedAt;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        'w-full rounded-md px-3 py-2 text-left transition-colors border-b-2 border-border',
        isClickable && 'hover:bg-accent/50 cursor-pointer',
        !isClickable && 'cursor-default'
      )}
    >
      {/* Header: Repo + Status */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 truncate">
          <Folder className="h-3 w-3 shrink-0" />
          {task.repoName}
        </span>
        <TaskStatusBadge status={task.status} />
      </div>

      {/* Description */}
      <div className="mt-1.5 min-w-0 truncate text-sm font-medium">{task.description}</div>

      {/* Meta: Time */}
      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTime(task.startedAt)}
        </span>
        <span>
          {task.status === 'completed' ? 'Ran for' : 'Running for'} {formatDuration(duration)}
        </span>
      </div>

      {/* Waiting reason */}
      {task.status === 'waiting' && task.waitingReason && (
        <div className="mt-1.5 rounded bg-yellow-500/10 px-2 py-1 text-xs text-yellow-600 dark:text-yellow-400">
          {task.waitingReason}
        </div>
      )}
    </button>
  );
}

export const AgentTaskItem = memo(AgentTaskItemComponent);
