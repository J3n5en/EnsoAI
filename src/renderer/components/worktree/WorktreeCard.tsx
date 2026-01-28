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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlowCard, useGlowEffectEnabled } from '@/components/ui/glow-card';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useWorktreeOutputState } from '@/hooks/useOutputState';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface WorktreeCardProps {
  worktree: GitWorktree;
  status?: GitStatus | null;
  isActive?: boolean;
  onSelect?: (worktree: GitWorktree) => void;
  onOpenTerminal?: (worktree: GitWorktree) => void;
  onOpenInFinder?: (worktree: GitWorktree) => void;
  onCopyPath?: (worktree: GitWorktree) => void;
  onRemove?: (worktree: GitWorktree) => void;
  // Drag reorder props
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
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
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: WorktreeCardProps) {
  const { t } = useI18n();
  const branchName = worktree.branch || t('Detached HEAD');
  const hasChanges = status && !status.isClean;
  const changedFilesCount = status
    ? status.staged.length + status.modified.length + status.untracked.length
    : 0;
  const outputState = useWorktreeOutputState(worktree.path);
  const glowEnabled = useGlowEffectEnabled();

  // Common card content
  const cardContent = (
    <>
      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-primary z-20" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <GitBranch className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{branchName}</span>
          {worktree.isMainWorktree && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              {t('Primary')}
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
                {t('Open in Terminal')}
              </MenuItem>
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInFinder?.(worktree);
                }}
              >
                <Folder className="mr-2 h-4 w-4" />
                {t('Show in Finder')}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyPath?.(worktree);
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t('Copy Path')}
              </MenuItem>
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  // Open in external editor
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('Open in IDE')}
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
                {t('Delete Worktree')}
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
            {t('You have {{count}} changed files', { count: changedFilesCount })}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-muted" />
            {t('Workspace clean')}
          </span>
        )}
        {status?.ahead && status.ahead > 0 && (
          <span className="text-blue-500">
            {t('{{count}} commits ahead', { count: status.ahead })}
          </span>
        )}
        {status?.behind && status.behind > 0 && (
          <span className="text-orange-500">
            {t('{{count}} commits behind', { count: status.behind })}
          </span>
        )}
      </div>
    </>
  );

  // When glow effect is disabled, use plain button
  if (!glowEnabled) {
    return (
      <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'group relative w-full text-left rounded-lg border bg-card p-4 transition-all hover:shadow-md',
          isActive && 'border-primary ring-1 ring-primary/20',
          worktree.isLocked && 'opacity-75'
        )}
        onClick={() => onSelect?.(worktree)}
      >
        {cardContent}
      </button>
    );
  }

  // Glow effect enabled
  return (
    <GlowCard
      state={outputState}
      as="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group relative w-full text-left rounded-lg border bg-card p-4 transition-all hover:shadow-md',
        isActive && 'border-primary ring-1 ring-primary/20',
        worktree.isLocked && 'opacity-75'
      )}
      onClick={() => onSelect?.(worktree)}
    >
      {cardContent}
    </GlowCard>
  );
}
