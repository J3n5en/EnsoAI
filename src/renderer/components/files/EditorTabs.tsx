import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Menu, MenuItem, MenuPopup, MenuSeparator } from '@/components/ui/menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { EditorTab } from '@/stores/editor';
import { getFileIcon, getFileIconColor } from './fileIcons';

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabPath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string, e: React.MouseEvent) => void | Promise<void>;
  onClose?: (path: string) => void | Promise<void>;
  onCloseOthers?: (keepPath: string) => void | Promise<void>;
  onCloseAll?: () => void | Promise<void>;
  onCloseLeft?: (path: string) => void | Promise<void>;
  onCloseRight?: (path: string) => void | Promise<void>;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
}

export function EditorTabs({
  tabs,
  activeTabPath,
  onTabClick,
  onTabClose,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseLeft,
  onCloseRight,
  onTabReorder,
}: EditorTabsProps) {
  const { t } = useI18n();
  const draggedIndexRef = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuTabPath, setMenuTabPath] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onTabReorder) {
        onTabReorder(fromIndex, toIndex);
      }
      draggedIndexRef.current = null;
    },
    [onTabReorder]
  );

  const menuTabIndex = useMemo(() => {
    if (!menuTabPath) return -1;
    return tabs.findIndex((tab) => tab.path === menuTabPath);
  }, [tabs, menuTabPath]);

  const canCloseOthers = !!onCloseOthers && !!menuTabPath && tabs.length > 1;
  const canCloseAll = !!onCloseAll && tabs.length > 0;
  const canCloseLeft = !!onCloseLeft && menuTabIndex > 0;
  const canCloseRight = !!onCloseRight && menuTabIndex >= 0 && menuTabIndex < tabs.length - 1;

  const handleCopyPath = useCallback(async () => {
    if (!menuTabPath) return;
    try {
      await navigator.clipboard.writeText(menuTabPath);
      toastManager.add({
        title: t('Copied'),
        description: t('Path copied to clipboard'),
        type: 'success',
        timeout: 2000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastManager.add({
        title: t('Copy failed'),
        description: message || t('Failed to copy content'),
        type: 'error',
        timeout: 3000,
      });
    }
    setMenuOpen(false);
  }, [menuTabPath, t]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="h-10 shrink-0 overflow-hidden border-b">
      <ScrollArea className="h-full">
        <div className="flex h-9 w-max pb-1">
          {tabs.map((tab, index) => {
            const isActive = tab.path === activeTabPath;
            const Icon = getFileIcon(tab.title, false);
            const iconColor = getFileIconColor(tab.title, false);

            return (
              <div
                key={tab.path}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                onClick={() => onTabClick(tab.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuTabPath(tab.path);
                  setMenuPosition({ x: e.clientX, y: e.clientY });
                  setMenuOpen(true);
                }}
                onKeyDown={(e) => e.key === 'Enter' && onTabClick(tab.path)}
                role="button"
                tabIndex={0}
                className={cn(
                  'group relative flex h-9 min-w-[120px] max-w-[180px] cursor-pointer select-none items-center gap-2 border-r px-3 text-sm transition-colors',
                  isActive
                    ? 'text-foreground'
                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                )}
              >
                {/* Active indicator - 使用 layoutId 实现平滑滑动 */}
                {isActive && (
                  <motion.div
                    layoutId="editor-tab-indicator"
                    className="absolute inset-x-0 top-0 h-[2px] bg-primary"
                    transition={springFast}
                  />
                )}

                {/* Icon */}
                <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />

                {/* Title */}
                <span className="flex-1 truncate">
                  {tab.isDirty && <span className="mr-0.5">*</span>}
                  {tab.title}
                </span>

                {/* Close button */}
                <button
                  type="button"
                  onClick={(e) => onTabClose(tab.path, e)}
                  className={cn(
                    'shrink-0 rounded p-0.5 text-primary opacity-0 transition-opacity hover:bg-primary/20',
                    'group-hover:opacity-100',
                    isActive && 'opacity-60'
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuPopup
          style={{
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
          }}
        >
          <MenuItem
            disabled={!menuTabPath || !onClose}
            onClick={async () => {
              if (!menuTabPath || !onClose) return;
              await onClose(menuTabPath);
              setMenuOpen(false);
            }}
          >
            {t('Close Tab')}
          </MenuItem>
          <MenuItem
            disabled={!canCloseOthers}
            onClick={async () => {
              if (!menuTabPath || !onCloseOthers) return;
              await onCloseOthers(menuTabPath);
              setMenuOpen(false);
            }}
          >
            {t('Close Others')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            disabled={!canCloseLeft}
            onClick={async () => {
              if (!menuTabPath || !onCloseLeft) return;
              await onCloseLeft(menuTabPath);
              setMenuOpen(false);
            }}
          >
            {t('Close Tabs to the Left')}
          </MenuItem>
          <MenuItem
            disabled={!canCloseRight}
            onClick={async () => {
              if (!menuTabPath || !onCloseRight) return;
              await onCloseRight(menuTabPath);
              setMenuOpen(false);
            }}
          >
            {t('Close Tabs to the Right')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            disabled={!canCloseAll}
            onClick={async () => {
              if (!onCloseAll) return;
              await onCloseAll();
              setMenuOpen(false);
            }}
          >
            {t('Close All Tabs')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={!menuTabPath} onClick={handleCopyPath}>
            {t('Copy Path')}
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
}
