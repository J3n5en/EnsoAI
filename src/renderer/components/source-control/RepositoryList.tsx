import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FolderGit2, GitBranch, Loader2, PanelLeftClose } from 'lucide-react';
import { GitSyncButton } from '@/components/git/GitSyncButton';
import { useI18n } from '@/i18n';
import { heightVariants, springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { BranchSwitcher } from './BranchSwitcher';
import type { Repository } from './types';

interface RepositoryListProps {
  repositories: Repository[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onCollapseSidebar?: () => void;
  isLoading?: boolean;
  // Git sync props
  isSyncing?: boolean;
  onSync?: (repoPath: string) => void;
  onPublish?: (repoPath: string) => void;
  // Branch checkout props
  onCheckout?: (repoPath: string, branch: string) => void;
  isCheckingOut?: boolean;
}

/**
 * VSCode-style repository list component
 * Shows main repo and submodules in a selectable list
 */
export function RepositoryList({
  repositories,
  selectedId,
  onSelect,
  expanded,
  onToggleExpand,
  onCollapseSidebar,
  isLoading,
  isSyncing,
  onSync,
  onPublish,
  onCheckout,
  isCheckingOut,
}: RepositoryListProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col border-b">
      {/* Header */}
      <div className="group flex items-center hover:bg-accent/50 transition-colors">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex flex-1 items-center gap-2 px-4 py-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200',
              !expanded && '-rotate-90'
            )}
          />
          <FolderGit2 className="h-4 w-4" />
          <span className="text-sm font-medium">{t('Repositories')}</span>
          <span className="text-xs text-muted-foreground">({repositories.length})</span>
        </button>
        {onCollapseSidebar && (
          <button
            type="button"
            onClick={onCollapseSidebar}
            className="mr-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            title={t('Hide sidebar')}
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Repository list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="repo-list"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springFast}
            className="overflow-hidden"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex flex-col pb-1">
                {repositories.map((repo) => (
                  <RepositoryItem
                    key={repo.path}
                    repository={repo}
                    isSelected={selectedId === repo.path}
                    onSelect={() => onSelect(repo.path)}
                    isSyncing={isSyncing}
                    onSync={onSync ? () => onSync(repo.path) : undefined}
                    onPublish={onPublish ? () => onPublish(repo.path) : undefined}
                    onCheckout={onCheckout ? (branch) => onCheckout(repo.path, branch) : undefined}
                    isCheckingOut={isCheckingOut}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface RepositoryItemProps {
  repository: Repository;
  isSelected: boolean;
  onSelect: () => void;
  isSyncing?: boolean;
  onSync?: () => void;
  onPublish?: () => void;
  onCheckout?: (branch: string) => void;
  isCheckingOut?: boolean;
}

function RepositoryItem({
  repository,
  isSelected,
  onSelect,
  isSyncing,
  onSync,
  onPublish,
  onCheckout,
  isCheckingOut,
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
        {isSubmodule && <div className="w-3" />}

        <Icon className={cn('h-3.5 w-3.5 shrink-0', isSubmodule ? 'text-yellow-500' : '')} />

        <span className="min-w-0 flex-1 truncate" title={repository.name}>
          {repository.name}
        </span>
      </button>

      {/* Branch Switcher - only show for selected repo */}
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

      {/* Changes count */}
      {repository.changesCount > 0 && (
        <span className="text-xs bg-primary/10 text-primary px-1.5 rounded-full shrink-0">
          {repository.changesCount}
        </span>
      )}

      {/* Git Sync Button */}
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
