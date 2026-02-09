import { AnimatePresence, motion } from 'framer-motion';
import {
  FileCode,
  FolderOpen,
  GitBranch,
  MessageSquare,
  RectangleEllipsis,
  Settings,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_TAB_ORDER, type TabId } from '@/App/constants';
import { normalizePath } from '@/App/storage';
import { OpenInMenu } from '@/components/app/OpenInMenu';
import { AgentPanel } from '@/components/chat/AgentPanel';
import { FilePanel } from '@/components/files';
import { RunningProjectsPopover } from '@/components/layout/RunningProjectsPopover';
import { SettingsContent } from '@/components/settings';
import type { SettingsCategory } from '@/components/settings/constants';
import { SourceControlPanel } from '@/components/source-control';
import { DiffReviewModal } from '@/components/source-control/DiffReviewModal';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import { TerminalPanel } from '../terminal';

type LayoutMode = 'columns' | 'tree';

interface MainContentProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tabOrder?: TabId[];
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  repoPath?: string; // repository path for session storage
  worktreePath?: string;
  repositoryCollapsed?: boolean;
  worktreeCollapsed?: boolean;
  layoutMode?: LayoutMode;
  onExpandRepository?: () => void;
  onExpandWorktree?: () => void;
  onSwitchWorktree?: (worktreePath: string) => void;
  onSwitchTab?: (tab: TabId) => void;
  isSettingsActive?: boolean;
  settingsCategory?: SettingsCategory;
  onCategoryChange?: (category: SettingsCategory) => void;
  scrollToProvider?: boolean;
  onToggleSettings?: () => void;
}

