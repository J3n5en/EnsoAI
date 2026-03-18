import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Play, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizePath } from '@/App/storage';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useTodoStore } from '@/stores/todo';
import type { TaskPriority, TodoTask } from './types';
import { type ResolvedAgent, useEnabledAgents } from './useEnabledAgents';

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: 'bg-blue-500',
  medium: 'bg-amber-500',
  high: 'bg-red-500',
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TaskCardProps {
  task: TodoTask;
  isOverlay?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  repoPath: string;
  worktreePath?: string;
  onSwitchToAgent?: () => void;
}

export function TaskCard({
  task,
  isOverlay,
  onEdit,
  onDelete,
  repoPath,
  worktreePath,
  onSwitchToAgent,
}: TaskCardProps) {
  const { t } = useI18n();
  const enabledAgents = useEnabledAgents();
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Close menu on outside click
  useEffect(() => {
    if (!showAgentMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        portalRef.current &&
        !portalRef.current.contains(target)
      ) {
        setShowAgentMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAgentMenu]);

  // Calculate menu position relative to viewport
  useLayoutEffect(() => {
    if (!showAgentMenu || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.top,
      left: rect.right,
    });
  }, [showAgentMenu]);

  const handleLaunchWithAgent = useCallback(
    (agent: ResolvedAgent) => {
      if (!worktreePath) return;

      const id = crypto.randomUUID();
      // Build task context for sending to agent
      const taskContext = task.description ? `${task.title}\n\n${task.description}` : task.title;

      // Use setState callback to ensure all updates happen in the same batch
      useAgentSessionsStore.setState((state) => {
        // Calculate displayOrder: max order in same worktree + 1
        const worktreeSessions = state.sessions.filter(
          (s) => s.repoPath === repoPath && s.cwd === worktreePath
        );
        const maxOrder = worktreeSessions.reduce(
          (max, s) => Math.max(max, s.displayOrder ?? 0),
          -1
        );

        const newSession = {
          id,
          sessionId: id,
          name: `Task: ${task.title}`,
          agentId: agent.agentId,
          agentCommand: agent.command,
          customPath: agent.customPath,
          customArgs: agent.customArgs,
          initialized: false,
          repoPath,
          cwd: worktreePath,
          environment: agent.environment,
          displayOrder: maxOrder + 1,
          // Store command to send after agent is ready
          pendingCommand: taskContext,
        };

        return {
          sessions: [...state.sessions, newSession],
          activeIds: { ...state.activeIds, [normalizePath(worktreePath)]: id },
          // Initialize enhanced input state (closed)
          enhancedInputStates: {
            ...state.enhancedInputStates,
            [id]: { open: false, content: '', imagePaths: [] },
          },
        };
      });

      // Move task to in-progress
      if (task.status === 'todo') {
        useTodoStore.getState().updateTask(repoPath, task.id, { status: 'in-progress' });
      }

      setShowAgentMenu(false);
      onSwitchToAgent?.();
    },
    [worktreePath, task, repoPath, onSwitchToAgent]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-1.5 border-b border-border/50 px-2 py-1.5 transition-colors hover:bg-accent/50',
        isDragging && 'opacity-50',
        isOverlay && 'bg-background shadow-md border rounded-sm'
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Priority dot */}
      <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[task.priority])} />

      {/* Title + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-foreground">{task.title}</span>
          {task.description && (
            <span className="hidden truncate text-xs text-muted-foreground/60 sm:inline">
              — {task.description}
            </span>
          )}
        </div>
      </div>

      {/* Time */}
      <span className="shrink-0 text-[10px] text-muted-foreground/50">
        {formatRelativeTime(task.updatedAt)}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {task.status !== 'done' && onSwitchToAgent && (
          <div className="relative" ref={menuRef}>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => {
                if (!worktreePath) return;
                setShowAgentMenu((v) => !v);
              }}
              disabled={!worktreePath}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={worktreePath ? t('Launch Agent') : t('Please select a worktree first')}
            >
              <Play className="h-3 w-3" />
            </button>

            {/* Agent selection menu - rendered via portal to avoid ScrollArea clipping */}
            {showAgentMenu &&
              enabledAgents.length > 0 &&
              createPortal(
                <div
                  ref={portalRef}
                  className="fixed z-[9999] min-w-36"
                  style={{
                    top: menuPos.top,
                    left: menuPos.left,
                    transform: 'translate(-100%, -100%)',
                  }}
                >
                  <div className="rounded-lg border bg-popover p-1 shadow-lg">
                    <div className="px-2 py-1">
                      <span className="text-xs text-muted-foreground">{t('Select Agent')}</span>
                    </div>
                    {enabledAgents.map((agent) => (
                      <button
                        type="button"
                        key={agent.agentId}
                        onClick={() => handleLaunchWithAgent(agent)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground whitespace-nowrap"
                      >
                        <span>{agent.name}</span>
                        {agent.isDefault && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            ({t('Default')})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>,
                document.body
              )}
          </div>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={t('Edit')}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          title={t('Delete')}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
