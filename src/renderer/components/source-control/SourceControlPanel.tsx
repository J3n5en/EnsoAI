import { joinPath } from '@shared/utils/path';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, GitBranch, GripVertical, History, PanelLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { toastManager } from '@/components/ui/toast';
import { useGitBranches, useGitCheckout, useGitPull, useGitPush } from '@/hooks/useGit';
import { useCommitDiff, useCommitFiles, useGitHistoryInfinite } from '@/hooks/useGitHistory';
import { useGitSync } from '@/hooks/useGitSync';
import {
  useFileChanges,
  useGitCommit,
  useGitDiscard,
  useGitFetch,
  useGitStage,
  useGitUnstage,
} from '@/hooks/useSourceControl';
import {
  useStageSubmodule,
  useSubmoduleBranches,
  useSubmoduleChanges,
  useSubmoduleFileDiff,
  useSubmodules,
  useUnstageSubmodule,
} from '@/hooks/useSubmodules';
import { useI18n } from '@/i18n';
import { heightVariants, springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useSourceControlStore } from '@/stores/sourceControl';
import { BranchSwitcher } from './BranchSwitcher';
import { ChangesList } from './ChangesList';
import { CommitBox } from './CommitBox';
import { CommitDiffViewer } from './CommitDiffViewer';
import { CommitHistoryList } from './CommitHistoryList';
import { panelTransition } from './constants';
import { DiffViewer } from './DiffViewer';
import { RepositoryList } from './RepositoryList';
import type { Repository } from './types';
import { usePanelResize } from './usePanelResize';

interface SourceControlPanelProps {
  rootPath: string | undefined;
  isActive?: boolean;
  onExpandWorktree?: () => void;
  worktreeCollapsed?: boolean;
  sessionId?: string | null;
}

