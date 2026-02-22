import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TodoTask } from './types';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: TodoTask[];
  onAddTask: () => void;
  onEditTask: (task: TodoTask) => void;
  onDeleteTask: (taskId: string) => void;
  repoPath: string;
  worktreePath?: string;
  onSwitchToAgent?: () => void;
}

export function KanbanColumn({
  status,
  title,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  repoPath,
  worktreePath,
  onSwitchToAgent,
}: KanbanColumnProps) {
  const { t } = useI18n();
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex min-w-[240px] flex-1 flex-col border-r border-border/50 last:border-r-0">
      {/* Column header */}
      <div className="flex items-center justify-between border-b border-border/50 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">{title}</span>
          <span className="text-[10px] text-muted-foreground/60">{tasks.length}</span>
        </div>
        <button
          type="button"
          onClick={onAddTask}
          className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground transition-colors"
          title={t('New Task')}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={cn('flex min-h-[60px] flex-col transition-colors', isOver && 'bg-accent/10')}
          >
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={() => onEditTask(task)}
                onDelete={() => onDeleteTask(task.id)}
                repoPath={repoPath}
                worktreePath={worktreePath}
                onSwitchToAgent={onSwitchToAgent}
              />
            ))}
            {tasks.length === 0 && (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50">
                {t('No tasks yet')}
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}
