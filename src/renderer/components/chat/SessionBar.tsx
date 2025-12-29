import { GripVertical, Plus, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

const STORAGE_KEY = 'enso-session-bar';
const EDGE_THRESHOLD = 20; // pixels from edge

export interface Session {
  id: string; // UUID, also used for agent --session-id
  name: string;
  agentId: string; // which agent CLI to use (e.g., 'claude', 'codex', 'gemini', 'codex-wsl', 'claude-hapi', 'claude-happy')
  agentCommand: string; // the CLI command to run (e.g., 'claude', 'codex')
  initialized: boolean; // true after first run, use --resume to restore
  activated?: boolean; // true after user presses Enter, only activated sessions are persisted
  repoPath: string; // repository path this session belongs to
  cwd: string; // worktree path this session belongs to
  environment?: 'native' | 'wsl' | 'hapi' | 'happy'; // execution environment (default: native)
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
  const dragStart = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  // Get enabled agents from settings
  const { agentSettings, customAgents, hapiSettings, shellConfig } = useSettingsStore();

  // Detect installed agents on mount only (uses cached results from main process)
  useEffect(() => {
    // Get all enabled agent IDs from settings
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    const newInstalled = new Set<string>();

    // Use Promise.all for parallel detection (main process caches results)
    const detectPromises = enabledAgentIds.map(async (agentId) => {
      // Handle Hapi agents: they are virtual, based on base CLI installation
      // On Windows, CLI might be installed in WSL only, so check both native and WSL
      const isHapi = agentId.endsWith('-hapi');
      if (isHapi) {
        if (!hapiSettings.enabled) return;
        const baseId = agentId.slice(0, -5);
        const customAgent = customAgents.find((a) => a.id === baseId);
        // Check native first
        const nativeResult = await window.electronAPI.cli.detectOne(baseId, customAgent, {
          shellConfig,
        });
        if (nativeResult.installed) {
          newInstalled.add(agentId);
          return;
        }
        // If not installed natively, check WSL (Windows only)
        const wslResult = await window.electronAPI.cli.detectOne(`${baseId}-wsl`, customAgent, {
          shellConfig,
        });
        if (wslResult.installed) {
          newInstalled.add(agentId);
        }
        return;
      }

      // Handle Happy agents: they are virtual, require happy global installation and base CLI
      const isHappy = agentId.endsWith('-happy');
      if (isHappy) {
        // Check if happy is globally installed first
        const happyStatus = await window.electronAPI.happy.checkGlobal(false, shellConfig);
        if (!happyStatus.installed) return;

        const baseId = agentId.slice(0, -6);
        const customAgent = customAgents.find((a) => a.id === baseId);
        // Check native first
        const nativeResult = await window.electronAPI.cli.detectOne(baseId, customAgent, {
          shellConfig,
        });
        if (nativeResult.installed) {
          newInstalled.add(agentId);
          return;
        }
        // If not installed natively, check WSL (Windows only)
        const wslResult = await window.electronAPI.cli.detectOne(`${baseId}-wsl`, customAgent, {
          shellConfig,
        });
        if (wslResult.installed) {
          newInstalled.add(agentId);
        }
        return;
      }

      // Find custom agent if this is a custom agent ID
      const isWsl = agentId.endsWith('-wsl');
      const baseId = isWsl ? agentId.slice(0, -4) : agentId;
      const customAgent = customAgents.find((a) => a.id === baseId);

      const result = await window.electronAPI.cli.detectOne(agentId, customAgent, { shellConfig });
      if (result.installed) {
        newInstalled.add(agentId);
      }
    });

    Promise.all(detectPromises).then(() => {
      setInstalledAgents(newInstalled);
    });
  }, [agentSettings, customAgents, hapiSettings.enabled, shellConfig]);

  // Filter to only enabled AND installed agents (includes WSL/Hapi variants)
  // For Hapi agents, also check if hapi is still enabled
  const enabledAgents = Object.keys(agentSettings).filter((id) => {
    if (!agentSettings[id]?.enabled || !installedAgents.has(id)) return false;
    // Hapi agents require hapiSettings.enabled
    if (id.endsWith('-hapi') && !hapiSettings.enabled) return false;
    return true;
  });

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

  // Hover handler for agent menu
  const handleAddMouseEnter = useCallback(() => {
    setShowAgentMenu(true);
  }, []);

  const handleAddClick = useCallback(() => {
    onNewSession();
    setShowAgentMenu(false);
  }, [onNewSession]);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      // Handle WSL, Hapi and Happy agent IDs (e.g., 'codex-wsl' -> base is 'codex', 'claude-hapi' -> base is 'claude', 'claude-happy' -> base is 'claude')
      const isWsl = agentId.endsWith('-wsl');
      const isHapi = agentId.endsWith('-hapi');
      const isHappy = agentId.endsWith('-happy');
      const baseId = isWsl
        ? agentId.slice(0, -4)
        : isHapi
          ? agentId.slice(0, -5)
          : isHappy
            ? agentId.slice(0, -6)
            : agentId;

      const customAgent = customAgents.find((a) => a.id === baseId);
      const info = customAgent
        ? { name: customAgent.name, command: customAgent.command }
        : AGENT_INFO[baseId] || { name: 'Claude', command: 'claude' };

      onNewSessionWithAgent?.(agentId, info.command);
      setShowAgentMenu(false);
    },
    [customAgents, onNewSessionWithAgent]
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

            <div
              className="relative"
              onMouseEnter={handleAddMouseEnter}
              onMouseLeave={() => setShowAgentMenu(false)}
            >
              <button
                type="button"
                onClick={handleAddClick}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Agent selection menu for new session */}
              {showAgentMenu && (
                <div className="absolute top-full right-[-10px] z-50 min-w-32 pt-1">
                  <div className="rounded-lg border bg-popover p-1 shadow-lg">
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      {t('Select Agent')}
                    </div>
                    {enabledAgents.map((agentId) => {
                      const isWsl = agentId.endsWith('-wsl');
                      const isHapi = agentId.endsWith('-hapi');
                      const isHappy = agentId.endsWith('-happy');
                      const baseId = isWsl
                        ? agentId.slice(0, -4)
                        : isHapi
                          ? agentId.slice(0, -5)
                          : isHappy
                            ? agentId.slice(0, -6)
                            : agentId;
                      const customAgent = customAgents.find((a) => a.id === baseId);
                      const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? baseId;
                      const name = isWsl
                        ? `${baseName} (WSL)`
                        : isHapi
                          ? `${baseName} (Hapi)`
                          : isHappy
                            ? `${baseName} (Happy)`
                            : baseName;
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
                            <span className="text-xs text-muted-foreground">{t('(default)')}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
