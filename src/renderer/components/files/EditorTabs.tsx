import { X } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { EditorTab } from '@/stores/editor';
import { getFileIcon, getFileIconColor } from './fileIcons';

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabPath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string, e: React.MouseEvent) => void | Promise<void>;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
}

export function EditorTabs({
  tabs,
  activeTabPath,
  onTabClick,
  onTabClose,
  onTabReorder,
}: EditorTabsProps) {
  const draggedIndexRef = useRef<number | null>(null);

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

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="h-10 shrink-0 overflow-hidden border-b bg-muted/30">
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
                onKeyDown={(e) => e.key === 'Enter' && onTabClick(tab.path)}
                role="button"
                tabIndex={0}
                className={cn(
                  'group relative flex h-9 min-w-[120px] max-w-[180px] cursor-pointer select-none items-center gap-2 border-r px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-background text-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                )}
              >
                {/* Active indicator */}
                {isActive && <div className="absolute inset-x-0 top-0 h-[2px] bg-primary" />}

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
    </div>
  );
}
