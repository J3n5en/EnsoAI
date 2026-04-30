import type { AgentTaskStatus } from '@shared/types';
import { cn } from '@/lib/utils';

interface TaskStatusBadgeProps {
  status: AgentTaskStatus;
  className?: string;
}

const statusConfig: Record<AgentTaskStatus, { dotClass: string; label: string }> = {
  running: {
    dotClass: 'bg-green-500',
    label: 'Running',
  },
  waiting: {
    dotClass: 'bg-yellow-500',
    label: 'Waiting',
  },
  idle: {
    dotClass: 'bg-muted-foreground/40',
    label: 'Idle',
  },
  completed: {
    dotClass: 'bg-green-500',
    label: 'Completed',
  },
  paused: {
    dotClass: 'bg-muted-foreground',
    label: 'Paused',
  },
};

export function TaskStatusBadge({ status, className }: TaskStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {status === 'running' && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              config.dotClass
            )}
          />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            config.dotClass,
            status === 'completed' && 'flex items-center justify-center'
          )}
        >
          {status === 'completed' && (
            <svg
              className="h-1.5 w-1.5 text-white"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </span>
      <span>{config.label}</span>
    </span>
  );
}
