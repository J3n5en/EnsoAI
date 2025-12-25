import type { FileChange, FileChangeStatus } from '@shared/types';
import {
  FileEdit,
  FilePlus,
  FileWarning,
  FileX,
  List,
  Minus,
  Plus,
  RotateCcw,
  TreeDeciduous,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSourceControlStore } from '@/stores/sourceControl';
import { ChangesTree } from './ChangesTree';

interface ChangesListProps {
  staged: FileChange[];
  unstaged: FileChange[];
  selectedFile: { path: string; staged: boolean } | null;
  onFileClick: (file: { path: string; staged: boolean }) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (path: string) => void;
  onDeleteUntracked?: (path: string) => void;
}

// M=Modified, A=Added, D=Deleted, R=Renamed, C=Copied, U=Untracked, X=Conflict
const statusIcons: Record<FileChangeStatus, React.ElementType> = {
  M: FileEdit,
  A: FilePlus,
  D: FileX,
  R: FileEdit,
  C: FilePlus,
  U: FilePlus, // Untracked - new file not yet staged
  X: FileWarning, // Conflict
};

const statusColors: Record<FileChangeStatus, string> = {
  M: 'text-orange-500',
  A: 'text-green-500',
  D: 'text-red-500',
  R: 'text-blue-500',
  C: 'text-blue-500',
  U: 'text-green-500', // Untracked shows as green (new file)
  X: 'text-purple-500', // Conflict
};

function FileItem({
  file,
  isSelected,
  onFileClick,
  onAction,
  actionIcon: ActionIcon,
  actionTitle,
  onDiscard,
}: {
  file: FileChange;
  isSelected: boolean;
  onFileClick: () => void;
  onAction: () => void;
  actionIcon: React.ElementType;
  actionTitle: string;
  onDiscard?: () => void;
}) {
  const Icon = statusIcons[file.status];

  return (
    <div
      className={cn(
        'group relative flex h-7 items-center gap-2 rounded-sm px-2 text-sm cursor-pointer transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
      onClick={onFileClick}
      onKeyDown={(e) => e.key === 'Enter' && onFileClick()}
      role="button"
      tabIndex={0}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isSelected ? '' : statusColors[file.status])} />

      <span
        className={cn('shrink-0 font-mono text-xs', isSelected ? '' : statusColors[file.status])}
      >
        {file.status}
      </span>

      <span className="min-w-0 flex-1 truncate">{file.path}</span>

      {/* Action buttons */}
      <div className="hidden shrink-0 items-center group-hover:flex">
        {onDiscard && (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            title="放弃更改"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          title={actionTitle}
        >
          <ActionIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ChangesList({
  staged,
  unstaged,
  selectedFile,
  onFileClick,
  onStage,
  onUnstage,
  onDiscard,
  onDeleteUntracked,
}: ChangesListProps) {
  const { viewMode, setViewMode } = useSourceControlStore();

  // Separate tracked and untracked changes
  const trackedChanges = unstaged.filter((f) => f.status !== 'U');
  const untrackedChanges = unstaged.filter((f) => f.status === 'U');

  const handleStageAll = () => {
    const paths = unstaged.map((f) => f.path);
    if (paths.length > 0) onStage(paths);
  };

  const handleUnstageAll = () => {
    const paths = staged.map((f) => f.path);
    if (paths.length > 0) onUnstage(paths);
  };

  const handleStageTracked = () => {
    const paths = trackedChanges.map((f) => f.path);
    if (paths.length > 0) onStage(paths);
  };

  const handleStageUntracked = () => {
    const paths = untrackedChanges.map((f) => f.path);
    if (paths.length > 0) onStage(paths);
  };

  // If tree mode, use ChangesTree component
  if (viewMode === 'tree') {
    return (
      <div className="flex h-full flex-col">
        {/* View Mode Toggle */}
        <div className="flex h-9 shrink-0 items-center justify-end border-b px-3">
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setViewMode(viewMode === 'list' ? 'tree' : 'list')}
            title={viewMode === 'list' ? '切换到树形视图' : '切换到列表视图'}
          >
            {viewMode === 'list' ? (
              <>
                <TreeDeciduous className="h-3.5 w-3.5" />
                <span>树形视图</span>
              </>
            ) : (
              <>
                <List className="h-3.5 w-3.5" />
                <span>列表视图</span>
              </>
            )}
          </button>
        </div>
        {/* Tree View */}
        <div className="flex-1 overflow-hidden">
          <ChangesTree
            staged={staged}
            trackedChanges={trackedChanges}
            untrackedChanges={untrackedChanges}
            selectedFile={selectedFile}
            onFileClick={onFileClick}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
            onDeleteUntracked={onDeleteUntracked}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* View Mode Toggle */}
      <div className="flex h-9 shrink-0 items-center justify-end border-b px-3">
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setViewMode(viewMode === 'list' ? 'tree' : 'list')}
          title={viewMode === 'list' ? '切换到树形视图' : '切换到列表视图'}
        >
          {viewMode === 'list' ? (
            <>
              <TreeDeciduous className="h-3.5 w-3.5" />
              <span>树形视图</span>
            </>
          ) : (
            <>
              <List className="h-3.5 w-3.5" />
              <span>列表视图</span>
            </>
          )}
        </button>
      </div>
      {/* List View */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* Staged Changes */}
          {staged.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  暂存的更改 ({staged.length})
                </h3>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleUnstageAll}
                >
                  全部取消暂存
                </button>
              </div>
              <div className="space-y-0.5">
                {staged.map((file) => (
                  <FileItem
                    key={`staged-${file.path}`}
                    file={file}
                    isSelected={selectedFile?.path === file.path && selectedFile?.staged === true}
                    onFileClick={() => onFileClick({ path: file.path, staged: true })}
                    onAction={() => onUnstage([file.path])}
                    actionIcon={Minus}
                    actionTitle="取消暂存"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tracked Changes */}
          {trackedChanges.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  更改 ({trackedChanges.length})
                </h3>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleStageTracked}
                >
                  全部暂存
                </button>
              </div>
              <div className="space-y-0.5">
                {trackedChanges.map((file) => (
                  <FileItem
                    key={`unstaged-${file.path}`}
                    file={file}
                    isSelected={selectedFile?.path === file.path && selectedFile?.staged === false}
                    onFileClick={() => onFileClick({ path: file.path, staged: false })}
                    onAction={() => onStage([file.path])}
                    actionIcon={Plus}
                    actionTitle="暂存"
                    onDiscard={() => onDiscard(file.path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Untracked Changes */}
          {untrackedChanges.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  未跟踪的更改 ({untrackedChanges.length})
                </h3>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleStageUntracked}
                >
                  全部暂存
                </button>
              </div>
              <div className="space-y-0.5">
                {untrackedChanges.map((file) => (
                  <FileItem
                    key={`untracked-${file.path}`}
                    file={file}
                    isSelected={selectedFile?.path === file.path && selectedFile?.staged === false}
                    onFileClick={() => onFileClick({ path: file.path, staged: false })}
                    onAction={() => onStage([file.path])}
                    actionIcon={Plus}
                    actionTitle="暂存"
                    onDiscard={onDeleteUntracked ? () => onDeleteUntracked(file.path) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {staged.length === 0 && trackedChanges.length === 0 && untrackedChanges.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <p className="text-sm">没有更改</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
