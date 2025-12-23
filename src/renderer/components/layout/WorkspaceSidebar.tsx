import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FolderOpen, PanelLeftClose, Plus, Search, Settings } from 'lucide-react';
import { useState } from 'react';

interface WorkspaceSidebarProps {
  repositories: Array<{ name: string; path: string }>;
  selectedRepo: string | null;
  onSelectRepo: (repoPath: string) => void;
  onAddRepository: () => void;
  onOpenSettings?: () => void;
  collapsed?: boolean;
  onCollapse?: () => void;
}

export function WorkspaceSidebar({
  repositories,
  selectedRepo,
  onSelectRepo,
  onAddRepository,
  onOpenSettings,
  collapsed: _collapsed = false,
  onCollapse,
}: WorkspaceSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRepos = repositories.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="flex h-full w-full flex-col border-r bg-muted/30">
      {/* Top bar with collapse button - h-12 to align with WorktreePanel header */}
      <div className="flex h-12 shrink-0 items-center justify-end px-2 drag-region">
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

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search repositories"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Repository List */}
      <div className="flex-1 overflow-auto px-2">
        <div className="space-y-1">
          {filteredRepos.map((repo) => (
            <button
              type="button"
              key={repo.path}
              onClick={() => onSelectRepo(repo.path)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                selectedRepo === repo.path
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent/50'
              )}
            >
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{repo.name}</div>
                <div className="truncate text-xs text-muted-foreground">{repo.path}</div>
              </div>
            </button>
          ))}
        </div>

        {filteredRepos.length === 0 && searchQuery && (
          <div className="py-8 text-center text-sm text-muted-foreground">没有找到匹配的仓库</div>
        )}

        {repositories.length === 0 && !searchQuery && (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">选择项目</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start gap-2"
            onClick={onAddRepository}
          >
            <Plus className="h-4 w-4" />
            Add Repository
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
