import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreateWorktreeDialog } from '@/components/worktree/CreateWorktreeDialog';
import { cn } from '@/lib/utils';
import type { GitBranch as GitBranchType, GitWorktree, WorktreeCreateOptions } from '@shared/types';
import {
  FolderOpen,
  GitBranch,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

interface WorktreePanelProps {
  worktrees: GitWorktree[];
  activeWorktree: GitWorktree | null;
  branches: GitBranchType[];
  projectName: string;
  isLoading?: boolean;
  isCreating?: boolean;
  onSelectWorktree: (worktree: GitWorktree) => void;
  onCreateWorktree: (options: WorktreeCreateOptions) => Promise<void>;
  onRemoveWorktree: (worktree: GitWorktree) => Promise<void>;
  onRefresh: () => void;
  width?: number;
  collapsed?: boolean;
  onCollapse?: () => void;
  workspaceCollapsed?: boolean;
  onExpandWorkspace?: () => void;
}

export function WorktreePanel({
  worktrees,
  activeWorktree,
  branches,
  projectName,
  isLoading,
  isCreating,
  onSelectWorktree,
  onCreateWorktree,
  onRemoveWorktree,
  onRefresh,
  width: _width = 280,
  collapsed: _collapsed = false,
  onCollapse,
  workspaceCollapsed = false,
  onExpandWorkspace,
}: WorktreePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [worktreeToDelete, setWorktreeToDelete] = useState<GitWorktree | null>(null);

  const filteredWorktrees = worktrees.filter(
    (wt) =>
      wt.branch?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wt.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="flex h-full w-full flex-col border-r bg-background">
      {/* Header with buttons */}
      <div
        className={cn(
          'flex h-12 items-center justify-end gap-1 border-b px-3 drag-region',
          workspaceCollapsed && 'pl-[70px]'
        )}
      >
        {/* Expand workspace button when collapsed */}
        {workspaceCollapsed && onExpandWorkspace && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 no-drag"
            onClick={onExpandWorkspace}
            title="展开 Workspace"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        )}
        {/* Create worktree button */}
        <CreateWorktreeDialog
          branches={branches}
          projectName={projectName}
          isLoading={isCreating}
          onSubmit={onCreateWorktree}
          trigger={
            <Button variant="ghost" size="icon" className="h-8 w-8 no-drag" title="新建 Worktree">
              <Plus className="h-4 w-4" />
            </Button>
          }
        />
        {/* Refresh button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 no-drag"
          onClick={onRefresh}
          title="刷新"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        {/* Collapse button */}
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 no-drag"
            onClick={onCollapse}
            title="折叠"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search bar */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search worktrees"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Worktree List */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <WorktreeItemSkeleton key={`skeleton-${i}`} />
            ))}
          </div>
        ) : filteredWorktrees.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {searchQuery ? '没有找到匹配的 Worktree' : '项目的 worktree'}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredWorktrees.map((worktree) => (
              <WorktreeItem
                key={worktree.path}
                worktree={worktree}
                isActive={activeWorktree?.path === worktree.path}
                onClick={() => onSelectWorktree(worktree)}
                onDelete={() => setWorktreeToDelete(worktree)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!worktreeToDelete}
        onOpenChange={(open) => !open && setWorktreeToDelete(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Worktree</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 worktree <strong>{worktreeToDelete?.branch}</strong> 吗？
              {worktreeToDelete?.prunable ? (
                <span className="block mt-2 text-muted-foreground">
                  该目录已被删除，将清理 git 记录。
                </span>
              ) : (
                <span className="block mt-2 text-destructive">
                  这将删除目录及其中所有文件，此操作不可撤销！
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">取消</Button>} />
            <Button
              variant="destructive"
              onClick={async () => {
                if (worktreeToDelete) {
                  await onRemoveWorktree(worktreeToDelete);
                  setWorktreeToDelete(null);
                }
              }}
            >
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </aside>
  );
}

interface WorktreeItemProps {
  worktree: GitWorktree;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function WorktreeItem({ worktree, isActive, onClick, onDelete }: WorktreeItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const isMain =
    worktree.isMainWorktree || worktree.branch === 'main' || worktree.branch === 'master';
  const branchDisplay = worktree.branch || 'detached';
  const isPrunable = worktree.prunable;

  // Mock data for display
  const lastAccessed = 'Last accessed now';
  const agentSession = 'Claude';

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'flex w-full flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors',
          isPrunable && 'opacity-50',
          isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
        )}
      >
        {/* Branch name */}
        <div className="flex w-full items-center gap-2">
          <GitBranch
            className={cn(
              'h-4 w-4 shrink-0',
              isPrunable ? 'text-destructive' : 'text-muted-foreground'
            )}
          />
          <span className={cn('truncate font-medium', isPrunable && 'line-through')}>
            {branchDisplay}
          </span>
          {isPrunable ? (
            <span className="shrink-0 rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
              已删除
            </span>
          ) : isMain ? (
            <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-600 dark:text-emerald-400">
              Main
            </span>
          ) : null}
        </div>

        {/* Path */}
        <div
          className={cn(
            'w-full truncate pl-6 text-xs text-muted-foreground',
            isPrunable && 'line-through'
          )}
        >
          {worktree.path}
        </div>

        {/* Meta info - hide for prunable */}
        {!isPrunable && (
          <div className="flex w-full items-center gap-3 pl-6 pt-1 text-xs text-muted-foreground">
            <span>{lastAccessed}</span>
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              <span>{agentSession}</span>
            </div>
          </div>
        )}
      </button>

      {/* Context Menu */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setMenuOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuOpen(false);
            }}
            role="presentation"
          />
          <div
            className="fixed z-50 min-w-32 rounded-lg border bg-popover p-1 shadow-lg"
            style={{ left: menuPosition.x, top: menuPosition.y }}
          >
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent',
                isMain && 'pointer-events-none opacity-50'
              )}
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              disabled={isMain}
            >
              <Trash2 className="h-4 w-4" />
              {isPrunable ? '清理记录' : '删除'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function WorktreeItemSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-2 h-3 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
    </div>
  );
}
