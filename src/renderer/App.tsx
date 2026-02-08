import type {
  GitWorktree,
  WorktreeCreateOptions,
  WorktreeMergeCleanupOptions,
  WorktreeMergeOptions,
  WorktreeMergeResult,
} from '@shared/types';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { consumeClaudeProviderSwitch, isClaudeProviderMatch } from '@/lib/claudeProvider';
import { normalizeHexColor } from '@/lib/colors';
import {
  ALL_GROUP_ID,
  DEFAULT_GROUP_COLOR,
  generateGroupId,
  panelTransition,
  type Repository,
  type RepositoryGroup,
  type TabId,
  TEMP_REPO_ID,
} from './App/constants';
import {
  getActiveGroupId,
  getRepositorySettings,
  getStoredBoolean,
  getStoredGroups,
  getStoredTabMap,
  getStoredTabOrder,
  getStoredWorktreeMap,
  getStoredWorktreeOrderMap,
  migrateRepositoryGroups,
  pathsEqual,
  STORAGE_KEYS,
  saveActiveGroupId,
  saveGroups,
  saveTabOrder,
  saveWorktreeOrderMap,
} from './App/storage';
import { useAppKeyboardShortcuts } from './App/useAppKeyboardShortcuts';
import { usePanelResize } from './App/usePanelResize';
import { UnsavedPromptHost } from './components/files/UnsavedPromptHost';
import { AddRepositoryDialog } from './components/git';
import { CloneProgressFloat } from './components/git/CloneProgressFloat';
import { ActionPanel } from './components/layout/ActionPanel';
import { MainContent } from './components/layout/MainContent';
import { RepositorySidebar } from './components/layout/RepositorySidebar';
import { TemporaryWorkspacePanel } from './components/layout/TemporaryWorkspacePanel';
import { TreeSidebar } from './components/layout/TreeSidebar';
import { WindowTitleBar } from './components/layout/WindowTitleBar';
import { WorktreePanel } from './components/layout/WorktreePanel';
import type { SettingsCategory } from './components/settings/constants';
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
import { useEditor } from './hooks/useEditor';
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
import { useCodeReviewContinueStore } from './stores/codeReviewContinue';
import { useEditorStore } from './stores/editor';
import { useInitScriptStore } from './stores/initScript';
import { useNavigationStore } from './stores/navigation';
import { useSettingsStore } from './stores/settings';
import { useTempWorkspaceStore } from './stores/tempWorkspace';
import { requestUnsavedChoice } from './stores/unsavedPrompt';
import { useWorktreeStore } from './stores/worktree';
import { initAgentActivityListener, useWorktreeActivityStore } from './stores/worktreeActivity';

// Initialize global clone progress listener
initCloneProgressListener();

