import type { CommitFileChange } from '@shared/types';
import { ChevronRight, FileEdit, FilePlus, FileX, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface CommitFileListProps {
  files: CommitFileChange[];
  selectedFile: string | null;
  onFileClick: (path: string) => void;
  isLoading?: boolean;
  commitHash?: string;
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

function getStatusText(status: CommitFileChange['status']) {
  switch (status) {
    case 'A':
      return '新增';
    case 'D':
      return '删除';
    case 'M':
      return '修改';
    case 'R':
      return '重命名';
    case 'C':
      return '复制';
    case 'X':
      return '冲突';
    default:
      return '';
  }
}

function getStatusColor(status: CommitFileChange['status']) {
  switch (status) {
    case 'A':
      return 'text-green-500';
    case 'D':
      return 'text-red-500';
    case 'M':
      return 'text-yellow-500';
    case 'R':
    case 'C':
      return 'text-blue-500';
    case 'X':
      return 'text-orange-500';
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
}: CommitFileListProps) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">此提交没有文件更改</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b px-4 py-2">
        <h3 className="text-sm font-medium">更改的文件 ({files.length})</h3>
        {commitHash && (
          <p className="mt-1 text-xs text-muted-foreground font-mono">
            {commitHash.substring(0, 7)}
          </p>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {files.map((file) => {
            const Icon = getFileIcon(file.status);
            const isSelected = selectedFile === file.path;
            return (
              <button
                type="button"
                key={file.path}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors',
                  'hover:bg-accent',
                  isSelected && 'bg-accent'
                )}
                onClick={() => onFileClick(file.path)}
              >
                <Icon className={cn('h-4 w-4 shrink-0', getStatusColor(file.status))} />
                <span className="min-w-0 flex-1 truncate text-sm">{file.path}</span>
                <span className={cn('shrink-0 text-xs', getStatusColor(file.status))}>
                  {getStatusText(file.status)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
