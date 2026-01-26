import type { ClaudeProvider } from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Circle, GripVertical, Plus, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlowCard, useGlowEffectEnabled } from '@/components/ui/glow-card';
import { toastManager } from '@/components/ui/toast';
import { useSessionOutputState } from '@/hooks/useOutputState';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

const STORAGE_KEY = 'enso-session-bar';
const EDGE_THRESHOLD = 20; // pixels from edge

export interface Session {
  id: string; // Session's own unique ID
  sessionId?: string; // Optional Claude session ID for --session-id/--resume (defaults to id if not set)
  name: string;
  agentId: string; // which agent CLI to use (e.g., 'claude', 'codex', 'gemini', 'claude-hapi', 'claude-happy')
  agentCommand: string; // the CLI command to run (e.g., 'claude', 'codex')
  customPath?: string; // custom absolute path to the agent CLI (overrides agentCommand lookup)
  customArgs?: string; // additional arguments to pass to the agent
  initialized: boolean; // true after first run, use --resume to restore
  activated?: boolean; // true after user presses Enter, only activated sessions are persisted
  repoPath: string; // repository path this session belongs to
  cwd: string; // worktree path this session belongs to
  environment?: 'native' | 'hapi' | 'happy'; // execution environment (default: native)
  displayOrder?: number; // order in SessionBar (lower = first), used for drag reorder
  terminalTitle?: string; // current terminal title from OSC escape sequence
}

interface SessionBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNewSession: () => void;
  onNewSessionWithAgent?: (agentId: string, agentCommand: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onReorderSessions?: (fromIndex: number, toIndex: number) => void;
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
  opencode: { name: 'OpenCode', command: 'opencode' },
};

// Session tab with glow effect
interface SessionTabProps {
  session: Session;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  editingName: string;
  isDragging: boolean;
  dropTargetIndex: number | null;
  draggedTabIndex: number | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: () => void;
  onClose: () => void;
  onStartEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onFinishEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function SessionTab({
  session,
  index,
  isActive,
  isEditing,
  editingName,
  isDragging,
  dropTargetIndex,
  draggedTabIndex,
  inputRef,
  onSelect,
  onClose,
  onStartEdit,
  onEditingNameChange,
  onFinishEdit,
  onKeyDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: SessionTabProps) {
  const outputState = useSessionOutputState(session.id);
  const glowEnabled = useGlowEffectEnabled();

  // When glow effect is disabled, use simple button with indicator dot
  if (!glowEnabled) {
    return (
      <div className="relative flex items-center">
        {/* Drop indicator - left side */}
        {dropTargetIndex === index && draggedTabIndex !== null && draggedTabIndex > index && (
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
        )}
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'group flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors cursor-pointer',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            isDragging && 'opacity-50'
          )}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onStartEdit();
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onBlur={onFinishEdit}
              onKeyDown={onKeyDown}
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
              onClose();
            }}
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full transition-colors',
              'hover:bg-destructive/20 hover:text-destructive',
              !isActive && 'opacity-0 group-hover:opacity-100'
            )}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {/* Drop indicator - right side */}
        {dropTargetIndex === index && draggedTabIndex !== null && draggedTabIndex < index && (
          <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
        )}
      </div>
    );
  }

  // Glow effect enabled - use GlowCard
  return (
    <div className="relative flex items-center">
      {/* Drop indicator - left side */}
      {dropTargetIndex === index && draggedTabIndex !== null && draggedTabIndex > index && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
      )}
      <GlowCard
        state={outputState}
        as="div"
        role="button"
        tabIndex={0}
        className={cn(
          'group flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors cursor-pointer',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          isDragging && 'opacity-50'
        )}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onSelect}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        onContextMenu={(e: React.MouseEvent) => {
          e.preventDefault();
          onStartEdit();
        }}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onBlur={onFinishEdit}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-20 bg-transparent outline-none border-b border-current"
          />
        ) : (
          <span className="relative z-10">{session.name}</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn(
            'relative z-10 flex h-4 w-4 items-center justify-center rounded-full transition-colors',
            'hover:bg-destructive/20 hover:text-destructive',
            !isActive && 'opacity-0 group-hover:opacity-100'
          )}
        >
          <X className="h-3 w-3" />
        </button>
      </GlowCard>
      {/* Drop indicator - right side */}
      {dropTargetIndex === index && draggedTabIndex !== null && draggedTabIndex < index && (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
      )}
    </div>
  );
}

