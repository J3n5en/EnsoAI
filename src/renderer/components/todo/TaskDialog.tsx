import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { useTodoStore } from '@/stores/todo';
import type { TaskPriority, TaskStatus, TodoTask } from './types';

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TodoTask | null; // null = create mode
  defaultStatus: TaskStatus;
  repoPath: string;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function TaskDialog({ open, onOpenChange, task, defaultStatus, repoPath }: TaskDialogProps) {
  const { t } = useI18n();
  const addTask = useTodoStore((s) => s.addTask);
  const updateTask = useTodoStore((s) => s.updateTask);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description);
        setPriority(task.priority);
      } else {
        setTitle('');
        setDescription('');
        setPriority('medium');
      }
    }
  }, [open, task]);

  const handleSubmit = useCallback(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    if (task) {
      updateTask(repoPath, task.id, {
        title: trimmedTitle,
        description: description.trim(),
        priority,
      });
    } else {
      addTask(repoPath, {
        title: trimmedTitle,
        description: description.trim(),
        priority,
        status: defaultStatus,
      });
    }
    onOpenChange(false);
  }, [
    title,
    description,
    priority,
    task,
    repoPath,
    defaultStatus,
    addTask,
    updateTask,
    onOpenChange,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? t('Edit Task') : t('New Task')}</DialogTitle>
          <DialogDescription>{task ? t('Edit Task') : t('New Task')}</DialogDescription>
        </DialogHeader>

        <DialogPanel>
          <div className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">{t('Task title')}</label>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none ring-ring focus:ring-2 placeholder:text-muted-foreground"
                placeholder={t('Enter task title...')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">{t('Task description')}</label>
              <textarea
                className="min-h-[80px] w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none ring-ring focus:ring-2 placeholder:text-muted-foreground"
                placeholder={t('Enter task description...')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">{t('Priority')}</label>
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex h-8 items-center rounded-md border px-3 text-sm transition-colors ${
                      priority === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent/50'
                    }`}
                  >
                    {t(opt.label)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogPanel>

        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            {task ? t('Save') : t('Create')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
