import { AlertCircle, Check, Download, Loader2, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { type CloneTask, useCloneTasksStore } from '@/stores/cloneTasks';

interface CloneTasksPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloneComplete?: (path: string, groupId: string | null) => void;
}

export function CloneTasksPopover({ open, onOpenChange, onCloneComplete }: CloneTasksPopoverProps) {
  const { t } = useI18n();

  const tasks = useCloneTasksStore((s) => s.tasks);
  const removeTask = useCloneTasksStore((s) => s.removeTask);

  const activeTasks = useMemo(() => tasks.filter((task) => task.status === 'cloning'), [tasks]);
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === 'completed'),
    [tasks]
  );
  const errorTasks = useMemo(() => tasks.filter((task) => task.status === 'error'), [tasks]);

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

  const handleOpenComplete = useCallback(
    (task: CloneTask) => {
      onCloneComplete?.(task.targetPath, task.groupId);
      removeTask(task.id);
      onOpenChange(false);
    },
    [onCloneComplete, removeTask, onOpenChange]
  );

  const handleDismiss = useCallback(
    (taskId: string) => {
      removeTask(taskId);
    },
    [removeTask]
  );

  const hasAnyTasks = tasks.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-md p-0" showCloseButton={false}>
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-medium">{t('Clone Tasks')}</h3>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {!hasAnyTasks ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('No clone tasks')}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Active tasks */}
              {activeTasks.map((task) => (
                <div key={task.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {task.repoName}
                    </span>
                  </div>
                  <Progress value={task.progress?.progress || 0} className="h-1.5" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{getProgressLabel(task)}</span>
                    <span>{task.progress?.progress || 0}%</span>
                  </div>
                </div>
              ))}

              {/* Completed tasks */}
              {completedTasks.map((task) => (
                <div key={task.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-green-500" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {task.repoName}
                    </span>
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
                      onClick={() => handleDismiss(task.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Error tasks */}
              {errorTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-destructive/50 bg-destructive/5 p-3"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {task.repoName}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => handleDismiss(task.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-destructive">{task.error}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}

interface CloneTasksBadgeProps {
  onClick: () => void;
  showBadge?: boolean;
}

export function CloneTasksBadge({ onClick, showBadge = true }: CloneTasksBadgeProps) {
  const { t } = useI18n();
  const tasks = useCloneTasksStore((s) => s.tasks);
  const activeTasks = useMemo(() => tasks.filter((task) => task.status === 'cloning'), [tasks]);
  const hasCompletedOrError = useMemo(
    () => tasks.some((task) => task.status === 'completed' || task.status === 'error'),
    [tasks]
  );

  const totalActive = activeTasks.length;
  const hasNotifications = totalActive > 0 || hasCompletedOrError;

  if (!hasNotifications) return null;

  return (
    <button
      type="button"
      className={cn(
        'relative flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors',
        totalActive > 0 && 'text-blue-500'
      )}
      title={t('Clone Tasks')}
      onClick={onClick}
    >
      <Download className="h-4 w-4" />
      {showBadge && totalActive > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
          {totalActive}
        </span>
      )}
      {showBadge && totalActive === 0 && hasCompletedOrError && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-green-500" />
      )}
    </button>
  );
}
