import type {
  GitWorktree,
  RemoteConnectionStatus,
  WorktreeCreateOptions,
  WorktreeMergeOptions,
  WorktreeMergeResult,
} from '@shared/types';
import { getDisplayPath, getDisplayPathBasename } from '@shared/utils/path';
import { isRemoteVirtualPath, toRemoteVirtualPath } from '@shared/utils/remotePath';
import { buildRepositoryId } from '@shared/utils/workspace';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_GROUP_ID,
  panelTransition,
  type Repository,
  type TabId,
  TEMP_REPO_ID,
} from './App/constants';
import {
  useAppLifecycle,
  useBackgroundImage,
  useClaudeIntegration,
  useClaudeProviderListener,
  useCodeReviewContinue,
  useFileDragDrop,
  useFocusSession,
  useGroupSync,
  useMenuActions,
  useMergeState,
  useOpenPathListener,
  usePanelState,
  useRepositoryState,
  useSettingsEvents,
  useSettingsState,
  useTempWorkspaceSync,
  useTerminalNavigation,
  useWorktreeSelection,
  useWorktreeState,
  useWorktreeSync,
} from './App/hooks';
import {
  getRepositorySettings,
  getStoredBoolean,
  getStoredWorktreeMap,
  STORAGE_KEYS,
  saveActiveGroupId,
} from './App/storage';
import { useAppKeyboardShortcuts } from './App/useAppKeyboardShortcuts';
import { usePanelResize } from './App/usePanelResize';
import { DevToolsOverlay } from './components/DevToolsOverlay';
import { FileSidebar } from './components/files';
import { UnsavedPromptHost } from './components/files/UnsavedPromptHost';
import { AddRepositoryDialog } from './components/git';
import { CloneProgressFloat } from './components/git/CloneProgressFloat';
import { ActionPanel } from './components/layout/ActionPanel';
import { BackgroundLayer } from './components/layout/BackgroundLayer';
import { MainContent } from './components/layout/MainContent';
import { RepositorySidebar } from './components/layout/RepositorySidebar';
import { TemporaryWorkspacePanel } from './components/layout/TemporaryWorkspacePanel';
import { TreeSidebar } from './components/layout/TreeSidebar';
import { WindowTitleBar } from './components/layout/WindowTitleBar';
import { WorktreePanel } from './components/layout/WorktreePanel';
import { RemoteAuthPromptHost } from './components/remote/RemoteAuthPromptHost';
import { DraggableSettingsWindow } from './components/settings/DraggableSettingsWindow';
import { TempWorkspaceDialogs } from './components/temp-workspace/TempWorkspaceDialogs';
import { UpdateNotification } from './components/UpdateNotification';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from './components/ui/dialog';
import { addToast, toastManager } from './components/ui/toast';
import { MergeEditor, MergeWorktreeDialog } from './components/worktree';
import { useAutoFetchListener, useGitBranches, useGitInit } from './hooks/useGit';
import { useWebInspector } from './hooks/useWebInspector';
import {
  useWorktreeCreate,
  useWorktreeList,
  useWorktreeMerge,
  useWorktreeMergeAbort,
  useWorktreeMergeContinue,
  useWorktreeRemove,
  useWorktreeResolveConflict,
} from './hooks/useWorktree';
import { useI18n } from './i18n';
import { initCloneProgressListener } from './stores/cloneTasks';
import { useEditorStore } from './stores/editor';
import { useInitScriptStore } from './stores/initScript';
import { useSettingsStore } from './stores/settings';
import { useTempWorkspaceStore } from './stores/tempWorkspace';
import { useWorktreeStore } from './stores/worktree';
import { initAgentActivityListener, useWorktreeActivityStore } from './stores/worktreeActivity';

// Initialize global clone progress listener
initCloneProgressListener();

