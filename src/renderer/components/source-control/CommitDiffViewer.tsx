import type { FileDiff } from '@shared/types';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { DiffViewer } from '@/components/source-control/DiffViewer';

interface CommitDiffViewerProps {
  rootPath: string;
  fileDiff: FileDiff | null | undefined;
  filePath: string | null;
  isLoading?: boolean;
}

export function CommitDiffViewer({
  rootPath,
  fileDiff,
  filePath,
  isLoading = false,
}: CommitDiffViewerProps) {
  // Memoize diff data to prevent unnecessary remounts
  const diffData = useMemo(
    () => ({
      path: filePath ?? '',
      original: fileDiff?.original ?? '',
      modified: fileDiff?.modified ?? '',
    }),
    [filePath, fileDiff]
  );

  // Don't render DiffViewer while loading or without data
  if (isLoading || !filePath || !fileDiff) {
    return (
      <div className="flex h-full items-center justify-center">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <p className="text-sm text-muted-foreground">选择一个文件以查看更改</p>
        )}
      </div>
    );
  }

  // Only render DiffViewer when we have valid data
  return (
    <DiffViewer
      rootPath={rootPath}
      file={{ path: filePath, staged: false }}
      diff={diffData}
      isCommitView
    />
  );
}
