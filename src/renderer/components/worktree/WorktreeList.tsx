import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import type { GitStatus, GitWorktree } from '@shared/types';
import { GitBranch } from 'lucide-react';
import { WorktreeCard } from './WorktreeCard';

interface WorktreeListProps {
  worktrees: GitWorktree[];
  statusMap?: Map<string, GitStatus>;
  activeWorktreePath?: string | null;
  isLoading?: boolean;
  onSelect?: (worktree: GitWorktree) => void;
  onOpenTerminal?: (worktree: GitWorktree) => void;
  onOpenInFinder?: (worktree: GitWorktree) => void;
  onCopyPath?: (worktree: GitWorktree) => void;
  onRemove?: (worktree: GitWorktree) => void;
}

export function WorktreeList({
  worktrees,
  statusMap,
  activeWorktreePath,
  isLoading,
  onSelect,
  onOpenTerminal,
  onOpenInFinder,
  onCopyPath,
  onRemove,
}: WorktreeListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <WorktreeCardSkeleton key={`skeleton-${i}`} />
        ))}
      </div>
    );
  }

  if (worktrees.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <GitBranch className="h-12 w-12 text-muted-foreground/50" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>暂无 Worktree</EmptyTitle>
          <EmptyDescription>点击右上角按钮创建第一个 Worktree</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {worktrees.map((worktree) => (
        <WorktreeCard
          key={worktree.path}
          worktree={worktree}
          status={statusMap?.get(worktree.path)}
          isActive={activeWorktreePath === worktree.path}
          onSelect={onSelect}
          onOpenTerminal={onOpenTerminal}
          onOpenInFinder={onOpenInFinder}
          onCopyPath={onCopyPath}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function WorktreeCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mt-2 h-4 w-48" />
      <Skeleton className="mt-3 h-3 w-24" />
    </div>
  );
}
