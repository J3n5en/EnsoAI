import type { CommitFileChange, GitLogEntry } from '@shared/types';
import {
  Copy,
  FileEdit,
  FilePlus,
  FileX,
  GitCommit,
  Loader2,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toastManager } from '@/components/ui/toast';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { type ResetMode, ResetModeDialog } from './ResetModeDialog';

interface CommitHistoryListProps {
  commits: GitLogEntry[];
  selectedHash: string | null;
  onCommitClick: (hash: string) => void;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  // Inline files expansion
  expandedCommitHash?: string | null;
  commitFiles?: CommitFileChange[];
  commitFilesLoading?: boolean;
  selectedFile?: string | null;
  onFileClick?: (filePath: string) => void;
  // Git operations
  workdir?: string;
  onRefresh?: () => void;
}

const RESET_MODE_LABELS: Record<ResetMode, string> = {
  soft: 'Soft Reset',
  mixed: 'Mixed Reset',
  hard: 'Hard Reset',
};

export function CommitHistoryList({
  commits,
  selectedHash,
  onCommitClick,
  isLoading = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  onLoadMore,
  expandedCommitHash,
  commitFiles = [],
  commitFilesLoading = false,
  selectedFile,
  onFileClick,
  workdir,
  onRefresh,
}: CommitHistoryListProps) {
  const { t, locale } = useI18n();
  const observerTarget = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    position: { x: number; y: number };
    commit: GitLogEntry | null;
  }>({ open: false, position: { x: 0, y: 0 }, commit: null });
  const [resetDialog, setResetDialog] = useState<{
    open: boolean;
    commit: GitLogEntry | null;
  }>({ open: false, commit: null });

  const handleContextMenu = useCallback((e: React.MouseEvent, commit: GitLogEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ open: true, position: { x: e.clientX, y: e.clientY }, commit });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, open: false, commit: null }));
  }, []);

  const handleCopyCommitId = useCallback(async () => {
    if (!contextMenu.commit) return;
    try {
      await navigator.clipboard.writeText(contextMenu.commit.hash);
      toastManager.add({
        title: t('Copied'),
        description: t('Commit ID copied to clipboard'),
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
    closeContextMenu();
  }, [contextMenu.commit, closeContextMenu, t]);

  const handleRevert = useCallback(async () => {
    if (!contextMenu.commit || !workdir) return;
    closeContextMenu();
    try {
      await window.electronAPI.git.revert(workdir, contextMenu.commit.hash);
      toastManager.add({
        title: t('Revert successful'),
        description: t('Commit has been reverted'),
        type: 'success',
        timeout: 3000,
      });
      onRefresh?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastManager.add({
        title: t('Revert failed'),
        description: message,
        type: 'error',
        timeout: 5000,
      });
    }
  }, [contextMenu.commit, workdir, closeContextMenu, t, onRefresh]);

  const handleResetClick = useCallback(() => {
    if (!contextMenu.commit) return;
    setResetDialog({ open: true, commit: contextMenu.commit });
    closeContextMenu();
  }, [contextMenu.commit, closeContextMenu]);

  const handleResetConfirm = useCallback(
    async (mode: ResetMode) => {
      if (!resetDialog.commit || !workdir) return;
      setResetDialog({ open: false, commit: null });
      try {
        await window.electronAPI.git.reset(workdir, resetDialog.commit.hash, mode);
        toastManager.add({
          title: t('Reset successful'),
          description: t('Reset to {{mode}} mode', { mode: t(RESET_MODE_LABELS[mode]) }),
          type: 'success',
          timeout: 3000,
        });
        onRefresh?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toastManager.add({
          title: t('Reset failed'),
          description: message,
          type: 'error',
          timeout: 5000,
        });
      }
    },
    [resetDialog.commit, workdir, t, onRefresh]
  );

  const handleResetCancel = useCallback(() => {
    setResetDialog({ open: false, commit: null });
  }, []);

  // Adjust context menu position to prevent overflow
  useLayoutEffect(() => {
    if (!contextMenu.open || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    let { x, y } = contextMenu.position;

    if (rect.bottom > viewportHeight - 8) {
      y = Math.max(8, viewportHeight - rect.height - 8);
    }
    if (rect.right > viewportWidth - 8) {
      x = Math.max(8, viewportWidth - rect.width - 8);
    }
    if (x !== contextMenu.position.x || y !== contextMenu.position.y) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }, [contextMenu.open, contextMenu.position]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return t('Just now');
    if (diffHours < 24) return t('{{count}} hours ago', { count: diffHours });
    if (diffDays < 7) return t('{{count}} days ago', { count: diffDays });
    return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US');
  };

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    const observerTargetRef = observerTarget.current;
    if (!observerTargetRef || !onLoadMore || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(observerTargetRef);

    return () => {
      if (observerTargetRef) {
        observer.unobserve(observerTargetRef);
      }
    };
  }, [onLoadMore, hasNextPage, isFetchingNextPage]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-muted-foreground">
        <GitCommit className="mb-2 h-10 w-10 opacity-50" />
        <p className="text-sm">{t('No commits yet')}</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-full min-h-0">
        <div className="space-y-0.5 p-2">
          {commits.map((commit) => {
            const isSelected = selectedHash === commit.hash;
            const isExpanded = expandedCommitHash === commit.hash;
            return (
              <div key={commit.hash} className="border-b border-border/50 last:border-0">
                <Tooltip>
                  <TooltipTrigger
                    className={cn(
                      'group flex w-full items-start rounded-sm px-3 py-2 text-left transition-colors',
                      isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    )}
                    onClick={() => onCommitClick(commit.hash)}
                    onContextMenu={(e) => handleContextMenu(e, commit)}
                  >
                    {/* Message & Metadata */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{commit.message}</p>
                      <div
                        className={cn(
                          'mt-0.5 flex items-center gap-2 text-xs',
                          isSelected ? 'text-accent-foreground/70' : 'text-muted-foreground'
                        )}
                      >
                        <span className="truncate">{commit.author_name}</span>
                        <span>·</span>
                        <span>{formatDate(commit.date)}</span>
                      </div>
                      {commit.refs && (
                        <div
                          className="mt-1 flex gap-1 overflow-hidden"
                          title={commit.refs}
                          style={{
                            maskImage:
                              'linear-gradient(to right, black calc(100% - 24px), transparent)',
                            WebkitMaskImage:
                              'linear-gradient(to right, black calc(100% - 24px), transparent)',
                          }}
                        >
                          {commit.refs.split(', ').map((ref) => (
                            <span
                              key={ref}
                              className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                            >
                              {ref.replace('HEAD ->', '').replace('tag:', '').trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipPopup className="max-w-md" side="right" align="start" sideOffset={4}>
                    <div className="text-xs space-y-1.5 whitespace-pre-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Hash:</span>
                        <span className="font-mono">{commit.hash.slice(0, 8)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Author:</span>
                        <span>{commit.author_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Date:</span>
                        <span>
                          {new Date(commit.date).toLocaleString(
                            locale === 'zh' ? 'zh-CN' : 'en-US'
                          )}
                        </span>
                      </div>
                      <div className="mt-1 border-t border-border/50 pt-1.5">
                        <span className="text-muted-foreground">Message:</span>
                        <p className="mt-0.5 break-words">{commit.fullMessage}</p>
                      </div>
                    </div>
                  </TooltipPopup>
                </Tooltip>

                {/* Inline File List Expansion */}
                {isExpanded && (
                  <div className="px-3 pb-2">
                    {commitFilesLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : commitFiles.length === 0 ? (
                      <div className="flex items-center justify-center py-4 text-muted-foreground">
                        <p className="text-xs">{t('No file changes in this commit')}</p>
                      </div>
                    ) : (
                      <div className="mt-1 space-y-0.5 rounded-sm bg-muted/30 p-1">
                        {commitFiles.map((file) => {
                          const Icon = getFileIcon(file.status);
                          const isFileSelected = selectedFile === file.path;
                          return (
                            <button
                              type="button"
                              key={file.path}
                              className={cn(
                                'flex h-7 w-full items-center gap-2 rounded-sm px-2 text-sm text-left transition-colors',
                                isFileSelected
                                  ? 'bg-accent text-accent-foreground'
                                  : 'hover:bg-accent/50'
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                onFileClick?.(file.path);
                              }}
                              title={file.path}
                            >
                              <Icon
                                className={cn(
                                  'h-3.5 w-3.5 shrink-0',
                                  isFileSelected ? '' : getStatusColor(file.status)
                                )}
                              />
                              <span
                                className={cn(
                                  'shrink-0 font-mono text-[10px]',
                                  isFileSelected ? '' : getStatusColor(file.status)
                                )}
                              >
                                {file.status}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs">{file.path}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading indicator for infinite scroll */}
          {(isFetchingNextPage || hasNextPage) && (
            <div ref={observerTarget} className="flex items-center justify-center py-4">
              {isFetchingNextPage && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        {/* Commit context menu */}
        {contextMenu.open && contextMenu.commit && (
          <>
            <div
              className="fixed inset-0 z-50"
              onClick={closeContextMenu}
              onKeyDown={(e) => e.key === 'Escape' && closeContextMenu()}
              onContextMenu={(e) => {
                e.preventDefault();
                closeContextMenu();
              }}
              role="presentation"
            />
            <div
              ref={contextMenuRef}
              className="fixed z-50 min-w-40 rounded-lg border bg-popover p-1 shadow-lg"
              style={{ left: contextMenu.position.x, top: contextMenu.position.y }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
                onClick={handleCopyCommitId}
              >
                <Copy className="h-4 w-4" />
                {t('Copy Commit ID')}
              </button>
              {workdir && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
                    onClick={handleRevert}
                  >
                    <Undo2 className="h-4 w-4" />
                    {t('Revert commit')}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                    onClick={handleResetClick}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t('Reset to commit')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </ScrollArea>

      {/* Reset mode dialog */}
      {resetDialog.commit && (
        <ResetModeDialog
          open={resetDialog.open}
          commitHash={resetDialog.commit.hash}
          commitMessage={resetDialog.commit.message}
          onConfirm={handleResetConfirm}
          onCancel={handleResetCancel}
        />
      )}
    </>
  );
}

// Helper functions for file icons and status colors
function getFileIcon(status: CommitFileChange['status']) {
  switch (status) {
    case 'A':
      return FilePlus;
    case 'D':
      return FileX;
    default:
      return FileEdit;
  }
}

function getStatusColor(status: CommitFileChange['status']) {
  switch (status) {
    case 'A':
      return 'text-green-500';
    case 'D':
      return 'text-red-500';
    case 'M':
      return 'text-orange-500';
    case 'R':
    case 'C':
      return 'text-blue-500';
    case 'X':
      return 'text-purple-500';
    default:
      return 'text-muted-foreground';
  }
}
