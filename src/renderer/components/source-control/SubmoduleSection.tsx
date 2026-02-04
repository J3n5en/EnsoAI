import type { GitSubmodule } from '@shared/types';
import { joinPath } from '@shared/utils/path';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FolderGit2,
  History,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
import { toastManager } from '@/components/ui/toast';
import { useCommitFiles, useGitHistoryInfinite } from '@/hooks/useGitHistory';
import {
  useCheckoutSubmoduleBranch,
  useCommitSubmodule,
  useDiscardSubmodule,
  useFetchSubmodule,
  usePullSubmodule,
  usePushSubmodule,
  useStageSubmodule,
  useSubmoduleBranches,
  useSubmoduleChanges,
  useUnstageSubmodule,
} from '@/hooks/useSubmodules';
import { useI18n } from '@/i18n';
import { heightVariants, springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { BranchSwitcher } from './BranchSwitcher';
import { ChangesList } from './ChangesList';
import { CommitBox } from './CommitBox';
import { CommitHistoryList } from './CommitHistoryList';

interface SubmoduleSectionProps {
  submodule: GitSubmodule;
  rootPath: string;
  expanded: boolean;
  onToggle: () => void;
  selectedFile: { path: string; staged: boolean; submodulePath?: string } | null;
  onFileClick: (file: { path: string; staged: boolean; submodulePath: string }) => void;
  selectedCommitFile?: string | null;
  onCommitFileClick?: (hash: string, filePath: string, submodulePath: string) => void;
  onClearCommitSelection?: () => void;
}

export function SubmoduleSection({
  submodule,
  rootPath,
  expanded,
  onToggle,
  selectedFile,
  onFileClick,
  selectedCommitFile,
  onCommitFileClick,
  onClearCommitSelection,
}: SubmoduleSectionProps) {
  const { t, tNode } = useI18n();

  // Fetch submodule changes
  const { data: changes = [], isLoading, refetch } = useSubmoduleChanges(rootPath, submodule.path);

  // Mutations
  const fetchMutation = useFetchSubmodule();
  const pullMutation = usePullSubmodule();
  const pushMutation = usePushSubmodule();
  const commitMutation = useCommitSubmodule();
  const stageMutation = useStageSubmodule();
  const unstageMutation = useUnstageSubmodule();
  const discardMutation = useDiscardSubmodule();

  const isSyncing = fetchMutation.isPending || pullMutation.isPending || pushMutation.isPending;

  // Tab state: 'changes' or 'history'
  const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes');

  // History state
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [expandedCommitHash, setExpandedCommitHash] = useState<string | null>(null);

  // History hooks - only fetch when History tab is active
  const {
    data: commitsData,
    isLoading: commitsLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useGitHistoryInfinite(activeTab === 'history' ? rootPath : null, 20, submodule.path);

  const commits = commitsData?.pages.flat() ?? [];

  const { data: commitFiles = [], isLoading: commitFilesLoading } = useCommitFiles(
    activeTab === 'history' ? rootPath : null,
    expandedCommitHash,
    submodule.path
  );

  // Branch switching
  const {
    data: branches = [],
    isLoading: branchesLoading,
    refetch: refetchBranches,
  } = useSubmoduleBranches(rootPath, submodule.path);
  const checkoutMutation = useCheckoutSubmoduleBranch();

  // Handle commit click - toggle expansion
  const handleCommitClick = useCallback(
    (hash: string) => {
      if (expandedCommitHash === hash) {
        // Collapse if already expanded
        setExpandedCommitHash(null);
        setSelectedCommitHash(null);
      } else {
        // Expand new commit
        setExpandedCommitHash(hash);
        setSelectedCommitHash(hash);
      }
    },
    [expandedCommitHash]
  );

  // Handle file click in commit history
  const handleHistoryFileClick = useCallback(
    (filePath: string) => {
      if (onCommitFileClick && expandedCommitHash) {
        onCommitFileClick(expandedCommitHash, filePath, submodule.path);
      }
    },
    [onCommitFileClick, expandedCommitHash, submodule.path]
  );

  // Handle tab change - clear selection state
  const handleTabChange = useCallback(
    (tab: 'changes' | 'history') => {
      setActiveTab(tab);
      // Clear history selection state when switching tabs
      setSelectedCommitHash(null);
      setExpandedCommitHash(null);
      // Notify parent to clear commit selection
      onClearCommitSelection?.();
    },
    [onClearCommitSelection]
  );

  // Confirmation dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'discard' | 'delete';
    paths: string[];
  } | null>(null);

  // Separate staged and unstaged
  const staged = useMemo(() => changes.filter((c) => c.staged), [changes]);
  const unstaged = useMemo(() => changes.filter((c) => !c.staged), [changes]);

  // Handlers
  const handleFetch = async () => {
    try {
      await fetchMutation.mutateAsync({ workdir: rootPath, submodulePath: submodule.path });
      refetch();
    } catch (error) {
      toastManager.add({
        title: t('Fetch failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handlePull = async () => {
    try {
      await pullMutation.mutateAsync({ workdir: rootPath, submodulePath: submodule.path });
      refetch();
      toastManager.add({
        title: t('Pull successful'),
        type: 'success',
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        title: t('Pull failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handlePush = async () => {
    try {
      await pushMutation.mutateAsync({ workdir: rootPath, submodulePath: submodule.path });
      toastManager.add({
        title: t('Pushed'),
        type: 'success',
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        title: t('Push failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleStage = async (paths: string[]) => {
    try {
      await stageMutation.mutateAsync({
        workdir: rootPath,
        submodulePath: submodule.path,
        paths,
      });
      refetch();
    } catch (error) {
      toastManager.add({
        title: t('Stage failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleUnstage = async (paths: string[]) => {
    try {
      await unstageMutation.mutateAsync({
        workdir: rootPath,
        submodulePath: submodule.path,
        paths,
      });
      refetch();
    } catch (error) {
      toastManager.add({
        title: t('Unstage failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleDiscard = (paths: string[]) => {
    setConfirmAction({ type: 'discard', paths });
    setDialogOpen(true);
  };

  const handleDeleteUntracked = (paths: string[]) => {
    setConfirmAction({ type: 'delete', paths });
    setDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    try {
      await discardMutation.mutateAsync({
        workdir: rootPath,
        submodulePath: submodule.path,
        paths: confirmAction.paths,
      });
      refetch();
      setDialogOpen(false);
      setConfirmAction(null);
    } catch (error) {
      toastManager.add({
        title: t('Discard failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleCommit = async (message: string) => {
    try {
      await commitMutation.mutateAsync({
        workdir: rootPath,
        submodulePath: submodule.path,
        message,
      });
      refetch();
      toastManager.add({
        title: t('Commit successful'),
        type: 'success',
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        title: t('Commit failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  // Branch checkout handler
  const handleBranchCheckout = useCallback(
    async (branch: string) => {
      try {
        await checkoutMutation.mutateAsync({
          workdir: rootPath,
          submodulePath: submodule.path,
          branch,
        });
        refetch();
        refetchBranches();
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
    [rootPath, submodule.path, checkoutMutation, refetch, refetchBranches, t]
  );

  const handleFileClick = (file: { path: string; staged: boolean }) => {
    onFileClick({ ...file, submodulePath: submodule.path });
  };

  // Check if this submodule's file is selected
  const getSelectedFile = () => {
    if (selectedFile?.submodulePath === submodule.path) {
      return { path: selectedFile.path, staged: selectedFile.staged };
    }
    return null;
  };

  return (
    <div
      className={cn(
        'flex flex-col border-t transition-all duration-200 ease-out',
        expanded ? 'flex-1 min-h-0' : 'shrink-0'
      )}
    >
      {/* Header */}
      <div className="group flex items-center shrink-0 rounded-sm hover:bg-accent/50 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 min-w-0 items-center gap-2 px-4 py-2 text-left focus:outline-none"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200',
              !expanded && '-rotate-90'
            )}
          />
          <FolderGit2 className="h-4 w-4 shrink-0 text-yellow-500" />
          <span className="text-sm font-medium min-w-0 truncate" title={submodule.name}>
            {submodule.name}
          </span>

          {/* Changes count */}
          {changes.length > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">({changes.length})</span>
          )}
        </button>

        {/* Branch Switcher */}
        <BranchSwitcher
          currentBranch={submodule.branch ?? null}
          branches={branches}
          onCheckout={handleBranchCheckout}
          isLoading={branchesLoading}
          isCheckingOut={checkoutMutation.isPending}
          size="sm"
        />

        {/* Sync buttons */}
        <div className="flex items-center gap-1 mr-2">
          {/* Ahead/Behind indicators with sync */}
          {(submodule.ahead > 0 || submodule.behind > 0) && (
            <div className="flex items-center gap-1 text-xs">
              {submodule.behind > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePull();
                  }}
                  disabled={isSyncing}
                  className="flex items-center gap-0.5 text-orange-500 hover:bg-accent rounded px-1 py-0.5 transition-colors disabled:opacity-50"
                  title={t('Pull')}
                >
                  {pullMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {submodule.behind}
                </button>
              )}
              {submodule.ahead > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePush();
                  }}
                  disabled={isSyncing}
                  className="flex items-center gap-0.5 text-blue-500 hover:bg-accent rounded px-1 py-0.5 transition-colors disabled:opacity-50"
                  title={t('Push')}
                >
                  {pushMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3 w-3" />
                  )}
                  {submodule.ahead}
                </button>
              )}
            </div>
          )}

          {/* Fetch button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleFetch();
            }}
            disabled={isSyncing}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
            title={t('Fetch')}
          >
            {fetchMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="submodule-content"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springFast}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {isLoading ? (
              <div className="flex h-20 items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <>
                {/* Tab Switcher */}
                <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/50">
                  <button
                    type="button"
                    onClick={() => handleTabChange('changes')}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm transition-colors',
                      activeTab === 'changes'
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    {t('Changes')}
                    {changes.length > 0 && <span className="text-[10px]">({changes.length})</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('history')}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm transition-colors',
                      activeTab === 'history'
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    <History className="h-3 w-3" />
                    {t('History')}
                  </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'changes' ? (
                  <>
                    {/* Changes List */}
                    <div className="flex-1 overflow-hidden min-h-0">
                      <ChangesList
                        staged={staged}
                        unstaged={unstaged}
                        selectedFile={getSelectedFile()}
                        onFileClick={handleFileClick}
                        onStage={handleStage}
                        onUnstage={handleUnstage}
                        onDiscard={handleDiscard}
                        onDeleteUntracked={handleDeleteUntracked}
                        onRefresh={() => {
                          handleFetch();
                          refetch();
                        }}
                        isRefreshing={isLoading || fetchMutation.isPending}
                        repoPath={joinPath(rootPath, submodule.path)}
                      />
                    </div>

                    {/* Commit Box */}
                    <CommitBox
                      stagedCount={staged.length}
                      onCommit={handleCommit}
                      isCommitting={commitMutation.isPending}
                      rootPath={joinPath(rootPath, submodule.path)}
                    />
                  </>
                ) : (
                  /* History List */
                  <div className="flex-1 overflow-hidden min-h-0">
                    <CommitHistoryList
                      commits={commits}
                      selectedHash={selectedCommitHash}
                      onCommitClick={handleCommitClick}
                      isLoading={commitsLoading}
                      isFetchingNextPage={isFetchingNextPage}
                      hasNextPage={hasNextPage}
                      onLoadMore={() => {
                        if (hasNextPage && !isFetchingNextPage) {
                          fetchNextPage();
                        }
                      }}
                      expandedCommitHash={expandedCommitHash}
                      commitFiles={commitFiles}
                      commitFilesLoading={commitFilesLoading}
                      selectedFile={selectedCommitFile}
                      onFileClick={handleHistoryFileClick}
                    />
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discard/Delete Confirmation Dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
