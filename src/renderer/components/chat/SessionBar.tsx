import type { ClaudeProvider } from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  CheckCircle,
  Circle,
  GripVertical,
  Plus,
  Settings,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlowCard, useGlowEffectEnabled } from '@/components/ui/glow-card';
import { toastManager } from '@/components/ui/toast';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useSessionOutputState } from '@/hooks/useOutputState';
import { useI18n } from '@/i18n';
import {
  clearClaudeProviderSwitch,
  isClaudeProviderMatch,
  markClaudeProviderSwitch,
} from '@/lib/claudeProvider';
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
  // Quick Terminal props
  quickTerminalOpen?: boolean;
  quickTerminalHasProcess?: boolean;
  onToggleQuickTerminal?: () => void;
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

interface ProviderMenuItemProps {
  provider: ClaudeProvider;
  isActive: boolean;
  isDisabled: boolean;
  isPending: boolean;
  activeProviderId: string | undefined;
  providers: ClaudeProvider[];
  onApplyProvider: (provider: ClaudeProvider) => void;
  onCloseMenu: () => void;
  setClaudeProviderEnabled: (id: string, enabled: boolean) => void;
  enableProviderDisableFeature: boolean;
  t: (key: string) => string;
}

const ProviderMenuItem = React.memo(function ProviderMenuItem({
  provider,
  isActive,
  isDisabled,
  isPending,
  activeProviderId,
  providers,
  onApplyProvider,
  onCloseMenu,
  setClaudeProviderEnabled,
  enableProviderDisableFeature,
  t,
}: ProviderMenuItemProps) {
  const effectiveIsDisabled = enableProviderDisableFeature ? isDisabled : false;

  const handleSwitch = useCallback(() => {
    if (!isActive && !effectiveIsDisabled) {
      onApplyProvider(provider);
      onCloseMenu();
    }
  }, [isActive, effectiveIsDisabled, provider, onApplyProvider, onCloseMenu]);

  const handleToggleEnabled = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const isCurrentlyEnabled = provider.enabled !== false;
      setClaudeProviderEnabled(provider.id, !isCurrentlyEnabled);

      // 禁用当前激活的 Provider 时，自动切换到下一个可用的 Provider
      if (isCurrentlyEnabled && activeProviderId === provider.id) {
        const nextEnabledProvider = providers.find(
          (p) => p.id !== provider.id && p.enabled !== false
        );
        if (nextEnabledProvider) {
          onApplyProvider(nextEnabledProvider);
        }
      }
    },
    [provider, activeProviderId, providers, setClaudeProviderEnabled, onApplyProvider]
  );

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
        effectiveIsDisabled && 'opacity-50'
      )}
    >
      <button
        type="button"
        onClick={handleSwitch}
        disabled={isPending || effectiveIsDisabled}
        className={cn(
          'flex flex-1 items-center gap-2 whitespace-nowrap text-left',
          isPending && 'cursor-not-allowed'
        )}
      >
        {isActive ? (
          <CheckCircle className="h-4 w-4 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 shrink-0" />
        )}
        <span className={cn(effectiveIsDisabled && 'line-through')}>{provider.name}</span>
      </button>

      {/* 禁用/启用按钮 */}
      {enableProviderDisableFeature && (
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <button
              type="button"
              onClick={handleToggleEnabled}
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              {isDisabled ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipPopup side="right">
            {isDisabled ? t('Click to enable this Provider') : t('Click to disable this Provider')}
          </TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
});

/** Pick the best display name for a session tab */
function getSessionDisplayName(session: { terminalTitle?: string; name: string }): string {
  const title = session.terminalTitle;
  if (!title) return session.name;
  // Skip raw process paths (e.g. "Administrator: C:\...\pwsh.exe")
  if (/[/\\](pwsh|powershell|cmd|bash|zsh|sh|fish|nu)(\.exe)?["']?\s*$/i.test(title)) {
    return session.name;
  }
  if (/^(Administrator|root)\s*:/i.test(title)) {
    return session.name;
  }
  // Skip command-line titles (e.g. "npm view ...", "node scripts/...")
  if (/^(npm|npx|node|python|py|pnpm|yarn|bun|deno|cargo|go|java|ruby)\s/i.test(title)) {
    return session.name;
  }
  return title;
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
            <span>{getSessionDisplayName(session)}</span>
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
          <span className="relative z-10">{getSessionDisplayName(session)}</span>
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
  quickTerminalOpen,
  quickTerminalHasProcess,
  onToggleQuickTerminal,
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
  const setClaudeProviderEnabled = useSettingsStore((s) => s.setClaudeProviderEnabled);
  const enableProviderDisableFeature = useSettingsStore(
    (s) => s.claudeCodeIntegration.enableProviderDisableFeature ?? true
  );

  const { data: claudeData } = useQuery({
    queryKey: ['claude-settings'],
    queryFn: () => window.electronAPI.claudeProvider.readSettings(),
    enabled: !state.collapsed, // 仅在展开状态查询
    staleTime: 30000, // 30秒缓存避免频繁查询
  });

  // 计算当前激活的 Provider
  const activeProvider = useMemo(() => {
    const currentConfig = claudeData?.extracted;
    if (!currentConfig) return null;
    return providers.find((p) => isClaudeProviderMatch(p, currentConfig)) ?? null;
  }, [providers, claudeData?.extracted]);

  // Provider 切换 mutation
  const applyProvider = useMutation({
    mutationFn: (provider: ClaudeProvider) => window.electronAPI.claudeProvider.apply(provider),
    onSuccess: (success, provider) => {
      if (!success) {
        clearClaudeProviderSwitch();
        toastManager.add({
          type: 'error',
          title: t('Switch failed'),
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['claude-settings'] });
      toastManager.add({
        type: 'success',
        title: t('Provider switched'),
        description: provider.name,
      });
    },
    onError: (error) => {
      clearClaudeProviderSwitch();
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

  // 稳定的 Provider 回调函数
  const handleApplyProvider = useCallback(
    (provider: ClaudeProvider) => {
      markClaudeProviderSwitch(provider);
      applyProvider.mutate(provider);
    },
    [applyProvider]
  );

  const handleCloseProviderMenu = useCallback(() => {
    setShowProviderMenu(false);
  }, []);

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
      // Default agent is always considered installed (no detection needed)
      // This ensures the default agent shows in menu even if user never ran detection
      if (agentSettings[agentId]?.isDefault) {
        newInstalled.add(agentId);
        continue;
      }

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
    setEditingName(getSessionDisplayName(session));
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
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-xs text-muted-foreground">{t('Select Agent')}</span>
                      <Tooltip>
                        <TooltipTrigger render={<span />}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAgentMenu(false);
                              window.dispatchEvent(new CustomEvent('open-settings-agent'));
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipPopup side="right">{t('Manage Agents')}</TooltipPopup>
                      </Tooltip>
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

            {/* Provider Tag - 仅在展开且设置启用时显示 */}
            {!state.collapsed && showProviderSwitcher && (
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
                    title={activeProvider?.name ?? t('Select Provider')}
                  >
                    <svg
                      fill="currentColor"
                      fillRule="evenodd"
                      height="1em"
                      className="h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      width="1em"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <title>Claude</title>
                      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
                    </svg>
                    {activeProvider ? (
                      <span>{truncateProviderName(activeProvider.name)}</span>
                    ) : null}
                  </button>

                  {/* Provider 选择菜单 */}
                  {showProviderMenu && providers.length > 0 && (
                    <div
                      className={cn(
                        'absolute right-[-10px] z-50 min-w-32',
                        // 根据工具栏位置决定菜单方向
                        containerRef.current &&
                          state.y > containerRef.current.getBoundingClientRect().height / 2
                          ? 'bottom-full pb-1'
                          : 'top-full pt-1'
                      )}
                    >
                      <div className="rounded-lg border bg-popover p-1 shadow-lg">
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {t('Select Provider')}
                          </span>
                          <Tooltip>
                            <TooltipTrigger render={<span />}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowProviderMenu(false);
                                  window.dispatchEvent(new CustomEvent('open-settings-provider'));
                                }}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipPopup side="right">{t('Manage Providers')}</TooltipPopup>
                          </Tooltip>
                        </div>
                        {providers.map((provider) => {
                          const isActive = activeProvider?.id === provider.id;
                          const isDisabled = provider.enabled === false;

                          return (
                            <ProviderMenuItem
                              key={provider.id}
                              provider={provider}
                              isActive={isActive}
                              isDisabled={isDisabled}
                              isPending={applyProvider.isPending}
                              activeProviderId={activeProvider?.id}
                              providers={providers}
                              onApplyProvider={handleApplyProvider}
                              onCloseMenu={handleCloseProviderMenu}
                              setClaudeProviderEnabled={setClaudeProviderEnabled}
                              enableProviderDisableFeature={enableProviderDisableFeature}
                              t={t}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Quick Terminal Button - 在 Provider Switcher 之后 */}
            {!state.collapsed && onToggleQuickTerminal && (
              <>
                <div className="mx-1 h-4 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger render={<span />}>
                    <button
                      type="button"
                      onClick={onToggleQuickTerminal}
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                        quickTerminalOpen
                          ? 'bg-accent text-accent-foreground'
                          : quickTerminalHasProcess
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipPopup>{t('Quick Terminal')} (Ctrl+`)</TooltipPopup>
                </Tooltip>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
