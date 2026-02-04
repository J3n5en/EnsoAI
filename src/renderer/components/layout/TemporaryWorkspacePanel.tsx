import type { TempWorkspaceItem } from '@shared/types';
import { motion } from 'framer-motion';
import {
  FolderGit2,
  GitBranch,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { TempWorkspaceContextMenu } from '@/components/temp-workspace/TempWorkspaceContextMenu';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

interface TemporaryWorkspacePanelProps {
  items: TempWorkspaceItem[];
  activePath: string | null;
  onSelect: (item: TempWorkspaceItem) => void;
  onCreate: () => void;
  onRequestRename: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onRefresh: () => void;
  onCollapse?: () => void;
}

export function TemporaryWorkspacePanel({
  items,
  activePath,
  onSelect,
  onCreate,
  onRequestRename,
  onRequestDelete,
  onRefresh,
  onCollapse,
}: TemporaryWorkspacePanelProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');

  const sortedItems = useMemo(() => [...items].sort((a, b) => b.createdAt - a.createdAt), [items]);
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedItems;
    const query = searchQuery.toLowerCase();
    return sortedItems.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.folderName.toLowerCase().includes(query) ||
        item.path.toLowerCase().includes(query)
    );
  }, [sortedItems, searchQuery]);

  return (
    <aside className="flex h-full w-full flex-col border-r bg-background">
      {/* Header with buttons */}
      <div className="flex h-12 items-center justify-end gap-1 border-b px-3 drag-region">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md no-drag text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          onClick={onRefresh}
          title={t('Refresh')}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
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

      {/* Search bar */}
      <div className="px-3 py-2">
        <div className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('Search sessions')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-2">
        {filteredItems.length === 0 ? (
          <Empty className="h-full border-0">
            <EmptyMedia variant="icon">
              <FolderGit2 className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle className="text-base">{t('No temp sessions')}</EmptyTitle>
              <EmptyDescription>{t('Create a temp session to get started')}</EmptyDescription>
            </EmptyHeader>
            {!searchQuery && (
              <Button onClick={onCreate} variant="outline" className="mt-2">
                {t('New Temp Session')}
              </Button>
            )}
          </Empty>
        ) : (
          <div className="space-y-1">
            {filteredItems.map((item) => (
              <TemporaryWorkspaceItemRow
                key={item.id}
                item={item}
                isActive={activePath === item.path}
                onSelect={() => onSelect(item)}
                onRequestRename={() => onRequestRename(item.id)}
                onRequestDelete={() => onRequestDelete(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer - Create Temp Session Button */}
      <div className="shrink-0 border-t p-2">
        <button
          type="button"
          className="flex h-8 w-full items-center justify-start gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          {t('New Temp Session')}
        </button>
      </div>
    </aside>
  );
}

interface TemporaryWorkspaceItemRowProps {
  item: TempWorkspaceItem;
  isActive: boolean;
  onSelect: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}

function TemporaryWorkspaceItemRow({
  item,
  isActive,
  onSelect,
  onRequestRename,
  onRequestDelete,
}: TemporaryWorkspaceItemRowProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const activities = useWorktreeActivityStore((s) => s.activities);
  const activity = activities[item.path] || { agentCount: 0, terminalCount: 0 };
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        className={cn(
          'relative flex w-full flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors',
          isActive ? 'text-accent-foreground' : 'hover:bg-accent/50'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="temp-workspace-panel-highlight"
            className="absolute inset-0 rounded-lg bg-accent"
            transition={springFast}
          />
        )}
        <div className="relative z-10 flex w-full items-center gap-2">
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
          <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-600 dark:text-emerald-400">
            {t('Main')}
          </span>
        </div>
        <div
          className="relative z-10 w-full overflow-hidden whitespace-nowrap text-ellipsis pl-6 text-xs text-muted-foreground [direction:rtl] [text-align:left] [unicode-bidi:plaintext]"
          title={item.path}
        >
          {item.path}
        </div>
        {hasActivity && (
          <div className="relative z-10 flex items-center gap-3 pl-6 text-xs text-muted-foreground">
            {activity.agentCount > 0 && (
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {activity.agentCount}
              </span>
            )}
            {activity.terminalCount > 0 && (
              <span className="flex items-center gap-1">
                <Terminal className="h-3 w-3" />
                {activity.terminalCount}
              </span>
            )}
          </div>
        )}
      </button>

      <TempWorkspaceContextMenu
        open={menuOpen}
        position={menuPosition}
        path={item.path}
        onClose={() => setMenuOpen(false)}
        onRename={onRequestRename}
        onDelete={onRequestDelete}
      />
    </>
  );
}
