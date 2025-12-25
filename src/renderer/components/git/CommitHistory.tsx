import type { GitLogEntry } from '@shared/types';
import { ChevronRight, GitCommit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CommitHistoryProps {
  commits: GitLogEntry[];
  onViewMore?: () => void;
  onCommitClick?: (commit: GitLogEntry) => void;
  maxHeight?: string;
}

export function CommitHistory({
  commits,
  onViewMore,
  onCommitClick,
  maxHeight = '200px',
}: CommitHistoryProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return '刚刚';
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN');
  };

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <GitCommit className="mr-2 h-5 w-5" />
        暂无提交记录
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">最近提交</h3>
        {onViewMore && (
          <Button variant="ghost" size="sm" onClick={onViewMore}>
            查看更多
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea style={{ maxHeight }}>
        <div className="space-y-1">
          {commits.map((commit) => (
            <button
              type="button"
              key={commit.hash}
              className="group flex w-full items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
              onClick={() => onCommitClick?.(commit)}
            >
              {/* Message */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{commit.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {commit.author_name} · {formatDate(commit.date)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
