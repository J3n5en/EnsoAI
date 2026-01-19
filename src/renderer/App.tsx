import type {
  GitWorktree,
  WorktreeCreateOptions,
  WorktreeMergeCleanupOptions,
  WorktreeMergeOptions,
  WorktreeMergeResult,
} from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeHexColor } from '@/lib/colors';
import {
  ALL_GROUP_ID,
  DEFAULT_GROUP_COLOR,
  generateGroupId,
  panelTransition,
  type Repository,
  type RepositoryGroup,
  type TabId,
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
import { TreeSidebar } from './components/layout/TreeSidebar';
import { WindowTitleBar } from './components/layout/WindowTitleBar';
import { WorktreePanel } from './components/layout/WorktreePanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
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
import { useGitBranches, useGitInit } from './hooks/useGit';
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
import { useNavigationStore } from './stores/navigation';
import { useSettingsStore } from './stores/settings';
import { requestUnsavedChoice } from './stores/unsavedPrompt';
import { useWorktreeStore } from './stores/worktree';

// Initialize global clone progress listener
initCloneProgressListener();

export default function App() {
  const { t } = useI18n();
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

  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<
    'general' | 'appearance' | 'editor' | 'keybindings' | 'agent' | 'integration' | 'hapi'
  >('general');
  const [scrollToProvider, setScrollToProvider] = useState(false);

  // Add Repository dialog state
  const [addRepoDialogOpen, setAddRepoDialogOpen] = useState(false);

  // Action panel state
  const [actionPanelOpen, setActionPanelOpen] = useState(false);

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

  // Panel resize hook
  const { repositoryWidth, worktreeWidth, treeSidebarWidth, resizing, handleResizeStart } =
    usePanelResize(layoutMode);

  const worktreeError = useWorktreeStore((s) => s.error);
  const switchEditorWorktree = useEditorStore((s) => s.switchWorktree);
  const clearEditorWorktreeState = useEditorStore((s) => s.clearWorktreeState);

  // Navigation store for terminal -> editor file navigation
  const { pendingNavigation, clearNavigation } = useNavigationStore();
  const { navigateToFile } = useEditor();

  // Handle tab change and persist to worktree tab map
  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      // Save tab state for current worktree
      if (activeWorktree?.path) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: tab,
        }));
      }
    },
    [activeWorktree]
  );

  // Keyboard shortcuts
  useAppKeyboardShortcuts({
    activeWorktreePath: activeWorktree?.path,
    onTabSwitch: handleTabChange,
    onActionPanelToggle: useCallback(() => setActionPanelOpen((prev) => !prev), []),
  });

  // Handle terminal file link navigation
  useEffect(() => {
    if (!pendingNavigation) return;

    const { path, line, column } = pendingNavigation;

    // Open the file and set cursor position
    navigateToFile(path, line, column);

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
          setSettingsOpen(true);
          break;
        case 'open-action-panel':
          setActionPanelOpen(true);
          break;
      }
    });
    return cleanup;
  }, []);

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

      // Close previous provider toast if exists
      if (providerToastRef.current) {
        toastManager.close(providerToastRef.current);
      }

      // Check if the new config matches any saved provider
      const matched = claudeProviders.find(
        (p) => p.baseUrl === extracted.baseUrl && p.authToken === extracted.authToken
      );

      if (matched) {
        // Switched to a known provider
        providerToastRef.current = toastManager.add({
          type: 'info',
          title: t('Provider switched'),
          description: matched.name,
        });
      } else {
        // New unsaved config detected
        providerToastRef.current = toastManager.add({
          type: 'info',
          title: t('New provider detected'),
          description: t('Click to save this config'),
          actionProps: {
            children: t('Open Settings'),
            onClick: () => {
              setSettingsCategory('integration');
              setScrollToProvider(true);
              setSettingsOpen(true);
            },
          },
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
  }, [claudeProviders, t]);

  // Save collapsed states to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REPOSITORY_COLLAPSED, String(repositoryCollapsed));
  }, [repositoryCollapsed]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKTREE_COLLAPSED, String(worktreeCollapsed));
  }, [worktreeCollapsed]);

  // Persist worktree tab map to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKTREE_TABS, JSON.stringify(worktreeTabMap));
  }, [worktreeTabMap]);

  // Persist panel tab order to localStorage
  useEffect(() => {
    saveTabOrder(tabOrder);
  }, [tabOrder]);

  // Get worktrees for selected repo (used in columns mode)
  const {
    data: worktrees = [],
    isLoading: worktreesLoading,
    isFetching: worktreesFetching,
    refetch,
  } = useWorktreeList(selectedRepo);

  // Get branches for selected repo
  const { data: branches = [], refetch: refetchBranches } = useGitBranches(selectedRepo);

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
  }, []);

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

  const handleSelectWorktree = useCallback(
    async (worktree: GitWorktree) => {
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
    },
    [activeWorktree, activeTab, worktreeTabMap, editorSettings.autoSave, t]
  );

  const handleSwitchWorktreePath = useCallback(
    async (worktreePath: string) => {
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
            return;
          }
        } catch {}
      }
    },
    [worktrees, repositories, worktreeTabMap, handleSelectWorktree]
  );

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

  const handleRemoveWorktree = async (
    worktree: GitWorktree,
    options?: { deleteBranch?: boolean; force?: boolean }
  ) => {
    if (!selectedRepo) return;
    await removeWorktreeMutation.mutateAsync({
      workdir: selectedRepo,
      options: {
        path: worktree.path,
        force: worktree.prunable || options?.force, // prunable or user-selected force delete
        deleteBranch: options?.deleteBranch,
        branch: worktree.branch || undefined,
      },
    });
    // Clear editor state for the removed worktree
    clearEditorWorktreeState(worktree.path);
    // Clear selection if the active worktree was removed.
    if (activeWorktree?.path === worktree.path) {
      setActiveWorktree(null);
    }
    refetchBranches();
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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Custom Title Bar for Windows/Linux */}
      <WindowTitleBar onOpenSettings={() => setSettingsOpen(true)} />

      {/* Main Layout */}
      <div className={`flex flex-1 overflow-hidden ${resizing ? 'select-none' : ''}`}>
        {layoutMode === 'tree' ? (
          // Tree Layout: Single sidebar with repos as root nodes and worktrees as children
          <AnimatePresence initial={false}>
            {!repositoryCollapsed && (
              <motion.div
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
                  onOpenSettings={() => setSettingsOpen(true)}
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
                    onOpenSettings={() => setSettingsOpen(true)}
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
        />

        {/* Global Settings Dialog */}
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            if (!open) {
              // Reset scroll flag when dialog closes
              setScrollToProvider(false);
            }
          }}
          initialCategory={settingsCategory}
          scrollToProvider={scrollToProvider}
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
          onOpenSettings={() => setSettingsOpen(true)}
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
      </div>
    </div>
  );
}
