import type { CommitFileChange } from '@shared/types';
import { FileEdit, FilePlus, FileX, Loader2, PanelLeftClose } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface CommitFileListProps {
  files: CommitFileChange[];
  selectedFile: string | null;
  onFileClick: (path: string) => void;
  isLoading?: boolean;
  commitHash?: string;
  onCollapse?: () => void;
}

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

export function CommitFileList({
  files,
  selectedFile,
  onFileClick,
  isLoading = false,
  commitHash,
  onCollapse,
}: CommitFileListProps) {
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('No file changes in this commit')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">
            {t('Changed files ({{count}})', { count: files.length })}
          </h3>
          {commitHash && (
            <p className="text-xs text-muted-foreground font-mono">{commitHash.substring(0, 7)}</p>
          )}
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            title={t('Hide changed files')}
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 px-1 py-2">
          {files.map((file) => {
            const Icon = getFileIcon(file.status);
            const isSelected = selectedFile === file.path;
            return (
              <button
                type="button"
                key={file.path}
                className={cn(
                  'flex h-7 w-full items-center gap-2 rounded-sm px-2 text-sm text-left transition-colors',
                  isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
                onClick={() => onFileClick(file.path)}
                title={file.path}
              >
                <Icon
                  className={cn('h-4 w-4 shrink-0', isSelected ? '' : getStatusColor(file.status))}
                />
                <span
                  className={cn(
                    'shrink-0 font-mono text-xs',
                    isSelected ? '' : getStatusColor(file.status)
                  )}
                >
                  {file.status}
                </span>
                <span className="min-w-0 flex-1 truncate">{file.path}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
