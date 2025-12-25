import { GripVertical, Plus, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { BUILTIN_AGENT_IDS, useSettingsStore } from '@/stores/settings';

const STORAGE_KEY = 'enso-session-bar';
const EDGE_THRESHOLD = 20; // pixels from edge
const LONG_PRESS_DELAY = 500; // ms for long press detection

export interface Session {
  id: string; // UUID, also used for agent --session-id
  name: string;
  agentId: string; // which agent CLI to use (e.g., 'claude', 'codex', 'gemini', 'codex-wsl')
  agentCommand: string; // the CLI command to run (e.g., 'claude', 'codex')
  initialized: boolean; // true after first run, use --resume to restore
  activated?: boolean; // true after user presses Enter, only activated sessions are persisted
  cwd: string; // worktree path this session belongs to
  environment?: 'native' | 'wsl'; // execution environment (default: native)
}

interface SessionBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNewSession: () => void;
  onNewSessionWithAgent?: (agentId: string, agentCommand: string) => void;
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

// Agent display names and commands
const AGENT_INFO: Record<string, { name: string; command: string }> = {
  claude: { name: 'Claude', command: 'claude' },
  codex: { name: 'Codex', command: 'codex' },
  droid: { name: 'Droid', command: 'droid' },
  gemini: { name: 'Gemini', command: 'gemini' },
  auggie: { name: 'Auggie', command: 'auggie' },
  cursor: { name: 'Cursor', command: 'cursor-agent' },
};

export function SessionBar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onNewSession,
  onNewSessionWithAgent,
  onRenameSession,
}: SessionBarProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<BarState>(loadState);
  const [dragging, setDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStart = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  // Get enabled agents from settings
  const { agentSettings, customAgents } = useSettingsStore();

  // Detect installed agents on mount (including WSL variants)
  useEffect(() => {
    // Get all enabled agent IDs from settings (includes WSL variants like 'codex-wsl')
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);

    for (const agentId of enabledAgentIds) {
      // Find custom agent if this is a custom agent ID
      const customAgent = customAgents.find((a) => a.id === agentId || `${a.id}-wsl` === agentId);

      window.electronAPI.cli.detectOne(agentId, customAgent).then((result) => {
        if (result.installed) {
          setInstalledAgents((prev) => new Set([...prev, agentId]));
        }
      });
    }
  }, [agentSettings, customAgents]);

  // Filter to only enabled AND installed agents (includes WSL variants)
  const enabledAgents = Object.keys(agentSettings).filter(
    (id) => agentSettings[id]?.enabled && installedAgents.has(id)
  );

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

  // Long press handlers for new session with agent selection
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleAddMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        setShowAgentMenu(true);
      }, LONG_PRESS_DELAY);
    },
    [clearLongPressTimer]
  );

  const handleAddMouseUp = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleAddMouseLeave = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleAddClick = useCallback(() => {
    // Only trigger if not showing menu (menu shown on long press)
    if (!showAgentMenu) {
      onNewSession();
    }
  }, [showAgentMenu, onNewSession]);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      // Handle WSL agent IDs (e.g., 'codex-wsl' -> base is 'codex')
      const isWsl = agentId.endsWith('-wsl');
      const baseId = isWsl ? agentId.slice(0, -4) : agentId;

      const customAgent = customAgents.find((a) => a.id === baseId);
      const info = customAgent
        ? { name: customAgent.name, command: customAgent.command }
        : AGENT_INFO[baseId] || { name: 'Claude', command: 'claude' };

      onNewSessionWithAgent?.(agentId, info.command);
      setShowAgentMenu(false);
    },
    [customAgents, onNewSessionWithAgent]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => clearLongPressTimer();
  }, [clearLongPressTimer]);

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
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit(session);
                }}
                onKeyDown={(e) => e.key === 'Enter' && onSelectSession(session.id)}
                role="button"
                tabIndex={0}
                className={cn(
                  'group flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors cursor-pointer',
                  activeSessionId === session.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
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
              </div>
            ))}

            <div className="mx-1 h-4 w-px bg-border" />

            <div className="relative">
              <button
                type="button"
                onClick={handleAddClick}
                onMouseDown={handleAddMouseDown}
                onMouseUp={handleAddMouseUp}
                onMouseLeave={handleAddMouseLeave}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Agent selection menu for new session */}
              {showAgentMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowAgentMenu(false)}
                    onKeyDown={(e) => e.key === 'Escape' && setShowAgentMenu(false)}
                  />
                  <div className="absolute top-full right-0 mt-1 z-50 min-w-32 rounded-lg border bg-popover p-1 shadow-lg">
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      {t('Select Agent')}
                    </div>
                    {enabledAgents.map((agentId) => {
                      const isWsl = agentId.endsWith('-wsl');
                      const baseId = isWsl ? agentId.slice(0, -4) : agentId;
                      const customAgent = customAgents.find((a) => a.id === baseId);
                      const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? baseId;
                      const name = isWsl ? `${baseName} (WSL)` : baseName;
                      const isDefault = agentSettings[agentId]?.isDefault;
                      return (
                        <button
                          type="button"
                          key={agentId}
                          onClick={() => handleSelectAgent(agentId)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <span>{name}</span>
                          {isDefault && (
                            <span className="text-xs text-muted-foreground">
                              {t('(default)')}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
