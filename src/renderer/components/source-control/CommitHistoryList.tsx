import type { CommitFileChange, GitLogEntry } from '@shared/types';
import { FileEdit, FilePlus, FileX, GitCommit, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

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
}

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
}: CommitHistoryListProps) {
  const { t, locale } = useI18n();
  const observerTarget = useRef<HTMLDivElement>(null);

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
                        {new Date(commit.date).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                      </span>
                    </div>
                    <div className="mt-1 border-t border-border/50 pt-1.5">
                      <span className="text-muted-foreground">Message:</span>
                      <p className="mt-0.5">{commit.message}</p>
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
    </ScrollArea>
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
