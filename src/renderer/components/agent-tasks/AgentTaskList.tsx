import type { AgentTask } from '@shared/types';
import { CircleDot } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAgentTasksStore } from '@/stores/agentTasks';
import { AgentTaskItem } from './AgentTaskItem';

interface AgentTaskListProps {
  onTaskClick?: (task: AgentTask) => void;
}

export function AgentTaskList({ onTaskClick }: AgentTaskListProps) {
  const { t } = useI18n();
  const allTasks = useAgentTasksStore((s) => s._allTasksCache);

  const isEmpty = allTasks.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CircleDot className="mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">{t('No agent tasks')}</p>
        <p className="mt-1 text-xs opacity-70">{t('Start an agent to see tasks here')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {allTasks.map((task) => (
        <AgentTaskItem key={task.sessionId} task={task} onClick={() => onTaskClick?.(task)} />
      ))}
    </div>
  );
}
