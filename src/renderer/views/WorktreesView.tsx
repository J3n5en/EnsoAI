import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreateWorktreeDialog, WorktreeList } from '@/components/worktree';
import { useGitBranches } from '@/hooks/useGit';
import { useWorktreeCreate, useWorktreeList, useWorktreeRemove } from '@/hooks/useWorktree';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWorktreeStore } from '@/stores/worktree';
import type { GitWorktree, WorktreeCreateOptions } from '@shared/types';
import { Filter, RefreshCw, Search } from 'lucide-react';
import * as React from 'react';

type FilterType = 'all' | 'active' | 'stale';

export function WorktreesView() {
  const { currentWorkspace } = useWorkspaceStore();
  const { currentWorktree, setCurrentWorktree } = useWorktreeStore();
  const workdir = currentWorkspace?.path || null;

  const { data: worktrees = [], isLoading, refetch } = useWorktreeList(workdir);
  const { data: branches = [] } = useGitBranches(workdir);
  const createWorktree = useWorktreeCreate();
  const removeWorktree = useWorktreeRemove();

  const [searchQuery, setSearchQuery] = React.useState('');
  const [filter, setFilter] = React.useState<FilterType>('all');

  const filteredWorktrees = React.useMemo(() => {
    let result = worktrees;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (w) => w.branch?.toLowerCase().includes(query) || w.path.toLowerCase().includes(query)
      );
    }

    // Type filter
    switch (filter) {
      case 'active':
        result = result.filter((w) => !w.prunable);
        break;
      case 'stale':
        result = result.filter((w) => w.prunable);
        break;
    }

    return result;
  }, [worktrees, searchQuery, filter]);

  const handleSelect = (worktree: GitWorktree) => {
    setCurrentWorktree(worktree);
  };

  const handleOpenTerminal = (worktree: GitWorktree) => {
    // TODO: Open terminal in worktree directory
    console.log('Open terminal:', worktree.path);
  };

  const handleOpenInFinder = (worktree: GitWorktree) => {
    // TODO: Open in Finder/Explorer
    console.log('Open in Finder:', worktree.path);
  };

  const handleCopyPath = (worktree: GitWorktree) => {
    navigator.clipboard.writeText(worktree.path);
  };

  const handleRemove = async (worktree: GitWorktree) => {
    if (!workdir) return;

    const confirmed = confirm(`确定要删除 worktree "${worktree.branch || worktree.path}" 吗？`);
    if (confirmed) {
      await removeWorktree.mutateAsync({
        workdir,
        options: { path: worktree.path },
      });
    }
  };

  const handleCreate = async (options: WorktreeCreateOptions) => {
    if (!workdir) return;
    await createWorktree.mutateAsync({ workdir, options });
  };

  if (!currentWorkspace) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>请先选择一个工作区</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Worktrees</h2>
        <CreateWorktreeDialog
          branches={branches}
          defaultPath={`${currentWorkspace.path}-worktree`}
          isLoading={createWorktree.isPending}
          onSubmit={handleCreate}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 worktree..."
            className="pl-9"
          />
        </div>

        <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <SelectTrigger className="w-32">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="active">活跃</SelectItem>
            <SelectItem value="stale">过期</SelectItem>
          </SelectPopup>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <WorktreeList
          worktrees={filteredWorktrees}
          activeWorktreePath={currentWorktree?.path}
          isLoading={isLoading}
          onSelect={handleSelect}
          onOpenTerminal={handleOpenTerminal}
          onOpenInFinder={handleOpenInFinder}
          onCopyPath={handleCopyPath}
          onRemove={handleRemove}
        />
      </div>
    </div>
  );
}
