import { Check, ChevronRight, FolderSymlink } from 'lucide-react';
import type { RepositoryGroup } from '@/App/constants';
import { useI18n } from '@/i18n';

interface MoveToGroupSubmenuProps {
  groups: RepositoryGroup[];
  currentGroupId?: string;
  onMove: (groupId: string | null) => void;
  onClose: () => void;
}

export function MoveToGroupSubmenu({
  groups,
  currentGroupId,
  onMove,
  onClose,
}: MoveToGroupSubmenuProps) {
  const { t } = useI18n();

  if (groups.length === 0) return null;

  return (
    <div className="relative group/submenu">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
      >
        <FolderSymlink className="h-4 w-4" />
        {t('Move to Group')}
        <ChevronRight className="ml-auto h-3.5 w-3.5" />
      </button>
      <div className="absolute left-full top-0 z-50 min-w-36 rounded-lg border bg-popover p-1 shadow-lg opacity-0 invisible group-hover/submenu:opacity-100 group-hover/submenu:visible transition-all">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          onClick={() => {
            onClose();
            onMove(null);
          }}
        >
          <span className="w-4 h-4 flex items-center justify-center">
            {!currentGroupId && <Check className="h-3.5 w-3.5" />}
          </span>
          <span className="text-muted-foreground">{t('No Group')}</span>
        </button>
        <div className="my-1 h-px bg-border" />
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              onClose();
              onMove(group.id);
            }}
          >
            <span className="w-4 h-4 flex items-center justify-center">
              {currentGroupId === group.id && <Check className="h-3.5 w-3.5" />}
            </span>
            {group.emoji && <span className="shrink-0 text-base">{group.emoji}</span>}
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border"
              style={{ backgroundColor: group.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
