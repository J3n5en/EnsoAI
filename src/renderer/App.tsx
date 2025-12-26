import type { GitWorktree, WorktreeCreateOptions } from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionPanel } from './components/layout/ActionPanel';
import { MainContent } from './components/layout/MainContent';
import { RepositorySidebar } from './components/layout/RepositorySidebar';
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
import { useEditor } from './hooks/useEditor';
import { useGitBranches, useGitInit } from './hooks/useGit';
import { useWorktreeCreate, useWorktreeList, useWorktreeRemove } from './hooks/useWorktree';
import { matchesKeybinding } from './lib/keybinding';
import { useNavigationStore } from './stores/navigation';
import { useSettingsStore } from './stores/settings';
import { useWorktreeStore } from './stores/worktree';
import { useI18n } from './i18n';

// Animation config
const panelTransition = { type: 'spring' as const, stiffness: 400, damping: 30 };

type TabId = 'chat' | 'file' | 'terminal' | 'source-control';

interface Repository {
  name: string;
  path: string;
}

// Panel size constraints
const REPOSITORY_MIN = 200;
const REPOSITORY_MAX = 400;
const REPOSITORY_DEFAULT = 240;
const WORKTREE_MIN = 200;
const WORKTREE_MAX = 400;
const WORKTREE_DEFAULT = 280;

// Helper to get initial value from localStorage
const getStoredNumber = (key: string, defaultValue: number) => {
  const saved = localStorage.getItem(key);
  return saved ? Number(saved) : defaultValue;
};

const getStoredBoolean = (key: string, defaultValue: boolean) => {
  const saved = localStorage.getItem(key);
  return saved !== null ? saved === 'true' : defaultValue;
};

const getStoredTabMap = (): Record<string, TabId> => {
  const saved = localStorage.getItem('enso-worktree-tabs');
  if (saved) {
    try {
      return JSON.parse(saved) as Record<string, TabId>;
    } catch {
      return {};
    }
  }
  return {};
};

// Normalize path for comparison (handles Windows case-insensitivity and trailing slashes)
const normalizePath = (path: string): string => {
  // Remove trailing slashes/backslashes
  let normalized = path.replace(/[\\/]+$/, '');
  // On Windows, normalize to lowercase for case-insensitive comparison
  if (navigator.platform.startsWith('Win')) {
    normalized = normalized.toLowerCase();
  }
  return normalized;
};

// Check if two paths are equal (considering OS-specific rules)
const pathsEqual = (path1: string, path2: string): boolean => {
  return normalizePath(path1) === normalizePath(path2);
};

