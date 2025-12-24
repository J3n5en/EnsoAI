import { cn } from '@/lib/utils';
import { FolderGit2, PanelLeftClose, Plus, Search, Settings } from 'lucide-react';
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
    <aside className="flex h-full w-full flex-col border-r bg-background">
      {/* Header */}
      <div className="flex h-12 items-center justify-end gap-1 border-b px-3 drag-region">
        {onCollapse && (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={onCollapse}
            title="折叠"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search repositories"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {/* Repository List */}
      <div className="flex-1 overflow-auto p-2">
        {filteredRepos.length === 0 && searchQuery ? (
          <div className="py-8 text-center text-sm text-muted-foreground">没有找到匹配的仓库</div>
        ) : repositories.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">点击 + 添加仓库</div>
        ) : (
          <div className="space-y-1">
            {filteredRepos.map((repo) => (
              <button
                type="button"
                key={repo.path}
                onClick={() => onSelectRepo(repo.path)}
                className={cn(
                  'flex w-full flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors',
                  selectedRepo === repo.path
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
              >
                {/* Repo name */}
                <div className="flex w-full items-center gap-2">
                  <FolderGit2
                    className={cn(
                      'h-4 w-4 shrink-0',
                      selectedRepo === repo.path
                        ? 'text-accent-foreground'
                        : 'text-muted-foreground'
                    )}
                  />
                  <span className="truncate font-medium">{repo.name}</span>
                </div>
                {/* Path */}
                <div
                  className={cn(
                    'w-full truncate pl-6 text-xs',
                    selectedRepo === repo.path
                      ? 'text-accent-foreground/70'
                      : 'text-muted-foreground'
                  )}
                >
                  {repo.path}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 flex-1 items-center justify-start gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={onAddRepository}
          >
            <Plus className="h-4 w-4" />
            Add Repository
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
