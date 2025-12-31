import { List, Plus, Terminal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { ShellTerminal } from './ShellTerminal';
import type { TerminalGroup as TerminalGroupType, TerminalTab } from './types';
import { getNextTabName } from './types';

interface TerminalGroupProps {
  group: TerminalGroupType;
  cwd: string;
  isActive: boolean;
  isGroupActive: boolean;
  onTabsChange: (groupId: string, tabs: TerminalTab[], activeTabId: string | null) => void;
  onGroupClick: () => void;
  onSplit: () => void;
  onGroupEmpty: (groupId: string) => void;
}

export function TerminalGroup({
  group,
  cwd,
  isActive,
  isGroupActive,
  onTabsChange,
  onGroupClick,
  onSplit,
  onGroupEmpty,
}: TerminalGroupProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const { tabs, activeTabId } = group;

  // Stable terminal IDs for rendering
  const [terminalIds, setTerminalIds] = useState<string[]>(() => tabs.map((t) => t.id));

  useEffect(() => {
    setTerminalIds((prev) => {
      const currentIds = new Set(prev);
      const tabIds = new Set(tabs.map((t) => t.id));
      const newIds = tabs.filter((t) => !currentIds.has(t.id)).map((t) => t.id);
      const filtered = prev.filter((id) => tabIds.has(id));
      return newIds.length > 0 ? [...filtered, ...newIds] : filtered;
    });
  }, [tabs]);

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

  const handleTitleChange = useCallback(
    (id: string, title: string) => {
      const newTabs = tabs.map((t) => (t.id === id ? { ...t, title } : t));
      onTabsChange(group.id, newTabs, activeTabId);
    },
    [tabs, group.id, activeTabId, onTabsChange]
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

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedId(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedId(null);
    setDropTargetId(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, tabId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedId && tabId !== draggedId) {
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
      if (!draggedId || draggedId === targetId) {
        setDraggedId(null);
        setDropTargetId(null);
        return;
      }

      const draggedIndex = tabs.findIndex((t) => t.id === draggedId);
      const targetIndex = tabs.findIndex((t) => t.id === targetId);
      if (draggedIndex === -1 || targetIndex === -1) return;

      const newTabs = [...tabs];
      const [removed] = newTabs.splice(draggedIndex, 1);
      newTabs.splice(targetIndex, 0, removed);
      onTabsChange(group.id, newTabs, activeTabId);

      setDraggedId(null);
      setDropTargetId(null);
    },
    [draggedId, tabs, group.id, activeTabId, onTabsChange]
  );

  const hasNoTabs = tabs.length === 0;

  return (
    <div
      className="relative flex h-full w-full flex-col"
      onClick={onGroupClick}
      onKeyDown={(e) => e.key === 'Enter' && onGroupClick()}
      role="region"
      tabIndex={-1}
    >
      {/* Inactive overlay */}
      {!isGroupActive && (
        <div className="absolute inset-0 z-10 bg-background/10 pointer-events-none" />
      )}
      {/* Tab Bar */}
      {!hasNoTabs && (
        <div
          className={cn(
            'flex h-9 items-center border-b border-border',
            isGroupActive ? 'bg-background/50' : 'bg-muted/30'
          )}
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
                      ? 'bg-background text-foreground'
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
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
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
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

      {/* Terminal Content */}
      <div className="relative flex-1">
        {terminalIds.map((id) => {
          const tab = tabs.find((t) => t.id === id);
          if (!tab) return null;
          // Terminal is visible if it's the active tab in this group
          const isTabVisible = activeTabId === id;
          // Terminal receives input only when panel, group, and tab are all active
          const isTerminalActive = isActive && isGroupActive && isTabVisible;
          return (
            <div
              key={id}
              className={
                isTabVisible ? 'h-full w-full' : 'absolute inset-0 opacity-0 pointer-events-none'
              }
            >
              <ShellTerminal
                cwd={tab.cwd}
                isActive={isTerminalActive}
                onExit={() => handleCloseTab(id)}
                onTitleChange={(title) => handleTitleChange(id, title)}
                onSplit={onSplit}
              />
            </div>
          );
        })}

        {/* Empty state */}
        {hasNoTabs && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-background">
            <Terminal className="h-12 w-12 opacity-50" />
            <p className="text-sm">{t('No terminals open')}</p>
            <Button variant="outline" size="sm" onClick={handleNewTab}>
              <Plus className="mr-2 h-4 w-4" />
              {t('New Terminal')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
