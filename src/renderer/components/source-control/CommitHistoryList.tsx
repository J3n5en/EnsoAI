import type { GitLogEntry } from '@shared/types';
import { GitCommit, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
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
}

export function CommitHistoryList({
  commits,
  selectedHash,
  onCommitClick,
  isLoading = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  onLoadMore,
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
    <ScrollArea className="h-full">
      <div className="space-y-0.5 p-2">
        {commits.map((commit) => {
          const isSelected = selectedHash === commit.hash;
          return (
            <button
              type="button"
              key={commit.hash}
              className={cn(
                'group flex w-full items-start gap-2 rounded-sm px-3 py-2 text-left transition-colors',
                isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
              onClick={() => onCommitClick(commit.hash)}
              title={commit.message}
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
                  <div className="mt-1 flex flex-wrap gap-1">
                    {commit.refs.split(', ').map((ref) => (
                      <span
                        key={ref}
                        className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                      >
                        {ref.replace('HEAD ->', '').replace('tag:', '').trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
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
