import { FileEdit, FilePlus, FileQuestion, FileX, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

type FileStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?';

interface FileChangesProps {
  title: string;
  files: string[];
  type: 'staged' | 'unstaged' | 'untracked';
  selectedFiles?: Set<string>;
  onFileSelect?: (path: string, selected: boolean) => void;
  onFileClick?: (path: string) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
}

const statusIcons: Record<FileStatus, React.ElementType> = {
  M: FileEdit,
  A: FilePlus,
  D: FileX,
  R: FileEdit,
  C: FilePlus,
  U: FileQuestion,
  '?': FileQuestion,
};

const statusColors: Record<FileStatus, string> = {
  M: 'text-orange-500',
  A: 'text-green-500',
  D: 'text-red-500',
  R: 'text-blue-500',
  C: 'text-blue-500',
  U: 'text-purple-500',
  '?': 'text-muted-foreground',
};

export function FileChanges({
  title,
  files,
  type,
  selectedFiles,
  onFileSelect,
  onFileClick,
  onStageAll,
  onUnstageAll,
  onStageFile,
  onUnstageFile,
}: FileChangesProps) {
  const { t } = useI18n();
  const getFileStatus = (_path: string): FileStatus => {
    if (type === 'untracked') return '?';
    // In a real implementation, this would come from the git status
    return 'M';
  };

  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {title} ({files.length})
        </h3>
        {type === 'staged' && onUnstageAll && (
          <Button variant="ghost" size="sm" onClick={onUnstageAll}>
            {t('Unstage all')}
          </Button>
        )}
        {(type === 'unstaged' || type === 'untracked') && onStageAll && (
          <Button variant="ghost" size="sm" onClick={onStageAll}>
            {t('Stage all')}
          </Button>
        )}
      </div>

      <ScrollArea className="max-h-48">
        <div className="space-y-1">
          {files.map((file) => {
            const status = getFileStatus(file);
            const _Icon = statusIcons[status];
            const isSelected = selectedFiles?.has(file);

            return (
              <div
                key={file}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                  isSelected && 'bg-accent'
                )}
              >
                {onFileSelect && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => onFileSelect(file, checked === true)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}

                <span className={cn('shrink-0 font-mono text-xs', statusColors[status])}>
                  {status}
                </span>

                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() => onFileClick?.(file)}
                >
                  {file}
                </button>

                <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                  {type === 'staged' && onUnstageFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => onUnstageFile(file)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {(type === 'unstaged' || type === 'untracked') && onStageFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => onStageFile(file)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
