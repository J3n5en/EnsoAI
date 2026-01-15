import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { type CloneTask, useCloneTasksStore } from '@/stores/cloneTasks';

// Maximum number of tasks to display in expanded view
const MAX_VISIBLE_TASKS = 3;

interface CloneProgressFloatProps {
  onCloneComplete?: (path: string, groupId: string | null) => void;
}

export function CloneProgressFloat({ onCloneComplete }: CloneProgressFloatProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  const tasks = useCloneTasksStore((s) => s.tasks);
  const removeTask = useCloneTasksStore((s) => s.removeTask);

  const activeTasks = useMemo(() => tasks.filter((task) => task.status === 'cloning'), [tasks]);
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === 'completed'),
    [tasks]
  );
  const errorTasks = useMemo(() => tasks.filter((task) => task.status === 'error'), [tasks]);

  // Limit displayed tasks with priority: Error > In Progress > Completed
  const { visibleErrorTasks, visibleActiveTasks, visibleCompletedTasks, hiddenCount } =
    useMemo(() => {
      const visibleError = errorTasks.slice(0, MAX_VISIBLE_TASKS);
      const remainingAfterError = MAX_VISIBLE_TASKS - visibleError.length;

      const visibleActive = activeTasks.slice(0, remainingAfterError);
      const remainingAfterActive = remainingAfterError - visibleActive.length;

      const visibleCompleted = completedTasks.slice(0, remainingAfterActive);

      const totalKnown = errorTasks.length + activeTasks.length + completedTasks.length;
      const visibleCount = visibleError.length + visibleActive.length + visibleCompleted.length;

      return {
        visibleErrorTasks: visibleError,
        visibleActiveTasks: visibleActive,
        visibleCompletedTasks: visibleCompleted,
        hiddenCount: totalKnown - visibleCount,
      };
    }, [errorTasks, activeTasks, completedTasks]);

  const stageLabels = useMemo<Record<string, string>>(
    () => ({
      counting: t('Counting objects...'),
      compressing: t('Compressing objects...'),
      receiving: t('Receiving objects...'),
      resolving: t('Resolving deltas...'),
      completed: t('Completed'),
    }),
    [t]
  );

  const getProgressLabel = (task: CloneTask) => {
    if (!task.progress) return t('Preparing...');
    return stageLabels[task.progress.stage] || task.progress.stage;
  };

  const handleOpenComplete = (task: CloneTask) => {
    onCloneComplete?.(task.targetPath, task.groupId);
    removeTask(task.id);
  };

  const handleDismiss = (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    removeTask(taskId);
  };

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggleCollapse();
    }
  };

  // Don't render if no tasks
  if (tasks.length === 0) return null;

  // Collapsed view - show a small badge
  if (collapsed) {
    const totalProgress =
      activeTasks.length > 0
        ? Math.round(
            activeTasks.reduce((sum, t) => sum + (t.progress?.progress || 0), 0) /
              activeTasks.length
          )
        : 0;

    return (
      <button
        type="button"
        onClick={handleToggleCollapse}
        className={cn(
          'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-2 shadow-lg transition-all hover:scale-105',
          activeTasks.length > 0
            ? 'bg-blue-500 text-white'
            : completedTasks.length > 0
              ? 'bg-green-500 text-white'
              : 'bg-destructive text-destructive-foreground'
        )}
      >
        {activeTasks.length > 0 ? (
          <>
            <Download className="h-4 w-4 animate-pulse" />
            <span className="text-sm font-medium">
              {activeTasks.length > 1 ? `${activeTasks.length} ${t('tasks')}` : `${totalProgress}%`}
            </span>
          </>
        ) : completedTasks.length > 0 ? (
          <>
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">{completedTasks.length}</span>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{errorTasks.length}</span>
          </>
        )}
        <ChevronUp className="h-3 w-3" />
      </button>
    );
  }

  // Expanded view - show full details (priority: Error > In Progress > Completed)
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {/* Error tasks - highest priority */}
      {visibleErrorTasks.map((task) => (
        <div
          key={task.id}
          className="rounded-lg border border-destructive/50 bg-card shadow-lg p-3 animate-in slide-in-from-bottom-2"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.repoName}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={(e) => handleDismiss(task.id, e)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <p className="mt-1 text-xs text-destructive truncate" title={task.error}>
            {task.error}
          </p>
        </div>
      ))}

      {/* Active tasks */}
      {visibleActiveTasks.map((task) => (
        <div
          key={task.id}
          role="button"
          tabIndex={0}
          className="rounded-lg border bg-card shadow-lg p-3 space-y-2 animate-in slide-in-from-bottom-2 cursor-pointer hover:bg-accent/30 transition-colors"
          onClick={handleToggleCollapse}
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 shrink-0 text-blue-500 animate-pulse" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {t('Cloning')} {task.repoName}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <Progress value={task.progress?.progress || 0} className="h-1.5" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{getProgressLabel(task)}</span>
            <span>{task.progress?.progress || 0}%</span>
          </div>
        </div>
      ))}

      {/* Completed tasks */}
      {visibleCompletedTasks.map((task) => (
        <div
          key={task.id}
          className="rounded-lg border border-green-500/30 bg-card shadow-lg p-3 animate-in slide-in-from-bottom-2"
        >
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-green-500" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.repoName}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => handleOpenComplete(task)}
            >
              {t('Open')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={(e) => handleDismiss(task.id, e)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {/* Hidden tasks indicator */}
      {hiddenCount > 0 && (
        <div className="rounded-lg border bg-card/80 shadow-lg p-2 animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <MoreHorizontal className="h-3 w-3" />
            <span>{t('and {{count}} more...', { count: hiddenCount })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
