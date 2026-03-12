import { ChevronDown, FolderGit2, GitBranch, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getStoredBoolean, STORAGE_KEYS } from '@/App/storage';
import { GitSyncButton } from '@/components/git/GitSyncButton';
import { SmoothCollapse } from '@/components/ui/smooth-collapse';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { BranchSwitcher } from './BranchSwitcher';
import type { Repository } from './types';

interface RepositoryListProps {
  repositories: Repository[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  /** Display mode: 'tabs' = horizontal tabs, 'list' = VSCode-style collapsible list */
  displayMode?: 'tabs' | 'list';
  /** Branch checkout handler for list mode inline BranchSwitcher */
  onCheckout?: (repoPath: string, branch: string) => void;
  /** Path of the repository currently being checked out, or null if none */
  checkingOutPath?: string | null;
  /** Sync handler for list mode GitSyncButton */
  onSync?: (repoPath: string) => void;
  /** Publish handler for list mode GitSyncButton */
  onPublish?: (repoPath: string) => void;
  /** Path of the repository currently being synced, or null if none */
  syncingPath?: string | null;
}

/**
 * Repository list component supporting two display modes:
 * - tabs: horizontal tab bar, hidden when only one repo (no submodules)
 * - list: VSCode-style collapsible list, always visible to show repo structure
 */
export function RepositoryList({
  repositories,
  selectedId,
  onSelect,
  isLoading,
  displayMode = 'tabs',
  onCheckout,
  checkingOutPath,
  onSync,
  onPublish,
  syncingPath,
}: RepositoryListProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(() =>
    getStoredBoolean(STORAGE_KEYS.SC_REPO_LIST_EXPANDED, true)
  );
  const tabsListRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view when selectedId changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedId drives scroll target
  useEffect(() => {
    if (displayMode !== 'tabs') return;
    // rAF ensures the active attribute and layout are flushed before measuring
    const frame = requestAnimationFrame(() => {
      if (!tabsListRef.current) return;
      // tabsListRef is on a wrapper div; find the actual scrollable TabsList inside
      const container =
        tabsListRef.current.querySelector<HTMLElement>('[data-slot="tabs-list"]') ??
        tabsListRef.current;
      const active = container.querySelector<HTMLElement>('[data-active]');
      if (!active) return;
      const cr = container.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      if (ar.left < cr.left) {
        container.scrollLeft -= cr.left - ar.left;
      } else if (ar.right > cr.right) {
        container.scrollLeft += ar.right - cr.right;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [displayMode, selectedId]);

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

  if (displayMode === 'list') {
    // List mode: always show even with single repo, matching original #265 VSCode-style behavior
    return (
      <div className="flex flex-col border-b">
        {/* Header */}
        <button
          type="button"
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            localStorage.setItem(STORAGE_KEYS.SC_REPO_LIST_EXPANDED, String(next));
          }}
          className="group flex items-center gap-2 px-4 py-2 text-left hover:bg-accent/50 transition-colors"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200',
              !expanded && '-rotate-90'
            )}
          />
          <FolderGit2 className="h-4 w-4" />
          <span className="text-sm font-medium flex-1">{t('Repositories')}</span>
          <span className="text-xs text-muted-foreground">({repositories.length})</span>
        </button>

        {/* Repository items */}
        <SmoothCollapse open={expanded}>
          <div className="flex flex-col pb-1">
            {repositories.map((repo) => (
              <RepositoryItem
                key={repo.path}
                repository={repo}
                isSelected={selectedId === repo.path}
                onSelect={() => onSelect(repo.path)}
                onCheckout={onCheckout ? (branch) => onCheckout(repo.path, branch) : undefined}
                isCheckingOut={checkingOutPath === repo.path}
                onSync={onSync ? () => onSync(repo.path) : undefined}
                onPublish={onPublish ? () => onPublish(repo.path) : undefined}
                isSyncing={syncingPath === repo.path}
              />
            ))}
          </div>
        </SmoothCollapse>
      </div>
    );
  }

  // Tabs mode: hide when only one repo (a single tab is meaningless)
  if (repositories.length === 1) {
    return null;
  }

  return (
    <div ref={tabsListRef}>
      <Tabs
        value={selectedId || repositories[0]?.path}
        onValueChange={onSelect}
        className="border-b py-1"
      >
        <TabsList className="h-9 w-full justify-start rounded-none bg-transparent border-0 p-0 px-2 flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {repositories.map((repo) => (
            <TabsTrigger
              key={repo.path}
              value={repo.path}
              className="h-9 gap-1.5 px-3 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent shrink-0 w-auto"
            >
              <span className="text-sm whitespace-nowrap">{repo.name}</span>
              {repo.changesCount > 0 && (
                <span className="ml-1 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] leading-none bg-primary text-primary-foreground rounded-full shrink-0 font-medium px-1">
                  {repo.changesCount}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

interface RepositoryItemProps {
  repository: Repository;
  isSelected: boolean;
  onSelect: () => void;
  onCheckout?: (branch: string) => void;
  isCheckingOut?: boolean;
  onSync?: () => void;
  onPublish?: () => void;
  isSyncing?: boolean;
}

function RepositoryItem({
  repository,
  isSelected,
  onSelect,
  onCheckout,
  isCheckingOut,
  onSync,
  onPublish,
  isSyncing,
}: RepositoryItemProps) {
  const isSubmodule = repository.type === 'submodule';
  const Icon = isSubmodule ? FolderGit2 : GitBranch;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-1.5 text-sm transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-2 min-w-0 text-left"
      >
        {/* Indent for submodules */}
        {isSubmodule && <div className="w-3 shrink-0" />}

        <Icon className={cn('h-3.5 w-3.5 shrink-0', isSubmodule ? 'text-yellow-500' : '')} />

        <span className="min-w-0 flex-1 truncate" title={repository.name}>
          {repository.name}
        </span>
      </button>

      {/* Branch Switcher (selected) or branch name label (unselected) */}
      {isSelected && onCheckout ? (
        <BranchSwitcher
          currentBranch={repository.branch}
          branches={repository.branches}
          onCheckout={onCheckout}
          isLoading={repository.branchesLoading}
          isCheckingOut={isCheckingOut}
          size="xs"
        />
      ) : (
        repository.branch && (
          <span className="text-xs text-muted-foreground shrink-0 max-w-20 truncate">
            {repository.branch}
          </span>
        )
      )}

      {repository.changesCount > 0 && (
        <span className="text-xs bg-primary/10 text-primary px-1.5 rounded-full shrink-0">
          {repository.changesCount}
        </span>
      )}

      <GitSyncButton
        ahead={repository.ahead}
        behind={repository.behind}
        tracking={repository.tracking}
        currentBranch={repository.branch}
        isSyncing={isSyncing}
        onSync={onSync}
        onPublish={onPublish}
      />
    </div>
  );
}
