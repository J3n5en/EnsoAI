import { cn } from '@/lib/utils';
import { GripVertical, Plus, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'enso-session-bar';
const EDGE_THRESHOLD = 20; // pixels from edge

export interface Session {
  id: string; // UUID, also used for claude --session-id
  name: string;
  initialized: boolean; // true after first run, use --resume to restore
  cwd: string; // worktree path this session belongs to
}

interface SessionBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (id: string, name: string) => void;
}

interface BarState {
  x: number;
  y: number;
  collapsed: boolean;
  edge: 'left' | 'right' | null;
}

function loadState(): BarState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { x: 50, y: 16, collapsed: false, edge: null };
}

export function SessionBar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onNewSession,
  onRenameSession,
}: SessionBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<BarState>(loadState);
  const [dragging, setDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const dragStart = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  // Save state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (state.collapsed) return;
      e.preventDefault();
      setDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        startX: state.x,
        startY: state.y,
      };
    },
    [state.collapsed, state.x, state.y]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      const newX = Math.max(0, Math.min(100, dragStart.current.startX + (dx / rect.width) * 100));
      const newY = Math.max(8, Math.min(rect.height - 48, dragStart.current.startY + dy));

      setState((s) => ({ ...s, x: newX, y: newY }));
    };

    const handleMouseUp = () => {
      setDragging(false);
      if (!containerRef.current || !barRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const barRect = barRef.current.getBoundingClientRect();

      // Check bar's left edge distance from container's left edge
      const leftEdgeDist = barRect.left - containerRect.left;
      // Check bar's right edge distance from container's right edge
      const rightEdgeDist = containerRect.right - barRect.right;

      setState((s) => {
        if (leftEdgeDist < EDGE_THRESHOLD) {
          return { ...s, x: 0, collapsed: true, edge: 'left' };
        }
        if (rightEdgeDist < EDGE_THRESHOLD) {
          return { ...s, x: 100, collapsed: true, edge: 'right' };
        }
        return s;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const handleExpand = useCallback(() => {
    if (!state.collapsed) return;
    setState((s) => ({ ...s, x: 50, collapsed: false, edge: null }));
  }, [state.collapsed]);

  const handleStartEdit = useCallback((session: Session) => {
    setEditingId(session.id);
    setEditingName(session.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const handleFinishEdit = useCallback(() => {
    if (editingId && editingName.trim()) {
      onRenameSession(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, onRenameSession]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleFinishEdit();
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setEditingName('');
      }
    },
    [handleFinishEdit]
  );

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <div
        ref={barRef}
        onClick={state.collapsed ? handleExpand : undefined}
        onKeyDown={state.collapsed ? (e) => e.key === 'Enter' && handleExpand() : undefined}
        role={state.collapsed ? 'button' : undefined}
        tabIndex={state.collapsed ? 0 : undefined}
        className={cn(
          'absolute pointer-events-auto',
          !dragging && 'transition-all duration-300',
          state.collapsed ? 'cursor-pointer' : dragging ? 'cursor-grabbing' : ''
        )}
        style={{
          ...(state.collapsed && state.edge === 'right'
            ? { right: 0, left: 'auto' }
            : { left: state.collapsed && state.edge === 'left' ? 0 : `${state.x}%` }),
          top: state.y,
          transform: state.collapsed ? 'none' : 'translateX(-50%)',
        }}
      >
        {state.collapsed ? (
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border bg-background/90 shadow-lg backdrop-blur-sm',
              state.edge === 'left' && 'rounded-l-md',
              state.edge === 'right' && 'rounded-r-md'
            )}
          >
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-full border bg-background/80 px-2 py-1.5 shadow-lg backdrop-blur-sm">
            <div
              className="flex h-7 w-4 items-center justify-center text-muted-foreground/50 cursor-grab"
              onMouseDown={handleMouseDown}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>

            {sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit(session);
                }}
                className={cn(
                  'group flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors cursor-pointer',
                  activeSessionId === session.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseSession(session.id);
                  }}
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full transition-colors',
                    'hover:bg-destructive/20 hover:text-destructive',
                    activeSessionId !== session.id && 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
                <Sparkles className="h-3.5 w-3.5" />
                {editingId === session.id ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleFinishEdit}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="w-20 bg-transparent outline-none border-b border-current"
                  />
                ) : (
                  <span>{session.name}</span>
                )}
              </button>
            ))}

            <div className="mx-1 h-4 w-px bg-border" />

            <button
              type="button"
              onClick={onNewSession}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
