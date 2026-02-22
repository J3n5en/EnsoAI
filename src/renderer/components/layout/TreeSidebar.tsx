import type {
  GitBranch as GitBranchType,
  GitWorktree,
  TempWorkspaceItem,
  WorktreeCreateOptions,
} from '@shared/types';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  ChevronRight,
  Clock,
  Copy,
  EyeOff,
  FolderGit2,
  FolderMinus,
  FolderOpen,
  GitBranch,
  GitMerge,
  List,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_GROUP_ID,
  type Repository,
  type RepositoryGroup,
  type TabId,
  TEMP_REPO_ID,
  UNGROUPED_SECTION_ID,
} from '@/App/constants';
import {
  DEFAULT_REPOSITORY_SETTINGS,
  getRepositorySettings,
  getStoredGroupCollapsedState,
  getStoredRepositorySettings,
  normalizePath,
  type RepositorySettings,
  saveGroupCollapsedState,
  saveRepositorySettings,
} from '@/App/storage';
import { GitSyncButton } from '@/components/git/GitSyncButton';
import {
  CreateGroupDialog,
  GroupEditDialog,
  GroupSelector,
  MoveToGroupSubmenu,
} from '@/components/group';
import { RepositoryManagerDialog } from '@/components/repository/RepositoryManagerDialog';
import { RepositorySettingsDialog } from '@/components/repository/RepositorySettingsDialog';
import { TempWorkspaceContextMenu } from '@/components/temp-workspace/TempWorkspaceContextMenu';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
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
import { RepoItemWithGlow } from '@/components/ui/glow-wrappers';
import { toastManager } from '@/components/ui/toast';
import { CreateWorktreeDialog } from '@/components/worktree/CreateWorktreeDialog';
import { useGitSync } from '@/hooks/useGitSync';
import { useWorktreeOutputState } from '@/hooks/useOutputState';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useWorktreeListMultiple } from '@/hooks/useWorktree';
import { useI18n } from '@/i18n';
import { heightVariants, springFast, springStandard } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { RunningProjectsPopover } from './RunningProjectsPopover';

