import { LayoutGroup, motion } from 'framer-motion';
import { FolderGit2, FolderMinus, PanelLeftClose, Plus, Search, Settings2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ALL_GROUP_ID, type RepositoryGroup, type TabId } from '@/App/constants';
import {
  CreateGroupDialog,
  GroupEditDialog,
  GroupSelector,
  MoveToGroupSubmenu,
} from '@/components/group';
import { RepositorySettingsDialog } from '@/components/repository/RepositorySettingsDialog';
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { RepoItemWithGlow } from '@/components/ui/glow-wrappers';
import { useI18n } from '@/i18n';
import { hexToRgba } from '@/lib/colors';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { RunningProjectsPopover } from './RunningProjectsPopover';

interface Repository {
  name: string;
  path: string;
  groupId?: string;
}

interface RepositorySidebarProps {
  repositories: Repository[];
  selectedRepo: string | null;
  onSelectRepo: (repoPath: string) => void;
  onAddRepository: () => void;
  onRemoveRepository?: (repoPath: string) => void;
  onReorderRepositories?: (fromIndex: number, toIndex: number) => void;
  onOpenSettings?: () => void;
  isSettingsActive?: boolean;
  onToggleSettings?: () => void;
  collapsed?: boolean;
  onCollapse?: () => void;
  groups: RepositoryGroup[];
  activeGroupId: string;
  onSwitchGroup: (groupId: string) => void;
  onCreateGroup: (name: string, emoji: string, color: string) => RepositoryGroup;
  onUpdateGroup: (groupId: string, name: string, emoji: string, color: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onMoveToGroup?: (repoPath: string, groupId: string | null) => void;
  onSwitchTab?: (tab: TabId) => void;
  onSwitchWorktreeByPath?: (path: string) => Promise<void> | void;
}

export function RepositorySidebar({
  repositories,
  selectedRepo,
  onSelectRepo,
  onAddRepository,
  onRemoveRepository,
  onReorderRepositories,
  onOpenSettings: _onOpenSettings,
  isSettingsActive: _isSettingsActive,
  onToggleSettings: _onToggleSettings,
  collapsed: _collapsed = false,
  onCollapse,
  groups,
  activeGroupId,
  onSwitchGroup,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onMoveToGroup,
  onSwitchTab,
  onSwitchWorktreeByPath,
}: RepositorySidebarProps) {
  const { t, tNode } = useI18n();
  const _settingsDisplayMode = useSettingsStore((s) => s.settingsDisplayMode);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuRepo, setMenuRepo] = useState<Repository | null>(null);
  const [repoToRemove, setRepoToRemove] = useState<Repository | null>(null);
  const [repoSettingsOpen, setRepoSettingsOpen] = useState(false);
  const [repoSettingsTarget, setRepoSettingsTarget] = useState<Repository | null>(null);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [editGroupDialogOpen, setEditGroupDialogOpen] = useState(false);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const repositoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.id] = repositories.filter((r) => r.groupId === group.id).length;
    }
    return counts;
  }, [groups, repositories]);

  // Drag reorder
  const draggedIndexRef = useRef<number | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number, repo: Repository) => {
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));

    // Create styled drag image
    const dragImage = document.createElement('div');
    dragImage.textContent = repo.name;
    dragImage.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        padding: 8px 12px;
        background-color: var(--accent);
        color: var(--accent-foreground);
        font-size: 14px;
        font-weight: 500;
        border-radius: 8px;
        white-space: nowrap;
        pointer-events: none;
      `;
    document.body.appendChild(dragImage);
    dragImageRef.current = dragImage;
    e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedIndexRef.current = null;
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndexRef.current !== null && draggedIndexRef.current !== index) {
      setDropTargetIndex(index);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderRepositories) {
        onReorderRepositories(fromIndex, toIndex);
      }
      setDropTargetIndex(null);
    },
    [onReorderRepositories]
  );

  const handleContextMenu = (e: React.MouseEvent, repo: Repository) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuRepo(repo);
    setMenuOpen(true);
  };

  const handleRemoveClick = () => {
    if (menuRepo) {
      setRepoToRemove(menuRepo);
    }
    setMenuOpen(false);
  };

  const handleConfirmRemove = () => {
    if (repoToRemove && onRemoveRepository) {
      onRemoveRepository(repoToRemove.path);
    }
    setRepoToRemove(null);
  };

  // Filter by group and search
  const filteredRepos = useMemo(() => {
    let filtered = repositories;
    if (activeGroupId !== ALL_GROUP_ID) {
      filtered = filtered.filter((r) => r.groupId === activeGroupId);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((repo) => repo.name.toLowerCase().includes(query));
    }
    return filtered.map((repo) => ({ repo, originalIndex: repositories.indexOf(repo) }));
  }, [repositories, activeGroupId, searchQuery]);

  return (
    <aside className="flex h-full w-full flex-col border-r bg-background">
      {/* Header */}
      <div className="flex h-12 items-center justify-end gap-1 border-b px-3 drag-region">
        {onSwitchWorktreeByPath && (
          <RunningProjectsPopover
            onSelectWorktreeByPath={onSwitchWorktreeByPath}
            onSwitchTab={onSwitchTab}
          />
        )}
        {onCollapse && (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={onCollapse}
            title={t('Collapse')}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Group Selector */}
      <GroupSelector
        groups={groups}
        activeGroupId={activeGroupId}
        repositoryCounts={repositoryCounts}
        totalCount={repositories.length}
        onSelectGroup={onSwitchGroup}
        onEditGroup={() => setEditGroupDialogOpen(true)}
        onAddGroup={() => setCreateGroupDialogOpen(true)}
      />

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('Search repositories')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {/* Repository List */}
      <div className="flex-1 overflow-auto p-2">
        {filteredRepos.length === 0 && searchQuery.length > 0 ? (
          <Empty className="h-full border-0">
            <EmptyMedia variant="icon">
              <Search className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base">{t('No matching repositories')}</EmptyTitle>
              <EmptyDescription>{t('Try a different search term')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : repositories.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyMedia variant="icon">
              <FolderGit2 className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base">{t('Add Repository')}</EmptyTitle>
              <EmptyDescription>
                {t('Add a Git repository from a local folder to get started')}
              </EmptyDescription>
            </EmptyHeader>
            <Button
              onClick={(e) => {
                e.currentTarget.blur();
                onAddRepository();
              }}
              variant="outline"
              className="mt-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('Add Repository')}
            </Button>
          </Empty>
        ) : (
          <LayoutGroup>
            <div className="space-y-1">
              {filteredRepos.map(({ repo, originalIndex }) => {
                const group = repo.groupId ? groupsById.get(repo.groupId) : undefined;
                const tagBg = group ? hexToRgba(group.color, 0.12) : null;
                const tagBorder = group ? hexToRgba(group.color, 0.35) : null;
                const isSelected = selectedRepo === repo.path;

                return (
                  <RepoItemWithGlow key={repo.path} repoPath={repo.path}>
                    {/* Drop indicator - top */}
                    {dropTargetIndex === originalIndex &&
                      draggedIndexRef.current !== null &&
                      draggedIndexRef.current > originalIndex && (
                        <div className="absolute -top-0.5 left-2 right-2 h-0.5 bg-primary rounded-full" />
                      )}
                    <button
                      type="button"
                      draggable={!searchQuery}
                      onDragStart={(e) => handleDragStart(e, originalIndex, repo)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, originalIndex)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, originalIndex)}
                      onClick={() => onSelectRepo(repo.path)}
                      onContextMenu={(e) => handleContextMenu(e, repo)}
                      className={cn(
                        'group relative flex w-full flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors',
                        isSelected ? 'text-accent-foreground' : 'hover:bg-accent/50',
                        draggedIndexRef.current === originalIndex && 'opacity-50'
                      )}
                    >
                      {/* Sliding highlight background */}
                      {isSelected && (
                        <motion.div
                          layoutId="repo-sidebar-highlight"
                          className="absolute inset-0 rounded-lg bg-accent"
                          transition={springFast}
                        />
                      )}
                      {/* Repo name + Tag + Settings */}
                      <div className="relative z-10 flex w-full items-center gap-2">
                        <FolderGit2
                          className={cn(
                            'h-4 w-4 shrink-0',
                            isSelected ? 'text-accent-foreground' : 'text-muted-foreground'
                          )}
                        />
                        <span className="truncate font-medium flex-1">{repo.name}</span>

                        {/* Group Tag - 移到这里 */}
                        {group && (
                          <span
                            className="shrink-0 inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[10px] text-foreground/80"
                            style={{
                              backgroundColor: tagBg ?? undefined,
                              borderColor: tagBorder ?? undefined,
                              color: group.color,
                            }}
                          >
                            {group.emoji && (
                              <span className="text-[0.9em] opacity-90">{group.emoji}</span>
                            )}
                            <span className="truncate max-w-[60px]">{group.name}</span>
                          </span>
                        )}

                        {/* Repository Settings */}
                        <div
                          role="button"
                          tabIndex={0}
                          className="shrink-0 p-1 rounded hover:bg-muted cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRepoSettingsTarget(repo);
                            setRepoSettingsOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setRepoSettingsTarget(repo);
                              setRepoSettingsOpen(true);
                            }
                          }}
                          title={t('Repository Settings')}
                        >
                          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                      {/* Path */}
                      <div
                        className={cn(
                          'relative z-10 w-full pl-6 text-xs overflow-hidden whitespace-nowrap text-ellipsis [direction:rtl] [text-align:left]',
                          isSelected ? 'text-accent-foreground/70' : 'text-muted-foreground'
                        )}
                        title={repo.path}
                      >
                        {repo.path}
                      </div>
                    </button>
                    {/* Drop indicator - bottom */}
                    {dropTargetIndex === originalIndex &&
                      draggedIndexRef.current !== null &&
                      draggedIndexRef.current < originalIndex && (
                        <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-primary rounded-full" />
                      )}
                  </RepoItemWithGlow>
                );
              })}
            </div>
          </LayoutGroup>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 flex-1 items-center justify-start gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.currentTarget.blur();
              onAddRepository();
            }}
          >
            <Plus className="h-4 w-4" />
            {t('Add Repository')}
          </button>
        </div>
      </div>

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
            {onMoveToGroup && groups.length > 0 && (
              <MoveToGroupSubmenu
                groups={groups}
                currentGroupId={menuRepo?.groupId}
                onMove={(groupId) => {
                  if (menuRepo) {
                    onMoveToGroup(menuRepo.path, groupId);
                  }
                }}
                onClose={() => setMenuOpen(false)}
              />
            )}

            {onMoveToGroup && groups.length > 0 && <div className="my-1 h-px bg-border" />}

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
              onClick={handleRemoveClick}
            >
              <FolderMinus className="h-4 w-4" />
              {t('Remove repository')}
            </button>
          </div>
        </>
      )}

      {/* Remove confirmation dialog */}
      <AlertDialog
        open={!!repoToRemove}
        onOpenChange={(open) => {
          if (!open) {
            setRepoToRemove(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Remove repository')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tNode('Are you sure you want to remove {{name}} from the workspace?', {
                name: <strong>{repoToRemove?.name}</strong>,
              })}
              <span className="block mt-2 text-muted-foreground">
                {t('This will only remove it from the app and will not delete local files.')}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={handleConfirmRemove}>
              {t('Remove')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {repoSettingsTarget && (
        <RepositorySettingsDialog
          open={repoSettingsOpen}
          onOpenChange={setRepoSettingsOpen}
          repoPath={repoSettingsTarget.path}
          repoName={repoSettingsTarget.name}
        />
      )}

      <CreateGroupDialog
        open={createGroupDialogOpen}
        onOpenChange={setCreateGroupDialogOpen}
        onSubmit={onCreateGroup}
      />

      <GroupEditDialog
        open={editGroupDialogOpen}
        onOpenChange={setEditGroupDialogOpen}
        group={activeGroup || null}
        repositoryCount={activeGroup ? repositoryCounts[activeGroup.id] || 0 : 0}
        onUpdate={onUpdateGroup}
        onDelete={onDeleteGroup}
      />
    </aside>
  );
}
