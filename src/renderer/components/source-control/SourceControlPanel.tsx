import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CloudUpload,
  GitBranch,
  GripVertical,
  History,
  Loader2,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react';
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
import { useGitPull, useGitPush, useGitStatus } from '@/hooks/useGit';
import { useCommitDiff, useCommitFiles, useGitHistoryInfinite } from '@/hooks/useGitHistory';
import { useFileChanges, useGitFetch } from '@/hooks/useSourceControl';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSourceControlStore } from '@/stores/sourceControl';
import { ChangesList } from './ChangesList';
import { CommitBox } from './CommitBox';
import { CommitDiffViewer } from './CommitDiffViewer';
import { CommitHistoryList } from './CommitHistoryList';
import { panelTransition } from './constants';
import { DiffViewer } from './DiffViewer';
import { usePanelResize } from './usePanelResize';
import { useSourceControlActions } from './useSourceControlActions';

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

  // Accordion state - collapsible sections
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // History view state
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null);
  const [expandedCommitHash, setExpandedCommitHash] = useState<string | null>(null);

  const {
    data: fileChangesResult,
    isLoading,
    isFetching,
    refetch,
  } = useFileChanges(rootPath ?? null, isActive);

  const changes = fileChangesResult?.changes;
  const skippedDirs = fileChangesResult?.skippedDirs;

  // Git sync status
  const { data: gitStatus, refetch: refetchStatus } = useGitStatus(rootPath ?? null, isActive);
  const pushMutation = useGitPush();
  const pullMutation = useGitPull();
  const fetchMutation = useGitFetch();
  const isSyncing = pushMutation.isPending || pullMutation.isPending;

  const {
    data: commitsData,
    isLoading: commitsLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch: refetchCommits,
  } = useGitHistoryInfinite(rootPath ?? null, 20);

  // Refetch immediately when tab becomes active
  useEffect(() => {
    if (isActive && rootPath) {
      refetch();
      refetchCommits();
      refetchStatus();
    }
  }, [isActive, rootPath, refetch, refetchCommits, refetchStatus]);

  // Sync handler: pull first (if behind), then push (if ahead)
  const handleSync = useCallback(async () => {
    if (!rootPath || isSyncing) return;

    try {
      let pulled = false;
      let pushed = false;

      // Pull first if behind
      if (gitStatus?.behind && gitStatus.behind > 0) {
        await pullMutation.mutateAsync({ workdir: rootPath });
        pulled = true;
      }
      // Then push if ahead
      if (gitStatus?.ahead && gitStatus.ahead > 0) {
        await pushMutation.mutateAsync({ workdir: rootPath });
        pushed = true;
      }
      // Refetch all data after sync
      refetch();
      refetchCommits();
      refetchStatus();

      // Show success toast
      if (pulled || pushed) {
        const actions = [pulled && t('Pulled'), pushed && t('Pushed')].filter(Boolean).join(' & ');
        toastManager.add({
          title: t('Sync completed'),
          description: actions,
          type: 'success',
          timeout: 3000,
        });
      }
    } catch {
      // Errors are handled by mutation's onError
    }
  }, [
    rootPath,
    isSyncing,
    gitStatus,
    pullMutation,
    pushMutation,
    refetch,
    refetchCommits,
    refetchStatus,
    t,
  ]);

  // Publish branch handler: push with --set-upstream
  const handlePublish = useCallback(async () => {
    if (!rootPath || !gitStatus?.current || pushMutation.isPending) return;

    try {
      await pushMutation.mutateAsync({
        workdir: rootPath,
        remote: 'origin',
        branch: gitStatus.current,
        setUpstream: true,
      });
      // Refetch all data after publish
      refetch();
      refetchCommits();
      refetchStatus();

      toastManager.add({
        title: t('Branch published'),
        description: t('Branch {{branch}} is now tracking origin/{{branch}}', {
          branch: gitStatus.current,
        }),
        type: 'success',
        timeout: 3000,
      });
    } catch {
      // Errors are handled by mutation's onError
    }
  }, [rootPath, gitStatus?.current, pushMutation, refetch, refetchCommits, refetchStatus, t]);

  // Flatten infinite query data
  const commits = commitsData?.pages.flat() ?? [];
  const { data: commitFiles = [], isLoading: commitFilesLoading } = useCommitFiles(
    rootPath ?? null,
    selectedCommitHash
  );

  // Find the status of the selected file to pass to useCommitDiff
  const selectedFileStatus = commitFiles.find((f) => f.path === selectedCommitFile)?.status;

  const { data: commitDiff, isLoading: commitDiffLoading } = useCommitDiff(
    rootPath ?? null,
    selectedCommitHash,
    selectedCommitFile,
    selectedFileStatus
  );

  const { selectedFile, setSelectedFile, setNavigationDirection } = useSourceControlStore();

  const staged = useMemo(() => changes?.filter((c) => c.staged) ?? [], [changes]);
  const unstaged = useMemo(() => changes?.filter((c) => !c.staged) ?? [], [changes]);

  // All files in order: staged first, then unstaged
  const allFiles = useMemo(() => [...staged, ...unstaged], [staged, unstaged]);

  // Panel resize hooks
  const { width: panelWidth, isResizing, containerRef, handleMouseDown } = usePanelResize();

  // Source control actions
  const {
    handleStage,
    handleUnstage,
    handleDiscard,
    handleDeleteUntracked,
    handleCommit,
    confirmAction,
    setConfirmAction,
    handleConfirmAction,
    isCommitting,
  } = useSourceControlActions({ rootPath, stagedCount: staged.length });

  // Handle file click in current changes view - clear commit selection
  const handleFileClick = useCallback(
    (file: { path: string; staged: boolean }) => {
      setSelectedCommitHash(null);
      setSelectedCommitFile(null);
      setExpandedCommitHash(null);
      setSelectedFile(file);
    },
    [setSelectedFile]
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
      <Empty>
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
              {/* Changes Section (Collapsible) */}
              <div
                className={cn(
                  'flex flex-col border-b',
                  changesExpanded ? 'flex-1 min-h-0' : 'shrink-0'
                )}
              >
                <div className="group flex items-center shrink-0 rounded-sm hover:bg-accent/50 transition-colors">
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
                    <span className="text-sm font-medium">{t('Changes')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(true)}
                    className="mr-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 group-hover:text-foreground transition-colors"
                    title={t('Hide sidebar')}
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </div>

                {changesExpanded && (
                  <>
                    {/* Warning for skipped directories */}
                    {skippedDirs && skippedDirs.length > 0 && (
                      <div className="mx-2 mt-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
                        <span className="font-medium">{t('Performance warning')}:</span>{' '}
                        {t('Skipped {{dirs}} (not in .gitignore)', {
                          dirs: skippedDirs.join(', '),
                        })}
                      </div>
                    )}
                    <div className="flex-1 overflow-hidden min-h-0">
                      <ChangesList
                        staged={staged}
                        unstaged={unstaged}
                        selectedFile={selectedFile}
                        onFileClick={handleFileClick}
                        onStage={handleStage}
                        onUnstage={handleUnstage}
                        onDiscard={handleDiscard}
                        onDeleteUntracked={handleDeleteUntracked}
                        onRefresh={async () => {
                          if (rootPath) {
                            await fetchMutation.mutateAsync({ workdir: rootPath });
                          }
                          refetch();
                          refetchCommits();
                          refetchStatus();
                        }}
                        isRefreshing={isFetching || fetchMutation.isPending}
                        repoPath={rootPath}
                      />
                    </div>
                    {/* Commit Box */}
                    <CommitBox
                      stagedCount={staged.length}
                      onCommit={handleCommit}
                      isCommitting={isCommitting}
                      rootPath={rootPath}
                    />
                  </>
                )}
              </div>

              {/* History Section (Collapsible) */}
              <div className={cn('flex flex-col', historyExpanded ? 'flex-1 min-h-0' : 'shrink-0')}>
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

                  {/* Publish Branch Button - when no upstream */}
                  {!gitStatus?.tracking && gitStatus?.current && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePublish();
                      }}
                      disabled={pushMutation.isPending}
                      className="mr-2 flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                      title={t('Publish branch to remote')}
                    >
                      {pushMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <CloudUpload className="h-3 w-3" />
                          <span>{t('Publish')}</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Sync Button - when has upstream and ahead/behind */}
                  {gitStatus?.tracking && (gitStatus.ahead > 0 || gitStatus.behind > 0) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSync();
                      }}
                      disabled={isSyncing}
                      className="mr-2 flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                      title={t('Sync with remote')}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          {gitStatus.ahead > 0 && (
                            <span className="flex items-center gap-0.5 text-blue-500">
                              <ArrowUp className="h-3 w-3" />
                              {gitStatus.ahead}
                            </span>
                          )}
                          {gitStatus.behind > 0 && (
                            <span className="flex items-center gap-0.5 text-orange-500">
                              <ArrowDown className="h-3 w-3" />
                              {gitStatus.behind}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  )}
                </div>

                {historyExpanded && (
                  <div className="h-full flex-1 overflow-hidden min-h-0">
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
                      onFileClick={handleCommitFileClick}
                    />
                  </div>
                )}
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
                rootPath={rootPath}
                fileDiff={commitDiff}
                filePath={selectedCommitFile}
                isLoading={commitDiffLoading}
                onPrevFile={handlePrevCommitFile}
                onNextFile={handleNextCommitFile}
                hasPrevFile={currentCommitFileIndex > 0}
                hasNextFile={currentCommitFileIndex < commitFiles.length - 1}
                sessionId={sessionId}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <DiffViewer
                rootPath={rootPath}
                file={selectedFile}
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
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
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