export default function App() {
  const { t } = useI18n();

  // Initialize agent activity listener for tree sidebar status display
  useEffect(() => {
    return initAgentActivityListener();
  }, []);

  // Listen for auto-fetch completion events to refresh git status
  useAutoFetchListener();

  const repoState = useRepositoryState();
  const wtState = useWorktreeState();
  const settingsState = useSettingsState(
    wtState.activeTab,
    wtState.previousTab,
    wtState.setActiveTab,
    wtState.setPreviousTab
  );
  const panelState = usePanelState();

  const {
    repositories,
    selectedRepo,
    groups,
    activeGroupId,
    setSelectedRepo: setSelectedRepoState,
    setActiveGroupId,
    saveRepositories,
    handleCreateGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleSwitchGroup,
    handleMoveToGroup,
    handleReorderRepositories,
  } = repoState;

  const {
    worktreeTabMap,
    repoWorktreeMap,
    tabOrder,
    activeTab,
    activeWorktree,
    currentWorktreePathRef,
    setWorktreeTabMap,
    setRepoWorktreeMap,
    setActiveTab,
    setPreviousTab,
    setActiveWorktree,
    handleReorderWorktrees: reorderWorktreesInState,
    handleReorderTabs,
    getSortedWorktrees,
    saveActiveWorktreeToMap,
  } = wtState;

  const {
    settingsCategory,
    scrollToProvider,
    pendingProviderAction,
    settingsDialogOpen,
    settingsDisplayMode,
    setSettingsCategory,
    setScrollToProvider,
    setPendingProviderAction,
    setSettingsDialogOpen,
    openSettings,
    toggleSettings,
    handleSettingsCategoryChange,
  } = settingsState;

  const {
    repositoryCollapsed,
    worktreeCollapsed,
    addRepoDialogOpen,
    initialLocalPath,
    actionPanelOpen,
    closeDialogOpen,
    toggleSelectedRepoExpandedRef,
    switchWorktreePathRef,
    setRepositoryCollapsed,
    setWorktreeCollapsed,
    setAddRepoDialogOpen,
    setInitialLocalPath,
    setActionPanelOpen,
    setCloseDialogOpen,
  } = panelState;

  const openLocalAddRepositoryDialog = useCallback(() => {
    setAddRepoDialogOpen(true);
  }, [setAddRepoDialogOpen]);

  const { isFileDragOver, repositorySidebarRef } = useFileDragDrop(
    true,
    setInitialLocalPath,
    openLocalAddRepositoryDialog
  );
  const [fileSidebarCollapsed, setFileSidebarCollapsed] = useState(() =>
    getStoredBoolean(STORAGE_KEYS.FILE_SIDEBAR_COLLAPSED, false)
  );

  const [activatedRemoteRepos, setActivatedRemoteRepos] = useState<Set<string>>(() => new Set());
  const [remoteStatuses, setRemoteStatuses] = useState<Record<string, RemoteConnectionStatus>>({});

  const repositoryByPath = useMemo(
    () => new Map(repositories.map((repo) => [repo.path, repo])),
    [repositories]
  );

  useEffect(() => {
    return window.electronAPI.remote.onStatusChange(({ connectionId, status }) => {
      setRemoteStatuses((prev) => ({
        ...prev,
        [connectionId]: status,
      }));
    });
  }, []);

  const isRemoteRepoPath = useCallback(
    (repoPath: string | null | undefined) => {
      if (!repoPath || repoPath === TEMP_REPO_ID) {
        return false;
      }

      const repo = repositoryByPath.get(repoPath);
      return repo?.kind === 'remote' || isRemoteVirtualPath(repoPath);
    },
    [repositoryByPath]
  );

  const activateRemoteRepo = useCallback(
    (repoPath: string | null | undefined) => {
      if (!repoPath || !isRemoteRepoPath(repoPath)) {
        return;
      }

      const repo = repositoryByPath.get(repoPath);
      if (repo?.connectionId) {
        window.electronAPI.remote.connect(repo.connectionId).catch((error) => {
          console.warn('[remote] Failed to activate remote repository:', error);
        });
      }

      setActivatedRemoteRepos((prev) => {
        if (prev.has(repoPath)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(repoPath);
        return next;
      });
    },
    [isRemoteRepoPath, repositoryByPath]
  );

  const canLoadRepo = useCallback(
    (repoPath: string | null | undefined) => {
      if (!repoPath || repoPath === TEMP_REPO_ID) {
        return false;
      }
      return !isRemoteRepoPath(repoPath) || activatedRemoteRepos.has(repoPath);
    },
    [activatedRemoteRepos, isRemoteRepoPath]
  );

  const setSelectedRepoForWorktreeSelection = useCallback(
    (repoPath: string) => {
      if (isRemoteRepoPath(repoPath)) {
        activateRemoteRepo(repoPath);
      }
      setSelectedRepoState(repoPath);
    },
    [activateRemoteRepo, isRemoteRepoPath, setSelectedRepoState]
  );

  const { refreshGitData, handleSelectWorktree } = useWorktreeSelection(
    activeWorktree,
    setActiveWorktree,
    currentWorktreePathRef,
    worktreeTabMap,
    setWorktreeTabMap,
    activeTab,
    setActiveTab,
    selectedRepo,
    setSelectedRepoForWorktreeSelection
  );

  const {
    mergeDialogOpen,
    mergeWorktree,
    mergeConflicts,
    pendingMergeOptions,
    setMergeDialogOpen,
    setMergeConflicts,
    setPendingMergeOptions,
    handleOpenMergeDialog,
  } = useMergeState();

  // Layout mode from settings
  const layoutMode = useSettingsStore((s) => s.layoutMode);
  const autoUpdateEnabled = useSettingsStore((s) => s.autoUpdateEnabled);
  const hideGroups = useSettingsStore((s) => s.hideGroups);
  const temporaryWorkspaceEnabled = useSettingsStore((s) => s.temporaryWorkspaceEnabled);
  const fileTreeDisplayMode = useSettingsStore((s) => s.fileTreeDisplayMode);
  const hasActiveWorktree = Boolean(activeWorktree?.path);
  const defaultTemporaryPath = useSettingsStore((s) => s.defaultTemporaryPath);
  const isWindows = window.electronAPI?.env.platform === 'win32';
  const pathSep = isWindows ? '\\' : '/';
  const homeDir = window.electronAPI?.env.HOME || '';
  const effectiveTempBasePath = useMemo(
    () => defaultTemporaryPath || [homeDir, 'ensoai', 'temporary'].join(pathSep),
    [defaultTemporaryPath, homeDir, pathSep]
  );
  const tempBasePathDisplay = useMemo(() => {
    if (!effectiveTempBasePath) return '';
    let display = effectiveTempBasePath.replace(/\\/g, '/');
    if (display.startsWith('/')) {
      display = display.slice(1);
    }
    if (!display.endsWith('/')) {
      display = `${display}/`;
    }
    return display;
  }, [effectiveTempBasePath]);
  const effectiveTemporaryWorkspaceEnabled = temporaryWorkspaceEnabled;

  // Panel resize hook
  const {
    repositoryWidth,
    worktreeWidth,
    treeSidebarWidth,
    fileSidebarWidth,
    resizing,
    handleResizeStart,
  } = usePanelResize(layoutMode);

  const worktreeError = useWorktreeStore((s) => s.error);
  const setWorktreeError = useWorktreeStore((s) => s.setError);
  const clearEditorWorktreeState = useEditorStore((s) => s.clearWorktreeState);
  const tempWorkspaces = useTempWorkspaceStore((s) => s.items);
  const addTempWorkspace = useTempWorkspaceStore((s) => s.addItem);
  const removeTempWorkspace = useTempWorkspaceStore((s) => s.removeItem);
  const renameTempWorkspace = useTempWorkspaceStore((s) => s.renameItem);
  const rehydrateTempWorkspaces = useTempWorkspaceStore((s) => s.rehydrate);
  const openTempRename = useTempWorkspaceStore((s) => s.openRename);
  const openTempDelete = useTempWorkspaceStore((s) => s.openDelete);

  // Handle tab change and persist to worktree tab map
  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      // Clear previousTab when switching away from settings via tab bar
      if (activeTab === 'settings') {
        setPreviousTab(null);
      }
      // Save tab state for current worktree
      if (activeWorktree?.path) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: tab,
        }));
      }
    },
    [activeTab, activeWorktree, setActiveTab, setPreviousTab, setWorktreeTabMap]
  );

  useSettingsEvents(openSettings, setSettingsCategory, setScrollToProvider);

  // Keyboard shortcuts
  useAppKeyboardShortcuts({
    activeWorktreePath: activeWorktree?.path,
    onTabSwitch: handleTabChange,
    onActionPanelToggle: useCallback(
      () => setActionPanelOpen((prev) => !prev),
      [setActionPanelOpen]
    ),
    onToggleWorktree: useCallback(() => {
      // In tree layout, toggle selected repo expanded; in columns layout, toggle worktree panel
      if (layoutMode === 'tree') {
        toggleSelectedRepoExpandedRef.current?.();
      } else {
        setWorktreeCollapsed((prev) => !prev);
      }
    }, [layoutMode, setWorktreeCollapsed, toggleSelectedRepoExpandedRef.current]),
    onToggleRepository: useCallback(
      () => setRepositoryCollapsed((prev) => !prev),
      [setRepositoryCollapsed]
    ),
    onSwitchActiveWorktree: useCallback(() => {
      const activities = useWorktreeActivityStore.getState().activities;

      // 获取所有有活跃 agent 会话的 worktree 路径（跨所有仓库）
      const activeWorktreePaths = Object.entries(activities)
        .filter(([, activity]) => activity.agentCount > 0)
        .map(([path]) => path)
        .sort(); // 确保顺序稳定

      // 边界检查：少于 2 个活跃 worktree 时无需切换
      if (activeWorktreePaths.length < 2) {
        return;
      }

      // 找到当前 worktree 在列表中的位置
      const currentPath = activeWorktree?.path ?? '';
      const currentIndex = activeWorktreePaths.indexOf(currentPath);

      // 计算下一个索引（循环）
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % activeWorktreePaths.length;

      // 切换到下一个 worktree（使用 ref 调用跨仓库切换函数）
      const nextWorktreePath = activeWorktreePaths[nextIndex];
      switchWorktreePathRef.current?.(nextWorktreePath);
    }, [activeWorktree?.path, switchWorktreePathRef.current]),
  });

  // Web Inspector: listen for element inspection data and write to active agent terminal
  useWebInspector(activeWorktree?.path, selectedRepo ?? undefined);

  useTerminalNavigation(activeWorktree?.path ?? null, setActiveTab, setWorktreeTabMap);
  useMenuActions(openSettings, setActionPanelOpen);
  const { confirmCloseAndRespond, cancelCloseAndRespond } = useAppLifecycle(
    panelState.setCloseDialogOpen
  );
  useClaudeProviderListener(
    setSettingsCategory,
    setScrollToProvider,
    openSettings,
    setPendingProviderAction
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FILE_SIDEBAR_COLLAPSED, String(fileSidebarCollapsed));
  }, [fileSidebarCollapsed]);

  useTempWorkspaceSync(
    effectiveTemporaryWorkspaceEnabled,
    selectedRepo,
    activeWorktree,
    tempWorkspaces,
    repositories,
    setSelectedRepoState,
    setActiveWorktree
  );

  const isTempRepo = selectedRepo === TEMP_REPO_ID;
  const worktreeRepoPath = isTempRepo ? null : selectedRepo;
  const selectedRepoCanLoad = canLoadRepo(worktreeRepoPath);
  const selectedRepository = worktreeRepoPath ? repositoryByPath.get(worktreeRepoPath) : null;
  const selectedRemoteStatus = selectedRepository?.connectionId
    ? (remoteStatuses[selectedRepository.connectionId] ?? null)
    : null;
  const selectedRemoteReady =
    !selectedRepository?.connectionId ||
    !isRemoteRepoPath(worktreeRepoPath) ||
    selectedRemoteStatus?.connected !== false ||
    selectedRemoteStatus == null;
  const worktreeQueryEnabled = Boolean(worktreeRepoPath && selectedRepoCanLoad);
  const inactiveSelectedRemoteRepo = Boolean(
    worktreeRepoPath &&
      isRemoteRepoPath(worktreeRepoPath) &&
      (!selectedRepoCanLoad || !selectedRemoteReady)
  );

  // Get worktrees for selected repo (used in columns mode)
  const {
    data: worktrees = [],
    isLoading: worktreesLoading,
    isFetching: worktreesFetching,
    isFetched: worktreesFetched,
    refetch,
  } = useWorktreeList(worktreeRepoPath, {
    enabled: worktreeQueryEnabled,
  });

  // Get branches for selected repo
  const { data: branches = [], refetch: refetchBranches } = useGitBranches(worktreeRepoPath, {
    enabled: worktreeQueryEnabled,
  });

  // Worktree mutations
  const createWorktreeMutation = useWorktreeCreate();
  const removeWorktreeMutation = useWorktreeRemove();
  const gitInitMutation = useGitInit();

  // Merge mutations
  const mergeMutation = useWorktreeMerge();
  const resolveConflictMutation = useWorktreeResolveConflict();
  const abortMergeMutation = useWorktreeMergeAbort();
  const continueMergeMutation = useWorktreeMergeContinue();

  useEffect(() => {
    rehydrateTempWorkspaces();
  }, [rehydrateTempWorkspaces]);

  useEffect(() => {
    if (!inactiveSelectedRemoteRepo) {
      return;
    }
    setWorktreeError(null);
  }, [inactiveSelectedRemoteRepo, setWorktreeError]);

  useEffect(() => {
    if (!selectedRepo || selectedRepo === TEMP_REPO_ID) {
      return;
    }
    if (selectedRepoCanLoad || !activeWorktree) {
      return;
    }
    setActiveWorktree(null);
  }, [selectedRepo, selectedRepoCanLoad, activeWorktree, setActiveWorktree]);

  useEffect(() => {
    if (!selectedRepo) return;
    if (selectedRepo === TEMP_REPO_ID) return;

    const oldWorktreePath = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKTREE);
    const savedWorktreeMap = getStoredWorktreeMap();
    const needsMigration = oldWorktreePath && !savedWorktreeMap[selectedRepo];

    if (needsMigration && oldWorktreePath) {
      const migrated = {
        ...savedWorktreeMap,
        [selectedRepo]: oldWorktreePath,
      };
      localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(migrated));
      setRepoWorktreeMap(migrated);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKTREE);
    }

    if (!selectedRepoCanLoad) return;

    if (!activeWorktree) {
      const savedWorktreePath = repoWorktreeMap[selectedRepo];
      if (!savedWorktreePath) return;
      if (!worktreesFetched) return;
      if (worktreesFetching) return;

      const matchedWorktree = worktrees.find((wt) => wt.path === savedWorktreePath);
      if (matchedWorktree) {
        setActiveWorktree(matchedWorktree);
        return;
      }

      // Remove stale saved mapping to avoid restore<->sync loops.
      setRepoWorktreeMap((prev) => {
        if (!prev[selectedRepo]) return prev;
        const updated = { ...prev };
        delete updated[selectedRepo];
        localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(updated));
        return updated;
      });
    }
  }, [
    selectedRepo,
    activeWorktree,
    repoWorktreeMap,
    selectedRepoCanLoad,
    worktrees,
    worktreesFetched,
    worktreesFetching,
    setRepoWorktreeMap,
    setActiveWorktree,
  ]);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.order - b.order), [groups]);
  const sortedWorktrees = useMemo(
    () => getSortedWorktrees(selectedRepo, worktrees),
    [getSortedWorktrees, selectedRepo, worktrees]
  );

  useGroupSync(hideGroups, activeGroupId, setActiveGroupId, saveActiveGroupId);
  useOpenPathListener(true, repositories, saveRepositories, setSelectedRepoState);
  useFocusSession({
    onSwitchWorktree: (path) => switchWorktreePathRef.current?.(path),
    onSwitchTab: handleTabChange,
  });
  useClaudeIntegration(activeWorktree?.path ?? null, true);
  useCodeReviewContinue(activeWorktree, handleTabChange);
  useWorktreeSync(worktrees, activeWorktree, worktreesFetching, setActiveWorktree);

  const handleReorderWorktrees = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderWorktreesInState(selectedRepo, worktrees, fromIndex, toIndex);
    },
    [selectedRepo, worktrees, reorderWorktreesInState]
  );

  // Remove repository from workspace
  const handleRemoveRepository = useCallback(
    (repoPath: string) => {
      const updated = repositories.filter((r) => r.path !== repoPath);
      saveRepositories(updated);
      setActivatedRemoteRepos((prev) => {
        if (!prev.has(repoPath)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(repoPath);
        return next;
      });
      // Clear selection if removed repo was selected
      if (selectedRepo === repoPath) {
        setSelectedRepoState(null);
        setActiveWorktree(null);
      }
    },
    [repositories, saveRepositories, selectedRepo, setActiveWorktree, setSelectedRepoState]
  );

  useEffect(() => {
    if (!selectedRepo || selectedRepo === TEMP_REPO_ID) return;
    if (!selectedRepoCanLoad) return;
    if (!worktreesFetched) return;
    if (worktreesFetching) return;

    if (!activeWorktree) {
      saveActiveWorktreeToMap(selectedRepo, null);
      return;
    }

    const isWorktreeInSelectedRepo = worktrees.some((wt) => wt.path === activeWorktree.path);
    if (isWorktreeInSelectedRepo) {
      saveActiveWorktreeToMap(selectedRepo, activeWorktree);
    }
  }, [
    selectedRepo,
    activeWorktree,
    selectedRepoCanLoad,
    worktrees,
    worktreesFetched,
    worktreesFetching,
    saveActiveWorktreeToMap,
  ]);

  const handleSelectRepo = useCallback(
    (repoPath: string, options?: { activateRemote?: boolean }) => {
      // Save current worktree's tab state before switching
      if (activeWorktree?.path) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: activeTab,
        }));
      }

      const shouldActivateRemote = (options?.activateRemote ?? false) && isRemoteRepoPath(repoPath);
      if (shouldActivateRemote) {
        activateRemoteRepo(repoPath);
      }

      const nextRepoCanLoad =
        repoPath !== TEMP_REPO_ID &&
        (!isRemoteRepoPath(repoPath) || shouldActivateRemote || activatedRemoteRepos.has(repoPath));

      setSelectedRepoState(repoPath);

      if (!nextRepoCanLoad) {
        setActiveWorktree(null);
        setActiveTab('chat');
        return;
      }

      const savedWorktreePath = repoWorktreeMap[repoPath];
      if (savedWorktreePath) {
        // Set temporary worktree with just the path; full object syncs after worktrees load.
        setActiveWorktree({ path: savedWorktreePath } as GitWorktree);
        const savedTab = worktreeTabMap[savedWorktreePath] || 'chat';
        setActiveTab(savedTab);
        return;
      }

      setActiveWorktree(null);
      setActiveTab('chat');
    },
    [
      activeTab,
      activeWorktree,
      activateRemoteRepo,
      activatedRemoteRepos,
      isRemoteRepoPath,
      repoWorktreeMap,
      setActiveTab,
      setActiveWorktree,
      setSelectedRepoState,
      setWorktreeTabMap,
      worktreeTabMap,
    ]
  );

  const handleSelectTempWorkspace = useCallback(
    async (path: string) => {
      await handleSelectWorktree({ path } as GitWorktree, TEMP_REPO_ID);
    },
    [handleSelectWorktree]
  );

  const handleCreateTempWorkspace = useCallback(async () => {
    const toastId = toastManager.add({
      type: 'loading',
      title: t('Creating...'),
      description: t('Temp Session'),
      timeout: 0,
    });

    const result = await window.electronAPI.tempWorkspace.create(effectiveTempBasePath);
    if (!result.ok) {
      toastManager.close(toastId);
      toastManager.add({
        type: 'error',
        title: t('Create failed'),
        description: result.message || t('Failed to create temp session'),
      });
      return;
    }

    addTempWorkspace(result.item);
    toastManager.close(toastId);
    toastManager.add({
      type: 'success',
      title: t('Temp Session created'),
      description: result.item.title,
    });
    await handleSelectTempWorkspace(result.item.path);
  }, [addTempWorkspace, effectiveTempBasePath, handleSelectTempWorkspace, t]);

  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const clearWorktreeActivity = useWorktreeActivityStore((s) => s.clearWorktree);

  const handleRemoveTempWorkspace = useCallback(
    async (id: string) => {
      const target = tempWorkspaces.find((item) => item.id === id);
      if (!target) return;

      const toastId = toastManager.add({
        type: 'loading',
        title: t('Deleting...'),
        description: target.title,
        timeout: 0,
      });

      closeAgentSessions(target.path);
      closeTerminalSessions(target.path);

      const result = await window.electronAPI.tempWorkspace.remove(
        target.path,
        effectiveTempBasePath
      );
      if (!result.ok) {
        toastManager.close(toastId);
        toastManager.add({
          type: 'error',
          title: t('Delete failed'),
          description: result.message || t('Failed to delete temp session'),
        });
        return;
      }

      removeTempWorkspace(id);
      clearEditorWorktreeState(target.path);
      clearWorktreeActivity(target.path);

      if (activeWorktree?.path === target.path) {
        const remaining = tempWorkspaces.filter((item) => item.id !== id);
        if (remaining.length > 0) {
          await handleSelectTempWorkspace(remaining[0].path);
        } else {
          setActiveWorktree(null);
        }
      }

      toastManager.close(toastId);
      toastManager.add({
        type: 'success',
        title: t('Temp Session deleted'),
        description: target.title,
      });
    },
    [
      activeWorktree?.path,
      clearEditorWorktreeState,
      closeAgentSessions,
      closeTerminalSessions,
      clearWorktreeActivity,
      handleSelectTempWorkspace,
      removeTempWorkspace,
      tempWorkspaces,
      t,
      effectiveTempBasePath,
      setActiveWorktree,
    ]
  );

  const handleSwitchWorktreePath = useCallback(
    async (worktreePath: string) => {
      const tempMatch = tempWorkspaces.find((item) => item.path === worktreePath);
      if (tempMatch) {
        await handleSelectWorktree({ path: tempMatch.path } as GitWorktree, TEMP_REPO_ID);
        return;
      }

      const worktree = worktrees.find((wt) => wt.path === worktreePath);
      if (worktree) {
        handleSelectWorktree(worktree);
        return;
      }

      for (const repo of repositories) {
        if (isRemoteRepoPath(repo.path) && !canLoadRepo(repo.path)) {
          continue;
        }

        try {
          const repoWorktrees = await window.electronAPI.worktree.list(repo.path);
          const found = repoWorktrees.find((wt) => wt.path === worktreePath);
          if (found) {
            setSelectedRepoForWorktreeSelection(repo.path);
            setActiveWorktree(found);
            const savedTab = worktreeTabMap[found.path] || 'chat';
            setActiveTab(savedTab);

            // Refresh git data for the switched worktree
            refreshGitData(found.path);
            return;
          }
        } catch {}
      }
    },
    [
      tempWorkspaces,
      worktrees,
      repositories,
      isRemoteRepoPath,
      canLoadRepo,
      worktreeTabMap,
      handleSelectWorktree,
      refreshGitData,
      setActiveTab,
      setActiveWorktree,
      setSelectedRepoForWorktreeSelection,
    ]
  );

  // Assign to ref for use in keyboard shortcut callback
  switchWorktreePathRef.current = handleSwitchWorktreePath;

  // Handle adding a local repository
  const createRepositoryEntry = useCallback(
    (
      repoPath: string,
      groupId: string | null,
      options?: { kind?: 'local' | 'remote'; connectionId?: string }
    ): Repository => ({
      id: buildRepositoryId(options?.kind ?? 'local', repoPath, {
        connectionId: options?.connectionId,
        platform:
          window.electronAPI.env.platform === 'win32'
            ? 'win32'
            : window.electronAPI.env.platform === 'darwin'
              ? 'darwin'
              : 'linux',
      }),
      name: getDisplayPathBasename(repoPath),
      path: repoPath,
      kind: options?.kind ?? 'local',
      connectionId: options?.connectionId,
      groupId: groupId || undefined,
    }),
    []
  );

  const findExistingRepository = useCallback(
    (candidate: Repository) =>
      repositories.find((repo) => repo.id === candidate.id || repo.path === candidate.path),
    [repositories]
  );

  const handleAddLocalRepository = useCallback(
    (selectedPath: string, groupId: string | null) => {
      const candidate = createRepositoryEntry(selectedPath, groupId);
      const existingRepo = findExistingRepository(candidate);
      if (existingRepo) {
        handleSelectRepo(existingRepo.path);
        return;
      }

      const updated = [...repositories, candidate];
      saveRepositories(updated);

      handleSelectRepo(candidate.path);
    },
    [
      createRepositoryEntry,
      findExistingRepository,
      handleSelectRepo,
      repositories,
      saveRepositories,
    ]
  );

  // Handle cloning a remote repository
  const handleCloneRepository = useCallback(
    (clonedPath: string, groupId: string | null) => {
      const candidate = createRepositoryEntry(clonedPath, groupId);
      const existingRepo = findExistingRepository(candidate);
      if (existingRepo) {
        handleSelectRepo(existingRepo.path);
        return;
      }

      const updated = [...repositories, candidate];
      saveRepositories(updated);

      handleSelectRepo(candidate.path);
    },
    [
      createRepositoryEntry,
      findExistingRepository,
      handleSelectRepo,
      repositories,
      saveRepositories,
    ]
  );

  const handleAddRemoteRepository = useCallback(
    async (remoteRepoPath: string, groupId: string | null, connectionId: string) => {
      const candidate = createRepositoryEntry(
        toRemoteVirtualPath(connectionId, remoteRepoPath),
        groupId,
        {
          kind: 'remote',
          connectionId,
        }
      );
      const existingRepo = findExistingRepository(candidate);
      if (existingRepo) {
        handleSelectRepo(existingRepo.path);
        return;
      }

      const updated = [...repositories, candidate];
      saveRepositories(updated);
      handleSelectRepo(candidate.path);
    },
    [
      createRepositoryEntry,
      findExistingRepository,
      handleSelectRepo,
      repositories,
      saveRepositories,
    ]
  );

  const handleOpenRepositoryDialog = useCallback(() => {
    setAddRepoDialogOpen(true);
  }, [setAddRepoDialogOpen]);

  const handleAddRepoDialogOpenChange = useCallback(
    (open: boolean) => {
      setAddRepoDialogOpen(open);
    },
    [setAddRepoDialogOpen]
  );

  const setPendingScript = useInitScriptStore((s) => s.setPendingScript);

  const handleCreateWorktree = async (options: WorktreeCreateOptions) => {
    if (!selectedRepo) return;
    try {
      await createWorktreeMutation.mutateAsync({
        workdir: selectedRepo,
        options,
      });

      const repoSettings = getRepositorySettings(selectedRepo);
      if (repoSettings.autoInitWorktree) {
        const newWorktreePath = options.path;
        const newWorktree: GitWorktree = {
          path: newWorktreePath,
          head: '',
          branch: options.newBranch || options.branch || null,
          isMainWorktree: false,
          isLocked: false,
          prunable: false,
        };

        handleSelectWorktree(newWorktree);

        if (repoSettings.initScript.trim()) {
          setPendingScript({
            worktreePath: newWorktreePath,
            script: repoSettings.initScript,
          });
          setActiveTab('terminal');
        }
      }
    } finally {
      refetchBranches();
    }
  };

  const handleRemoveWorktree = (
    worktree: GitWorktree,
    options?: { deleteBranch?: boolean; force?: boolean }
  ) => {
    if (!selectedRepo) return;

    // Show loading toast
    const toastId = toastManager.add({
      type: 'loading',
      title: t('Deleting...'),
      description: worktree.branch || getDisplayPath(worktree.path),
      timeout: 0,
    });

    // Execute deletion asynchronously (non-blocking)
    removeWorktreeMutation
      .mutateAsync({
        workdir: selectedRepo,
        options: {
          path: worktree.path,
          force: worktree.prunable || options?.force,
          deleteBranch: options?.deleteBranch,
          branch: worktree.branch || undefined,
        },
      })
      .then(() => {
        // Clear editor state for the removed worktree
        clearEditorWorktreeState(worktree.path);
        // Clear selection if the active worktree was removed
        if (activeWorktree?.path === worktree.path) {
          setActiveWorktree(null);
        }
        refetchBranches();

        // Show success toast
        toastManager.close(toastId);
        toastManager.add({
          type: 'success',
          title: t('Worktree deleted'),
          description: worktree.branch || getDisplayPath(worktree.path),
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const hasUncommitted = message.includes('modified or untracked');

        // Show error toast
        toastManager.close(toastId);
        toastManager.add({
          type: 'error',
          title: t('Delete failed'),
          description: hasUncommitted
            ? t('This directory contains uncommitted changes. Please check "Force delete".')
            : message,
        });
      });
  };

  const handleInitGit = async () => {
    if (!selectedRepo) return;
    try {
      await gitInitMutation.mutateAsync(selectedRepo);
      // Refresh worktrees and branches after init
      await refetch();
      await refetchBranches();
    } catch (error) {
      console.error('Failed to initialize git repository:', error);
    }
  };

  const handleMerge = async (options: WorktreeMergeOptions): Promise<WorktreeMergeResult> => {
    if (!selectedRepo) {
      return { success: false, merged: false, error: 'No repository selected' };
    }
    return mergeMutation.mutateAsync({ workdir: selectedRepo, options });
  };

  const handleMergeConflicts = (result: WorktreeMergeResult, options: WorktreeMergeOptions) => {
    setMergeDialogOpen(false); // Close merge dialog first
    setMergeConflicts(result);
    // Store the merge options for cleanup after conflict resolution
    setPendingMergeOptions({
      worktreePath: options.worktreePath,
      sourceBranch: mergeWorktree?.branch || '',
      deleteWorktreeAfterMerge: options.deleteWorktreeAfterMerge,
      deleteBranchAfterMerge: options.deleteBranchAfterMerge,
    });

    // Notify user if changes were stashed, with specific paths
    const stashedPaths: string[] = [];
    if (result.mainStashStatus === 'stashed' && result.mainWorktreePath) {
      stashedPaths.push(result.mainWorktreePath);
    }
    if (result.worktreeStashStatus === 'stashed' && result.worktreePath) {
      stashedPaths.push(result.worktreePath);
    }
    if (stashedPaths.length > 0) {
      toastManager.add({
        type: 'info',
        title: t('Changes stashed'),
        description:
          t(
            'Your uncommitted changes were stashed. After resolving conflicts, run "git stash pop" in:'
          ) +
          '\n' +
          stashedPaths.join('\n'),
      });
    }
  };

  const handleResolveConflict = async (file: string, content: string) => {
    if (!selectedRepo) return;
    await resolveConflictMutation.mutateAsync({
      workdir: selectedRepo,
      resolution: { file, content },
    });
  };

  const handleAbortMerge = async () => {
    if (!selectedRepo) return;
    await abortMergeMutation.mutateAsync({ workdir: selectedRepo });
    setMergeConflicts(null);
    setPendingMergeOptions(null);
    refetch();
  };

  const handleCompleteMerge = async (message: string) => {
    if (!selectedRepo) return;
    const result = await continueMergeMutation.mutateAsync({
      workdir: selectedRepo,
      message,
      cleanupOptions: pendingMergeOptions || undefined,
    });
    if (result.success) {
      // Show warnings if any (combined into a single toast)
      if (result.warnings && result.warnings.length > 0) {
        addToast({
          type: 'warning',
          title: t('Merge completed with warnings'),
          description: result.warnings.join('\n'),
        });
      }
      setMergeConflicts(null);
      setPendingMergeOptions(null);
      refetch();
      refetchBranches();
    }
  };

  const getConflictContent = async (file: string) => {
    if (!selectedRepo) throw new Error('No repository selected');
    return window.electronAPI.worktree.getConflictContent(selectedRepo, file);
  };

  useEffect(() => {
    const isSettingsOpen =
      (settingsDisplayMode === 'tab' && activeTab === 'settings') ||
      (settingsDisplayMode === 'draggable-modal' && settingsDialogOpen);

    if (!isSettingsOpen) return;
    if (!pendingProviderAction) return;

    const eventName =
      pendingProviderAction === 'preview'
        ? 'open-settings-provider-preview'
        : 'open-settings-provider-save';

    window.dispatchEvent(new CustomEvent(eventName));
    setPendingProviderAction(null);
  }, [
    settingsDisplayMode,
    settingsDialogOpen,
    activeTab,
    pendingProviderAction,
    setPendingProviderAction,
  ]);

  useBackgroundImage();

  return (
    <div className="relative z-0 flex h-screen flex-col overflow-hidden">
      <BackgroundLayer />
      {/* Custom Title Bar for Windows/Linux */}
      <WindowTitleBar onOpenSettings={openSettings} />

      {/* DevTools Overlay for macOS traffic lights protection */}
      <DevToolsOverlay />

      {/* Main Layout */}
      <div className={`flex flex-1 overflow-hidden ${resizing ? 'select-none' : ''}`}>
        {layoutMode === 'tree' ? (
          // Tree Layout: Single sidebar with repos as root nodes and worktrees as children
          <AnimatePresence initial={false}>
            {!repositoryCollapsed && (
              <motion.div
                ref={repositorySidebarRef}
                key="tree-sidebar"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: treeSidebarWidth, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={panelTransition}
                className="relative h-full shrink-0 overflow-hidden"
              >
                <TreeSidebar
                  repositories={repositories}
                  selectedRepo={selectedRepo}
                  activeWorktree={activeWorktree}
                  worktrees={sortedWorktrees}
                  branches={branches}
                  isLoading={worktreesLoading}
                  isCreating={createWorktreeMutation.isPending}
                  error={worktreeError}
                  onSelectRepo={handleSelectRepo}
                  canLoadRepo={(repoPath) => canLoadRepo(repoPath)}
                  onActivateRemoteRepo={activateRemoteRepo}
                  onSelectWorktree={handleSelectWorktree}
                  onAddRepository={handleOpenRepositoryDialog}
                  onRemoveRepository={handleRemoveRepository}
                  onCreateWorktree={handleCreateWorktree}
                  onRemoveWorktree={handleRemoveWorktree}
                  onMergeWorktree={handleOpenMergeDialog}
                  onReorderRepositories={handleReorderRepositories}
                  onReorderWorktrees={handleReorderWorktrees}
                  onRefresh={() => {
                    refetch();
                    refetchBranches();
                  }}
                  onInitGit={handleInitGit}
                  onOpenSettings={openSettings}
                  collapsed={false}
                  onCollapse={() => setRepositoryCollapsed(true)}
                  groups={sortedGroups}
                  activeGroupId={activeGroupId}
                  onSwitchGroup={handleSwitchGroup}
                  onCreateGroup={handleCreateGroup}
                  onUpdateGroup={handleUpdateGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onMoveToGroup={handleMoveToGroup}
                  onSwitchTab={setActiveTab}
                  onSwitchWorktreeByPath={handleSwitchWorktreePath}
                  temporaryWorkspaceEnabled={effectiveTemporaryWorkspaceEnabled}
                  tempWorkspaces={tempWorkspaces}
                  tempBasePath={tempBasePathDisplay}
                  onSelectTempWorkspace={handleSelectTempWorkspace}
                  onCreateTempWorkspace={handleCreateTempWorkspace}
                  onRequestTempRename={openTempRename}
                  onRequestTempDelete={openTempDelete}
                  toggleSelectedRepoExpandedRef={toggleSelectedRepoExpandedRef}
                  isSettingsActive={activeTab === 'settings'}
                  onToggleSettings={toggleSettings}
                  isFileDragOver={isFileDragOver}
                />
                {/* Resize handle */}
                <div
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
                  onMouseDown={handleResizeStart('repository')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          // Columns Layout: Separate repo sidebar and worktree panel
          <>
            {/* Column 1: Repository Sidebar */}
            <AnimatePresence initial={false}>
              {!repositoryCollapsed && (
                <motion.div
                  ref={repositorySidebarRef}
                  key="repository"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: repositoryWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={panelTransition}
                  className="relative h-full shrink-0 overflow-hidden"
                >
                  <RepositorySidebar
                    repositories={repositories}
                    selectedRepo={selectedRepo}
                    onSelectRepo={handleSelectRepo}
                    canLoadRepo={canLoadRepo}
                    onAddRepository={handleOpenRepositoryDialog}
                    onRemoveRepository={handleRemoveRepository}
                    onReorderRepositories={handleReorderRepositories}
                    onOpenSettings={openSettings}
                    collapsed={false}
                    onCollapse={() => setRepositoryCollapsed(true)}
                    groups={sortedGroups}
                    activeGroupId={activeGroupId}
                    onSwitchGroup={handleSwitchGroup}
                    onCreateGroup={handleCreateGroup}
                    onUpdateGroup={handleUpdateGroup}
                    onDeleteGroup={handleDeleteGroup}
                    onMoveToGroup={handleMoveToGroup}
                    onSwitchTab={setActiveTab}
                    onSwitchWorktreeByPath={handleSwitchWorktreePath}
                    isSettingsActive={activeTab === 'settings'}
                    onToggleSettings={toggleSettings}
                    isFileDragOver={isFileDragOver}
                    temporaryWorkspaceEnabled={effectiveTemporaryWorkspaceEnabled}
                    tempBasePath={tempBasePathDisplay}
                  />
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
                    onMouseDown={handleResizeStart('repository')}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Column 2: Worktree Panel */}
            <AnimatePresence initial={false}>
              {!worktreeCollapsed && (
                <motion.div
                  key="worktree"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: worktreeWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={panelTransition}
                  className="relative h-full shrink-0 overflow-hidden"
                >
                  {isTempRepo ? (
                    <TemporaryWorkspacePanel
                      items={tempWorkspaces}
                      activePath={activeWorktree?.path ?? null}
                      onSelect={(item) => handleSelectTempWorkspace(item.path)}
                      onCreate={handleCreateTempWorkspace}
                      onRequestRename={(id) => openTempRename(id)}
                      onRequestDelete={(id) => openTempDelete(id)}
                      onRefresh={rehydrateTempWorkspaces}
                      onCollapse={() => setWorktreeCollapsed(true)}
                    />
                  ) : (
                    <WorktreePanel
                      worktrees={sortedWorktrees}
                      activeWorktree={activeWorktree}
                      branches={branches}
                      projectName={selectedRepo ? getDisplayPathBasename(selectedRepo) : ''}
                      inactiveRemote={inactiveSelectedRemoteRepo}
                      remoteStatus={selectedRemoteStatus}
                      isLoading={worktreesLoading}
                      isCreating={createWorktreeMutation.isPending}
                      error={inactiveSelectedRemoteRepo ? null : worktreeError}
                      onSelectWorktree={handleSelectWorktree}
                      onCreateWorktree={handleCreateWorktree}
                      onRemoveWorktree={handleRemoveWorktree}
                      onMergeWorktree={handleOpenMergeDialog}
                      onReorderWorktrees={handleReorderWorktrees}
                      onInitGit={handleInitGit}
                      onRefresh={() => {
                        refetch();
                        refetchBranches();
                      }}
                      width={worktreeWidth}
                      collapsed={false}
                      onCollapse={() => setWorktreeCollapsed(true)}
                      repositoryCollapsed={repositoryCollapsed}
                      onExpandRepository={() => setRepositoryCollapsed(false)}
                    />
                  )}
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
                    onMouseDown={handleResizeStart('worktree')}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Main Content */}
        {fileTreeDisplayMode === 'current' && hasActiveWorktree && (
          <FileSidebar
            rootPath={activeWorktree?.path}
            isActive={activeTab === 'file'}
            width={fileSidebarWidth}
            collapsed={fileSidebarCollapsed}
            onCollapse={() => setFileSidebarCollapsed(true)}
            onResizeStart={handleResizeStart('fileSidebar')}
            onSwitchTab={() => handleTabChange('file')}
          />
        )}

        <MainContent
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabOrder={tabOrder}
          onTabReorder={handleReorderTabs}
          repoPath={selectedRepo || undefined}
          worktreePath={activeWorktree?.path}
          repositoryCollapsed={repositoryCollapsed}
          worktreeCollapsed={layoutMode === 'tree' ? repositoryCollapsed : worktreeCollapsed}
          fileSidebarCollapsed={
            fileTreeDisplayMode === 'current' && hasActiveWorktree ? fileSidebarCollapsed : false
          }
          layoutMode={layoutMode}
          onExpandRepository={() => setRepositoryCollapsed(false)}
          onExpandWorktree={
            layoutMode === 'tree'
              ? () => setRepositoryCollapsed(false)
              : () => setWorktreeCollapsed(false)
          }
          onExpandFileSidebar={
            fileTreeDisplayMode === 'current' && hasActiveWorktree
              ? () => setFileSidebarCollapsed(false)
              : undefined
          }
          onSwitchWorktree={handleSwitchWorktreePath}
          onSwitchTab={handleTabChange}
          isSettingsActive={
            (settingsDisplayMode === 'tab' && activeTab === 'settings') ||
            (settingsDisplayMode === 'draggable-modal' && settingsDialogOpen)
          }
          settingsCategory={settingsCategory}
          onCategoryChange={handleSettingsCategoryChange}
          scrollToProvider={scrollToProvider}
          onToggleSettings={toggleSettings}
        />

        <TempWorkspaceDialogs
          onConfirmDelete={handleRemoveTempWorkspace}
          onConfirmRename={renameTempWorkspace}
        />

        {/* Add Repository Dialog */}
        <AddRepositoryDialog
          open={addRepoDialogOpen}
          onOpenChange={handleAddRepoDialogOpenChange}
          groups={sortedGroups}
          defaultGroupId={activeGroupId === ALL_GROUP_ID ? null : activeGroupId}
          onAddLocal={handleAddLocalRepository}
          onCloneComplete={handleCloneRepository}
          onAddRemote={handleAddRemoteRepository}
          onCreateGroup={handleCreateGroup}
          initialLocalPath={initialLocalPath ?? undefined}
          onClearInitialLocalPath={() => setInitialLocalPath(null)}
        />

        {/* Action Panel */}
        <ActionPanel
          open={actionPanelOpen}
          onOpenChange={setActionPanelOpen}
          repositoryCollapsed={repositoryCollapsed}
          worktreeCollapsed={worktreeCollapsed}
          projectPath={activeWorktree?.path || selectedRepo || undefined}
          repositories={repositories}
          selectedRepoPath={selectedRepo ?? undefined}
          worktrees={worktrees}
          activeWorktreePath={activeWorktree?.path}
          onToggleRepository={() => setRepositoryCollapsed((prev) => !prev)}
          onToggleWorktree={() => setWorktreeCollapsed((prev) => !prev)}
          onOpenSettings={openSettings}
          onSwitchRepo={(repoPath) => handleSelectRepo(repoPath, { activateRemote: true })}
          onSwitchWorktree={handleSelectWorktree}
        />

        {/* Update Notification */}
        <UpdateNotification autoUpdateEnabled={autoUpdateEnabled} />

        {/* Unsaved Prompt Host */}
        <UnsavedPromptHost />

        {/* Remote SSH Auth Prompt Host */}
        <RemoteAuthPromptHost />

        {/* Close Confirmation Dialog */}
        <Dialog
          open={closeDialogOpen}
          onOpenChange={(open) => {
            setCloseDialogOpen(open);
            if (!open) {
              cancelCloseAndRespond();
            }
          }}
        >
          <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{t('Confirm exit')}</DialogTitle>
              <DialogDescription>{t('Are you sure you want to exit the app?')}</DialogDescription>
            </DialogHeader>
            <DialogFooter variant="bare">
              <Button
                variant="outline"
                onClick={() => {
                  setCloseDialogOpen(false);
                  cancelCloseAndRespond();
                }}
              >
                {t('Cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setCloseDialogOpen(false);
                  confirmCloseAndRespond();
                }}
              >
                {t('Exit')}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>

        {/* Merge Worktree Dialog */}
        {mergeWorktree && (
          <MergeWorktreeDialog
            open={mergeDialogOpen}
            onOpenChange={setMergeDialogOpen}
            worktree={mergeWorktree}
            branches={branches}
            isLoading={mergeMutation.isPending}
            onMerge={handleMerge}
            onConflicts={handleMergeConflicts}
            onSuccess={({ deletedWorktree }) => {
              if (deletedWorktree && mergeWorktree) {
                clearEditorWorktreeState(mergeWorktree.path);
                if (activeWorktree?.path === mergeWorktree.path) {
                  setActiveWorktree(null);
                }
              }
              refetch();
              refetchBranches();
            }}
          />
        )}

        {/* Merge Conflict Editor */}
        {mergeConflicts?.conflicts && mergeConflicts.conflicts.length > 0 && (
          <Dialog open={true} onOpenChange={() => {}}>
            <DialogPopup className="h-[90vh] max-w-[95vw] p-0" showCloseButton={false}>
              <MergeEditor
                conflicts={mergeConflicts.conflicts}
                workdir={selectedRepo || ''}
                sourceBranch={mergeWorktree?.branch || undefined}
                onResolve={handleResolveConflict}
                onComplete={handleCompleteMerge}
                onAbort={handleAbortMerge}
                getConflictContent={getConflictContent}
              />
            </DialogPopup>
          </Dialog>
        )}

        {/* Clone Progress Float - shows clone progress in bottom right corner */}
        <CloneProgressFloat onCloneComplete={handleCloneRepository} />

        {/* Draggable Settings Window (for draggable-modal mode) */}
        {settingsDisplayMode === 'draggable-modal' && (
          <DraggableSettingsWindow
            open={settingsDialogOpen}
            onOpenChange={setSettingsDialogOpen}
            activeCategory={settingsCategory}
            onCategoryChange={handleSettingsCategoryChange}
            scrollToProvider={scrollToProvider}
          />
        )}
      </div>
    </div>
  );
}
