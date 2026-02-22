import {
  closestCorners,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { selectTasks, useTodoStore } from '@/stores/todo';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';
import { TASK_STATUS_LIST, type TaskStatus, type TodoTask } from './types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  done: 'Done',
};

interface KanbanBoardProps {
  repoPath: string;
  worktreePath?: string;
  onSwitchToAgent?: () => void;
}

export function KanbanBoard({ repoPath, worktreePath, onSwitchToAgent }: KanbanBoardProps) {
  const { t } = useI18n();
  const tasks = useTodoStore((s) => selectTasks(s, repoPath));
  const moveTask = useTodoStore((s) => s.moveTask);
  const reorderTasks = useTodoStore((s) => s.reorderTasks);
  const loadTasks = useTodoStore((s) => s.loadTasks);

  // Load tasks from SQLite on mount / repoPath change
  useEffect(() => {
    loadTasks(repoPath);
  }, [repoPath, loadTasks]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TodoTask | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track pending cross-column move during drag (not yet committed)
  const [pendingMove, setPendingMove] = useState<{
    taskId: string;
    fromStatus: TaskStatus;
    toStatus: TaskStatus;
  } | null>(null);

  // Snapshot of tasks at drag start for cancel rollback
  const dragStartSnapshotRef = useRef<TodoTask[] | null>(null);

  // Merge pending move into displayed tasks
  const displayTasks = useMemo(() => {
    if (!pendingMove) return tasks;
    return tasks.map((t) =>
      t.id === pendingMove.taskId ? { ...t, status: pendingMove.toStatus } : t
    );
  }, [tasks, pendingMove]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TodoTask[]> = {
      todo: [],
      'in-progress': [],
      done: [],
    };
    for (const task of displayTasks) {
      grouped[task.status]?.push(task);
    }
    // Sort by order within each column
    for (const status of TASK_STATUS_LIST) {
      grouped[status].sort((a, b) => a.order - b.order);
    }
    return grouped;
  }, [displayTasks]);

  const activeTask = useMemo(
    () => (activeId ? (displayTasks.find((t) => t.id === activeId) ?? null) : null),
    [activeId, displayTasks]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Find which column a task belongs to (using displayTasks for visual consistency)
  const findColumn = useCallback(
    (id: string): TaskStatus | null => {
      const task = displayTasks.find((t) => t.id === id);
      if (task) return task.status;
      if (TASK_STATUS_LIST.includes(id as TaskStatus)) return id as TaskStatus;
      return null;
    },
    [displayTasks]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(String(event.active.id));
      dragStartSnapshotRef.current = tasks;
    },
    [tasks]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeColumn = findColumn(String(active.id));
      let overColumn = findColumn(String(over.id));

      if (TASK_STATUS_LIST.includes(String(over.id) as TaskStatus)) {
        overColumn = String(over.id) as TaskStatus;
      }

      if (!activeColumn || !overColumn || activeColumn === overColumn) return;

      // Only update visual pending state, don't persist
      const task = displayTasks.find((t) => t.id === String(active.id));
      if (!task) return;

      const originalStatus =
        dragStartSnapshotRef.current?.find((t) => t.id === String(active.id))?.status ??
        task.status;

      setPendingMove({
        taskId: String(active.id),
        fromStatus: originalStatus,
        toStatus: overColumn,
      });
    },
    [findColumn, displayTasks]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const currentPendingMove = pendingMove;

      setActiveId(null);
      setPendingMove(null);
      dragStartSnapshotRef.current = null;

      if (!over) return;

      // Commit cross-column move
      if (currentPendingMove && currentPendingMove.taskId === String(active.id)) {
        const overItems = tasksByStatus[currentPendingMove.toStatus];
        const newOrder = overItems.length > 0 ? overItems[overItems.length - 1].order + 1 : 0;
        moveTask(repoPath, currentPendingMove.taskId, currentPendingMove.toStatus, newOrder);
        return;
      }

      // Same column reorder
      const activeColumn = findColumn(String(active.id));
      let overColumn = findColumn(String(over.id));

      if (TASK_STATUS_LIST.includes(String(over.id) as TaskStatus)) {
        overColumn = String(over.id) as TaskStatus;
      }

      if (!activeColumn || !overColumn) return;

      if (activeColumn === overColumn && String(active.id) !== String(over.id)) {
        const items = tasksByStatus[activeColumn];
        const oldIndex = items.findIndex((t) => t.id === String(active.id));
        const newIndex = items.findIndex((t) => t.id === String(over.id));

        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(items, oldIndex, newIndex);
          reorderTasks(
            repoPath,
            activeColumn,
            reordered.map((t) => t.id)
          );
        }
      }
    },
    [findColumn, tasksByStatus, reorderTasks, moveTask, repoPath, pendingMove]
  );

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    setActiveId(null);
    setPendingMove(null);
    dragStartSnapshotRef.current = null;
  }, []);

  const handleAddTask = useCallback((status: TaskStatus) => {
    setEditingTask(null);
    setDefaultStatus(status);
    setDialogOpen(true);
  }, []);

  const handleEditTask = useCallback((task: TodoTask) => {
    setEditingTask(task);
    setDefaultStatus(task.status);
    setDialogOpen(true);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Board header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-medium text-foreground">{t('Todo')}</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => handleAddTask('todo')}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('New Task')}
        </Button>
      </div>

      {/* Kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-1 overflow-x-auto">
          {TASK_STATUS_LIST.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              title={t(STATUS_LABELS[status])}
              tasks={tasksByStatus[status]}
              onAddTask={() => handleAddTask(status)}
              onEditTask={handleEditTask}
              onDeleteTask={(taskId) => useTodoStore.getState().deleteTask(repoPath, taskId)}
              repoPath={repoPath}
              worktreePath={worktreePath}
              onSwitchToAgent={onSwitchToAgent}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCard
              task={activeTask}
              isOverlay
              onEdit={() => {}}
              onDelete={() => {}}
              repoPath={repoPath}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task dialog */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        defaultStatus={defaultStatus}
        repoPath={repoPath}
      />
    </div>
  );
}