export function SessionBar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onNewSession,
  onNewSessionWithAgent,
  onRenameSession,
  onReorderSessions,
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
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());
  const dragStart = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  // Provider 查询和切换逻辑
  const queryClient = useQueryClient();
  const providers = useSettingsStore((s) => s.claudeCodeIntegration.providers);
  const showProviderSwitcher = useSettingsStore(
    (s) => s.claudeCodeIntegration.showProviderSwitcher ?? true
  );

  const { data: claudeData } = useQuery({
    queryKey: ['claude-settings'],
    queryFn: () => window.electronAPI.claudeProvider.readSettings(),
    enabled: !state.collapsed, // 仅在展开状态查询
    staleTime: 30000, // 30秒缓存避免频繁查询
  });

  // 计算当前激活的 Provider
  const activeProvider = useMemo(() => {
    const env = claudeData?.settings?.env;
    if (!env) return null;
    return (
      providers.find(
        (p) => p.baseUrl === env.ANTHROPIC_BASE_URL && p.authToken === env.ANTHROPIC_AUTH_TOKEN
      ) ?? null
    );
  }, [providers, claudeData?.settings]);

  // Provider 切换 mutation
  const applyProvider = useMutation({
    mutationFn: (provider: ClaudeProvider) => window.electronAPI.claudeProvider.apply(provider),
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ['claude-settings'] });
      toastManager.add({
        type: 'success',
        title: t('Provider switched'),
        description: provider.name,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: 'error',
        title: t('Switch failed'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // 截断 Provider 名称（最多 15 个字符）
  const truncateProviderName = (name: string): string => {
    if (name.length <= 15) return name;
    return `${name.slice(0, 14)}...`;
  };

  // Tab drag reorder
  const draggedTabIndexRef = useRef<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Store drag image element for cleanup
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  const handleTabDragStart = useCallback((e: React.DragEvent, index: number) => {
    draggedTabIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));

    // Create a simple styled drag image
    const target = e.currentTarget as HTMLElement;
    const computedStyle = window.getComputedStyle(target);
    const textContent = target.querySelector('span')?.textContent || '';

    const dragImage = document.createElement('div');
    dragImage.textContent = textContent;
    dragImage.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      padding: ${computedStyle.padding};
      background-color: ${computedStyle.backgroundColor};
      color: ${computedStyle.color};
      font-size: ${computedStyle.fontSize};
      font-family: ${computedStyle.fontFamily};
      border-radius: 9999px;
      white-space: nowrap;
      pointer-events: none;
    `;

    document.body.appendChild(dragImage);
    dragImageRef.current = dragImage;
    e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);

    // Prevent bar dragging while tab dragging
    e.stopPropagation();
  }, []);

  const handleTabDragEnd = useCallback(() => {
    // Clean up drag image
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedTabIndexRef.current = null;
    setDropTargetIndex(null);
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTabIndexRef.current !== null && draggedTabIndexRef.current !== index) {
      setDropTargetIndex(index);
    }
  }, []);

  const handleTabDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleTabDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedTabIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderSessions) {
        onReorderSessions(fromIndex, toIndex);
      }
      draggedTabIndexRef.current = null;
      setDropTargetIndex(null);
    },
    [onReorderSessions]
  );

  // Get enabled agents from settings (use persisted detection status, no scanning)
  const { agentSettings, agentDetectionStatus, customAgents, hapiSettings } = useSettingsStore();

  // Build installed agents set from persisted detection status
  useEffect(() => {
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    const newInstalled = new Set<string>();

    for (const agentId of enabledAgentIds) {
      // Handle Hapi agents: check if base CLI is detected as installed
      if (agentId.endsWith('-hapi')) {
        if (!hapiSettings.enabled) continue;
        const baseId = agentId.slice(0, -5);
        if (agentDetectionStatus[baseId]?.installed) {
          newInstalled.add(agentId);
        }
        continue;
      }

      // Handle Happy agents: check if base CLI is detected as installed
      if (agentId.endsWith('-happy')) {
        const baseId = agentId.slice(0, -6);
        if (agentDetectionStatus[baseId]?.installed) {
          newInstalled.add(agentId);
        }
        continue;
      }

      // Regular agents: use persisted detection status
      if (agentDetectionStatus[agentId]?.installed) {
        newInstalled.add(agentId);
      }
    }

    setInstalledAgents(newInstalled);
  }, [agentSettings, agentDetectionStatus, hapiSettings.enabled]);

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
      // Handle Hapi and Happy agent IDs (e.g., 'claude-hapi' -> base is 'claude', 'claude-happy' -> base is 'claude')
      const isHapi = agentId.endsWith('-hapi');
      const isHappy = agentId.endsWith('-happy');
      const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

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
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
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
            : state.collapsed && state.edge === 'left'
              ? { left: 0 }
              : state.x > 90
                ? { right: `${100 - state.x}%` }
                : { left: `${state.x}%` }),
          top: state.y,
          transform: state.collapsed
            ? 'none'
            : state.x > 90
              ? 'translateX(50%)'
              : 'translateX(-50%)',
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
          <div className="flex items-center gap-1 rounded-full border bg-background/80 px-2 py-1.5 shadow-lg backdrop-blur-sm min-w-fit">
            <div
              className="flex h-7 w-4 items-center justify-center text-muted-foreground/50 cursor-grab"
              onMouseDown={handleMouseDown}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>

            {sessions.map((session, index) => (
              <SessionTab
                key={session.id}
                session={session}
                index={index}
                isActive={activeSessionId === session.id}
                isEditing={editingId === session.id}
                editingName={editingName}
                isDragging={draggedTabIndexRef.current === index}
                dropTargetIndex={dropTargetIndex}
                draggedTabIndex={draggedTabIndexRef.current}
                inputRef={inputRef}
                onSelect={() => onSelectSession(session.id)}
                onClose={() => onCloseSession(session.id)}
                onStartEdit={() => handleStartEdit(session)}
                onEditingNameChange={setEditingName}
                onFinishEdit={handleFinishEdit}
                onKeyDown={handleKeyDown}
                onDragStart={(e) => handleTabDragStart(e, index)}
                onDragEnd={handleTabDragEnd}
                onDragOver={(e) => handleTabDragOver(e, index)}
                onDragLeave={handleTabDragLeave}
                onDrop={(e) => handleTabDrop(e, index)}
              />
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
                <div
                  className={cn(
                    'absolute right-[-10px] z-50 min-w-32',
                    // Show menu above when bar is in bottom half of container
                    containerRef.current &&
                      state.y > containerRef.current.getBoundingClientRect().height / 2
                      ? 'bottom-full pb-1'
                      : 'top-full pt-1'
                  )}
                >
                  <div className="rounded-lg border bg-popover p-1 shadow-lg">
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      {t('Select Agent')}
                    </div>
                    {[...enabledAgents]
                      .sort((a, b) => {
                        const aDefault = agentSettings[a]?.isDefault ? 1 : 0;
                        const bDefault = agentSettings[b]?.isDefault ? 1 : 0;
                        return bDefault - aDefault;
                      })
                      .map((agentId) => {
                        const isHapi = agentId.endsWith('-hapi');
                        const isHappy = agentId.endsWith('-happy');
                        const baseId = isHapi
                          ? agentId.slice(0, -5)
                          : isHappy
                            ? agentId.slice(0, -6)
                            : agentId;
                        const customAgent = customAgents.find((a) => a.id === baseId);
                        const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? baseId;
                        const name = isHapi
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
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground whitespace-nowrap"
                          >
                            <span>{name}</span>
                            {isDefault && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {t('(default)')}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Provider Tag - 仅在展开、有 Provider 且设置启用时显示 */}
            {!state.collapsed && showProviderSwitcher && activeProvider && (
              <>
                <div className="mx-1 h-4 w-px bg-border" />

                <div
                  className="relative shrink-0"
                  onMouseEnter={() => setShowProviderMenu(true)}
                  onMouseLeave={() => setShowProviderMenu(false)}
                >
                  <button
                    type="button"
                    onClick={() => setShowProviderMenu(!showProviderMenu)}
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors whitespace-nowrap"
                    title={activeProvider.name}
                  >
                    <span>{truncateProviderName(activeProvider.name)}</span>
                  </button>

                  {/* Provider 选择菜单 */}
                  {showProviderMenu && providers.length > 0 && (
                    <div
                      className={cn(
                        'absolute right-[-10px] z-50 min-w-40',
                        // 根据工具栏位置决定菜单方向
                        containerRef.current &&
                          state.y > containerRef.current.getBoundingClientRect().height / 2
                          ? 'bottom-full pb-1'
                          : 'top-full pt-1'
                      )}
                    >
                      <div className="rounded-lg border bg-popover p-1 shadow-lg">
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                          {t('Select Provider')}
                        </div>
                        {providers.map((provider) => {
                          const isActive = activeProvider?.id === provider.id;
                          return (
                            <button
                              type="button"
                              key={provider.id}
                              onClick={() => {
                                if (!isActive) {
                                  applyProvider.mutate(provider);
                                }
                                setShowProviderMenu(false);
                              }}
                              disabled={applyProvider.isPending}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors whitespace-nowrap',
                                isActive
                                  ? 'text-foreground'
                                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                                applyProvider.isPending && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              {isActive ? (
                                <CheckCircle className="h-4 w-4 shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 shrink-0" />
                              )}
                              <span className="flex-1 text-left">{provider.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