export function MainContent({
  activeTab,
  onTabChange,
  tabOrder = DEFAULT_TAB_ORDER,
  onTabReorder,
  repoPath,
  worktreePath,
  repositoryCollapsed = false,
  worktreeCollapsed = false,
  layoutMode = 'columns',
  onExpandRepository,
  onExpandWorktree,
  onSwitchWorktree,
  onSwitchTab,
  isSettingsActive = false,
  settingsCategory,
  onCategoryChange,
  scrollToProvider,
  onToggleSettings,
}: MainContentProps) {
  const { t } = useI18n();
  const settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const setSettingsDisplayMode = useSettingsStore((s) => s.setSettingsDisplayMode);

  // Diff Review Modal state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Subscribe to sessions and activeIds for reactivity
  const sessions = useAgentSessionsStore((s) => s.sessions);
  const activeIds = useAgentSessionsStore((s) => s.activeIds);
  const activeSessionId = useMemo(() => {
    if (!repoPath || !worktreePath) return null;
    const key = normalizePath(worktreePath);
    const activeId = activeIds[key];
    if (activeId) {
      const session = sessions.find((s) => s.id === activeId);
      if (session) return activeId;
    }
    const firstSession = sessions.find((s) => s.repoPath === repoPath && s.cwd === worktreePath);
    return firstSession?.id ?? null;
  }, [repoPath, worktreePath, sessions, activeIds]);

  // Sync activeSessionId to terminalWrite store for global access (e.g., toast "Send to Session")
  const setActiveSessionId = useTerminalWriteStore((s) => s.setActiveSessionId);
  useEffect(() => {
    setActiveSessionId(activeSessionId);
  }, [activeSessionId, setActiveSessionId]);

  // Tab metadata configuration (excludes 'settings' as it's not shown in the tab bar)
  const tabConfigMap: Record<
    Exclude<TabId, 'settings'>,
    { icon: React.ElementType; label: string }
  > = {
    chat: { icon: Sparkles, label: t('Agent') },
    file: { icon: FileCode, label: t('File') },
    terminal: { icon: Terminal, label: t('Terminal') },
    'source-control': { icon: GitBranch, label: t('Version Control') },
  };

  // Generate tabs array based on tabOrder (filter out 'settings' tab)
  const tabs = tabOrder
    .filter((id): id is Exclude<TabId, 'settings'> => id !== 'settings')
    .map(
      (id) =>
        ({ id, ...tabConfigMap[id] }) as {
          id: Exclude<TabId, 'settings'>;
          icon: React.ElementType;
          label: string;
        }
    );

  // Drag reorder state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  useEffect(() => {
    const dragImage = document.createElement('div');
    dragImage.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      padding: 8px 12px;
      background-color: var(--accent);
      color: var(--accent-foreground);
      font-size: 14px;
      font-weight: 500;
      border-radius: 8px;
      white-space: nowrap;
      pointer-events: none;
    `;
    document.body.appendChild(dragImage);
    dragImageRef.current = dragImage;

    return () => {
      dragImage.remove();
      dragImageRef.current = null;
    };
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, index: number, label: string) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));

    const dragImage = dragImageRef.current;
    if (dragImage) {
      dragImage.textContent = label;
      e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedIndex !== null && draggedIndex !== index) {
        setDropTargetIndex((prev) => (prev === index ? prev : index));
      }
    },
    [draggedIndex]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) {
      return;
    }
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndex;
      if (fromIndex !== null && fromIndex !== toIndex && onTabReorder) {
        onTabReorder(fromIndex, toIndex);
      }
      setDropTargetIndex(null);
    },
    [onTabReorder, draggedIndex]
  );

  // Need extra padding for traffic lights when both panels are collapsed (macOS only)
  const isMac = window.electronAPI.env.platform === 'darwin';
  const needsTrafficLightPadding = isMac && repositoryCollapsed && worktreeCollapsed;

  // Remember last valid repoPath and worktreePath to keep AgentPanel mounted
  // This prevents agent terminals from being destroyed when switching repos
  const lastValidRepoPathRef = useRef<string | null>(null);
  const lastValidWorktreePathRef = useRef<string | null>(null);

  // Update refs when we have valid values
  useEffect(() => {
    if (repoPath && worktreePath) {
      lastValidRepoPathRef.current = repoPath;
      lastValidWorktreePathRef.current = worktreePath;
    }
  }, [repoPath, worktreePath]);

  // Use current values if available, otherwise use last valid values
  const effectiveRepoPath = repoPath || lastValidRepoPathRef.current;
  const effectiveWorktreePath = worktreePath || lastValidWorktreePathRef.current;

  // Check if we have a currently selected worktree
  const hasActiveWorktree = Boolean(repoPath && worktreePath);

  // When background image is enabled, avoid stacking multiple semi-transparent bg-background layers
  // Keep bg-background on <main> only (1 layer), remove from all inner elements to prevent double-stacking
  const bgImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const innerBg = bgImageEnabled ? '' : 'bg-background';

  return (
    <main className={cn('flex min-w-[535px] flex-1 flex-col overflow-hidden bg-background')}>
      {/* Header with tabs */}
      <header
        className={cn(
          'flex h-12 shrink-0 items-center justify-between border-b px-4 drag-region',
          innerBg,
          needsTrafficLightPadding && 'pl-[80px]'
        )}
      >
        {/* Left: Expand buttons + Tabs */}
        <div className="flex items-center gap-1 no-drag">
          {/* Expand buttons when panels are collapsed */}
          <AnimatePresence mode="popLayout">
            {worktreeCollapsed && (
              <motion.div
                key="expand-buttons"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="flex items-center overflow-hidden"
              >
                {needsTrafficLightPadding && <div className="mx-1 h-4 w-px bg-border" />}
                {repositoryCollapsed && onSwitchWorktree && onSwitchTab && (
                  <RunningProjectsPopover
                    onSelectWorktreeByPath={onSwitchWorktree}
                    onSwitchTab={onSwitchTab}
                    showBadge={false}
                  />
                )}
                {layoutMode === 'tree' ? (
                  onExpandRepository && (
                    <button
                      type="button"
                      onClick={onExpandRepository}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                      title={t('Expand Sidebar')}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  )
                ) : (
                  <>
                    {repositoryCollapsed && onExpandRepository && (
                      <button
                        type="button"
                        onClick={onExpandRepository}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                        title={t('Expand Repository')}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </button>
                    )}
                    {onExpandWorktree && (
                      <button
                        type="button"
                        onClick={onExpandWorktree}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                        title={t('Expand Worktree')}
                      >
                        <GitBranch className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
                <div className="mx-1 h-4 w-px bg-border" />
              </motion.div>
            )}
          </AnimatePresence>
          {tabs.map((tab, index) => {
            const isDropTarget = dropTargetIndex === index;
            const isDragging = draggedIndex === index;
            const isActive = activeTab === tab.id;
            return (
              <div
                key={tab.id}
                draggable={!!onTabReorder}
                onDragStart={onTabReorder ? (e) => handleDragStart(e, index, tab.label) : undefined}
                onDragEnd={onTabReorder ? handleDragEnd : undefined}
                onDragOver={onTabReorder ? (e) => handleDragOver(e, index) : undefined}
                onDragLeave={onTabReorder ? handleDragLeave : undefined}
                onDrop={onTabReorder ? (e) => handleDrop(e, index) : undefined}
                aria-grabbed={isDragging}
                aria-disabled={!onTabReorder}
                className={cn(
                  'relative flex items-center',
                  isDragging && 'opacity-50',
                  onTabReorder && 'cursor-grab active:cursor-grabbing'
                )}
              >
                {/* Drop indicator */}
                {isDropTarget && !isDragging && (
                  <motion.div
                    layoutId="tab-drop-indicator"
                    className="absolute -top-0.5 left-0 right-0 h-0.5 bg-primary rounded-full"
                    transition={springFast}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'relative flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                    isActive
                      ? 'text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  {/* Active highlight background */}
                  {isActive && (
                    <motion.div
                      layoutId="main-tab-highlight"
                      className="absolute inset-0 rounded-md bg-accent"
                      transition={springFast}
                    />
                  )}
                  <tab.icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Right: Settings + Review button + Open In Menu */}
        <div className="flex items-center gap-2 no-drag">
          {/* Settings button */}
          <button
            type="button"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
              isSettingsActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={onToggleSettings}
            title={t('Settings')}
          >
            <Settings className="h-4 w-4" />
          </button>
          {activeSessionId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReviewModalOpen(true)}
              className="h-8"
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              {t('Review')}
            </Button>
          )}
          <OpenInMenu path={worktreePath} activeTab={activeTab} />
        </div>
      </header>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Chat tab - ALWAYS keep AgentPanel mounted to preserve terminal sessions across repo switches */}
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'chat' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          {/* Always render AgentPanel if we have any valid paths (current or previous) */}
          {effectiveRepoPath && effectiveWorktreePath ? (
            <>
              <AgentPanel
                repoPath={effectiveRepoPath}
                cwd={effectiveWorktreePath}
                isActive={activeTab === 'chat' && hasActiveWorktree}
                onSwitchWorktree={onSwitchWorktree}
              />
              {/* Show overlay when no worktree is actively selected */}
              {!hasActiveWorktree && (
                <div className={cn("absolute inset-0 z-20 flex items-center justify-center", innerBg)}>
                  <Empty className="border-0">
                    <EmptyMedia variant="icon">
                      <Sparkles className="h-4.5 w-4.5" />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>{t('Select a Worktree')}</EmptyTitle>
                      <EmptyDescription>
                        {t('Choose a worktree to continue using AI Agent')}
                      </EmptyDescription>
                    </EmptyHeader>
                    {onExpandWorktree && worktreeCollapsed && (
                      <Button onClick={onExpandWorktree} variant="outline" className="mt-2">
                        <GitBranch className="mr-2 h-4 w-4" />
                        {t('Choose Worktree')}
                      </Button>
                    )}
                  </Empty>
                </div>
              )}
            </>
          ) : (
            <div className={cn("h-full flex items-center justify-center", innerBg)}>
              <Empty className="border-0">
                <EmptyMedia variant="icon">
                  <Sparkles className="h-4.5 w-4.5" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>{t('Start using AI Agent')}</EmptyTitle>
                  <EmptyDescription>
                    {t('Select a Worktree to start using AI coding assistant')}
                  </EmptyDescription>
                </EmptyHeader>
                {onExpandWorktree && worktreeCollapsed && (
                  <Button onClick={onExpandWorktree} variant="outline" className="mt-2">
                    <GitBranch className="mr-2 h-4 w-4" />
                    {t('Choose Worktree')}
                  </Button>
                )}
              </Empty>
            </div>
          )}
        </div>
        {/* Terminal tab - keep mounted to preserve shell sessions */}
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'terminal' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <TerminalPanel
            repoPath={effectiveRepoPath ?? undefined}
            cwd={effectiveWorktreePath ?? undefined}
            isActive={activeTab === 'terminal' && hasActiveWorktree}
          />
        </div>
        {/* File tab - keep mounted to preserve editor state */}
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'file' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <FilePanel
            rootPath={worktreePath}
            isActive={activeTab === 'file'}
            sessionId={activeSessionId}
          />
        </div>
        {/* Source Control tab - keep mounted to preserve selection state */}
        <div
          className={cn(
            'absolute inset-0',
            innerBg,
            activeTab === 'source-control' ? 'z-10' : 'invisible pointer-events-none z-0'
          )}
        >
          <SourceControlPanel
            rootPath={worktreePath}
            isActive={activeTab === 'source-control'}
            onExpandWorktree={onExpandWorktree}
            worktreeCollapsed={worktreeCollapsed}
            sessionId={activeSessionId}
          />
        </div>
        {/* Settings tab */}
        {settingsDisplayMode === 'tab' && (
          <div
            className={cn(
              'absolute inset-0',
              innerBg,
              activeTab === 'settings' ? 'z-10' : 'invisible pointer-events-none z-0'
            )}
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h1 className="text-lg font-medium">{t('Settings')}</h1>
                <button
                  type="button"
                  onClick={() => setSettingsDisplayMode('draggable-modal')}
                  className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                  title={t('Switch to floating mode')}
                >
                  <RectangleEllipsis className="h-3.5 w-3.5" />
                  {t('Switch to floating mode')}
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <SettingsContent
                  activeCategory={settingsCategory}
                  onCategoryChange={onCategoryChange}
                  scrollToProvider={scrollToProvider}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Diff Review Modal */}
      <DiffReviewModal
        open={isReviewModalOpen}
        onOpenChange={setIsReviewModalOpen}
        rootPath={worktreePath}
        sessionId={activeSessionId}
        onSend={() => onTabChange('chat')}
      />
    </main>
  );
}
