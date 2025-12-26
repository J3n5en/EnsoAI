import type { FileDiff } from '@shared/types';
import { Loader2, PanelLeft } from 'lucide-react';
import { useMemo } from 'react';
import { DiffViewer } from '@/components/source-control/DiffViewer';
import { useI18n } from '@/i18n';

interface CommitDiffViewerProps {
  rootPath: string;
  fileDiff: FileDiff | null | undefined;
  filePath: string | null;
  isLoading?: boolean;
  filesCollapsed?: boolean;
  onExpandFiles?: () => void;
}

export function CommitDiffViewer({
  rootPath,
  fileDiff,
  filePath,
  isLoading = false,
  filesCollapsed = false,
  onExpandFiles,
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
        {/* Expand button when files panel is collapsed */}
        {filesCollapsed && onExpandFiles && (
          <button
            type="button"
            onClick={onExpandFiles}
            className="flex h-full w-6 shrink-0 items-center justify-center border-r text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground transition-colors"
            title={t('Show changed files')}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        )}
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
      {/* Expand button when files panel is collapsed */}
      {filesCollapsed && onExpandFiles && (
        <button
          type="button"
          onClick={onExpandFiles}
          className="flex h-full w-6 shrink-0 items-center justify-center border-r text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground transition-colors"
          title={t('Show changed files')}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex-1 overflow-hidden">
        <DiffViewer
          rootPath={rootPath}
          file={{ path: filePath, staged: false }}
          diff={diffData}
          isCommitView
        />
      </div>
    </div>
  );
}