interface TreeSidebarProps {
  repositories: Repository[];
  selectedRepo: string | null;
  activeWorktree: GitWorktree | null;
  worktrees: GitWorktree[];
  branches: GitBranchType[];
  isLoading?: boolean;
  isCreating?: boolean;
  error?: string | null;
  onSelectRepo: (repoPath: string) => void;
  onSelectWorktree: (worktree: GitWorktree) => void;
  onAddRepository: () => void;
  onRemoveRepository?: (repoPath: string) => void;
  onCreateWorktree: (options: WorktreeCreateOptions) => Promise<void>;
  onRemoveWorktree: (
    worktree: GitWorktree,
    options?: { deleteBranch?: boolean; force?: boolean }
  ) => void;
  onMergeWorktree?: (worktree: GitWorktree) => void;
  onReorderRepositories?: (fromIndex: number, toIndex: number) => void;
  onReorderWorktrees?: (fromIndex: number, toIndex: number) => void;
  onRefresh: () => void;
  onInitGit?: () => Promise<void>;
  onOpenSettings?: () => void;
  isSettingsActive?: boolean;
  onToggleSettings?: () => void;
  collapsed?: boolean;
  onCollapse?: () => void;
  groups: RepositoryGroup[];
  activeGroupId: string;
  onSwitchGroup: (groupId: string) => void;
  onCreateGroup: (name: string, emoji: string, color: string) => RepositoryGroup;
  onUpdateGroup: (groupId: string, name: string, emoji: string, color: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onMoveToGroup?: (repoPath: string, groupId: string | null) => void;
  onSwitchTab?: (tab: TabId) => void;
  onSwitchWorktreeByPath?: (path: string) => Promise<void> | void;
  temporaryWorkspaceEnabled?: boolean;
  tempWorkspaces?: TempWorkspaceItem[];
  tempBasePath?: string;
  onSelectTempWorkspace?: (path: string) => void;
  onCreateTempWorkspace?: () => void;
  onRequestTempRename?: (id: string) => void;
  onRequestTempDelete?: (id: string) => void;
  /** Ref callback to expose toggleSelectedRepoExpanded function */
  toggleSelectedRepoExpandedRef?: React.MutableRefObject<(() => void) | null>;
  /** Whether a file is being dragged over the sidebar (from App.tsx global handler) */
  isFileDragOver?: boolean;
}

export function TreeSidebar({
  repositories,
  selectedRepo,
  activeWorktree,
  worktrees: _worktrees,
  branches,
  isLoading: _isLoading,
  isCreating,
  error: _error,
  onSelectRepo,
  onSelectWorktree,
  onAddRepository,
  onRemoveRepository,
  onCreateWorktree,
  onRemoveWorktree,
  onMergeWorktree,
  onReorderRepositories,
  onReorderWorktrees,
  onRefresh,
  onInitGit,
  onOpenSettings: _onOpenSettings,
  isSettingsActive: _isSettingsActive,
  onToggleSettings: _onToggleSettings,
  collapsed: _collapsed = false,
  onCollapse,
  groups,
  activeGroupId,
  onSwitchGroup,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onMoveToGroup,
  onSwitchTab,
  onSwitchWorktreeByPath,
  temporaryWorkspaceEnabled = false,
  tempWorkspaces = [],
  tempBasePath = '',
  onSelectTempWorkspace,
  onCreateTempWorkspace,
  onRequestTempRename,
  onRequestTempDelete,
  toggleSelectedRepoExpandedRef,
  isFileDragOver,
}: TreeSidebarProps) {
  const { t, tNode } = useI18n();
  const _settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const hideGroups = useSettingsStore((s) => s.hideGroups);
  const [searchQuery, setSearchQuery] = useState('');
  const [tempExpanded, setTempExpanded] = useState(true);
  const [expandedRepoList, setExpandedRepoList] = useState<string[]>([]);

  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [editGroupDialogOpen, setEditGroupDialogOpen] = useState(false);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    getStoredGroupCollapsedState()
  );

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      saveGroupCollapsedState(next);
      return next;
    });
  }, []);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const repositoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.id] = repositories.filter((r) => r.groupId === group.id).length;
    }
    return counts;
  }, [groups, repositories]);
  const sortedTempWorkspaces = useMemo(
    () => [...tempWorkspaces].sort((a, b) => b.createdAt - a.createdAt),
    [tempWorkspaces]
  );

  // Convert list to set for fast lookups
  const expandedRepos = useMemo(() => new Set(expandedRepoList), [expandedRepoList]);

  // Fetch worktrees for expanded repos only
  const {
    worktreesMap,
    errorsMap,
    loadingMap,
    refetchAll: refetchExpandedWorktrees,
  } = useWorktreeListMultiple(expandedRepoList);

  // Repository context menu
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const [repoMenuPosition, setRepoMenuPosition] = useState({ x: 0, y: 0 });
  const [repoMenuTarget, setRepoMenuTarget] = useState<Repository | null>(null);
  const [repoToRemove, setRepoToRemove] = useState<Repository | null>(null);

  // Repository settings dialog
  const [repoSettingsOpen, setRepoSettingsOpen] = useState(false);
  const [repoSettingsTarget, setRepoSettingsTarget] = useState<Repository | null>(null);

  // Repository manager dialog
  const [repoManagerOpen, setRepoManagerOpen] = useState(false);

  // Cached repository settings to avoid repeated localStorage reads
  const [repoSettingsMap, setRepoSettingsMap] = useState<Record<string, RepositorySettings>>(
    getStoredRepositorySettings
  );
  const refreshRepoSettings = useCallback(() => {
    setRepoSettingsMap(getStoredRepositorySettings());
  }, []);
  useEffect(() => {
    refreshRepoSettings();
  }, [refreshRepoSettings]);

  // Create worktree dialog (triggered from context menu)
  const [createWorktreeDialogOpen, setCreateWorktreeDialogOpen] = useState(false);
  const [pendingCreateWorktree, setPendingCreateWorktree] = useState(false);
  const [waitingForBranchRefresh, setWaitingForBranchRefresh] = useState(false);

  // Wait for repo switch before triggering branch refresh
  useEffect(() => {
    if (pendingCreateWorktree && selectedRepo === repoMenuTarget?.path) {
      setPendingCreateWorktree(false);
      // Trigger refresh to get branches and worktree list for the new repo
      onRefresh();
      refetchExpandedWorktrees();
      setWaitingForBranchRefresh(true);
    }
  }, [selectedRepo, pendingCreateWorktree, repoMenuTarget, onRefresh, refetchExpandedWorktrees]);

  // Wait for branches to update before opening dialog
  useEffect(() => {
    if (waitingForBranchRefresh && branches.length >= 0) {
      // Small delay to ensure branches state is fully updated
      const timer = setTimeout(() => {
        setCreateWorktreeDialogOpen(true);
        setWaitingForBranchRefresh(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [branches, waitingForBranchRefresh]);

  // Worktree delete dialog
  const [worktreeToDelete, setWorktreeToDelete] = useState<GitWorktree | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);

  // Drag reorder for repos
  const draggedRepoIndexRef = useRef<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const dragGroupRef = useRef<string | null>(null);
  const [dropRepoTargetIndex, setDropRepoTargetIndex] = useState<number | null>(null);

  // Drag reorder for worktrees
  const draggedWorktreeIndexRef = useRef<number | null>(null);
  const [dropWorktreeTargetIndex, setDropWorktreeTargetIndex] = useState<number | null>(null);

  // Get the main worktree path for git operations (from selected repo's worktrees)
  const selectedRepoWorktrees = selectedRepo ? worktreesMap[selectedRepo] || [] : [];
  const mainWorktree = selectedRepoWorktrees.find((wt) => wt.isMainWorktree);
  const workdir = mainWorktree?.path || selectedRepo || '';

  const fetchDiffStats = useWorktreeActivityStore((s) => s.fetchDiffStats);
  const activities = useWorktreeActivityStore((s) => s.activities);
  const shouldPoll = useShouldPoll();

  useEffect(() => {
    const allWorktrees = Object.values(worktreesMap).flat();
    if (allWorktrees.length === 0 || !shouldPoll) return;

    const activePaths = allWorktrees
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
  }, [worktreesMap, activities, fetchDiffStats, shouldPoll]);

  // Auto-expand selected repo (only when selectedRepo changes externally, not from tree click)
  const prevSelectedRepoRef = useRef<string | null>(null);
  const skipAutoExpandRef = useRef(false);
  useEffect(() => {
    if (selectedRepo && selectedRepo !== prevSelectedRepoRef.current) {
      if (selectedRepo === TEMP_REPO_ID) {
        prevSelectedRepoRef.current = selectedRepo;
        return;
      }
      // Skip auto-expand if user explicitly clicked the tree
      if (!skipAutoExpandRef.current && !expandedRepos.has(selectedRepo)) {
        setExpandedRepoList((prev) => [...prev, selectedRepo]);
      }
      skipAutoExpandRef.current = false;
    }
    prevSelectedRepoRef.current = selectedRepo;
  }, [selectedRepo, expandedRepos]);

  const toggleRepoExpanded = useCallback((repoPath: string) => {
    setExpandedRepoList((prev) => {
      if (prev.includes(repoPath)) {
        return prev.filter((p) => p !== repoPath);
      }
      return [...prev, repoPath];
    });
  }, []);

  // Expose toggle function for selected repo via ref
  useEffect(() => {
    if (toggleSelectedRepoExpandedRef) {
      if (!selectedRepo) {
        toggleSelectedRepoExpandedRef.current = null;
      } else if (selectedRepo === TEMP_REPO_ID) {
        toggleSelectedRepoExpandedRef.current = () => setTempExpanded((prev) => !prev);
      } else {
        toggleSelectedRepoExpandedRef.current = () => toggleRepoExpanded(selectedRepo);
      }
    }
    return () => {
      if (toggleSelectedRepoExpandedRef) {
        toggleSelectedRepoExpandedRef.current = null;
      }
    };
  }, [toggleSelectedRepoExpandedRef, selectedRepo, toggleRepoExpanded]);

  // Repository drag handlers
  const handleRepoDragStart = useCallback((e: React.DragEvent, index: number, repo: Repository) => {
    draggedRepoIndexRef.current = index;
    dragGroupRef.current = repo.groupId ?? UNGROUPED_SECTION_ID;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `repo:${index}`);

    const dragImage = document.createElement('div');
    dragImage.textContent = repo.name;
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
  }, []);

  const handleRepoDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedRepoIndexRef.current = null;
    dragGroupRef.current = null;
    setDropRepoTargetIndex(null);
  }, []);

  const handleRepoDragOver = useCallback(
    (e: React.DragEvent, originalIndex: number, targetGroupId?: string) => {
      const canDropInGroup = !targetGroupId || dragGroupRef.current === targetGroupId;
      if (!canDropInGroup) {
        setDropRepoTargetIndex(null);
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedRepoIndexRef.current !== null && draggedRepoIndexRef.current !== originalIndex) {
        setDropRepoTargetIndex(originalIndex);
      }
    },
    []
  );

  const handleRepoDragLeave = useCallback(() => {
    setDropRepoTargetIndex(null);
  }, []);

  const handleRepoDrop = useCallback(
    (e: React.DragEvent, toIndex: number, targetGroupId?: string) => {
      const canDropInGroup = !targetGroupId || dragGroupRef.current === targetGroupId;
      if (!canDropInGroup) {
        setDropRepoTargetIndex(null);
        return;
      }

      e.preventDefault();
      const fromIndex = draggedRepoIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderRepositories) {
        onReorderRepositories(fromIndex, toIndex);
      }
      setDropRepoTargetIndex(null);
    },
    [onReorderRepositories]
  );

  // Worktree drag handlers
  const handleWorktreeDragStart = useCallback(
    (e: React.DragEvent, index: number, worktree: GitWorktree) => {
      draggedWorktreeIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `worktree:${index}`);

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

  const handleWorktreeDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedWorktreeIndexRef.current = null;
    setDropWorktreeTargetIndex(null);
  }, []);

  const handleWorktreeDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedWorktreeIndexRef.current !== null && draggedWorktreeIndexRef.current !== index) {
      setDropWorktreeTargetIndex(index);
    }
  }, []);

  const handleWorktreeDragLeave = useCallback(() => {
    setDropWorktreeTargetIndex(null);
  }, []);

  const handleWorktreeDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedWorktreeIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderWorktrees) {
        onReorderWorktrees(fromIndex, toIndex);
      }
      setDropWorktreeTargetIndex(null);
    },
    [onReorderWorktrees]
  );

  // Repository context menu
  const handleRepoContextMenu = (e: React.MouseEvent, repo: Repository) => {
    e.preventDefault();
    setRepoMenuPosition({ x: e.clientX, y: e.clientY });
    setRepoMenuTarget(repo);
    setRepoMenuOpen(true);
  };

  const handleRemoveRepoClick = () => {
    if (repoMenuTarget) {
      setRepoToRemove(repoMenuTarget);
    }
    setRepoMenuOpen(false);
  };

  const handleConfirmRemoveRepo = () => {
    if (repoToRemove && onRemoveRepository) {
      onRemoveRepository(repoToRemove.path);
    }
    setRepoToRemove(null);
  };

  const showSections = activeGroupId === ALL_GROUP_ID && !searchQuery && !hideGroups;

  const filteredRepos = useMemo(() => {
    let filtered = repositories;

    // Filter hidden repositories using cached settings
    filtered = filtered.filter((repo) => {
      const settings = repoSettingsMap[normalizePath(repo.path)] || DEFAULT_REPOSITORY_SETTINGS;
      return !settings.hidden;
    });

    if (activeGroupId !== ALL_GROUP_ID) {
      filtered = filtered.filter((r) => r.groupId === activeGroupId);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((repo) => {
        if (repo.name.toLowerCase().includes(query)) return true;
        const repoWorktrees = worktreesMap[repo.path] || [];
        return repoWorktrees.some(
          (wt) => wt.branch?.toLowerCase().includes(query) || wt.path.toLowerCase().includes(query)
        );
      });
    }

    return filtered.map((repo) => ({
      repo,
      originalIndex: repositories.indexOf(repo),
    }));
  }, [repositories, worktreesMap, searchQuery, activeGroupId, repoSettingsMap]);

  const groupedSections = useMemo(() => {
    if (!showSections) return [];

    // Use the same hidden filter as filteredRepos
    const visibleRepos = repositories.filter((repo) => {
      const settings = repoSettingsMap[normalizePath(repo.path)] || DEFAULT_REPOSITORY_SETTINGS;
      return !settings.hidden;
    });

    const sections: Array<{
      groupId: string;
      name: string;
      emoji: string;
      color: string;
      repos: Array<{ repo: Repository; originalIndex: number }>;
    }> = [];

    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
    for (const group of sortedGroups) {
      const groupRepos = visibleRepos
        .filter((r) => r.groupId === group.id)
        .map((repo) => ({ repo, originalIndex: repositories.indexOf(repo) }));
      if (groupRepos.length > 0) {
        sections.push({
          groupId: group.id,
          name: group.name,
          emoji: group.emoji,
          color: group.color,
          repos: groupRepos,
        });
      }
    }

    const ungroupedRepos = visibleRepos
      .filter((r) => !r.groupId)
      .map((repo) => ({ repo, originalIndex: repositories.indexOf(repo) }));
    if (ungroupedRepos.length > 0) {
      sections.push({
        groupId: UNGROUPED_SECTION_ID,
        name: t('Ungrouped'),
        emoji: '',
        color: '',
        repos: ungroupedRepos,
      });
    }

    return sections;
  }, [showSections, groups, repositories, repoSettingsMap, t]);

  // Filter worktrees for a specific repo
  const getFilteredWorktrees = useCallback(
    (repoPath: string) => {
      const repoWorktrees = worktreesMap[repoPath] || [];
      if (!searchQuery) return repoWorktrees;
      const query = searchQuery.toLowerCase();
      return repoWorktrees.filter(
        (wt) => wt.branch?.toLowerCase().includes(query) || wt.path.toLowerCase().includes(query)
      );
    },
    [worktreesMap, searchQuery]
  );

  const renderRepoItem = (repo: Repository, originalIndex: number, sectionGroupId?: string) => {
    const isSelected = selectedRepo === repo.path;
    const isExpanded = expandedRepos.has(repo.path);
    const repoWorktrees = getFilteredWorktrees(repo.path);
    const repoError = errorsMap[repo.path];
    const repoLoading = loadingMap[repo.path] ?? (isExpanded && !worktreesMap[repo.path]);
    const repoWts = worktreesMap[repo.path] || [];
    const repoMainWorktree = repoWts.find((wt) => wt.isMainWorktree);
    const workdir = repoMainWorktree?.path || repo.path;

    return (
      <div key={repo.path} className={cn('relative rounded-lg', isSelected && 'pb-2')}>
        {/* Sliding highlight background for selected repo */}
        {isSelected && (
          <motion.div
            layoutId="repo-container-highlight"
            className="absolute inset-0 rounded-lg bg-accent/40"
            transition={springFast}
          />
        )}
        {/* Repository row */}
        <div>
          {/* Drop indicator - top */}
          {dropRepoTargetIndex === originalIndex &&
            draggedRepoIndexRef.current !== null &&
            draggedRepoIndexRef.current > originalIndex && (
              <div className="absolute -top-0.5 left-2 right-2 h-0.5 bg-primary rounded-full" />
            )}
          <div
            role="button"
            tabIndex={0}
            draggable={!searchQuery && !!onReorderRepositories}
            onDragStart={(e) => handleRepoDragStart(e, originalIndex, repo)}
            onDragEnd={handleRepoDragEnd}
            onDragOver={(e) => handleRepoDragOver(e, originalIndex, sectionGroupId)}
            onDragLeave={handleRepoDragLeave}
            onDrop={(e) => handleRepoDrop(e, originalIndex, sectionGroupId)}
            onContextMenu={(e) => handleRepoContextMenu(e, repo)}
            onClick={() => {
              toggleRepoExpanded(repo.path);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleRepoExpanded(repo.path);
              }
            }}
            className={cn(
              'group relative flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left transition-colors cursor-pointer',
              !isSelected && 'hover:bg-accent/30',
              draggedRepoIndexRef.current === originalIndex && 'opacity-50'
            )}
          >
            {/* Row 1: Chevron + Icon + Name + CreateWorktree + Settings */}
            <div className="relative z-10 flex w-full items-center gap-1">
              <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                    isExpanded && 'rotate-90'
                  )}
                />
              </span>
              <FolderGit2
                className={cn(
                  'h-4 w-4 shrink-0',
                  isSelected ? 'text-accent-foreground' : 'text-muted-foreground'
                )}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-sm text-left">
                {repo.name}
              </span>

              {/* Create Worktree Button */}
              {isSelected ? (
                <CreateWorktreeDialog
                  branches={branches}
                  projectName={repo.name}
                  workdir={workdir}
                  isLoading={isCreating}
                  onSubmit={async (options) => {
                    await onCreateWorktree(options);
                    refetchExpandedWorktrees();
                  }}
                  trigger={
                    <button
                      type="button"
                      className="shrink-0 p-1 rounded hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                      }}
                      title={t('New Worktree')}
                    >
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  }
                />
              ) : (
                <button
                  type="button"
                  className="shrink-0 p-1 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.currentTarget.blur();
                    setRepoMenuTarget(repo);
                    onSelectRepo(repo.path);
                    setPendingCreateWorktree(true);
                  }}
                  title={t('New Worktree')}
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}

              {/* Repository Settings Button */}
              <button
                type="button"
                className="shrink-0 p-1 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  setRepoSettingsTarget(repo);
                  setRepoSettingsOpen(true);
                }}
                title={t('Repository Settings')}
              >
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* Row 3: Path */}
            <span
              className="relative z-10 pl-6 overflow-hidden whitespace-nowrap text-ellipsis text-xs text-muted-foreground [direction:rtl] [text-align:left]"
              title={repo.path}
            >
              {repo.path}
            </span>
          </div>
          {/* Drop indicator - bottom */}
          {dropRepoTargetIndex === originalIndex &&
            draggedRepoIndexRef.current !== null &&
            draggedRepoIndexRef.current < originalIndex && (
              <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-primary rounded-full" />
            )}
        </div>

        {/* Worktrees under this repo */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="ml-2 mr-2 mt-1 space-y-0.5 overflow-hidden"
            >
              {repoError ? (
                <div className="py-2 px-2 text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                  <span className="text-destructive">{t('Not a Git repository')}</span>
                  {onInitGit && isSelected && (
                    <Button
                      onClick={async () => {
                        await onInitGit();
                        refetchExpandedWorktrees();
                      }}
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs w-fit"
                    >
                      <GitBranch className="mr-1 h-3 w-3" />
                      {t('Init')}
                    </Button>
                  )}
                </div>
              ) : repoLoading ? (
                <div className="space-y-1">
                  {[0, 1].map((i) => (
                    <div key={`skeleton-${i}`} className="h-8 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : repoWorktrees.length === 0 ? (
                <div className="py-2 px-2 text-xs text-muted-foreground">
                  {searchQuery
                    ? t('No matching worktrees')
                    : t('No worktrees. Create one to get started.')}
                </div>
              ) : (
                repoWorktrees.map((worktree, wtIndex) => (
                  <WorktreeTreeItem
                    key={worktree.path}
                    worktree={worktree}
                    repoPath={repo.path}
                    branches={branches}
                    isActive={activeWorktree?.path === worktree.path}
                    onClick={() => {
                      if (!isSelected) {
                        onSelectRepo(repo.path);
                      }
                      onSelectWorktree(worktree);
                    }}
                    onDelete={() => setWorktreeToDelete(worktree)}
                    onMerge={onMergeWorktree ? () => onMergeWorktree(worktree) : undefined}
                    draggable={!searchQuery && !!onReorderWorktrees && isSelected}
                    onDragStart={(e) => handleWorktreeDragStart(e, wtIndex, worktree)}
                    onDragEnd={handleWorktreeDragEnd}
                    onDragOver={(e) => handleWorktreeDragOver(e, wtIndex)}
                    onDragLeave={handleWorktreeDragLeave}
                    onDrop={(e) => handleWorktreeDrop(e, wtIndex)}
                    showDropIndicator={dropWorktreeTargetIndex === wtIndex}
                    dropDirection={
                      dropWorktreeTargetIndex === wtIndex &&
                      draggedWorktreeIndexRef.current !== null
                        ? draggedWorktreeIndexRef.current > wtIndex
                          ? 'top'
                          : 'bottom'
                        : null
                    }
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'flex h-full w-full flex-col border-r bg-background transition-colors',
        isFileDragOver && 'bg-primary/10'
      )}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-end gap-1 border-b px-3 drag-region">
        <div className="flex items-center gap-1">
          {/* Manage repositories button */}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={() => setRepoManagerOpen(true)}
            title={t('Manage Repositories')}
          >
            <List className="h-4 w-4" />
          </button>
          {/* Refresh button */}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={() => {
              onRefresh();
              refetchExpandedWorktrees();
            }}
            title={t('Refresh')}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <RunningProjectsPopover
            onSelectWorktreeByPath={onSwitchWorktreeByPath || (() => {})}
            onSwitchTab={onSwitchTab}
          />
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
      </div>

      {!hideGroups && (
        <GroupSelector
          groups={groups}
          activeGroupId={activeGroupId}
          repositoryCounts={repositoryCounts}
          totalCount={repositories.length}
          onSelectGroup={onSwitchGroup}
          onEditGroup={() => setEditGroupDialogOpen(true)}
          onAddGroup={() => setCreateGroupDialogOpen(true)}
        />
      )}

      <div className="px-3 py-2">
        <div className="flex h-8 items-center gap-2 rounded-lg border px-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('Search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {/* Tree List */}
      <div className="flex-1 overflow-auto p-2">
        {temporaryWorkspaceEnabled && (
          <div className="mb-2">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setTempExpanded((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTempExpanded((prev) => !prev);
                }
              }}
              className={cn(
                'group relative flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left transition-colors cursor-pointer',
                selectedRepo === TEMP_REPO_ID ? 'text-accent-foreground' : 'hover:bg-accent/30'
              )}
            >
              {selectedRepo === TEMP_REPO_ID && (
                <motion.div
                  layoutId="temp-root-highlight"
                  className="absolute inset-0 rounded-lg bg-accent/50"
                  transition={springFast}
                />
              )}
              <div className="relative z-10 flex w-full items-center gap-1">
                <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                      tempExpanded && 'rotate-90'
                    )}
                  />
                </span>
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium text-sm text-left">
                  {t('Temp Session')}
                </span>
                {onCreateTempWorkspace && (
                  <button
                    type="button"
                    className="shrink-0 p-1 rounded hover:bg-muted"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateTempWorkspace();
                    }}
                    title={t('New Temp Session')}
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              {tempBasePath && (
                <span className="relative z-10 pl-6 overflow-hidden whitespace-nowrap text-ellipsis text-xs text-muted-foreground [direction:rtl] [text-align:left] [unicode-bidi:plaintext]">
                  {tempBasePath}
                </span>
              )}
            </div>

            <AnimatePresence initial={false}>
              {tempExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="ml-2 mr-2 mt-1 space-y-0.5 overflow-hidden"
                >
                  {sortedTempWorkspaces.length === 0 ? (
                    <div className="py-2 px-2 text-xs text-muted-foreground">
                      {t('No temp sessions')}
                    </div>
                  ) : (
                    sortedTempWorkspaces.map((item) => (
                      <TempWorkspaceTreeItem
                        key={item.id}
                        item={item}
                        isActive={
                          selectedRepo === TEMP_REPO_ID && activeWorktree?.path === item.path
                        }
                        onSelect={() => onSelectTempWorkspace?.(item.path)}
                        onRequestRename={() => onRequestTempRename?.(item.id)}
                        onRequestDelete={() => onRequestTempDelete?.(item.id)}
                      />
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {repositories.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyMedia variant="icon">
              <FolderGit2 className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base">{t('Add Repository')}</EmptyTitle>
              <EmptyDescription>
                {t('Add a Git repository from a local folder to get started')}
              </EmptyDescription>
            </EmptyHeader>
            <Button
              onClick={(e) => {
                e.currentTarget.blur();
                onAddRepository();
              }}
              variant="outline"
              className="mt-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('Add Repository')}
            </Button>
          </Empty>
        ) : filteredRepos.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyMedia variant="icon">
              <Search className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base">{t('No matching results')}</EmptyTitle>
              <EmptyDescription>{t('Try a different search term')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <LayoutGroup>
            {showSections ? (
              <div className="space-y-2">
                {groupedSections.map((section) => {
                  const isGroupCollapsed = !!collapsedGroups[section.groupId];
                  const isUngrouped = section.groupId === UNGROUPED_SECTION_ID;
                  return (
                    <div key={section.groupId}>
                      {/* Section Header */}
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapsed(section.groupId)}
                        className="flex h-7 w-full items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-colors select-none"
                      >
                        <ChevronRight
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
                            !isGroupCollapsed && 'rotate-90'
                          )}
                        />
                        {section.emoji && <span className="shrink-0 text-sm">{section.emoji}</span>}
                        {!isUngrouped && section.color && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: section.color }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-left">{section.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                          {section.repos.length}
                        </span>
                      </button>
                      {/* Section Content */}
                      <AnimatePresence initial={false}>
                        {!isGroupCollapsed && (
                          <motion.div
                            key={`group-content-${section.groupId}`}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            variants={heightVariants}
                            transition={springStandard}
                            className="overflow-hidden"
                          >
                            <div className="space-y-1 pt-0.5">
                              {section.repos.map(({ repo, originalIndex }) => {
                                return renderRepoItem(repo, originalIndex, section.groupId);
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredRepos.map(({ repo, originalIndex }) =>
                  renderRepoItem(repo, originalIndex)
                )}
              </div>
            )}
          </LayoutGroup>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 flex-1 items-center justify-start gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.currentTarget.blur();
              onAddRepository();
            }}
          >
            <Plus className="h-4 w-4" />
            {t('Add Repository')}
          </button>
        </div>
      </div>

      {/* Repository Context Menu */}
      {repoMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setRepoMenuOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setRepoMenuOpen(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              setRepoMenuOpen(false);
            }}
            role="presentation"
          />
          <div
            className="fixed z-50 min-w-32 rounded-lg border bg-popover p-1 shadow-lg"
            style={{ left: repoMenuPosition.x, top: repoMenuPosition.y }}
          >
            {/* New Worktree button */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                setRepoMenuOpen(false);
                // Switch to the right-clicked repo first, then wait for state update
                if (repoMenuTarget && repoMenuTarget.path !== selectedRepo) {
                  onSelectRepo(repoMenuTarget.path);
                  setPendingCreateWorktree(true);
                } else {
                  // Already on target repo, trigger refresh and open dialog
                  onRefresh();
                  refetchExpandedWorktrees();
                  setCreateWorktreeDialogOpen(true);
                }
              }}
            >
              <Plus className="h-4 w-4" />
              {t('New Worktree')}
            </button>

            {/* Repository Settings */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                setRepoMenuOpen(false);
                if (repoMenuTarget) {
                  setRepoSettingsTarget(repoMenuTarget);
                  setRepoSettingsOpen(true);
                }
              }}
            >
              <Settings2 className="h-4 w-4" />
              {t('Repository Settings')}
            </button>

            {/* Hide Repository */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                setRepoMenuOpen(false);
                if (repoMenuTarget) {
                  const currentSettings = getRepositorySettings(repoMenuTarget.path);
                  saveRepositorySettings(repoMenuTarget.path, {
                    ...currentSettings,
                    hidden: true,
                  });
                  refreshRepoSettings();
                  // If hiding the currently selected repo, switch to next visible one
                  if (selectedRepo === repoMenuTarget.path) {
                    const nextVisible = repositories.find(
                      (r) => r.path !== repoMenuTarget.path && !getRepositorySettings(r.path).hidden
                    );
                    if (nextVisible) {
                      onSelectRepo(nextVisible.path);
                    }
                  }
                  toastManager.add({
                    title: t('Repository hidden'),
                    description: t('Hidden repositories will not appear in the sidebar'),
                    type: 'success',
                    timeout: 3000,
                  });
                }
              }}
            >
              <EyeOff className="h-4 w-4" />
              {t('Hide Repository')}
            </button>

            {!hideGroups && onMoveToGroup && groups.length > 0 && (
              <MoveToGroupSubmenu
                groups={groups}
                currentGroupId={repoMenuTarget?.groupId}
                onMove={(groupId) => {
                  if (repoMenuTarget) {
                    onMoveToGroup(repoMenuTarget.path, groupId);
                  }
                }}
                onClose={() => setRepoMenuOpen(false)}
              />
            )}

            {/* Separator */}
            <div className="my-1 h-px bg-border" />

            {/* Remove repository button */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-accent"
              onClick={handleRemoveRepoClick}
            >
              <FolderMinus className="h-4 w-4" />
              {t('Remove repository')}
            </button>
          </div>
        </>
      )}

      {/* Remove repository confirmation dialog */}
      <AlertDialog
        open={!!repoToRemove}
        onOpenChange={(open) => {
          if (!open) {
            setRepoToRemove(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Remove repository')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tNode('Are you sure you want to remove {{name}} from the workspace?', {
                name: <strong>{repoToRemove?.name}</strong>,
              })}
              <span className="block mt-2 text-muted-foreground">
                {t('This will only remove it from the app and will not delete local files.')}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={handleConfirmRemoveRepo}>
              {t('Remove')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Delete worktree confirmation dialog */}
      <AlertDialog
        open={!!worktreeToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setWorktreeToDelete(null);
            setDeleteBranch(false);
            setForceDelete(false);
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
                  onRemoveWorktree(worktreeToDelete, {
                    deleteBranch,
                    force: forceDelete,
                  });
                  setWorktreeToDelete(null);
                  setDeleteBranch(false);
                  setForceDelete(false);
                  refetchExpandedWorktrees();
                }
              }}
            >
              {t('Delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Create Worktree Dialog (triggered from context menu) */}
      <CreateWorktreeDialog
        open={createWorktreeDialogOpen}
        onOpenChange={setCreateWorktreeDialogOpen}
        branches={branches}
        projectName={selectedRepo?.split('/').pop() || ''}
        workdir={workdir}
        isLoading={isCreating}
        onSubmit={async (options) => {
          await onCreateWorktree(options);
          refetchExpandedWorktrees();
        }}
      />

      {/* Repository Settings Dialog */}
      {repoSettingsTarget && (
        <RepositorySettingsDialog
          open={repoSettingsOpen}
          onOpenChange={setRepoSettingsOpen}
          repoPath={repoSettingsTarget.path}
          repoName={repoSettingsTarget.name}
        />
      )}

      {/* Repository Manager Dialog */}
      <RepositoryManagerDialog
        open={repoManagerOpen}
        onOpenChange={setRepoManagerOpen}
        repositories={repositories}
        selectedRepo={selectedRepo}
        onSelectRepo={onSelectRepo}
        onRemoveRepository={onRemoveRepository}
        onSettingsChange={refreshRepoSettings}
      />

      <CreateGroupDialog
        open={createGroupDialogOpen}
        onOpenChange={setCreateGroupDialogOpen}
        onSubmit={onCreateGroup}
      />

      <GroupEditDialog
        open={editGroupDialogOpen}
        onOpenChange={setEditGroupDialogOpen}
        group={activeGroup || null}
        repositoryCount={activeGroup ? repositoryCounts[activeGroup.id] || 0 : 0}
        onUpdate={onUpdateGroup}
        onDelete={onDeleteGroup}
      />
    </aside>
  );
}

interface TempWorkspaceTreeItemProps {
  item: TempWorkspaceItem;
  isActive: boolean;
  onSelect: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}

function TempWorkspaceTreeItem({
  item,
  isActive,
  onSelect,
  onRequestRename,
  onRequestDelete,
}: TempWorkspaceTreeItemProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const activities = useWorktreeActivityStore((s) => s.activities);
  const activity = activities[item.path] || { agentCount: 0, terminalCount: 0 };
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <>
      <div className="relative rounded-lg">
        <button
          type="button"
          onClick={onSelect}
          onContextMenu={handleContextMenu}
          className={cn(
            'group relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pl-[24px] text-left transition-colors',
            isActive ? 'text-accent-foreground' : 'hover:bg-accent/30'
          )}
        >
          {isActive && (
            <motion.div
              layoutId="temp-workspace-highlight"
              className="absolute inset-0 rounded-lg bg-accent/50"
              transition={springFast}
            />
          )}
          <GitBranch className="relative z-10 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="relative z-10 min-w-0 flex-1 truncate text-sm">{item.title}</span>
          <span className="relative z-10 shrink-0 rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-medium uppercase text-emerald-600 dark:text-emerald-400">
            {t('Main')}
          </span>
          {hasActivity && (
            <div className="relative z-10 flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
              {activity.agentCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Sparkles className="h-3 w-3" />
                  {activity.agentCount}
                </span>
              )}
              {activity.terminalCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Terminal className="h-3 w-3" />
                  {activity.terminalCount}
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      <TempWorkspaceContextMenu
        open={menuOpen}
        position={menuPosition}
        path={item.path}
        onClose={() => setMenuOpen(false)}
        onRename={onRequestRename}
        onDelete={onRequestDelete}
      />
    </>
  );
}

// Worktree item for tree view
interface WorktreeTreeItemProps {
  worktree: GitWorktree;
  repoPath: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onMerge?: () => void;
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

function WorktreeTreeItem({
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
}: WorktreeTreeItemProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const isMain =
    worktree.isMainWorktree || worktree.branch === 'main' || worktree.branch === 'master';
  const branchDisplay = worktree.branch || t('Detached');
  const isPrunable = worktree.prunable;
  const glowEnabled = useGlowEffectEnabled();

  // Check if branch is merged to main
  const isMerged = useMemo(() => {
    if (!worktree.branch || isMain) return false;
    const branch = branches.find((b) => b.name === worktree.branch);
    return branch?.merged === true;
  }, [worktree.branch, isMain, branches]);

  // Subscribe to activity store
  const activities = useWorktreeActivityStore((s) => s.activities);
  const diffStatsMap = useWorktreeActivityStore((s) => s.diffStats);
  const activityStates = useWorktreeActivityStore((s) => s.activityStates);
  const activity = activities[worktree.path] || {
    agentCount: 0,
    terminalCount: 0,
  };
  const diffStats = diffStatsMap[worktree.path] || {
    insertions: 0,
    deletions: 0,
  };
  const activityState = activityStates[worktree.path] || 'idle';
  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;
  const hasDiffStats = diffStats.insertions > 0 || diffStats.deletions > 0;

  // Auto-clear completed state after 5 seconds when worktree is active
  const COMPLETED_STATE_DURATION_MS = 5000;
  useEffect(() => {
    if (isActive && activityState === 'completed') {
      const timer = setTimeout(() => {
        // Use getState() to avoid stale closure and dependency array issues
        useWorktreeActivityStore.getState().clearActivityState(worktree.path);
      }, COMPLETED_STATE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isActive, activityState, worktree.path]);

  // Check if any session in this worktree has outputting or unread state
  const outputState = useWorktreeOutputState(worktree.path);

  // Git sync operations
  const {
    ahead: aheadCount,
    behind: behindCount,
    tracking,
    currentBranch,
    isSyncing,
    handleSync,
    handlePublish,
  } = useGitSync({ workdir: worktree.path, enabled: isActive });

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
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
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

      if (y + rect.height > viewportHeight - 8) {
        y = Math.max(8, viewportHeight - rect.height - 8);
      }

      if (x + rect.width > viewportWidth - 8) {
        x = Math.max(8, viewportWidth - rect.width - 8);
      }

      if (x !== menuPosition.x || y !== menuPosition.y) {
        setMenuPosition({ x, y });
      }
    }
  }, [menuOpen, menuPosition]);

  // Button content (without activity indicator - it's now outside)
  const buttonContent = (
    <>
      {/* Drop indicator - top */}
      {showDropIndicator && dropDirection === 'top' && (
        <div className="absolute -top-0.5 left-0 right-0 h-0.5 bg-primary rounded-full" />
      )}
      <div
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
        onContextMenu={handleContextMenu}
        className={cn(
          'relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors text-sm cursor-pointer',
          isPrunable && 'opacity-50',
          isActive
            ? 'border border-primary bg-primary/10'
            : 'border border-transparent hover:bg-accent/50'
        )}
      >
        <GitBranch
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            isPrunable ? 'text-destructive' : isActive ? 'text-primary' : 'text-muted-foreground'
          )}
        />
        <span className={cn('min-w-0 flex-1 truncate', isPrunable && 'line-through')}>
          {branchDisplay}
        </span>
        {isPrunable ? (
          <span className="shrink-0 rounded bg-destructive/20 px-1 py-0.5 text-[9px] font-medium uppercase text-destructive">
            {t('Deleted')}
          </span>
        ) : isMain ? (
          <span className="shrink-0 rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-medium uppercase text-emerald-600 dark:text-emerald-400">
            {t('Main')}
          </span>
        ) : isMerged ? (
          <span className="shrink-0 rounded bg-success/20 px-1 py-0.5 text-[9px] font-medium uppercase text-success-foreground">
            {t('Merged')}
          </span>
        ) : null}
        {/* Git sync status */}
        <GitSyncButton
          ahead={aheadCount}
          behind={behindCount}
          tracking={tracking}
          currentBranch={currentBranch}
          isSyncing={isSyncing}
          onSync={handleSync}
          onPublish={handlePublish}
        />
        {/* Activity counts */}
        <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
          {activity.agentCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Sparkles className="h-3 w-3" />
              {activity.agentCount}
            </span>
          )}
          {activity.terminalCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Terminal className="h-3 w-3" />
              {activity.terminalCount}
            </span>
          )}
          {hasDiffStats && (
            <span className="flex items-center gap-0.5">
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
      </div>
      {/* Drop indicator - bottom */}
      {showDropIndicator && dropDirection === 'bottom' && (
        <div className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-primary rounded-full" />
      )}
    </>
  );

  return (
    <>
      {/* Flex container: activity indicator on left, button on right */}
      <div className="flex items-center">
        {/* Activity indicator area - same width as ChevronRight container in repo row */}
        <span className="shrink-0 w-5 h-5 flex items-center justify-center">
          <ActivityIndicator state={activityState} size="sm" />
        </span>
        {/* Button with optional glow border */}
        {glowEnabled ? (
          <GlowBorder state={activityState as GlowState} className="rounded-lg flex-1 min-w-0">
            {buttonContent}
          </GlowBorder>
        ) : (
          <div className="relative rounded-lg flex-1 min-w-0">{buttonContent}</div>
        )}
      </div>

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
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-accent/50',
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
