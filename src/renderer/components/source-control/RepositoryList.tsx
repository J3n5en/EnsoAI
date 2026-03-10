import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Repository } from './types';

interface RepositoryListProps {
  repositories: Repository[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

/**
 * Repository tabs component
 * Shows main repo and submodules as tabs
 */
export function RepositoryList({
  repositories,
  selectedId,
  onSelect,
  isLoading,
}: RepositoryListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4 border-b">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (repositories.length === 0) {
    return null;
  }

  // Don't show tabs if only one repository
  if (repositories.length === 1) {
    return null;
  }

  return (
    <Tabs
      value={selectedId || repositories[0]?.path}
      onValueChange={onSelect}
      className="border-b py-1"
    >
      <TabsList
        className="h-9 w-full justify-start rounded-none bg-transparent border-0 p-0 px-2 grid"
        style={{ gridTemplateColumns: `repeat(${repositories.length}, 1fr)` }}
      >
        {repositories.map((repo) => (
          <TabsTrigger
            key={repo.path}
            value={repo.path}
            className="h-9 gap-1.5 px-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <span className="text-sm truncate">{repo.name}</span>
            {repo.changesCount > 0 && (
              <span className="ml-1 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] leading-none bg-primary text-primary-foreground rounded-full shrink-0 font-medium px-1">
                {repo.changesCount}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