export default function App() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  // Initialize agent activity listener for tree sidebar status display
  useEffect(() => {
    return initAgentActivityListener();
  }, []);

  // Listen for auto-fetch completion events to refresh git status
  useAutoFetchListener();

  // Per-worktree tab state: { [worktreePath]: TabId }
  const [worktreeTabMap, setWorktreeTabMap] = useState<Record<string, TabId>>(getStoredTabMap);
  // Per-repo worktree state: { [repoPath]: worktreePath }
  const [repoWorktreeMap, setRepoWorktreeMap] =
    useState<Record<string, string>>(getStoredWorktreeMap);
  // Per-repo worktree display order: { [repoPath]: { [worktreePath]: displayOrder } }
  const [worktreeOrderMap, setWorktreeOrderMap] =
    useState<Record<string, Record<string, number>>>(getStoredWorktreeOrderMap);
  // Panel tab order: custom order of tabs
  const [tabOrder, setTabOrder] = useState<TabId[]>(getStoredTabOrder);
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [previousTab, setPreviousTab] = useState<TabId | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [activeWorktree, setActiveWorktree] = useState<GitWorktree | null>(null);
  const [groups, setGroups] = useState<RepositoryGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>(ALL_GROUP_ID);

  // Panel collapsed states - initialize from localStorage
  const [repositoryCollapsed, setRepositoryCollapsed] = useState(() =>
    getStoredBoolean(STORAGE_KEYS.REPOSITORY_COLLAPSED, false)
  );
  const [worktreeCollapsed, setWorktreeCollapsed] = useState(() =>
    getStoredBoolean(STORAGE_KEYS.WORKTREE_COLLAPSED, false)
  );

  // Ref to toggle selected repo expanded in tree layout
  const toggleSelectedRepoExpandedRef = useRef<(() => void) | null>(null);

  // Ref for cross-repo worktree switching (defined later)
  const switchWorktreePathRef = useRef<((path: string) => void) | null>(null);

  // Ref to track current worktree path for fetch race condition prevention
  const currentWorktreePathRef = useRef<string | null>(null);

  // Settings page state (used in MainContent)
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>(() => {
    try {
      const saved = localStorage.getItem('enso-settings-active-category');
      const validCategories: SettingsCategory[] = [
        'general',
        'appearance',
        'editor',
        'keybindings',
        'agent',
        'ai',
        'integration',
        'hapi',
      ];
      return saved && validCategories.includes(saved as SettingsCategory)
        ? (saved as SettingsCategory)
        : 'general';
    } catch {
      return 'general';
    }
  });
  const [scrollToProvider, setScrollToProvider] = useState(false);
  const [pendingProviderAction, setPendingProviderAction] = useState<'preview' | 'save' | null>(
    null
  );

  // 持久化状态变更
  useEffect(() => {
    try {
      localStorage.setItem('enso-settings-active-category', settingsCategory);
    } catch (error) {
      console.warn('Failed to save settings category:', error);
    }
  }, [settingsCategory]);

  // Global drag-and-drop for repository sidebar
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const repositorySidebarRef = useRef<HTMLDivElement>(null);
  const isFileDragOverRef = useRef(false);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    isFileDragOverRef.current = isFileDragOver;
  }, [isFileDragOver]);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      // Check if over sidebar
      const el = repositorySidebarRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const over =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        setIsFileDragOver(over);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.clientX <= 0 || e.clientY <= 0) {
        setIsFileDragOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const wasOver = isFileDragOverRef.current;
      setIsFileDragOver(false);

      if (wasOver && e.dataTransfer?.files.length) {
        const file = e.dataTransfer.files[0];
        const path = window.electronAPI.utils.getPathForFile(file);
        if (path) {
          setInitialLocalPath(path);
          setAddRepoDialogOpen(true);
        }
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, []);

  // 创建回调函数
  const handleSettingsCategoryChange = useCallback((category: SettingsCategory) => {
    setSettingsCategory(category);
  }, []);

  // Add Repository dialog state
  const [addRepoDialogOpen, setAddRepoDialogOpen] = useState(false);
  const [initialLocalPath, setInitialLocalPath] = useState<string | null>(null);

  // Action panel state
  const [actionPanelOpen, setActionPanelOpen] = useState(false);

  // Settings dialog state (for draggable-modal mode)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  // Track previous settingsDisplayMode to detect actual changes (not just initialization)
  const prevSettingsDisplayModeRef = useRef<typeof settingsDisplayMode | null>(null);

  // Close confirmation dialog state (legacy)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  // Merge dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeWorktree, setMergeWorktree] = useState<GitWorktree | null>(null);
  const [mergeConflicts, setMergeConflicts] = useState<WorktreeMergeResult | null>(null);
  const [pendingMergeOptions, setPendingMergeOptions] = useState<
    | (Required<Pick<WorktreeMergeCleanupOptions, 'worktreePath' | 'sourceBranch'>> &
        Pick<WorktreeMergeCleanupOptions, 'deleteWorktreeAfterMerge' | 'deleteBranchAfterMerge'>)
    | null
  >(null);

  // Layout mode from settings
  const layoutMode = useSettingsStore((s) => s.layoutMode);
  const autoUpdateEnabled = useSettingsStore((s) => s.autoUpdateEnabled);
  const editorSettings = useSettingsStore((s) => s.editorSettings);
  const settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const hideGroups = useSettingsStore((s) => s.hideGroups);
  const temporaryWorkspaceEnabled = useSettingsStore((s) => s.temporaryWorkspaceEnabled);
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

  // Panel resize hook
  const { repositoryWidth, worktreeWidth, treeSidebarWidth, resizing, handleResizeStart } =
    usePanelResize(layoutMode);

  const worktreeError = useWorktreeStore((s) => s.error);
  const switchEditorWorktree = useEditorStore((s) => s.switchWorktree);
  const clearEditorWorktreeState = useEditorStore((s) => s.clearWorktreeState);
  const tempWorkspaces = useTempWorkspaceStore((s) => s.items);
  const addTempWorkspace = useTempWorkspaceStore((s) => s.addItem);
  const removeTempWorkspace = useTempWorkspaceStore((s) => s.removeItem);
  const renameTempWorkspace = useTempWorkspaceStore((s) => s.renameItem);
  const rehydrateTempWorkspaces = useTempWorkspaceStore((s) => s.rehydrate);
  const openTempRename = useTempWorkspaceStore((s) => s.openRename);
  const openTempDelete = useTempWorkspaceStore((s) => s.openDelete);

  // Navigation store for terminal -> editor file navigation
  const { pendingNavigation, clearNavigation } = useNavigationStore();
  const { navigateToFile } = useEditor();

  const openSettings = useCallback(() => {
    if (settingsDisplayMode === 'tab') {
      if (activeTab !== 'settings') {
        setPreviousTab(activeTab);
        setActiveTab('settings');
      }
    } else {
      setSettingsDialogOpen(true);
    }
  }, [settingsDisplayMode, activeTab]);

  // Toggle settings page
  const toggleSettings = useCallback(() => {
    if (settingsDisplayMode === 'tab') {
      // Tab mode: toggle between settings and previous tab
      if (activeTab === 'settings') {
        setActiveTab(previousTab || 'chat');
        setPreviousTab(null);
      } else {
        setPreviousTab(activeTab);
        setActiveTab('settings');
      }
    } else {
      // Draggable-modal mode: toggle dialog
      setSettingsDialogOpen((prev) => !prev);
    }
  }, [settingsDisplayMode, activeTab, previousTab]);

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
    [activeTab, activeWorktree]
  );

  // Clean up settings state when display mode changes and open settings in new mode
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only trigger on display mode change, not on activeTab/previousTab change
  useEffect(() => {
    // Only trigger when settingsDisplayMode actually changes (not on initial mount or rehydration)
    const prevMode = prevSettingsDisplayModeRef.current;
    prevSettingsDisplayModeRef.current = settingsDisplayMode;

    // Skip if this is the first run (prevMode is null) - no mode switch happened
    if (prevMode === null) {
      return;
    }

    // Skip if the mode hasn't actually changed
    if (prevMode === settingsDisplayMode) {
      return;
    }

    if (settingsDisplayMode === 'tab') {
      // Switching to tab mode: close dialog and open settings tab
      setSettingsDialogOpen(false);
      // Open settings tab if not already active
      if (activeTab !== 'settings') {
        setPreviousTab(activeTab);
        setActiveTab('settings');
      }
    } else {
      // Switching to draggable-modal mode: exit settings tab and open modal
      if (activeTab === 'settings') {
        setActiveTab(previousTab || 'chat');
        setPreviousTab(null);
      }
      // Open modal
      setSettingsDialogOpen(true);
    }
  }, [settingsDisplayMode]);

  // Listen for 'open-settings-provider' event from SessionBar
  useEffect(() => {
    const handleOpenSettingsProvider = () => {
      setSettingsCategory('integration');
      setScrollToProvider(true);
      openSettings();
    };

    window.addEventListener('open-settings-provider', handleOpenSettingsProvider);
    return () => {
      window.removeEventListener('open-settings-provider', handleOpenSettingsProvider);
    };
  }, [openSettings]);

  // Listen for 'open-settings-agent' event from SessionBar/AgentPanel
  useEffect(() => {
    const handleOpenSettingsAgent = () => {
      setSettingsCategory('agent');
      openSettings();
    };

    window.addEventListener('open-settings-agent', handleOpenSettingsAgent);
    return () => {
      window.removeEventListener('open-settings-agent', handleOpenSettingsAgent);
    };
  }, [openSettings]);

  // Keyboard shortcuts
  useAppKeyboardShortcuts({
    activeWorktreePath: activeWorktree?.path,
    onTabSwitch: handleTabChange,
    onActionPanelToggle: useCallback(() => setActionPanelOpen((prev) => !prev), []),
    onToggleWorktree: useCallback(() => {
      // In tree layout, toggle selected repo expanded; in columns layout, toggle worktree panel
      if (layoutMode === 'tree') {
        toggleSelectedRepoExpandedRef.current?.();
      } else {
        setWorktreeCollapsed((prev) => !prev);
      }
    }, [layoutMode]),
    onToggleRepository: useCallback(() => setRepositoryCollapsed((prev) => !prev), []),
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
    }, [activeWorktree?.path]),
  });

  // Web Inspector: listen for element inspection data and write to active agent terminal
  useWebInspector(activeWorktree?.path, selectedRepo ?? undefined);

  // Handle terminal file link navigation
  useEffect(() => {
    if (!pendingNavigation) return;

    const { path, line, column, previewMode } = pendingNavigation;

    // Open the file and set cursor position, passing previewMode for markdown files
    navigateToFile(path, line, column, undefined, previewMode);

    // Switch to file tab and update worktree tab map
    setActiveTab('file');
    if (activeWorktree?.path) {
      setWorktreeTabMap((prev) => ({
        ...prev,
        [activeWorktree.path]: 'file',
      }));
    }

    // Clear the navigation request
    clearNavigation();
  }, [pendingNavigation, navigateToFile, clearNavigation, activeWorktree]);

  // Listen for menu actions from main process
  useEffect(() => {
    const cleanup = window.electronAPI.menu.onAction((action) => {
      switch (action) {
        case 'open-settings':
          openSettings();
          break;
        case 'open-action-panel':
          setActionPanelOpen(true);
          break;
      }
    });
    return cleanup;
  }, [openSettings]);

  // Listen for close request from main process (native dialogs are shown in main)
  useEffect(() => {
    const cleanup = window.electronAPI.app.onCloseRequest((requestId) => {
      const state = useEditorStore.getState();
      const editorSettings = useSettingsStore.getState().editorSettings;

      const allTabs = [
        ...state.tabs,
        ...Object.values(state.worktreeStates).flatMap((s) => s.tabs),
      ];

      const dirtyPaths =
        editorSettings.autoSave === 'off'
          ? Array.from(new Set(allTabs.filter((t) => t.isDirty).map((t) => t.path)))
          : [];

      window.electronAPI.app.respondCloseRequest(requestId, { dirtyPaths });
    });
    return cleanup;
  }, []);

  // Main process asks renderer to save a specific dirty file before closing.
  useEffect(() => {
    const cleanup = window.electronAPI.app.onCloseSaveRequest(async (requestId, path) => {
      try {
        const state = useEditorStore.getState();
        const allTabs = [
          ...state.tabs,
          ...Object.values(state.worktreeStates).flatMap((s) => s.tabs),
        ];
        const tab = allTabs.find((t) => t.path === path);
        if (!tab) {
          window.electronAPI.app.respondCloseSaveRequest(requestId, {
            ok: false,
            error: 'File not found in editor tabs',
          });
          return;
        }

        await window.electronAPI.file.write(path, tab.content, tab.encoding);
        useEditorStore.getState().markFileSaved(path);

        window.electronAPI.app.respondCloseSaveRequest(requestId, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        window.electronAPI.app.respondCloseSaveRequest(requestId, { ok: false, error: message });
      }
    });
    return cleanup;
  }, []);

  // Listen for Claude Provider settings change (from cc-switch or other tools)
  const claudeProviders = useSettingsStore((s) => s.claudeCodeIntegration.providers);
  const providerToastRef = useRef<ReturnType<typeof toastManager.add> | null>(null);
  useEffect(() => {
    const cleanup = window.electronAPI.claudeProvider.onSettingsChanged((data) => {
      const { extracted } = data;
      if (!extracted?.baseUrl) return;

      if (consumeClaudeProviderSwitch(extracted)) {
        return;
      }

      // Close previous provider toast if exists
      if (providerToastRef.current) {
        toastManager.close(providerToastRef.current);
      }

      // Check if the new config matches any saved provider
      const matched = claudeProviders.find((p) => isClaudeProviderMatch(p, extracted));

      if (matched) {
        // Switched to a known provider
        providerToastRef.current = toastManager.add({
          type: 'info',
          title: t('Provider switched'),
          description: matched.name,
        });
      } else {
        // New unsaved config detected
        providerToastRef.current = addToast({
          type: 'info',
          title: t('New provider detected'),
          description: t('Click to save this config'),
          actions: [
            {
              label: t('Preview'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
                setPendingProviderAction('preview');
              },
              variant: 'ghost',
            },
            {
              label: t('Save'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
                setPendingProviderAction('save');
              },
              variant: 'outline',
            },
            {
              label: t('Open Settings'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
              },
            },
          ],
        });
      }
    });

    // Cleanup: close toast and unsubscribe on unmount
    return () => {
      if (providerToastRef.current) {
        toastManager.close(providerToastRef.current);
        providerToastRef.current = null;
      }
      cleanup();
    };
  }, [claudeProviders, t, openSettings]);

  // Save collapsed states to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REPOSITORY_COLLAPSED, String(repositoryCollapsed));
  }, [repositoryCollapsed]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKTREE_COLLAPSED, String(worktreeCollapsed));
  }, [worktreeCollapsed]);

  useEffect(() => {
    if (!temporaryWorkspaceEnabled && selectedRepo === TEMP_REPO_ID) {
      setSelectedRepo(repositories[0]?.path ?? null);
    }
  }, [temporaryWorkspaceEnabled, selectedRepo, repositories]);

  useEffect(() => {
    if (selectedRepo !== TEMP_REPO_ID || !activeWorktree?.path) return;
    const exists = tempWorkspaces.some((item) => item.path === activeWorktree.path);
    if (!exists) {
      setActiveWorktree(null);
    }
  }, [selectedRepo, activeWorktree?.path, tempWorkspaces]);

  // Persist worktree tab map to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKTREE_TABS, JSON.stringify(worktreeTabMap));
  }, [worktreeTabMap]);

  // Persist panel tab order to localStorage
  useEffect(() => {
    saveTabOrder(tabOrder);
  }, [tabOrder]);

  const isTempRepo = selectedRepo === TEMP_REPO_ID;
  const worktreeRepoPath = isTempRepo ? null : selectedRepo;

  // Get worktrees for selected repo (used in columns mode)
  const {
    data: worktrees = [],
    isLoading: worktreesLoading,
    isFetching: worktreesFetching,
    refetch,
  } = useWorktreeList(worktreeRepoPath);

  // Get branches for selected repo
  const { data: branches = [], refetch: refetchBranches } = useGitBranches(worktreeRepoPath);

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
    migrateRepositoryGroups();
    rehydrateTempWorkspaces();

    const savedGroups = getStoredGroups();
    setGroups(savedGroups);
    setActiveGroupId(getActiveGroupId());

    const validGroupIds = new Set(savedGroups.map((g) => g.id));

    const savedRepos = localStorage.getItem(STORAGE_KEYS.REPOSITORIES);
    if (savedRepos) {
      try {
        let parsed = JSON.parse(savedRepos) as Repository[];
        let needsMigration = false;
        parsed = parsed.map((repo) => {
          if (repo.name.includes('/') || repo.name.includes('\\')) {
            needsMigration = true;
            const fixedName = repo.path.split(/[\\/]/).pop() || repo.path;
            return { ...repo, name: fixedName };
          }
          if (repo.groupId && !validGroupIds.has(repo.groupId)) {
            needsMigration = true;
            return { ...repo, groupId: undefined };
          }
          return repo;
        });
        if (needsMigration) {
          localStorage.setItem(STORAGE_KEYS.REPOSITORIES, JSON.stringify(parsed));
        }
        setRepositories(parsed);
      } catch {
        // ignore
      }
    }

    const savedSelectedRepo = localStorage.getItem(STORAGE_KEYS.SELECTED_REPO);
    if (savedSelectedRepo) {
      setSelectedRepo(savedSelectedRepo);
    }

    // Migration: convert old single worktree to per-repo map
    const oldWorktreePath = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKTREE);
    const savedWorktreeMap = getStoredWorktreeMap();
    if (oldWorktreePath && savedSelectedRepo && !savedWorktreeMap[savedSelectedRepo]) {
      // Migrate old data to new format
      const migrated = { ...savedWorktreeMap, [savedSelectedRepo]: oldWorktreePath };
      localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(migrated));
      setRepoWorktreeMap(migrated);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKTREE);
    }

    // Restore worktree for selected repo
    const worktreeMap = getStoredWorktreeMap();
    const savedWorktreePath = savedSelectedRepo ? worktreeMap[savedSelectedRepo] : null;
    if (savedWorktreePath) {
      // Wait for worktrees to load before setting active worktree.
      setActiveWorktree({ path: savedWorktreePath } as GitWorktree);
    }
  }, [rehydrateTempWorkspaces]);

  const saveRepositories = useCallback((repos: Repository[]) => {
    localStorage.setItem(STORAGE_KEYS.REPOSITORIES, JSON.stringify(repos));
    setRepositories(repos);
  }, []);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.order - b.order);
  }, [groups]);

  const handleCreateGroup = useCallback(
    (name: string, emoji: string, color: string) => {
      const normalizedColor = normalizeHexColor(color, DEFAULT_GROUP_COLOR);
      const newGroup: RepositoryGroup = {
        id: generateGroupId(),
        name: name.trim(),
        emoji,
        color: normalizedColor,
        order: groups.length,
      };
      const updated = [...groups, newGroup];
      setGroups(updated);
      saveGroups(updated);
      return newGroup;
    },
    [groups]
  );

  const handleUpdateGroup = useCallback(
    (groupId: string, name: string, emoji: string, color: string) => {
      const normalizedColor = normalizeHexColor(color, DEFAULT_GROUP_COLOR);
      const updated = groups.map((g) =>
        g.id === groupId ? { ...g, name: name.trim(), emoji, color: normalizedColor } : g
      );
      setGroups(updated);
      saveGroups(updated);
    },
    [groups]
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      const updatedGroups = groups
        .filter((g) => g.id !== groupId)
        .map((g, i) => ({ ...g, order: i }));
      setGroups(updatedGroups);
      saveGroups(updatedGroups);

      const updatedRepos = repositories.map((r) =>
        r.groupId === groupId ? { ...r, groupId: undefined } : r
      );
      saveRepositories(updatedRepos);

      if (activeGroupId === groupId) {
        setActiveGroupId(ALL_GROUP_ID);
        saveActiveGroupId(ALL_GROUP_ID);
      }
    },
    [groups, repositories, saveRepositories, activeGroupId]
  );

  const handleSwitchGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    saveActiveGroupId(groupId);
  }, []);

  // Auto-switch to ALL when hideGroups is enabled
  useEffect(() => {
    if (hideGroups && activeGroupId !== ALL_GROUP_ID) {
      setActiveGroupId(ALL_GROUP_ID);
      saveActiveGroupId(ALL_GROUP_ID);
    }
  }, [hideGroups, activeGroupId]);

  const handleMoveToGroup = useCallback(
    (repoPath: string, targetGroupId: string | null) => {
      const updated = repositories.map((r) =>
        r.path === repoPath ? { ...r, groupId: targetGroupId || undefined } : r
      );
      saveRepositories(updated);
    },
    [repositories, saveRepositories]
  );

  // Reorder repositories
  const handleReorderRepositories = useCallback(
    (fromIndex: number, toIndex: number) => {
      const reordered = [...repositories];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      saveRepositories(reordered);
    },
    [repositories, saveRepositories]
  );

  // Reorder worktrees (update display order)
  const handleReorderWorktrees = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!selectedRepo) return;

      // Get current order for this repo
      const currentRepoOrder = worktreeOrderMap[selectedRepo] || {};

      // Sort worktrees by current display order to get the visual order
      const sortedWorktrees = [...worktrees].sort((a, b) => {
        const orderA = currentRepoOrder[a.path] ?? Number.MAX_SAFE_INTEGER;
        const orderB = currentRepoOrder[b.path] ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });

      // Build new order
      const orderedPaths = sortedWorktrees.map((wt) => wt.path);
      const [movedPath] = orderedPaths.splice(fromIndex, 1);
      orderedPaths.splice(toIndex, 0, movedPath);

      // Create new order map for this repo
      const newRepoOrder: Record<string, number> = {};
      for (let i = 0; i < orderedPaths.length; i++) {
        newRepoOrder[orderedPaths[i]] = i;
      }

      const newOrderMap = { ...worktreeOrderMap, [selectedRepo]: newRepoOrder };
      setWorktreeOrderMap(newOrderMap);
      saveWorktreeOrderMap(newOrderMap);
    },
    [selectedRepo, worktrees, worktreeOrderMap]
  );

  // Reorder panel tabs
  const handleReorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabOrder((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // Sort worktrees by display order for the current repo
  const sortedWorktrees = selectedRepo
    ? [...worktrees].sort((a, b) => {
        const repoOrder = worktreeOrderMap[selectedRepo] || {};
        const orderA = repoOrder[a.path] ?? Number.MAX_SAFE_INTEGER;
        const orderB = repoOrder[b.path] ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      })
    : worktrees;

  // Listen for open path event from CLI (enso command)
  useEffect(() => {
    const cleanup = window.electronAPI.app.onOpenPath((rawPath) => {
      // Normalize the path: remove trailing slashes and any stray quotes (Windows CMD issue)
      const path = rawPath.replace(/[\\/]+$/, '').replace(/^["']|["']$/g, '');
      // Check if repo already exists (using path comparison that handles Windows case-insensitivity)
      const existingRepo = repositories.find((r) => pathsEqual(r.path, path));
      if (existingRepo) {
        setSelectedRepo(existingRepo.path);
      } else {
        // Handle both forward and back slashes for name extraction
        const name = path.split(/[\\/]/).pop() || path;
        const newRepo: Repository = { name, path };
        const updated = [...repositories, newRepo];
        saveRepositories(updated);
        setSelectedRepo(path);
      }
    });
    return cleanup;
  }, [repositories, saveRepositories]);

  // Remove repository from workspace
  const handleRemoveRepository = useCallback(
    (repoPath: string) => {
      const updated = repositories.filter((r) => r.path !== repoPath);
      saveRepositories(updated);
      // Clear selection if removed repo was selected
      if (selectedRepo === repoPath) {
        setSelectedRepo(null);
        setActiveWorktree(null);
      }
    },
    [repositories, saveRepositories, selectedRepo]
  );

  // Save selected repo to localStorage
  useEffect(() => {
    if (selectedRepo) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_REPO, selectedRepo);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_REPO);
    }
  }, [selectedRepo]);

  // Save active worktree to per-repo map
  useEffect(() => {
    if (selectedRepo && activeWorktree) {
      setRepoWorktreeMap((prev) => {
        const updated = { ...prev, [selectedRepo]: activeWorktree.path };
        localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(updated));
        return updated;
      });
    } else if (selectedRepo && !activeWorktree) {
      setRepoWorktreeMap((prev) => {
        const updated = { ...prev };
        delete updated[selectedRepo];
        localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(updated));
        return updated;
      });
    }
  }, [selectedRepo, activeWorktree]);

  // Sync editor state with active worktree
  const currentEditorWorktree = useEditorStore((s) => s.currentWorktreePath);
  useEffect(() => {
    const targetPath = activeWorktree?.path ?? null;
    if (targetPath !== currentEditorWorktree) {
      switchEditorWorktree(targetPath);
    }
  }, [activeWorktree, currentEditorWorktree, switchEditorWorktree]);

  // Sync Claude IDE Bridge with active worktree
  const claudeCodeIntegration = useSettingsStore((s) => s.claudeCodeIntegration);
  useEffect(() => {
    if (claudeCodeIntegration.enabled) {
      const folders = activeWorktree ? [activeWorktree.path] : [];
      window.electronAPI.mcp.setEnabled(true, folders);
    } else {
      window.electronAPI.mcp.setEnabled(false);
    }
  }, [claudeCodeIntegration.enabled, activeWorktree]);

  // Sync Stop hook setting with Claude Code
  useEffect(() => {
    window.electronAPI.mcp.setStopHookEnabled(claudeCodeIntegration.stopHookEnabled);
  }, [claudeCodeIntegration.stopHookEnabled]);

  // Sync Status Line hook setting with Claude Code
  useEffect(() => {
    window.electronAPI.mcp.setStatusLineHookEnabled(claudeCodeIntegration.statusLineEnabled);
  }, [claudeCodeIntegration.statusLineEnabled]);

  // Sync PermissionRequest hook setting with Claude Code (for AskUserQuestion notifications)
  useEffect(() => {
    window.electronAPI.mcp.setPermissionRequestHookEnabled(
      claudeCodeIntegration.permissionRequestHookEnabled
    );
  }, [claudeCodeIntegration.permissionRequestHookEnabled]);

  // Listen for code review continue conversation request
  const shouldSwitchToChatTab = useCodeReviewContinueStore(
    (s) => s.continueConversation.shouldSwitchToChatTab
  );
  const clearChatTabSwitch = useCodeReviewContinueStore((s) => s.clearChatTabSwitch);
  useEffect(() => {
    if (shouldSwitchToChatTab && activeWorktree) {
      handleTabChange('chat');
      clearChatTabSwitch();
    }
  }, [shouldSwitchToChatTab, activeWorktree, clearChatTabSwitch, handleTabChange]);

  // Sync activeWorktree with loaded worktrees data
  useEffect(() => {
    if (worktrees.length > 0 && activeWorktree) {
      const found = worktrees.find((wt) => wt.path === activeWorktree.path);
      if (found && found !== activeWorktree) {
        setActiveWorktree(found);
      } else if (!found && !worktreesFetching) {
        setActiveWorktree(null);
      }
    }
  }, [worktrees, activeWorktree, worktreesFetching]);

  const handleSelectRepo = (repoPath: string) => {
    // Save current worktree's tab state before switching
    if (activeWorktree?.path) {
      setWorktreeTabMap((prev) => ({
        ...prev,
        [activeWorktree.path]: activeTab,
      }));
    }

    setSelectedRepo(repoPath);
    // Restore previously selected worktree for this repo
    const savedWorktreePath = repoWorktreeMap[repoPath];
    if (savedWorktreePath) {
      // Set temporary worktree with just the path; full object synced after worktrees load
      setActiveWorktree({ path: savedWorktreePath } as GitWorktree);
      // Restore the tab state for this worktree
      const savedTab = worktreeTabMap[savedWorktreePath] || 'chat';
      setActiveTab(savedTab);
    } else {
      setActiveWorktree(null);
      setActiveTab('chat');
    }
    // Editor state will be synced by useEffect
  };

  // Helper function to refresh git data for a worktree
  const refreshGitData = useCallback(
    (worktreePath: string) => {
      // Update ref to track current worktree for race condition prevention
      currentWorktreePathRef.current = worktreePath;

      // Immediately refresh local git data
      const localKeys = [
        'status',
        'file-changes',
        'file-diff',
        'log',
        'log-infinite',
        'submodules',
      ];
      for (const key of localKeys) {
        queryClient.invalidateQueries({ queryKey: ['git', key, worktreePath] });
      }
      queryClient.invalidateQueries({ queryKey: ['git', 'submodule', 'changes', worktreePath] });

      // Fetch remote then refresh branch data (with race condition check)
      window.electronAPI.git
        .fetch(worktreePath)
        .then(() => {
          // Only refresh if this is still the current worktree
          if (currentWorktreePathRef.current === worktreePath) {
            queryClient.invalidateQueries({ queryKey: ['git', 'branches', worktreePath] });
            queryClient.invalidateQueries({ queryKey: ['git', 'status', worktreePath] });
          }
        })
        .catch(() => {
          // Silent fail - fetch errors are not critical
        });
    },
    [queryClient]
  );

  const handleSelectWorktree = useCallback(
    async (worktree: GitWorktree, nextRepoPath?: string) => {
      if (editorSettings.autoSave === 'off') {
        const editorState = useEditorStore.getState();
        const dirtyTabs = editorState.tabs.filter((tab) => tab.isDirty);

        for (const tab of dirtyTabs) {
          const fileName = tab.path.split(/[/\\\\]/).pop() ?? tab.path;
          const choice = await requestUnsavedChoice(fileName);

          if (choice === 'cancel') {
            return;
          }

          if (choice === 'save') {
            try {
              await window.electronAPI.file.write(tab.path, tab.content, tab.encoding);
              useEditorStore.getState().markFileSaved(tab.path);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              toastManager.add({
                type: 'error',
                title: t('Save failed'),
                description: message,
              });
              return;
            }
          } else {
            try {
              const { content } = await window.electronAPI.file.read(tab.path);
              useEditorStore.getState().updateFileContent(tab.path, content, false);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              toastManager.add({
                type: 'error',
                title: t('File read failed'),
                description: message,
              });
              return;
            }
          }
        }
      }

      if (nextRepoPath && nextRepoPath !== selectedRepo) {
        setSelectedRepo(nextRepoPath);
      }

      // Save current worktree's tab state before switching
      if (activeWorktree?.path) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: activeTab,
        }));
      }

      // Switch to new worktree (editor state will be synced by useEffect)
      setActiveWorktree(worktree);

      // Restore the new worktree's tab state (default to 'chat')
      const savedTab = worktreeTabMap[worktree.path] || 'chat';
      setActiveTab(savedTab);

      // Refresh git data for the new worktree
      refreshGitData(worktree.path);
    },
    [
      activeWorktree,
      activeTab,
      worktreeTabMap,
      editorSettings.autoSave,
      t,
      refreshGitData,
      selectedRepo,
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
        try {
          const repoWorktrees = await window.electronAPI.worktree.list(repo.path);
          const found = repoWorktrees.find((wt) => wt.path === worktreePath);
          if (found) {
            setSelectedRepo(repo.path);
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
    [tempWorkspaces, worktrees, repositories, worktreeTabMap, handleSelectWorktree, refreshGitData]
  );

  // Assign to ref for use in keyboard shortcut callback
  switchWorktreePathRef.current = handleSwitchWorktreePath;

  // Open add repository dialog
  const handleAddRepository = () => {
    setAddRepoDialogOpen(true);
  };

  // Handle adding a local repository
  const handleAddLocalRepository = useCallback(
    (selectedPath: string, groupId: string | null) => {
      // Check if repo already exists
      if (repositories.some((r) => r.path === selectedPath)) {
        return;
      }

      // Extract repo name from path (handle both / and \ for Windows compatibility)
      const name = selectedPath.split(/[\\/]/).pop() || selectedPath;

      const newRepo: Repository = {
        name,
        path: selectedPath,
        groupId: groupId || undefined,
      };

      const updated = [...repositories, newRepo];
      saveRepositories(updated);

      // Auto-select the new repo
      setSelectedRepo(selectedPath);
    },
    [repositories, saveRepositories]
  );

  // Handle cloning a remote repository
  const handleCloneRepository = useCallback(
    (clonedPath: string, groupId: string | null) => {
      // Check if repo already exists
      if (repositories.some((r) => r.path === clonedPath)) {
        setSelectedRepo(clonedPath);
        return;
      }

      // Extract repo name from path
      const name = clonedPath.split(/[\\/]/).pop() || clonedPath;

      const newRepo: Repository = {
        name,
        path: clonedPath,
        groupId: groupId || undefined,
      };

      const updated = [...repositories, newRepo];
      saveRepositories(updated);

      // Auto-select the new repo
      setSelectedRepo(clonedPath);
    },
    [repositories, saveRepositories]
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
      description: worktree.branch || worktree.path,
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
          description: worktree.branch || worktree.path,
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

  // Merge handlers
  const handleOpenMergeDialog = (worktree: GitWorktree) => {
    setMergeWorktree(worktree);
    setMergeDialogOpen(true);
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
  }, [settingsDisplayMode, settingsDialogOpen, activeTab, pendingProviderAction]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Custom Title Bar for Windows/Linux */}
      <WindowTitleBar onOpenSettings={openSettings} />

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
                  onSelectWorktree={handleSelectWorktree}
                  onAddRepository={handleAddRepository}
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
                  temporaryWorkspaceEnabled={temporaryWorkspaceEnabled}
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
                    onAddRepository={handleAddRepository}
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
                    temporaryWorkspaceEnabled={temporaryWorkspaceEnabled}
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
                      projectName={selectedRepo?.split(/[\\/]/).pop() || ''}
                      isLoading={worktreesLoading}
                      isCreating={createWorktreeMutation.isPending}
                      error={worktreeError}
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
        <MainContent
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabOrder={tabOrder}
          onTabReorder={handleReorderTabs}
          repoPath={selectedRepo || undefined}
          worktreePath={activeWorktree?.path}
          repositoryCollapsed={repositoryCollapsed}
          worktreeCollapsed={layoutMode === 'tree' ? repositoryCollapsed : worktreeCollapsed}
          layoutMode={layoutMode}
          onExpandRepository={() => setRepositoryCollapsed(false)}
          onExpandWorktree={
            layoutMode === 'tree'
              ? () => setRepositoryCollapsed(false)
              : () => setWorktreeCollapsed(false)
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
          onOpenChange={setAddRepoDialogOpen}
          groups={sortedGroups}
          defaultGroupId={activeGroupId === ALL_GROUP_ID ? null : activeGroupId}
          onAddLocal={handleAddLocalRepository}
          onCloneComplete={handleCloneRepository}
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
          onSwitchRepo={handleSelectRepo}
          onSwitchWorktree={handleSelectWorktree}
        />

        {/* Update Notification */}
        <UpdateNotification autoUpdateEnabled={autoUpdateEnabled} />

        {/* Unsaved Prompt Host */}
        <UnsavedPromptHost />

        {/* Close Confirmation Dialog */}
        <Dialog
          open={closeDialogOpen}
          onOpenChange={(open) => {
            setCloseDialogOpen(open);
            if (!open) {
              window.electronAPI.app.confirmClose(false);
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
                  window.electronAPI.app.confirmClose(false);
                }}
              >
                {t('Cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setCloseDialogOpen(false);
                  window.electronAPI.app.confirmClose(true);
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