export default function App() {
  const { t } = useI18n();
  // Per-worktree tab state: { [worktreePath]: TabId }
  const [worktreeTabMap, setWorktreeTabMap] = useState<Record<string, TabId>>(getStoredTabMap);
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [activeWorktree, setActiveWorktree] = useState<GitWorktree | null>(null);

  // Panel sizes and collapsed states - initialize from localStorage
  const [repositoryWidth, setRepositoryWidth] = useState(() =>
    getStoredNumber('enso-repository-width', REPOSITORY_DEFAULT)
  );
  const [worktreeWidth, setWorktreeWidth] = useState(() =>
    getStoredNumber('enso-worktree-width', WORKTREE_DEFAULT)
  );
  const [repositoryCollapsed, setRepositoryCollapsed] = useState(() =>
    getStoredBoolean('enso-repository-collapsed', false)
  );
  const [worktreeCollapsed, setWorktreeCollapsed] = useState(() =>
    getStoredBoolean('enso-worktree-collapsed', false)
  );

  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Action panel state
  const [actionPanelOpen, setActionPanelOpen] = useState(false);

  // Close confirmation dialog state
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  // Resize state
  const [resizing, setResizing] = useState<'repository' | 'worktree' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const worktreeError = useWorktreeStore((s) => s.error);

  // Initialize settings store (for theme hydration)
  useSettingsStore();

  // Navigation store for terminal -> editor file navigation
  const { pendingNavigation, clearNavigation } = useNavigationStore();
  const { navigateToFile } = useEditor();

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

  // Listen for close request from main process
  useEffect(() => {
    const cleanup = window.electronAPI.app.onCloseRequest(() => {
      setCloseDialogOpen(true);
    });
    return cleanup;
  }, []);

  // Listen for Action Panel keyboard shortcut (Shift+Cmd+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setActionPanelOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for main tab switching keyboard shortcuts
  useEffect(() => {
    const switchTab = (tab: TabId) => {
      setActiveTab(tab);
      const worktreePath = activeWorktree?.path;
      if (worktreePath) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [worktreePath]: tab,
        }));
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const bindings = useSettingsStore.getState().mainTabKeybindings;

      if (matchesKeybinding(e, bindings.switchToAgent)) {
        e.preventDefault();
        switchTab('chat');
        return;
      }

      if (matchesKeybinding(e, bindings.switchToFile)) {
        e.preventDefault();
        switchTab('file');
        return;
      }

      if (matchesKeybinding(e, bindings.switchToTerminal)) {
        e.preventDefault();
        switchTab('terminal');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWorktree]);

  // Save panel sizes to localStorage
  useEffect(() => {
    localStorage.setItem('enso-repository-width', String(repositoryWidth));
  }, [repositoryWidth]);

  useEffect(() => {
    localStorage.setItem('enso-worktree-width', String(worktreeWidth));
  }, [worktreeWidth]);

  useEffect(() => {
    localStorage.setItem('enso-repository-collapsed', String(repositoryCollapsed));
  }, [repositoryCollapsed]);

  useEffect(() => {
    localStorage.setItem('enso-worktree-collapsed', String(worktreeCollapsed));
  }, [worktreeCollapsed]);

  // Persist worktree tab map to localStorage
  useEffect(() => {
    localStorage.setItem('enso-worktree-tabs', JSON.stringify(worktreeTabMap));
  }, [worktreeTabMap]);

  // Resize handlers
  const handleResizeStart = useCallback(
    (panel: 'repository' | 'worktree') => (e: React.MouseEvent) => {
      e.preventDefault();
      setResizing(panel);
      startXRef.current = e.clientX;
      startWidthRef.current = panel === 'repository' ? repositoryWidth : worktreeWidth;
    },
    [repositoryWidth, worktreeWidth]
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + delta;

      if (resizing === 'repository') {
        setRepositoryWidth(Math.max(REPOSITORY_MIN, Math.min(REPOSITORY_MAX, newWidth)));
      } else {
        setWorktreeWidth(Math.max(WORKTREE_MIN, Math.min(WORKTREE_MAX, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  // Get worktrees for selected repo
  const {
    data: worktrees = [],
    isLoading: worktreesLoading,
    refetch,
  } = useWorktreeList(selectedRepo);

  // Get branches for selected repo
  const { data: branches = [], refetch: refetchBranches } = useGitBranches(selectedRepo);

  // Worktree mutations
  const createWorktreeMutation = useWorktreeCreate();
  const removeWorktreeMutation = useWorktreeRemove();
  const gitInitMutation = useGitInit();

  // Load saved repositories and selection from localStorage
  useEffect(() => {
    const savedRepos = localStorage.getItem('enso-repositories');
    if (savedRepos) {
      try {
        const parsed = JSON.parse(savedRepos) as Repository[];
        setRepositories(parsed);
      } catch {
        // ignore
      }
    }

    const savedSelectedRepo = localStorage.getItem('enso-selected-repo');
    if (savedSelectedRepo) {
      setSelectedRepo(savedSelectedRepo);
    }

    const savedWorktreePath = localStorage.getItem('enso-active-worktree');
    if (savedWorktreePath) {
      // Wait for worktrees to load before setting active worktree.
      setActiveWorktree({ path: savedWorktreePath } as GitWorktree);
    }
  }, []);

  // Save repositories to localStorage
  const saveRepositories = useCallback((repos: Repository[]) => {
    localStorage.setItem('enso-repositories', JSON.stringify(repos));
    setRepositories(repos);
  }, []);

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
      localStorage.setItem('enso-selected-repo', selectedRepo);
    } else {
      localStorage.removeItem('enso-selected-repo');
    }
  }, [selectedRepo]);

  // Save active worktree to localStorage
  useEffect(() => {
    if (activeWorktree) {
      localStorage.setItem('enso-active-worktree', activeWorktree.path);
    } else {
      localStorage.removeItem('enso-active-worktree');
    }
  }, [activeWorktree]);

  // Sync activeWorktree with loaded worktrees data
  useEffect(() => {
    if (worktrees.length > 0 && activeWorktree) {
      const found = worktrees.find((wt) => wt.path === activeWorktree.path);
      if (found && found !== activeWorktree) {
        setActiveWorktree(found);
      } else if (!found) {
        setActiveWorktree(null);
      }
    }
  }, [worktrees, activeWorktree]);

  const handleSelectRepo = (repoPath: string) => {
    setSelectedRepo(repoPath);
    setActiveWorktree(null);
  };

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

  const handleSelectWorktree = useCallback(
    (worktree: GitWorktree) => {
      // Save current worktree's tab state before switching
      if (activeWorktree?.path) {
        setWorktreeTabMap((prev) => ({
          ...prev,
          [activeWorktree.path]: activeTab,
        }));
      }

      // Switch to new worktree
      setActiveWorktree(worktree);

      // Restore the new worktree's tab state (default to 'chat')
      const savedTab = worktreeTabMap[worktree.path] || 'chat';
      setActiveTab(savedTab);
    },
    [activeWorktree, activeTab, worktreeTabMap]
  );

  // Handle switching worktree by path (used by notification click)
  const handleSwitchWorktreePath = useCallback(
    (worktreePath: string) => {
      const worktree = worktrees.find((wt) => wt.path === worktreePath);
      if (worktree) {
        handleSelectWorktree(worktree);
      }
    },
    [worktrees, handleSelectWorktree]
  );

  const handleAddRepository = async () => {
    try {
      const selectedPath = await window.electronAPI.dialog.openDirectory();
      if (!selectedPath) return;

      // Check if repo already exists
      if (repositories.some((r) => r.path === selectedPath)) {
        return;
      }

      // Extract repo name from path
      const name = selectedPath.split('/').pop() || selectedPath;

      const newRepo: Repository = {
        name,
        path: selectedPath,
      };

      const updated = [...repositories, newRepo];
      saveRepositories(updated);

      // Auto-select the new repo
      setSelectedRepo(selectedPath);
    } catch (error) {
      console.error('Error opening directory dialog:', error);
    }
  };

  const handleCreateWorktree = async (options: WorktreeCreateOptions) => {
    if (!selectedRepo) return;
    try {
      await createWorktreeMutation.mutateAsync({
        workdir: selectedRepo,
        options,
      });
    } finally {
      // Refresh branches on success/failure (git worktree add -b creates branches first).
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

  return (
    <div className={`flex h-screen overflow-hidden ${resizing ? 'select-none' : ''}`}>
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
              onOpenSettings={() => setSettingsOpen(true)}
              collapsed={false}
              onCollapse={() => setRepositoryCollapsed(true)}
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
              worktrees={worktrees}
              activeWorktree={activeWorktree}
              branches={branches}
              projectName={selectedRepo?.split('/').pop() || ''}
              isLoading={worktreesLoading}
              isCreating={createWorktreeMutation.isPending}
              error={worktreeError}
              onSelectWorktree={handleSelectWorktree}
              onCreateWorktree={handleCreateWorktree}
              onRemoveWorktree={handleRemoveWorktree}
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

      {/* Column 3: Main Content */}
      <MainContent
        activeTab={activeTab}
        onTabChange={handleTabChange}
        repoPath={selectedRepo || undefined}
        worktreePath={activeWorktree?.path}
        repositoryCollapsed={repositoryCollapsed}
        worktreeCollapsed={worktreeCollapsed}
        onExpandRepository={() => setRepositoryCollapsed(false)}
        onExpandWorktree={() => setWorktreeCollapsed(false)}
        onSwitchWorktree={handleSwitchWorktreePath}
      />

      {/* Global Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

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
      <UpdateNotification />

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
    </div>
  );
}
