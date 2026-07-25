import type { CommitFileChange, GitGraphLogEntry, GitGraphRefs } from '@shared/types';
import { useMemo } from 'react';
import { CommitHistoryList } from './CommitHistoryList';
import { buildCommitGraphLayout } from './commitGraphLayout';

export interface CommitGraphHistoryListProps {
  commits: GitGraphLogEntry[];
  selectedHash: string | null;
  onCommitClick: (hash: string) => void;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  expandedCommitHash?: string | null;
  commitFiles?: CommitFileChange[];
  commitFilesLoading?: boolean;
  selectedFile?: string | null;
  onFileClick?: (filePath: string) => void;
  workdir?: string;
  onRefresh?: () => void;
  graphRefs: GitGraphRefs;
  mergeBase: string | null;
}

/** 图表视图沿用提交操作和文件展开逻辑，但使用独立的图表行布局。 */
export function CommitGraphHistoryList({
  commits,
  graphRefs,
  mergeBase,
  ...props
}: CommitGraphHistoryListProps) {
  // 图表布局依赖完整引用和共同祖先，避免在共享列表中重复计算。
  const graphRows = useMemo(
    () => buildCommitGraphLayout(commits, graphRefs, mergeBase),
    [commits, graphRefs, mergeBase]
  );

  return (
    <CommitHistoryList
      {...props}
      commits={commits}
      graphRefs={graphRefs}
      graphRows={graphRows}
      graphView
    />
  );
}
