import type { GitBranch as GitBranchType, GitWorktree, WorktreeCreateOptions } from '@shared/types';
import { LayoutGroup, motion } from 'framer-motion';
import {
  Copy,
  FolderOpen,
  GitBranch,
  GitMerge,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitSyncButton } from '@/components/git/GitSyncButton';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { GlowBorder, type GlowState, useGlowEffectEnabled } from '@/components/ui/glow-card';
import { toastManager } from '@/components/ui/toast';
import { CreateWorktreeDialog } from '@/components/worktree/CreateWorktreeDialog';
import { useGitSync } from '@/hooks/useGitSync';
import { useWorktreeOutputState } from '@/hooks/useOutputState';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

interface WorktreePanelProps {
  worktrees: GitWorktree[];
  activeWorktree: GitWorktree | null;
  branches: GitBranchType[];
  projectName: string;
  isLoading?: boolean;
  isCreating?: boolean;
  error?: string | null;
  onSelectWorktree: (worktree: GitWorktree) => void;
  onCreateWorktree: (options: WorktreeCreateOptions) => Promise<void>;
  onRemoveWorktree: (
    worktree: GitWorktree,
    options?: { deleteBranch?: boolean; force?: boolean }
  ) => void;
  onMergeWorktree?: (worktree: GitWorktree) => void;
  onReorderWorktrees?: (fromIndex: number, toIndex: number) => void;
  onRefresh: () => void;
  onInitGit?: () => Promise<void>;
  width?: number;
  collapsed?: boolean;
  onCollapse?: () => void;
  repositoryCollapsed?: boolean;
  onExpandRepository?: () => void;
}

