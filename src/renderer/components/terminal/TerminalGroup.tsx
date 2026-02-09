import { motion } from 'framer-motion';
import { List, Plus, Terminal, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import type { TerminalGroup as TerminalGroupType, TerminalTab } from './types';
import { getNextTabName } from './types';

interface TerminalGroupProps {
  group: TerminalGroupType;
  cwd: string;
  isGroupActive: boolean;
  onTabsChange: (groupId: string, tabs: TerminalTab[], activeTabId: string | null) => void;
  onGroupClick: () => void;
  onGroupEmpty: (groupId: string) => void;
  onTabMoveToGroup?: (
    tabId: string,
    sourceGroupId: string,
    targetGroupId: string,
    targetIndex?: number
  ) => void;
}

export function TerminalGroup({
  group,
  cwd,
  isGroupActive,
  onTabsChange,
  onGroupClick,
  onGroupEmpty,
  onTabMoveToGroup,
}: TerminalGroupProps) {
  const { t } = useI18n();
  const bgImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const { tabs, activeTabId } = group;

  const handleNewTab = useCallback(() => {
    const newTab: TerminalTab = {
      id: crypto.randomUUID(),
      name: getNextTabName(tabs, cwd),
      cwd,
    };
    onTabsChange(group.id, [...tabs, newTab], newTab.id);
  }, [tabs, cwd, group.id, onTabsChange]);

  const handleCloseTab = useCallback(
    (id: string) => {
      const newTabs = tabs.filter((t) => t.id !== id);

      if (newTabs.length === 0) {
        onGroupEmpty(group.id);
        return;
      }

      let newActiveTabId = activeTabId;
      if (activeTabId === id) {
        const closedIndex = tabs.findIndex((t) => t.id === id);
        const newIndex = Math.min(closedIndex, newTabs.length - 1);
        newActiveTabId = newTabs[newIndex].id;
      }
      onTabsChange(group.id, newTabs, newActiveTabId);
    },
    [tabs, activeTabId, group.id, onTabsChange, onGroupEmpty]
  );

  const handleSelectTab = useCallback(
    (id: string) => {
      onTabsChange(group.id, tabs, id);
      onGroupClick();
    },
    [group.id, tabs, onTabsChange, onGroupClick]
  );

  const handleStartEdit = useCallback((tab: TerminalTab) => {
    setEditingId(tab.id);
    setEditingName(tab.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const handleFinishEdit = useCallback(() => {
    if (editingId && editingName.trim()) {
      const newTabs = tabs.map((t) =>
        t.id === editingId ? { ...t, name: editingName.trim(), userEdited: true } : t
      );
      onTabsChange(group.id, newTabs, activeTabId);
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, tabs, group.id, activeTabId, onTabsChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleFinishEdit();
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setEditingName('');
      }
    },
    [handleFinishEdit]
  );

  // State for cross-group drop indicator
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, tabId: string) => {
      setDraggedId(tabId);
      e.dataTransfer.effectAllowed = 'move';
      // Store both tabId and groupId for cross-group drops
      e.dataTransfer.setData(
        'application/terminal-tab',
        JSON.stringify({ tabId, groupId: group.id })
      );
      e.dataTransfer.setData('text/plain', tabId);
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '0.5';
      }
    },
    [group.id]
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedId(null);
    setDropTargetId(null);
    setIsDropZoneActive(false);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, tabId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (tabId !== draggedId) {
        setDropTargetId(tabId);
      }
    },
    [draggedId]
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();

      // Try to parse cross-group drag data
      const dragData = e.dataTransfer.getData('application/terminal-tab');
      if (dragData) {
        try {
          const { tabId, groupId: sourceGroupId } = JSON.parse(dragData);

          // Cross-group move
          if (sourceGroupId !== group.id && onTabMoveToGroup) {
            const targetIndex = tabs.findIndex((t) => t.id === targetId);
            onTabMoveToGroup(tabId, sourceGroupId, group.id, targetIndex);
            setDraggedId(null);
            setDropTargetId(null);
            return;
          }

          // Same group reorder
          if (tabId === targetId) {
            setDraggedId(null);
            setDropTargetId(null);
            return;
          }

          const draggedIndex = tabs.findIndex((t) => t.id === tabId);
          const targetIndex = tabs.findIndex((t) => t.id === targetId);
          if (draggedIndex === -1 || targetIndex === -1) return;

          const newTabs = [...tabs];
          const [removed] = newTabs.splice(draggedIndex, 1);
          newTabs.splice(targetIndex, 0, removed);
          onTabsChange(group.id, newTabs, activeTabId);
        } catch {
          // Fallback to plain text
        }
      }

      setDraggedId(null);
      setDropTargetId(null);
    },
    [tabs, group.id, activeTabId, onTabsChange, onTabMoveToGroup]
  );

  // Handle drop on empty area of tab bar (append to end)
  const handleTabBarDragOver = useCallback((e: React.DragEvent) => {
    // Only accept terminal-tab drops
    if (e.dataTransfer.types.includes('application/terminal-tab')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDropZoneActive(true);
    }
  }, []);

  const handleTabBarDragLeave = useCallback((e: React.DragEvent) => {
    // Only deactivate if leaving the container entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      setIsDropZoneActive(false);
    }
  }, []);

  const handleTabBarDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDropZoneActive(false);

      const dragData = e.dataTransfer.getData('application/terminal-tab');
      if (!dragData) return;

      try {
        const { tabId, groupId: sourceGroupId } = JSON.parse(dragData);

        // Cross-group move to end
        if (sourceGroupId !== group.id && onTabMoveToGroup) {
          onTabMoveToGroup(tabId, sourceGroupId, group.id);
          return;
        }

        // Same group - move to end
        const draggedIndex = tabs.findIndex((t) => t.id === tabId);
        if (draggedIndex === -1 || draggedIndex === tabs.length - 1) return;

        const newTabs = [...tabs];
        const [removed] = newTabs.splice(draggedIndex, 1);
        newTabs.push(removed);
        onTabsChange(group.id, newTabs, activeTabId);
      } catch {
        // Ignore parse errors
      }
    },
    [tabs, group.id, activeTabId, onTabsChange, onTabMoveToGroup]
  );

  const hasNoTabs = tabs.length === 0;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: click is supplementary, terminals inside handle focus
    <div className="relative h-full w-full" onClick={onGroupClick}>
      {/* Inactive overlay */}
      {!isGroupActive && (
        <div className="absolute inset-0 z-10 bg-background/10 pointer-events-none" />
      )}
      {/* Tab Bar */}
      {!hasNoTabs && (
        <div
          className={cn(
            'flex h-9 items-center border-b border-border',
            !bgImageEnabled && (isGroupActive ? 'bg-background' : 'bg-muted'),
            isDropZoneActive && 'ring-2 ring-primary ring-inset'
          )}
          onDragOver={handleTabBarDragOver}
          onDragLeave={handleTabBarDragLeave}
          onDrop={handleTabBarDrop}
        >
          <div className="flex flex-1 items-center overflow-x-auto" onDoubleClick={handleNewTab}>
            {tabs.map((tab) => {
              const isTabActive = activeTabId === tab.id;
              const isDragging = draggedId === tab.id;
              const isDropTarget = dropTargetId === tab.id;
              return (
                <div
                  key={tab.id}
                  draggable={editingId !== tab.id}
                  onDragStart={(e) => handleDragStart(e, tab.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, tab.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, tab.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectTab(tab.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(tab);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectTab(tab.id)}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'group relative flex h-9 min-w-[120px] max-w-[180px] items-center gap-2 border-r border-border px-3 text-sm transition-colors cursor-grab',
                    isTabActive
                      ? cn(!bgImageEnabled && 'bg-background', 'text-foreground')
                      : cn(!bgImageEnabled && 'bg-muted hover:bg-muted/80', 'text-muted-foreground hover:text-foreground'),
                    isDragging && 'opacity-50',
                    isDropTarget && 'ring-2 ring-primary ring-inset'
                  )}
                >
                  <List className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  {editingId === tab.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleFinishEdit}
                      onKeyDown={handleKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-transparent outline-none border-b border-current text-sm"
                    />
                  ) : (
                    <span className="flex-1 truncate">
                      {tab.userEdited ? tab.name : tab.title || tab.name}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(tab.id);
                    }}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors',
                      'hover:bg-destructive/20 hover:text-destructive',
                      !isTabActive && 'opacity-0 group-hover:opacity-100'
                    )}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {isTabActive && (
                    <motion.div
                      layoutId={`terminal-tab-indicator-${group.id}`}
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      transition={springFast}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* New Tab Button */}
          <div className="flex items-center border-l border-border px-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNewTab();
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={t('New Terminal')}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Empty state - shown when no tabs */}
      {hasNoTabs && (
        <div className={cn("flex h-full w-full flex-col items-center justify-center gap-4 text-muted-foreground", !bgImageEnabled && "bg-background")}>
          <Terminal className="h-12 w-12 opacity-50" />
          <p className="text-sm">{t('No terminals open')}</p>
          <Button variant="outline" size="sm" onClick={handleNewTab}>
            <Plus className="mr-2 h-4 w-4" />
            {t('New Terminal')}
          </Button>
        </div>
      )}
    </div>
  );
}
