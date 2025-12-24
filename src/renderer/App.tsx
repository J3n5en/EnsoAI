import type { GitWorktree, WorkspaceRecord, WorktreeCreateOptions } from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionPanel } from './components/layout/ActionPanel';
import { MainContent } from './components/layout/MainContent';
import { WorkspaceSidebar } from './components/layout/WorkspaceSidebar';
import { WorktreePanel } from './components/layout/WorktreePanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { useEditor } from './hooks/useEditor';
import { useGitBranches } from './hooks/useGit';
import { useWorktreeCreate, useWorktreeList, useWorktreeRemove } from './hooks/useWorktree';
import { useNavigationStore } from './stores/navigation';
import { useSettingsStore } from './stores/settings';
import { useWorkspaceStore } from './stores/workspace';

// Animation config
const panelTransition = { type: 'spring' as const, stiffness: 400, damping: 30 };

type TabId = 'chat' | 'file' | 'terminal' | 'source-control';

interface Repository {
  name: string;
  path: string;
}

// Panel size constraints
const WORKSPACE_MIN = 200;
const WORKSPACE_MAX = 400;
const WORKSPACE_DEFAULT = 240;
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [activeWorktree, setActiveWorktree] = useState<GitWorktree | null>(null);

  // Panel sizes and collapsed states - initialize from localStorage
  const [workspaceWidth, setWorkspaceWidth] = useState(() =>
    getStoredNumber('enso-workspace-width', WORKSPACE_DEFAULT)
  );
  const [worktreeWidth, setWorktreeWidth] = useState(() =>
    getStoredNumber('enso-worktree-width', WORKTREE_DEFAULT)
  );
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(() =>
    getStoredBoolean('enso-workspace-collapsed', false)
  );
  const [worktreeCollapsed, setWorktreeCollapsed] = useState(() =>
    getStoredBoolean('enso-worktree-collapsed', false)
  );

  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Action panel state
  const [actionPanelOpen, setActionPanelOpen] = useState(false);

  // Resize state
  const [resizing, setResizing] = useState<'workspace' | 'worktree' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const { workspaces, currentWorkspace, setCurrentWorkspace, setWorkspaces } = useWorkspaceStore();

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

    // Switch to file tab
    setActiveTab('file');

    // Clear the navigation request
    clearNavigation();
  }, [pendingNavigation, navigateToFile, clearNavigation]);

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

  // Save panel sizes to localStorage
  useEffect(() => {
    localStorage.setItem('enso-workspace-width', String(workspaceWidth));
  }, [workspaceWidth]);

  useEffect(() => {
    localStorage.setItem('enso-worktree-width', String(worktreeWidth));
  }, [worktreeWidth]);

  useEffect(() => {
    localStorage.setItem('enso-workspace-collapsed', String(workspaceCollapsed));
  }, [workspaceCollapsed]);

  useEffect(() => {
    localStorage.setItem('enso-worktree-collapsed', String(worktreeCollapsed));
  }, [worktreeCollapsed]);

  // Resize handlers
  const handleResizeStart = useCallback(
    (panel: 'workspace' | 'worktree') => (e: React.MouseEvent) => {
      e.preventDefault();
      setResizing(panel);
      startXRef.current = e.clientX;
      startWidthRef.current = panel === 'workspace' ? workspaceWidth : worktreeWidth;
    },
    [workspaceWidth, worktreeWidth]
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + delta;

      if (resizing === 'workspace') {
        setWorkspaceWidth(Math.max(WORKSPACE_MIN, Math.min(WORKSPACE_MAX, newWidth)));
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

  // Initialize default workspace if none exists
  useEffect(() => {
    if (workspaces.length === 0) {
      const defaultWorkspace: WorkspaceRecord = {
        id: 1,
        name: 'Personal',
        path: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setWorkspaces([defaultWorkspace]);
      setCurrentWorkspace(defaultWorkspace);
    }
  }, [workspaces.length, setWorkspaces, setCurrentWorkspace]);

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
      // 需要等 worktrees 加载后再设置
      setActiveWorktree({ path: savedWorktreePath } as GitWorktree);
    }
  }, []);

  // Save repositories to localStorage
  const saveRepositories = useCallback((repos: Repository[]) => {
    localStorage.setItem('enso-repositories', JSON.stringify(repos));
    setRepositories(repos);
  }, []);

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

  const _handleSelectWorkspace = (workspace: WorkspaceRecord) => {
    setCurrentWorkspace(workspace);
    setSelectedRepo(null);
    setActiveWorktree(null);
  };

  const handleSelectRepo = (repoPath: string) => {
    setSelectedRepo(repoPath);
    setActiveWorktree(null);
  };

  const handleSelectWorktree = (worktree: GitWorktree) => {
    setActiveWorktree(worktree);
  };

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
      // 无论成功失败都刷新分支列表（因为 git worktree add -b 会先创建分支）
      refetchBranches();
    }
  };

  const handleRemoveWorktree = async (worktree: GitWorktree, deleteBranch?: boolean) => {
    if (!selectedRepo) return;
    await removeWorktreeMutation.mutateAsync({
      workdir: selectedRepo,
      options: {
        path: worktree.path,
        force: worktree.prunable, // prunable 的直接 prune，否则 force remove
        deleteBranch,
        branch: worktree.branch || undefined,
      },
    });
    // 如果删除的是当前选中的，清空选择
    if (activeWorktree?.path === worktree.path) {
      setActiveWorktree(null);
    }
    refetchBranches();
  };

  return (
    <div className={`flex h-screen overflow-hidden ${resizing ? 'select-none' : ''}`}>
      {/* Column 1: Workspace Sidebar */}
      <AnimatePresence initial={false}>
        {!workspaceCollapsed && (
          <motion.div
            key="workspace"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: workspaceWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={panelTransition}
            className="relative h-full shrink-0 overflow-hidden"
          >
            <WorkspaceSidebar
              repositories={repositories}
              selectedRepo={selectedRepo}
              onSelectRepo={handleSelectRepo}
              onAddRepository={handleAddRepository}
              onRemoveRepository={handleRemoveRepository}
              onOpenSettings={() => setSettingsOpen(true)}
              collapsed={false}
              onCollapse={() => setWorkspaceCollapsed(true)}
            />
            {/* Resize handle */}
            <div
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
              onMouseDown={handleResizeStart('workspace')}
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
              onSelectWorktree={handleSelectWorktree}
              onCreateWorktree={handleCreateWorktree}
              onRemoveWorktree={handleRemoveWorktree}
              onRefresh={() => {
                refetch();
                refetchBranches();
              }}
              width={worktreeWidth}
              collapsed={false}
              onCollapse={() => setWorktreeCollapsed(true)}
              workspaceCollapsed={workspaceCollapsed}
              onExpandWorkspace={() => setWorkspaceCollapsed(false)}
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
        onTabChange={setActiveTab}
        workspaceName={currentWorkspace?.name}
        repoPath={selectedRepo || undefined}
        worktreePath={activeWorktree?.path}
        workspaceCollapsed={workspaceCollapsed}
        worktreeCollapsed={worktreeCollapsed}
        onExpandWorkspace={() => setWorkspaceCollapsed(false)}
        onExpandWorktree={() => setWorktreeCollapsed(false)}
      />

      {/* Global Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Action Panel */}
      <ActionPanel
        open={actionPanelOpen}
        onOpenChange={setActionPanelOpen}
        workspaceCollapsed={workspaceCollapsed}
        worktreeCollapsed={worktreeCollapsed}
        projectPath={activeWorktree?.path || selectedRepo || undefined}
        onToggleWorkspace={() => setWorkspaceCollapsed((prev) => !prev)}
        onToggleWorktree={() => setWorktreeCollapsed((prev) => !prev)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    </div>
  );
}
