import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import type { GitStatus, GitWorktree } from '@shared/types';
import {
  Copy,
  ExternalLink,
  Folder,
  GitBranch,
  Lock,
  MoreVertical,
  Terminal,
  Trash2,
} from 'lucide-react';

interface WorktreeCardProps {
  worktree: GitWorktree;
  status?: GitStatus | null;
  isActive?: boolean;
  onSelect?: (worktree: GitWorktree) => void;
  onOpenTerminal?: (worktree: GitWorktree) => void;
  onOpenInFinder?: (worktree: GitWorktree) => void;
  onCopyPath?: (worktree: GitWorktree) => void;
  onRemove?: (worktree: GitWorktree) => void;
}

export function WorktreeCard({
  worktree,
  status,
  isActive,
  onSelect,
  onOpenTerminal,
  onOpenInFinder,
  onCopyPath,
  onRemove,
}: WorktreeCardProps) {
  const branchName = worktree.branch?.replace('refs/heads/', '') || 'detached HEAD';
  const hasChanges = status && !status.isClean;
  const changedFilesCount = status
    ? status.staged.length + status.modified.length + status.untracked.length
    : 0;

  return (
    <button
      type="button"
      className={cn(
        'group relative w-full text-left rounded-lg border bg-card p-4 transition-all hover:shadow-md',
        isActive && 'border-primary ring-1 ring-primary/20',
        worktree.isLocked && 'opacity-75'
      )}
      onClick={() => onSelect?.(worktree)}
    >
      {/* Active indicator */}
      {isActive && <div className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-primary" />}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <GitBranch className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{branchName}</span>
          {worktree.isMainWorktree && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              primary
            </Badge>
          )}
          {worktree.isLocked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTerminal?.(worktree);
            }}
          >
            <Terminal className="h-4 w-4" />
          </Button>

          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
            />
            <MenuPopup>
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTerminal?.(worktree);
                }}
              >
                <Terminal className="mr-2 h-4 w-4" />
                在终端中打开
              </MenuItem>
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInFinder?.(worktree);
                }}
              >
                <Folder className="mr-2 h-4 w-4" />在 Finder 中显示
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyPath?.(worktree);
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                复制路径
              </MenuItem>
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  // Open in external editor
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />在 IDE 中打开
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                className="text-destructive focus:text-destructive"
                disabled={worktree.isMainWorktree}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(worktree);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除 Worktree
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>

      {/* Path */}
      <p className="mt-1 truncate text-sm text-muted-foreground">{worktree.path}</p>

      {/* Status */}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        {hasChanges ? (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {changedFilesCount} 个文件已更改
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-muted" />
            工作区干净
          </span>
        )}
        {status?.ahead && status.ahead > 0 && (
          <span className="text-blue-500">{status.ahead} commits ahead</span>
        )}
        {status?.behind && status.behind > 0 && (
          <span className="text-orange-500">{status.behind} commits behind</span>
        )}
      </div>
    </button>
  );
}
