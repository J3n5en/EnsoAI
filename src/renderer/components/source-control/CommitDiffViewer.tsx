import type { FileDiff } from '@shared/types';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { DiffViewer } from '@/components/source-control/DiffViewer';
import { useI18n } from '@/i18n';

interface CommitDiffViewerProps {
  rootPath: string;
  fileDiff: FileDiff | null | undefined;
  filePath: string | null;
  isLoading?: boolean;
  onPrevFile?: () => void;
  onNextFile?: () => void;
  hasPrevFile?: boolean;
  hasNextFile?: boolean;
  sessionId?: string | null;
}

export function CommitDiffViewer({
  rootPath,
  fileDiff,
  filePath,
  isLoading = false,
  onPrevFile,
  onNextFile,
  hasPrevFile = false,
  hasNextFile = false,
  sessionId,
}: CommitDiffViewerProps) {
  const { t } = useI18n();

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
      <div className="flex h-full">
        <div className="flex flex-1 items-center justify-center">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-sm text-muted-foreground">{t('Select a file to view changes')}</p>
          )}
        </div>
      </div>
    );
  }

  // Only render DiffViewer when we have valid data
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-hidden">
        <DiffViewer
          rootPath={rootPath}
          file={{ path: filePath, staged: false }}
          diff={diffData}
          isCommitView
          onPrevFile={onPrevFile}
          onNextFile={onNextFile}
          hasPrevFile={hasPrevFile}
          hasNextFile={hasNextFile}
          sessionId={sessionId}
        />
      </div>
    </div>
  );
}