export function SourceControlPanel({
  rootPath,
  isActive = false,
  onExpandWorktree,
  worktreeCollapsed,
  sessionId,
}: SourceControlPanelProps) {
  const { t, tNode } = useI18n();
  const queryClient = useQueryClient();

  // Accordion state - collapsible sections
  const [reposExpanded, setReposExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Selected repository - null means main repo, string means submodule path
  const [selectedSubmodulePath, setSelectedSubmodulePath] = useState<string | null>(null);

  // Selected submodule file state
  const [selectedSubmoduleFile, setSelectedSubmoduleFile] = useState<{
    path: string;
    staged: boolean;
    submodulePath: string;
  } | null>(null);

  // History view state
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null);
  const [expandedCommitHash, setExpandedCommitHash] = useState<string | null>(null);

  // Submodule commit history state
  const [selectedSubmoduleCommit, _setSelectedSubmoduleCommit] = useState<{
    hash: string;
    filePath: string | null;
    submodulePath: string;
  } | null>(null);

  const {
    data: fileChangesResult,
    isLoading,
    isFetching,
    refetch,
  } = useFileChanges(rootPath ?? null, isActive);

  const changes = fileChangesResult?.changes;
  const skippedDirs = fileChangesResult?.skippedDirs;

  // Git sync operations using shared hook
  const { refetchStatus, isSyncing, ahead, behind, tracking, currentBranch } = useGitSync({
    workdir: rootPath ?? '',
    enabled: isActive && !!rootPath,
  });

  // Note: useGitFetch is separate from useGitSync because fetch is a read-only
  // operation used for refresh, while sync handles push/pull mutations.
  const fetchMutation = useGitFetch();

  // Branch switching
  const {
    data: branches = [],
    isLoading: branchesLoading,
    refetch: refetchBranches,
  } = useGitBranches(rootPath ?? null);
  const checkoutMutation = useGitCheckout();

  // Submodules
  const { data: submodules = [] } = useSubmodules(rootPath ?? null);

  // Generic pull/push mutations for both main repo and submodules
  const pullMutation = useGitPull();
  const pushMutation = useGitPush();

  // Submodule branches - fetch when a submodule is selected (must be before repositories useMemo)
  const { data: submoduleBranches = [], isLoading: submoduleBranchesLoading } =
    useSubmoduleBranches(rootPath ?? null, selectedSubmodulePath);

  // Main repository
  const mainRepo: Repository | null = useMemo(() => {
    if (!rootPath) return null;
    return {
      type: 'main',
      name: rootPath.split('/').pop() || t('Repository'),
      path: rootPath,
      branch: currentBranch ?? null,
      tracking: tracking ?? null,
      ahead: ahead ?? 0,
      behind: behind ?? 0,
      changesCount: changes?.length ?? 0,
      branches,
      branchesLoading,
    };
  }, [rootPath, currentBranch, tracking, ahead, behind, changes, branches, branchesLoading, t]);

  // Submodule repositories
  const submoduleRepos: Repository[] = useMemo(() => {
    if (!rootPath) return [];
    return submodules
      .filter((s) => s.initialized)
      .map((sub) => {
        const isSelected = selectedSubmodulePath === sub.path;
        return {
          type: 'submodule' as const,
          name: sub.name,
          path: joinPath(rootPath, sub.path),
          submodulePath: sub.path,
          branch: sub.branch ?? null,
          tracking: sub.tracking ?? null,
          ahead: sub.ahead ?? 0,
          behind: sub.behind ?? 0,
          changesCount: (sub.stagedCount ?? 0) + (sub.unstagedCount ?? 0),
          branches: isSelected ? submoduleBranches : undefined,
          branchesLoading: isSelected ? submoduleBranchesLoading : undefined,
        };
      });
  }, [rootPath, submodules, selectedSubmodulePath, submoduleBranches, submoduleBranchesLoading]);

  // Combined repositories list
  const repositories = useMemo(() => {
    return mainRepo ? [mainRepo, ...submoduleRepos] : [];
  }, [mainRepo, submoduleRepos]);

  // Get selected repository
  const selectedRepo = useMemo(() => {
    if (!selectedSubmodulePath) {
      return repositories.find((r) => r.type === 'main') ?? null;
    }
    return repositories.find((r) => r.submodulePath === selectedSubmodulePath) ?? null;
  }, [repositories, selectedSubmodulePath]);

  // Submodule changes - only fetch when a submodule is selected
  const {
    data: submoduleChanges = [],
    isLoading: submoduleChangesLoading,
    refetch: refetchSubmoduleChanges,
  } = useSubmoduleChanges(rootPath ?? null, selectedSubmodulePath);

  // Submodule history - only fetch when a submodule is selected
  const {
    data: submoduleCommitsData,
    isLoading: submoduleCommitsLoading,
    hasNextPage: submoduleHasNextPage,
    isFetchingNextPage: submoduleIsFetchingNextPage,
    fetchNextPage: fetchSubmoduleNextPage,
    refetch: refetchSubmoduleCommits,
  } = useGitHistoryInfinite(
    selectedSubmodulePath ? (rootPath ?? null) : null,
    20,
    selectedSubmodulePath ?? undefined
  );

  // Current changes based on selected repo
  const currentChanges = selectedSubmodulePath ? submoduleChanges : (changes ?? []);
  const currentBranches = selectedSubmodulePath ? submoduleBranches : branches;
  const currentBranchesLoading = selectedSubmodulePath ? submoduleBranchesLoading : branchesLoading;

  // Submodule file diff - fetch when a submodule file is selected
  const { data: submoduleFileDiff } = useSubmoduleFileDiff(
    rootPath ?? null,
    selectedSubmoduleFile?.submodulePath ?? null,
    selectedSubmoduleFile?.path ?? null,
    selectedSubmoduleFile?.staged ?? false
  );

  const {
    data: commitsData,
    isLoading: commitsLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch: refetchCommits,
  } = useGitHistoryInfinite(rootPath ?? null, 20);

  // Ensure a repository is selected when repositories are available
  // This fixes the issue where no repository is selected when switching to source control tab
  useEffect(() => {
    if (repositories.length > 0 && !selectedRepo) {
      // Default to main repository (first in list)
      setSelectedSubmodulePath(null);
    }
  }, [repositories.length, selectedRepo]);

  // Refetch immediately when tab becomes active
  useEffect(() => {
    if (isActive && rootPath) {
      refetch();
      refetchCommits();
      refetchStatus();
      // Also refresh submodules data
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', rootPath] });
      queryClient.invalidateQueries({ queryKey: ['git', 'submodule', 'changes', rootPath] });
    }
  }, [isActive, rootPath, refetch, refetchCommits, refetchStatus, queryClient]);

  // Wrap sync handlers to add additional refetch calls for SourceControlPanel
  const handleSync = useCallback(
    async (repoPath: string) => {
      if (!repoPath || pullMutation.isPending || pushMutation.isPending) return;

      const isSubmodule = repoPath !== rootPath;
      const repo = repositories.find((r) => r.path === repoPath);
      if (!repo) return;

      const repoAhead = repo.ahead;
      const repoBehind = repo.behind;

      try {
        let pulled = false;
        let pushed = false;

        // Pull first if behind
        if (repoBehind > 0) {
          await pullMutation.mutateAsync({ workdir: repoPath });
          pulled = true;
        }
        // Then push if ahead
        if (repoAhead > 0) {
          await pushMutation.mutateAsync({ workdir: repoPath });
          pushed = true;
        }

        if (isSubmodule) {
          queryClient.invalidateQueries({ queryKey: ['git', 'submodules', rootPath] });
        } else {
          refetchStatus();
        }
        refetch();
        refetchCommits();

        const branch = repo.branch ?? '';
        if (pulled && pushed) {
          toastManager.add({
            title: t('Sync completed'),
            description: t(
              'Pulled {{pulled}} commit(s), pushed {{pushed}} commit(s) on {{branch}}',
              { pulled: repoBehind, pushed: repoAhead, branch }
            ),
            type: 'success',
            timeout: 3000,
          });
        } else if (pulled) {
          toastManager.add({
            title: t('Sync completed'),
            description: t('Pulled {{count}} commit(s) on {{branch}}', {
              count: repoBehind,
              branch,
            }),
            type: 'success',
            timeout: 3000,
          });
        } else if (pushed) {
          toastManager.add({
            title: t('Sync completed'),
            description: t('Pushed {{count}} commit(s) on {{branch}}', {
              count: repoAhead,
              branch,
            }),
            type: 'success',
            timeout: 3000,
          });
        } else {
          toastManager.add({
            title: t('Already up to date'),
            description: t('{{branch}} is in sync with remote', { branch }),
            type: 'success',
            timeout: 2000,
          });
        }
      } catch (error) {
        toastManager.add({
          title: t('Sync failed'),
          description: error instanceof Error ? error.message : String(error),
          type: 'error',
          timeout: 5000,
        });
      }
    },
    [
      rootPath,
      repositories,
      pullMutation,
      pushMutation,
      queryClient,
      refetchStatus,
      refetch,
      refetchCommits,
      t,
    ]
  );

  const handlePublish = useCallback(
    async (repoPath: string) => {
      if (!repoPath || pushMutation.isPending) return;

      const isSubmodule = repoPath !== rootPath;
      const repo = repositories.find((r) => r.path === repoPath);
      const branch = repo?.branch;

      try {
        await pushMutation.mutateAsync({
          workdir: repoPath,
          remote: 'origin',
          branch: branch ?? undefined,
          setUpstream: true,
        });

        if (isSubmodule) {
          queryClient.invalidateQueries({ queryKey: ['git', 'submodules', rootPath] });
        } else {
          refetchStatus();
        }
        refetch();
        refetchCommits();

        toastManager.add({
          title: t('Branch published'),
          description: t('Branch {{branch}} is now tracking origin/{{branch}}', {
            branch: branch ?? '',
          }),
          type: 'success',
          timeout: 3000,
        });
      } catch (error) {
        toastManager.add({
          title: t('Publish failed'),
          description: error instanceof Error ? error.message : String(error),
          type: 'error',
          timeout: 5000,
        });
      }
    },
    [rootPath, repositories, pushMutation, queryClient, refetchStatus, refetch, refetchCommits, t]
  );

  // Branch checkout handler
  const handleBranchCheckout = useCallback(
    async (repoPath: string, branch: string) => {
      if (!repoPath || checkoutMutation.isPending) return;

      try {
        await checkoutMutation.mutateAsync({ workdir: repoPath, branch });
        refetch();
        refetchBranches();
        refetchCommits();
        refetchStatus();

        toastManager.add({
          title: t('Branch switched'),
          description: t('Branch switched to {{branch}}', { branch }),
          type: 'success',
          timeout: 3000,
        });
      } catch (error) {
        toastManager.add({
          title: t('Failed to switch branch'),
          description: error instanceof Error ? error.message : String(error),
          type: 'error',
          timeout: 5000,
        });
      }
    },
    [checkoutMutation, refetch, refetchBranches, refetchCommits, refetchStatus, t]
  );

  // Flatten infinite query data
  const mainCommits = commitsData?.pages.flat() ?? [];
  const submoduleCommits = submoduleCommitsData?.pages.flat() ?? [];
  const currentCommits = selectedSubmodulePath ? submoduleCommits : mainCommits;
  const currentCommitsLoading = selectedSubmodulePath ? submoduleCommitsLoading : commitsLoading;
  const currentHasNextPage = selectedSubmodulePath ? submoduleHasNextPage : hasNextPage;
  const currentIsFetchingNextPage = selectedSubmodulePath
    ? submoduleIsFetchingNextPage
    : isFetchingNextPage;
  const currentFetchNextPage = selectedSubmodulePath ? fetchSubmoduleNextPage : fetchNextPage;

  const { data: commitFiles = [], isLoading: commitFilesLoading } = useCommitFiles(
    rootPath ?? null,
    selectedCommitHash,
    selectedSubmodulePath ?? undefined
  );

  // Find the status of the selected file to pass to useCommitDiff
  const selectedFileStatus = commitFiles.find((f) => f.path === selectedCommitFile)?.status;

  const { data: commitDiff, isLoading: commitDiffLoading } = useCommitDiff(
    rootPath ?? null,
    selectedCommitHash,
    selectedCommitFile,
    selectedFileStatus,
    selectedSubmodulePath ?? undefined
  );

  // Submodule commit diff
  const { data: _submoduleCommitDiff, isLoading: _submoduleCommitDiffLoading } = useCommitDiff(
    rootPath ?? null,
    selectedSubmoduleCommit?.hash ?? null,
    selectedSubmoduleCommit?.filePath ?? null,
    undefined,
    selectedSubmoduleCommit?.submodulePath ?? null
  );

  const { selectedFile, setSelectedFile, setNavigationDirection } = useSourceControlStore();

  // Handle repository selection
  const handleRepoSelect = useCallback(
    (repoPath: string) => {
      const repo = repositories.find((r) => r.path === repoPath);
      if (repo?.type === 'main') {
        setSelectedSubmodulePath(null);
      } else if (repo?.submodulePath) {
        setSelectedSubmodulePath(repo.submodulePath);
      }
      // Clear file selections when switching repos
      setSelectedFile(null);
      setSelectedCommitHash(null);
      setSelectedCommitFile(null);
      setExpandedCommitHash(null);
      setSelectedSubmoduleFile(null);
    },
    [repositories, setSelectedFile]
  );

  // Use currentChanges for staged/unstaged based on selected repo
  const staged = useMemo(() => currentChanges.filter((c) => c.staged), [currentChanges]);
  const unstaged = useMemo(() => currentChanges.filter((c) => !c.staged), [currentChanges]);

  // All files in order: staged first, then unstaged
  const allFiles = useMemo(() => [...staged, ...unstaged], [staged, unstaged]);

  // Panel resize hooks
  const { width: panelWidth, isResizing, containerRef, handleMouseDown } = usePanelResize();

  // Get the working directory for the selected repo
  const selectedRepoPath =
    selectedSubmodulePath && rootPath ? joinPath(rootPath, selectedSubmodulePath) : rootPath;

  // Git mutations
  const stageMutation = useGitStage();
  const unstageMutation = useGitUnstage();
  const discardMutation = useGitDiscard();
  const commitMutation = useGitCommit();

  // Submodule mutations
  const stageSubmoduleMutation = useStageSubmodule();
  const unstageSubmoduleMutation = useUnstageSubmodule();

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    type: 'discard' | 'delete';
    paths: string[];
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Git action handlers
  const handleStage = useCallback(
    (paths: string[]) => {
      if (!rootPath) return;
      if (selectedSubmodulePath) {
        stageSubmoduleMutation.mutate({
          workdir: rootPath,
          submodulePath: selectedSubmodulePath,
          paths,
        });
      } else {
        stageMutation.mutate({ workdir: rootPath, paths });
      }
    },
    [rootPath, selectedSubmodulePath, stageMutation, stageSubmoduleMutation]
  );

  const handleUnstage = useCallback(
    (paths: string[]) => {
      if (!rootPath) return;
      if (selectedSubmodulePath) {
        unstageSubmoduleMutation.mutate({
          workdir: rootPath,
          submodulePath: selectedSubmodulePath,
          paths,
        });
      } else {
        unstageMutation.mutate({ workdir: rootPath, paths });
      }
    },
    [rootPath, selectedSubmodulePath, unstageMutation, unstageSubmoduleMutation]
  );

  const handleDiscard = useCallback((paths: string[]) => {
    setConfirmAction({ paths, type: 'discard' });
    setDialogOpen(true);
  }, []);

  const handleDeleteUntracked = useCallback((paths: string[]) => {
    setConfirmAction({ paths, type: 'delete' });
    setDialogOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setConfirmAction(null);
    }
  }, []);

  const handleConfirmAction = useCallback(async () => {
    if (!selectedRepoPath || !confirmAction) return;

    try {
      if (confirmAction.type === 'discard') {
        await discardMutation.mutateAsync({
          workdir: selectedRepoPath,
          paths: confirmAction.paths,
        });
      } else {
        for (const path of confirmAction.paths) {
          await window.electronAPI.file.delete(`${selectedRepoPath}/${path}`, { recursive: false });
        }
        if (selectedSubmodulePath && rootPath) {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ['git', 'submodule', 'changes', rootPath, selectedSubmodulePath],
            }),
            queryClient.invalidateQueries({ queryKey: ['git', 'submodules', rootPath] }),
            queryClient.invalidateQueries({
              queryKey: ['git', 'submodule', 'diff', rootPath, selectedSubmodulePath],
            }),
          ]);
        } else if (rootPath) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', rootPath] }),
            queryClient.invalidateQueries({ queryKey: ['git', 'status', rootPath] }),
            queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', rootPath] }),
          ]);
        }
      }

      if (selectedFile && confirmAction.paths.includes(selectedFile.path)) {
        setSelectedFile(null);
      }
    } catch (error) {
      toastManager.add({
        title: confirmAction.type === 'discard' ? t('Discard failed') : t('Delete failed'),
        description: error instanceof Error ? error.message : t('Unknown error'),
        type: 'error',
        timeout: 5000,
      });
    }

    setDialogOpen(false);
  }, [
    selectedRepoPath,
    confirmAction,
    discardMutation,
    selectedFile,
    setSelectedFile,
    t,
    rootPath,
    queryClient,
    selectedSubmodulePath,
  ]);

  const handleCommit = useCallback(
    async (message: string) => {
      if (!selectedRepoPath || staged.length === 0) return;

      try {
        await commitMutation.mutateAsync({ workdir: selectedRepoPath, message });
        toastManager.add({
          title: t('Commit successful'),
          description: t('Committed {{count}} files', { count: staged.length }),
          type: 'success',
          timeout: 3000,
        });
        setSelectedFile(null);
      } catch (error) {
        toastManager.add({
          title: t('Commit failed'),
          description: error instanceof Error ? error.message : t('Unknown error'),
          type: 'error',
          timeout: 5000,
        });
      }
    },
    [selectedRepoPath, staged.length, commitMutation, setSelectedFile, t]
  );

  const isCommitting = commitMutation.isPending;

  // Handle file click in current changes view - clear commit selection
  const handleFileClick = useCallback(
    (file: { path: string; staged: boolean }) => {
      setSelectedCommitHash(null);
      setSelectedCommitFile(null);
      setExpandedCommitHash(null);
      setSelectedSubmoduleFile(null);
      if (selectedSubmodulePath) {
        setSelectedSubmoduleFile({ ...file, submodulePath: selectedSubmodulePath });
      } else {
        setSelectedFile(file);
      }
    },
    [setSelectedFile, selectedSubmodulePath]
  );

  // Handle commit click in history view - toggle expansion
  const handleCommitClick = useCallback(
    (hash: string) => {
      if (expandedCommitHash === hash) {
        // Collapse if already expanded
        setExpandedCommitHash(null);
        setSelectedCommitHash(null);
        setSelectedCommitFile(null);
      } else {
        // Expand new commit
        setExpandedCommitHash(hash);
        setSelectedCommitHash(hash);
        setSelectedCommitFile(null);
      }
    },
    [expandedCommitHash]
  );

  // Handle file click in commit history view
  const handleCommitFileClick = useCallback(
    (filePath: string) => {
      setSelectedCommitFile(filePath);
      setNavigationDirection('next');
    },
    [setNavigationDirection]
  );

  // File navigation
  const currentFileIndex = selectedFile
    ? allFiles.findIndex((f) => f.path === selectedFile.path && f.staged === selectedFile.staged)
    : -1;

  const handlePrevFile = useCallback(() => {
    if (currentFileIndex > 0) {
      const prevFile = allFiles[currentFileIndex - 1];
      setNavigationDirection('prev');
      setSelectedFile({ path: prevFile.path, staged: prevFile.staged });
    }
  }, [currentFileIndex, allFiles, setSelectedFile, setNavigationDirection]);

  const handleNextFile = useCallback(() => {
    if (currentFileIndex < allFiles.length - 1) {
      const nextFile = allFiles[currentFileIndex + 1];
      setNavigationDirection('next');
      setSelectedFile({ path: nextFile.path, staged: nextFile.staged });
    }
  }, [currentFileIndex, allFiles, setSelectedFile, setNavigationDirection]);

  // Commit file navigation
  const currentCommitFileIndex = selectedCommitFile
    ? commitFiles.findIndex((f) => f.path === selectedCommitFile)
    : -1;

  const handlePrevCommitFile = useCallback(() => {
    if (currentCommitFileIndex > 0) {
      const prevFile = commitFiles[currentCommitFileIndex - 1];
      setNavigationDirection('prev');
      setSelectedCommitFile(prevFile.path);
    }
  }, [currentCommitFileIndex, commitFiles, setNavigationDirection]);

  const handleNextCommitFile = useCallback(() => {
    if (currentCommitFileIndex < commitFiles.length - 1) {
      const nextFile = commitFiles[currentCommitFileIndex + 1];
      setNavigationDirection('next');
      setSelectedCommitFile(nextFile.path);
    }
  }, [currentCommitFileIndex, commitFiles, setNavigationDirection]);

  if (!rootPath) {
    return (
      <Empty className="h-full">
        <EmptyMedia variant="icon">
          <GitBranch className="h-4.5 w-4.5" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t('Version Control')}</EmptyTitle>
          <EmptyDescription>{t('Select a Worktree to view changes')}</EmptyDescription>
        </EmptyHeader>
        {onExpandWorktree && worktreeCollapsed && (
          <Button onClick={onExpandWorktree} variant="outline" className="mt-2">
            <GitBranch className="mr-2 h-4 w-4" />
            {t('Choose Worktree')}
          </Button>
        )}
      </Empty>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('Loading...')}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar Expand Button (when collapsed) */}
        <AnimatePresence initial={false}>
          {sidebarCollapsed && (
            <motion.button
              key="sidebar-expand"
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="flex h-full w-6 shrink-0 items-center justify-center border-r text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground transition-colors"
              title={t('Show sidebar')}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 24, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={panelTransition}
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Left: Changes List */}
        <AnimatePresence initial={false}>
          {!sidebarCollapsed && (
            <motion.div
              key="sidebar"
              className="flex shrink-0 flex-col border-r overflow-hidden"
              style={{ width: panelWidth }}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: panelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={panelTransition}
            >
              {/* Repositories Section (VSCode-style) */}
              <RepositoryList
                repositories={repositories}
                selectedId={selectedRepo?.path ?? null}
                onSelect={handleRepoSelect}
                expanded={reposExpanded}
                onToggleExpand={() => setReposExpanded(!reposExpanded)}
                onCollapseSidebar={() => setSidebarCollapsed(true)}
                isSyncing={isSyncing}
                onSync={handleSync}
                onPublish={handlePublish}
                onCheckout={handleBranchCheckout}
                isCheckingOut={checkoutMutation.isPending}
              />

              {/* Changes Section (Collapsible) */}
              <div
                className={cn(
                  'flex flex-col border-b transition-all duration-200 ease-out',
                  changesExpanded ? 'flex-1 min-h-0' : 'shrink-0'
                )}
              >
                <div className="group flex items-center shrink-0 rounded-sm hover:bg-accent/50 transition-colors pr-4">
                  <button
                    type="button"
                    onClick={() => setChangesExpanded(!changesExpanded)}
                    className="flex flex-1 items-center gap-2 px-4 py-2 text-left focus:outline-none"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200',
                        !changesExpanded && '-rotate-90'
                      )}
                    />
                    <GitBranch className="h-4 w-4" />
                    <span className="text-sm font-medium shrink-0">{t('Changes')}</span>
                    {currentChanges.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({currentChanges.length})
                      </span>
                    )}
                  </button>

                  {/* Branch Switcher - uses selected repo's branches */}
                  <BranchSwitcher
                    currentBranch={selectedRepo?.branch ?? null}
                    branches={currentBranches}
                    onCheckout={(branch) =>
                      selectedRepoPath && handleBranchCheckout(selectedRepoPath, branch)
                    }
                    isLoading={currentBranchesLoading}
                    isCheckingOut={checkoutMutation.isPending}
                    size="xs"
                  />
                </div>

                {/* Collapsible content with AnimatePresence for proper unmounting */}
                <AnimatePresence initial={false}>
                  {changesExpanded && (
                    <motion.div
                      key="changes-content"
                      variants={heightVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={springFast}
                      className="flex flex-col flex-1 min-h-0 overflow-hidden"
                    >
                      {/* Warning for skipped directories - only for main repo */}
                      {!selectedSubmodulePath && skippedDirs && skippedDirs.length > 0 && (
                        <div className="mx-2 mt-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
                          <span className="font-medium">{t('Performance warning')}:</span>{' '}
                          {t('Skipped {{dirs}} (not in .gitignore)', {
                            dirs: skippedDirs.join(', '),
                          })}
                        </div>
                      )}
                      {!selectedSubmodulePath && fileChangesResult?.truncated && (
                        <div className="mx-2 mt-2 rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
                          {t('Too many changes, showing first {{count}}.', {
                            count:
                              fileChangesResult.truncatedLimit ?? fileChangesResult.changes.length,
                          })}
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden min-h-0">
                        <ChangesList
                          staged={staged}
                          unstaged={unstaged}
                          selectedFile={selectedSubmodulePath ? null : selectedFile}
                          onFileClick={handleFileClick}
                          onStage={handleStage}
                          onUnstage={handleUnstage}
                          onDiscard={handleDiscard}
                          onDeleteUntracked={handleDeleteUntracked}
                          onRefresh={async () => {
                            if (selectedSubmodulePath) {
                              refetchSubmoduleChanges();
                              refetchSubmoduleCommits();
                            } else if (rootPath) {
                              await fetchMutation.mutateAsync({ workdir: rootPath });
                              refetch();
                              refetchCommits();
                              refetchStatus();
                            }
                          }}
                          isRefreshing={
                            selectedSubmodulePath
                              ? submoduleChangesLoading
                              : isFetching || fetchMutation.isPending
                          }
                          repoPath={selectedRepoPath}
                          sessionId={sessionId}
                        />
                      </div>
                      {/* Commit Box */}
                      <CommitBox
                        stagedCount={staged.length}
                        onCommit={handleCommit}
                        isCommitting={isCommitting}
                        rootPath={selectedRepoPath}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* History Section (Collapsible) */}
              <div
                className={cn(
                  'flex flex-col transition-all duration-200 ease-out',
                  historyExpanded ? 'flex-1 min-h-0' : 'shrink-0'
                )}
              >
                <div className="group flex items-center shrink-0 rounded-sm hover:bg-accent/50 transition-colors">
                  <button
                    type="button"
                    onClick={() => setHistoryExpanded(!historyExpanded)}
                    className="flex flex-1 items-center gap-2 px-4 py-2 text-left focus:outline-none"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200',
                        !historyExpanded && '-rotate-90'
                      )}
                    />
                    <History className="h-4 w-4" />
                    <span className="text-sm font-medium">{t('History')}</span>
                  </button>
                </div>

                {/* Collapsible content with AnimatePresence for proper unmounting */}
                <AnimatePresence initial={false}>
                  {historyExpanded && (
                    <motion.div
                      key="history-content"
                      variants={heightVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={springFast}
                      className="flex-1 min-h-0 overflow-hidden"
                    >
                      <div className="h-full">
                        <CommitHistoryList
                          commits={currentCommits}
                          selectedHash={selectedCommitHash}
                          onCommitClick={handleCommitClick}
                          isLoading={currentCommitsLoading}
                          isFetchingNextPage={currentIsFetchingNextPage}
                          hasNextPage={currentHasNextPage}
                          onLoadMore={() => {
                            if (currentHasNextPage && !currentIsFetchingNextPage) {
                              currentFetchNextPage();
                            }
                          }}
                          expandedCommitHash={expandedCommitHash}
                          commitFiles={commitFiles}
                          commitFilesLoading={commitFilesLoading}
                          selectedFile={selectedCommitFile}
                          onFileClick={handleCommitFileClick}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Resize Handle */}
        {!sidebarCollapsed && (
          <div
            className={cn(
              'group flex w-1 shrink-0 cursor-col-resize items-center justify-center hover:bg-accent',
              isResizing && 'bg-accent'
            )}
            onMouseDown={handleMouseDown}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </div>
        )}

        {/* Right: Diff Viewer */}
        <div className="flex flex-1 overflow-hidden">
          {selectedCommitHash ? (
            <div className="flex-1 overflow-hidden">
              <CommitDiffViewer
                rootPath={selectedRepoPath ?? rootPath ?? ''}
                fileDiff={commitDiff}
                filePath={selectedCommitFile}
                isActive={isActive}
                isLoading={commitDiffLoading}
                onPrevFile={handlePrevCommitFile}
                onNextFile={handleNextCommitFile}
                hasPrevFile={currentCommitFileIndex > 0}
                hasNextFile={currentCommitFileIndex < commitFiles.length - 1}
                sessionId={sessionId}
              />
            </div>
          ) : selectedSubmoduleFile && rootPath ? (
            <div className="flex-1 overflow-hidden">
              <DiffViewer
                rootPath={joinPath(rootPath, selectedSubmoduleFile.submodulePath)}
                file={{ path: selectedSubmoduleFile.path, staged: selectedSubmoduleFile.staged }}
                diff={submoduleFileDiff ?? undefined}
                skipFetch={true}
                isActive={isActive}
                sessionId={sessionId}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <DiffViewer
                rootPath={selectedRepoPath ?? rootPath ?? ''}
                file={selectedFile}
                isActive={isActive}
                onPrevFile={handlePrevFile}
                onNextFile={handleNextFile}
                hasPrevFile={currentFileIndex > 0}
                hasNextFile={currentFileIndex < allFiles.length - 1}
                sessionId={sessionId}
              />
            </div>
          )}
        </div>
      </div>

      {/* Discard/Delete Confirmation Dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'discard'
                ? confirmAction.paths.length > 1
                  ? t('Discard {{count}} changes', { count: confirmAction.paths.length })
                  : t('Discard changes')
                : (confirmAction?.paths.length ?? 0) > 1
                  ? t('Delete {{count}} files', { count: confirmAction?.paths.length ?? 0 })
                  : t('Delete file')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.paths.length === 1
                ? confirmAction.type === 'discard'
                  ? tNode(
                      'Are you sure you want to discard changes to {{path}}? This cannot be undone.',
                      {
                        path: (
                          <span className="font-medium text-foreground break-all">
                            {confirmAction.paths[0]}
                          </span>
                        ),
                      }
                    )
                  : tNode(
                      'Are you sure you want to delete the untracked file {{path}}? This cannot be undone.',
                      {
                        path: (
                          <span className="font-medium text-foreground break-all">
                            {confirmAction.paths[0]}
                          </span>
                        ),
                      }
                    )
                : confirmAction?.type === 'discard'
                  ? t(
                      'Are you sure you want to discard changes to {{count}} files? This cannot be undone.',
                      { count: confirmAction.paths.length }
                    )
                  : t(
                      'Are you sure you want to delete {{count}} untracked files? This cannot be undone.',
                      { count: confirmAction?.paths.length ?? 0 }
                    )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={handleConfirmAction}>
              {confirmAction?.type === 'discard' ? t('Discard') : t('Delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