export function WorktreePanel({
  worktrees,
  activeWorktree,
  branches,
  projectName,
  isLoading,
  isCreating,
  error,
  onSelectWorktree,
  onCreateWorktree,
  onRemoveWorktree,
  onMergeWorktree,
  onReorderWorktrees,
  onRefresh,
  onInitGit,
  width: _width = 280,
  collapsed: _collapsed = false,
  onCollapse,
  repositoryCollapsed = false,
  onExpandRepository,
}: WorktreePanelProps) {
  const { t, tNode } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [worktreeToDelete, setWorktreeToDelete] = useState<GitWorktree | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);

  // Drag reorder
  const draggedIndexRef = useRef<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number, worktree: GitWorktree) => {
      draggedIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));

      // Create styled drag image
      const dragImage = document.createElement('div');
      dragImage.textContent = worktree.branch || worktree.path.split(/[\\/]/).pop() || '';
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
      e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedIndexRef.current = null;
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndexRef.current !== null && draggedIndexRef.current !== index) {
      setDropTargetIndex(index);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderWorktrees) {
        onReorderWorktrees(fromIndex, toIndex);
      }
      setDropTargetIndex(null);
    },
    [onReorderWorktrees]
  );

  // Keep track of original indices for drag reorder when filtering
  const filteredWorktreesWithIndex = worktrees
    .map((wt, index) => ({ worktree: wt, originalIndex: index }))
    .filter(
      ({ worktree: wt }) =>
        wt.branch?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wt.path.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Get the main worktree path for git operations
  const mainWorktree = worktrees.find((wt) => wt.isMainWorktree);
  const workdir = mainWorktree?.path || '';

  const fetchDiffStats = useWorktreeActivityStore((s) => s.fetchDiffStats);
  const activities = useWorktreeActivityStore((s) => s.activities);
  const shouldPoll = useShouldPoll();

  useEffect(() => {
    if (worktrees.length === 0 || !shouldPoll) return;
    const activePaths = worktrees
      .filter((wt) => {
        const activity = activities[wt.path];
        return activity && (activity.agentCount > 0 || activity.terminalCount > 0);
      })
      .map((wt) => wt.path);

    if (activePaths.length === 0) return;

    fetchDiffStats(activePaths);
    const interval = setInterval(() => {
      fetchDiffStats(activePaths);
    }, 10000);
    return () => clearInterval(interval);
  }, [worktrees, activities, fetchDiffStats, shouldPoll]);

  return (
    <aside className="flex h-full w-full flex-col border-r bg-background">
      {/* Header with buttons */}
      <div
        className={cn(
          'flex h-12 items-center justify-end gap-1 border-b px-3 drag-region',
          repositoryCollapsed && 'pl-[70px]'
        )}
      >
        {/* Expand repository button when collapsed */}
        {repositoryCollapsed && onExpandRepository && (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={onExpandRepository}
            title={t('Expand Repository')}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        )}
        {/* Refresh button */}
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          onClick={onRefresh}
          title={t('Refresh')}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        {/* Collapse button */}
        {onCollapse && (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={onCollapse}
            title={t('Collapse')}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="px-3 py-2">
        <div className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('Search worktrees')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {/* Worktree List */}
      <div className="flex-1 overflow-auto p-2">
        {error ? (
          <Empty className="h-full border-0">
            <EmptyMedia variant="icon">
              <GitBranch className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base">{t('Not a Git repository')}</EmptyTitle>
              <EmptyDescription>
                {t('This directory is not a Git repository. Initialize it to enable Git features.')}
              </EmptyDescription>
            </EmptyHeader>
            <div className="mt-2 flex gap-2">
              <Button onClick={onRefresh} variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('Refresh')}
              </Button>
              {onInitGit && (
                <Button onClick={onInitGit} size="sm">
                  <GitBranch className="mr-2 h-4 w-4" />
                  {t('Initialize repository')}
                </Button>
              )}
            </div>
          </Empty>
        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <WorktreeItemSkeleton key={`skeleton-${i}`} />
            ))}
          </div>
        ) : filteredWorktreesWithIndex.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyMedia variant="icon">
              <GitBranch className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base">
                {searchQuery ? t('No matching worktrees') : t('No worktrees')}
              </EmptyTitle>
              <EmptyDescription>
                {searchQuery
                  ? t('Try a different search term')
                  : t('Create your first worktree to get started')}
              </EmptyDescription>
            </EmptyHeader>
            {!searchQuery && (
              <CreateWorktreeDialog
                branches={branches}
                projectName={projectName}
                workdir={workdir}
                isLoading={isCreating}
                onSubmit={onCreateWorktree}
                trigger={
                  <Button variant="outline" className="mt-2">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('Create Worktree')}
                  </Button>
                }
              />
            )}
          </Empty>
        ) : (
          <LayoutGroup>
            <div className="space-y-1">
              {filteredWorktreesWithIndex.map(({ worktree, originalIndex }) => (
                <WorktreeItem
                  key={worktree.path}
                  worktree={worktree}
                  branches={branches}
                  isActive={activeWorktree?.path === worktree.path}
                  onClick={() => onSelectWorktree(worktree)}
                  onDelete={() => setWorktreeToDelete(worktree)}
                  onMerge={onMergeWorktree ? () => onMergeWorktree(worktree) : undefined}
                  draggable={!searchQuery && !!onReorderWorktrees}
                  onDragStart={(e) => handleDragStart(e, originalIndex, worktree)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, originalIndex)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, originalIndex)}
                  showDropIndicator={dropTargetIndex === originalIndex}
                  dropDirection={
                    dropTargetIndex === originalIndex && draggedIndexRef.current !== null
                      ? draggedIndexRef.current > originalIndex
                        ? 'top'
                        : 'bottom'
                      : null
                  }
                />
              ))}
            </div>
          </LayoutGroup>
        )}
      </div>

      {/* Footer - Create Worktree Button */}
      <div className="shrink-0 border-t p-2">
        <CreateWorktreeDialog
          branches={branches}
          projectName={projectName}
          workdir={workdir}
          isLoading={isCreating}
          onSubmit={onCreateWorktree}
          trigger={
            <button
              type="button"
              className="flex h-8 w-full items-center justify-start gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('New Worktree')}
            </button>
          }
        />
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!worktreeToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setWorktreeToDelete(null);
            setDeleteBranch(false);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Worktree')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tNode('Are you sure you want to delete worktree {{name}}?', {
                name: <strong>{worktreeToDelete?.branch}</strong>,
              })}
              {worktreeToDelete?.prunable ? (
                <span className="block mt-2 text-muted-foreground">
                  {t('This directory has already been removed; Git records will be cleaned up.')}
                </span>
              ) : (
                <span className="block mt-2 text-destructive">
                  {t(
                    'This will delete the directory and all files inside. This action cannot be undone!'
                  )}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            {worktreeToDelete?.branch && !worktreeToDelete?.isMainWorktree && (
              <label className="flex items-center gap-2 px-6 py-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteBranch}
                  onChange={(e) => setDeleteBranch(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span>
                  {tNode('Also delete branch {{name}}', {
                    name: <strong>{worktreeToDelete.branch}</strong>,
                  })}
                </span>
              </label>
            )}
            {!worktreeToDelete?.prunable && (
              <label className="flex items-center gap-2 px-6 py-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceDelete}
                  onChange={(e) => setForceDelete(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-muted-foreground">
                  {t('Force delete (ignore uncommitted changes)')}
                </span>
              </label>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button
              variant="destructive"
              onClick={() => {
                if (worktreeToDelete) {
                  onRemoveWorktree(worktreeToDelete, { deleteBranch, force: forceDelete });
                  setWorktreeToDelete(null);
                  setDeleteBranch(false);
                  setForceDelete(false);
                }
              }}
            >
              {t('Delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </aside>
  );
}

interface WorktreeItemProps {
  worktree: GitWorktree;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onMerge?: () => void;
  // Drag reorder props
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  showDropIndicator?: boolean;
  dropDirection?: 'top' | 'bottom' | null;
  branches?: GitBranchType[];
}

function WorktreeItem({
  worktree,
  isActive,
  onClick,
  onDelete,
  onMerge,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  showDropIndicator,
  dropDirection,
  branches = [],
}: WorktreeItemProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const isMain =
    worktree.isMainWorktree || worktree.branch === 'main' || worktree.branch === 'master';
  const branchDisplay = worktree.branch || t('Detached');
  const isPrunable = worktree.prunable;
  const glowEnabled = useGlowEffectEnabled();

  // Git sync operations
  const { ahead, behind, tracking, currentBranch, isSyncing, handleSync, handlePublish } =
    useGitSync({ workdir: worktree.path, enabled: isActive });

  // Check if branch is merged to main
  const isMerged = useMemo(() => {
    if (!worktree.branch || isMain) return false;
    const branch = branches.find((b) => b.name === worktree.branch);
    return branch?.merged === true;
  }, [worktree.branch, isMain, branches]);

  // Subscribe to activity store
  const activities = useWorktreeActivityStore((s) => s.activities);
  const diffStatsMap = useWorktreeActivityStore((s) => s.diffStats);
  const activity = activities[worktree.path] || { agentCount: 0, terminalCount: 0 };
  const diffStats = diffStatsMap[worktree.path] || { insertions: 0, deletions: 0 };
  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const hasDiffStats = diffStats.insertions > 0 || diffStats.deletions > 0;

  // Check if any session in this worktree has outputting or unread state
  const outputState = useWorktreeOutputState(worktree.path);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(worktree.path);
      toastManager.add({
        title: t('Copied'),
        description: t('Path copied to clipboard'),
        type: 'success',
        timeout: 2000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastManager.add({
        title: t('Copy failed'),
        description: message || t('Failed to copy content'),
        type: 'error',
        timeout: 3000,
      });
    }
  }, [t, worktree.path]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    // Will adjust position after menu renders
    setMenuPosition({ x, y });
    setMenuOpen(true);
  };

  // Adjust menu position if it overflows viewport
  useEffect(() => {
    if (menuOpen && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let { x, y } = menuPosition;

      // Adjust if menu overflows bottom
      if (y + rect.height > viewportHeight - 8) {
        y = Math.max(8, viewportHeight - rect.height - 8);
      }

      // Adjust if menu overflows right
      if (x + rect.width > viewportWidth - 8) {
        x = Math.max(8, viewportWidth - rect.width - 8);
      }

      if (x !== menuPosition.x || y !== menuPosition.y) {
        setMenuPosition({ x, y });
      }
    }
  }, [menuOpen, menuPosition]);

  // Common worktree item content
  const worktreeItemContent = (
    <>
      {/* Drop indicator - top */}
      {showDropIndicator && dropDirection === 'top' && (
        <div className="absolute -top-0.5 left-2 right-2 h-0.5 bg-primary rounded-full" />
      )}
      <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'relative flex w-full flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors cursor-pointer',
          isPrunable && 'opacity-50',
          isActive ? 'text-accent-foreground' : 'hover:bg-accent/50'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="worktree-panel-highlight"
            className="absolute inset-0 rounded-lg bg-accent"
            transition={springFast}
          />
        )}
        {/* Branch name */}
        <div className="relative z-10 flex w-full items-center gap-2">
          <GitBranch
            className={cn(
              'h-4 w-4 shrink-0',
              isPrunable
                ? 'text-destructive'
                : isActive
                  ? 'text-accent-foreground'
                  : 'text-muted-foreground'
            )}
          />
          <span className={cn('truncate font-medium', isPrunable && 'line-through')}>
            {branchDisplay}
          </span>
          {isPrunable ? (
            <span className="shrink-0 rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
              {t('Deleted')}
            </span>
          ) : isMain ? (
            <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-600 dark:text-emerald-400">
              {t('Main')}
            </span>
          ) : isMerged ? (
            <span className="shrink-0 rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-success-foreground">
              {t('Merged')}
            </span>
          ) : null}
          {/* Git sync status - inline with branch name */}
          <GitSyncButton
            ahead={ahead}
            behind={behind}
            tracking={tracking}
            currentBranch={currentBranch}
            isSyncing={isSyncing}
            onSync={handleSync}
            onPublish={handlePublish}
          />
        </div>

        {/* Path - use rtl direction to show ellipsis at start, keeping end visible */}
        <div
          className={cn(
            'relative z-10 w-full overflow-hidden whitespace-nowrap text-ellipsis pl-6 text-xs [direction:rtl] [text-align:left] [unicode-bidi:plaintext]',
            isPrunable && 'line-through',
            isActive ? 'text-accent-foreground/70' : 'text-muted-foreground'
          )}
          title={worktree.path}
        >
          {worktree.path}
        </div>

        {/* Activity counts and diff stats (only shown when has active sessions) */}
        {hasActivity && (
          <div className="relative z-10 flex items-center gap-3 pl-6 text-xs text-muted-foreground">
            {activity.agentCount > 0 && (
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {activity.agentCount}
              </span>
            )}
            {activity.terminalCount > 0 && (
              <span className="flex items-center gap-1">
                <Terminal className="h-3 w-3" />
                {activity.terminalCount}
              </span>
            )}
            {hasDiffStats && (
              <span className="flex items-center gap-1.5">
                {diffStats.insertions > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{diffStats.insertions}
                  </span>
                )}
                {diffStats.deletions > 0 && (
                  <span className="text-red-600 dark:text-red-400">-{diffStats.deletions}</span>
                )}
              </span>
            )}
          </div>
        )}
      </button>
      {/* Drop indicator - bottom */}
      {showDropIndicator && dropDirection === 'bottom' && (
        <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-primary rounded-full" />
      )}
    </>
  );

  return (
    <>
      {glowEnabled ? (
        <GlowBorder state={outputState as GlowState} className="rounded-lg">
          {worktreeItemContent}
        </GlowBorder>
      ) : (
        <div className="relative rounded-lg">{worktreeItemContent}</div>
      )}

      {/* Context Menu */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setMenuOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuOpen(false);
            }}
            role="presentation"
          />
          <div
            ref={menuRef}
            className="fixed z-50 min-w-40 rounded-lg border bg-popover p-1 shadow-lg"
            style={{ left: menuPosition.x, top: menuPosition.y }}
          >
            {/* Close All Sessions */}
            {activity.agentCount > 0 && activity.terminalCount > 0 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
                onClick={() => {
                  setMenuOpen(false);
                  closeAgentSessions(worktree.path);
                  closeTerminalSessions(worktree.path);
                }}
              >
                <X className="h-4 w-4" />
                {t('Close All Sessions')}
              </button>
            )}

            {/* Close Agent Sessions */}
            {activity.agentCount > 0 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
                onClick={() => {
                  setMenuOpen(false);
                  closeAgentSessions(worktree.path);
                }}
              >
                <X className="h-4 w-4" />
                <Sparkles className="h-4 w-4" />
                {t('Close Agent Sessions')}
              </button>
            )}

            {/* Close Terminal Sessions */}
            {activity.terminalCount > 0 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
                onClick={() => {
                  setMenuOpen(false);
                  closeTerminalSessions(worktree.path);
                }}
              >
                <X className="h-4 w-4" />
                <Terminal className="h-4 w-4" />
                {t('Close Terminal Sessions')}
              </button>
            )}

            {/* Separator if there are activity options */}
            {hasActivity && <div className="my-1 h-px bg-border" />}

            {/* Open Folder */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
              onClick={() => {
                setMenuOpen(false);
                window.electronAPI.shell.openPath(worktree.path);
              }}
            >
              <FolderOpen className="h-4 w-4" />
              {t('Open folder')}
            </button>

            {/* Copy Path */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
              onClick={() => {
                setMenuOpen(false);
                handleCopyPath();
              }}
            >
              <Copy className="h-4 w-4" />
              {t('Copy Path')}
            </button>

            {/* Merge to Branch */}
            {onMerge && !isMain && !isPrunable && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
                onClick={() => {
                  setMenuOpen(false);
                  onMerge();
                }}
              >
                <GitMerge className="h-4 w-4" />
                {t('Merge to Branch...')}
              </button>
            )}

            {/* Separator before delete */}
            <div className="my-1 h-px bg-border" />

            {/* Delete Worktree */}
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent/50',
                isMain && 'pointer-events-none opacity-50'
              )}
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              disabled={isMain}
            >
              <Trash2 className="h-4 w-4" />
              {isPrunable ? t('Clean up records') : t('Delete')}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function WorktreeItemSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-2 h-3 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
    </div>
  );
}
