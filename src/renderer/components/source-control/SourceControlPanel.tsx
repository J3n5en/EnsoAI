import { ChevronDown, GitBranch, GripVertical, History } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useCommitDiff, useCommitFiles, useGitHistoryInfinite } from '@/hooks/useGitHistory';
import {
  useFileChanges,
  useGitCommit,
  useGitDiscard,
  useGitStage,
  useGitUnstage,
} from '@/hooks/useSourceControl';
import { cn } from '@/lib/utils';
import { useSourceControlStore } from '@/stores/sourceControl';
import { ChangesList } from './ChangesList';
import { CommitBox } from './CommitBox';
import { CommitDiffViewer } from './CommitDiffViewer';
import { CommitFileList } from './CommitFileList';
import { CommitHistoryList } from './CommitHistoryList';
import { DiffViewer } from './DiffViewer';

const MIN_WIDTH = 180;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 256;

interface SourceControlPanelProps {
  rootPath: string | undefined;
  isActive?: boolean;
  onExpandWorktree?: () => void;
  worktreeCollapsed?: boolean;
}

export function SourceControlPanel({
  rootPath,
  isActive = false,
  onExpandWorktree,
  worktreeCollapsed,
}: SourceControlPanelProps) {
  // Accordion state - collapsible sections
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // History view state
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null);

  const { data: changes, isLoading } = useFileChanges(rootPath ?? null, isActive);
  const {
    data: commitsData,
    isLoading: commitsLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useGitHistoryInfinite(rootPath ?? null, 20);

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

  // Handle file click in current changes view - clear commit selection
  const handleFileClick = useCallback(
    (file: { path: string; staged: boolean }) => {
      setSelectedCommitHash(null);
      setSelectedCommitFile(null);
      setSelectedFile(file);
    },
    [setSelectedFile]
  );

  // Handle file click in commit history view - always navigate to first diff
  const handleCommitFileClick = useCallback(
    (filePath: string) => {
      setSelectedCommitFile(filePath);
      setNavigationDirection('next'); // Navigate to first diff
    },
    [setNavigationDirection]
  );
  const stageMutation = useGitStage();
  const unstageMutation = useGitUnstage();
  const discardMutation = useGitDiscard();
  const commitMutation = useGitCommit();

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Discard/Delete confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    path: string;
    type: 'discard' | 'delete';
  } | null>(null);

  const staged = useMemo(() => changes?.filter((c) => c.staged) ?? [], [changes]);
  const unstaged = useMemo(() => changes?.filter((c) => !c.staged) ?? [], [changes]);

  // All files in order: staged first, then unstaged
  const allFiles = useMemo(() => [...staged, ...unstaged], [staged, unstaged]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Attach global mouse events for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleStage = useCallback(
    (paths: string[]) => {
      if (rootPath) {
        stageMutation.mutate({ workdir: rootPath, paths });
      }
    },
    [rootPath, stageMutation]
  );

  const handleUnstage = useCallback(
    (paths: string[]) => {
      if (rootPath) {
        unstageMutation.mutate({ workdir: rootPath, paths });
      }
    },
    [rootPath, unstageMutation]
  );

  const handleDiscard = useCallback((path: string) => {
    setConfirmAction({ path, type: 'discard' });
  }, []);

  const handleDeleteUntracked = useCallback((path: string) => {
    setConfirmAction({ path, type: 'delete' });
  }, []);

  const handleConfirmAction = useCallback(async () => {
    if (!rootPath || !confirmAction) return;

    try {
      if (confirmAction.type === 'discard') {
        discardMutation.mutate({ workdir: rootPath, path: confirmAction.path });
      } else {
        // Delete untracked file
        await window.electronAPI.file.delete(`${rootPath}/${confirmAction.path}`, {
          recursive: false,
        });
        // Invalidate queries to refresh the file list
        stageMutation.mutate({ workdir: rootPath, paths: [] });
      }

      // Clear selection if affecting selected file
      if (selectedFile?.path === confirmAction.path) {
        setSelectedFile(null);
      }
    } catch (error) {
      toastManager.add({
        title: confirmAction.type === 'discard' ? '放弃更改失败' : '删除文件失败',
        description: error instanceof Error ? error.message : '未知错误',
        type: 'error',
        duration: 5000,
      });
    }

    setConfirmAction(null);
  }, [rootPath, confirmAction, discardMutation, selectedFile, setSelectedFile, stageMutation]);

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

  const handleCommit = useCallback(
    async (message: string) => {
      if (!rootPath || staged.length === 0) return;

      try {
        await commitMutation.mutateAsync({ workdir: rootPath, message });
        toastManager.add({
          title: '提交成功',
          description: `已提交 ${staged.length} 个文件`,
          type: 'success',
          duration: 3000,
        });
        setSelectedFile(null);
      } catch (error) {
        toastManager.add({
          title: '提交失败',
          description: error instanceof Error ? error.message : '未知错误',
          type: 'error',
          duration: 5000,
        });
      }
    },
    [rootPath, staged.length, commitMutation, setSelectedFile]
  );

  if (!rootPath) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <GitBranch className="h-4.5 w-4.5" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>源代码管理</EmptyTitle>
          <EmptyDescription>选择一个 Worktree 以查看更改</EmptyDescription>
        </EmptyHeader>
        {onExpandWorktree && worktreeCollapsed && (
          <Button onClick={onExpandWorktree} variant="outline" className="mt-2">
            <GitBranch className="mr-2 h-4 w-4" />
            选择 Worktree
          </Button>
        )}
      </Empty>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">加载中...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Changes List */}
        <div className="flex shrink-0 flex-col border-r" style={{ width: panelWidth }}>
          {/* Changes Section (Collapsible) */}
          <div
            className={cn(
              'flex flex-col border-b',
              changesExpanded ? 'flex-1 min-h-0' : 'shrink-0'
            )}
          >
            <button
              type="button"
              onClick={() => setChangesExpanded(!changesExpanded)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-accent transition-colors shrink-0"
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  !changesExpanded && 'rotate-180'
                )}
              />
              <GitBranch className="h-4 w-4" />
              <span className="text-sm font-medium">更改</span>
            </button>

            {changesExpanded && (
              <>
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
                  />
                </div>
                {/* Commit Box */}
                <CommitBox
                  stagedCount={staged.length}
                  onCommit={handleCommit}
                  isCommitting={commitMutation.isPending}
                />
              </>
            )}
          </div>

          {/* History Section (Collapsible) */}
          <div className={cn('flex flex-col', historyExpanded ? 'flex-1 min-h-0' : 'shrink-0')}>
            <button
              type="button"
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-accent transition-colors shrink-0"
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  !historyExpanded && 'rotate-180'
                )}
              />
              <History className="h-4 w-4" />
              <span className="text-sm font-medium">历史记录</span>
            </button>

            {historyExpanded && (
              <div className="flex-1 overflow-auto min-h-0">
                <CommitHistoryList
                  commits={commits}
                  selectedHash={selectedCommitHash}
                  onCommitClick={(hash) => {
                    setSelectedCommitHash(hash);
                    setSelectedCommitFile(null);
                  }}
                  isLoading={commitsLoading}
                  isFetchingNextPage={isFetchingNextPage}
                  hasNextPage={hasNextPage}
                  onLoadMore={() => {
                    if (hasNextPage && !isFetchingNextPage) {
                      fetchNextPage();
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className={cn(
            'group flex w-1 shrink-0 cursor-col-resize items-center justify-center hover:bg-accent',
            isResizing && 'bg-accent'
          )}
          onMouseDown={handleMouseDown}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </div>

        {/* Right: Diff Viewer or Commit Details */}
        <div className="flex flex-1 overflow-hidden">
          {selectedCommitHash ? (
            <>
              {/* Commit File List */}
              <div className="shrink-0 border-r" style={{ width: panelWidth }}>
                <CommitFileList
                  files={commitFiles}
                  selectedFile={selectedCommitFile}
                  onFileClick={handleCommitFileClick}
                  isLoading={commitFilesLoading}
                  commitHash={selectedCommitHash}
                />
              </div>

              {/* Commit Diff Viewer */}
              <div className="flex-1 overflow-hidden">
                <CommitDiffViewer
                  rootPath={rootPath}
                  fileDiff={commitDiff}
                  filePath={selectedCommitFile}
                  isLoading={commitDiffLoading}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-hidden">
              <DiffViewer
                rootPath={rootPath}
                file={selectedFile}
                onPrevFile={handlePrevFile}
                onNextFile={handleNextFile}
                hasPrevFile={currentFileIndex > 0}
                hasNextFile={currentFileIndex < allFiles.length - 1}
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
              {confirmAction?.type === 'discard' ? '放弃更改' : '删除文件'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'discard' ? (
                <>
                  确定要放弃{' '}
                  <span className="font-medium text-foreground">{confirmAction.path}</span>{' '}
                  的更改吗？此操作不可撤销。
                </>
              ) : (
                <>
                  确定要删除未跟踪的文件{' '}
                  <span className="font-medium text-foreground">{confirmAction?.path}</span>{' '}
                  吗？此操作不可撤销。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">取消</Button>} />
            <Button variant="destructive" onClick={handleConfirmAction}>
              {confirmAction?.type === 'discard' ? '放弃更改' : '删除文件'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
