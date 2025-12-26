import { List, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { matchesKeybinding } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { ShellTerminal } from './ShellTerminal';

interface TerminalTab {
  id: string;
  name: string;
  cwd: string; // Track which worktree this tab belongs to
  title?: string; // Terminal title from OSC escape sequence
  userEdited?: boolean; // User manually edited the name, takes priority over title
}

interface TerminalPanelProps {
  cwd?: string;
  isActive?: boolean;
}

interface TerminalState {
  tabs: TerminalTab[];
  activeIds: Record<string, string>; // { [cwd]: activeTabId }
}

function createInitialState(): TerminalState {
  return { tabs: [], activeIds: {} };
}

function getNextName(tabs: TerminalTab[], forCwd: string): string {
  const cwdTabs = tabs.filter((t) => t.cwd === forCwd);
  const numbers = cwdTabs
    .map((t) => {
      const match = t.name.match(/^Untitled-(\d+)$/);
      return match ? Number.parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `Untitled-${max + 1}`;
}

export function TerminalPanel({ cwd, isActive = false }: TerminalPanelProps) {
  const { t } = useI18n();
  const [state, setState] = useState<TerminalState>(createInitialState);
  const { tabs, activeIds } = state;
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const initializedCwdsRef = useRef<Set<string>>(new Set());
  const terminalKeybindings = useSettingsStore((state) => state.terminalKeybindings);
  const { setTerminalCount, registerTerminalCloseHandler } = useWorktreeActivityStore();

  // Get tabs for current worktree
  const currentTabs = useMemo(() => tabs.filter((t) => t.cwd === cwd), [tabs, cwd]);
  const activeId = cwd ? activeIds[cwd] || null : null;

  // Create initial tab only when terminal panel becomes active for this worktree (lazy loading)
  useEffect(() => {
    if (cwd && isActive && !initializedCwdsRef.current.has(cwd)) {
      initializedCwdsRef.current.add(cwd);
      const defaultTab: TerminalTab = { id: crypto.randomUUID(), name: 'Untitled-1', cwd };
      setState((prev) => ({
        tabs: [...prev.tabs, defaultTab],
        activeIds: { ...prev.activeIds, [cwd]: defaultTab.id },
      }));
    }
  }, [cwd, isActive]);

  // Stable terminal IDs - only append, never reorder (prevents DOM reordering issues with xterm)
  const [terminalIds, setTerminalIds] = useState<string[]>(() => tabs.map((t) => t.id));

  // Update stable terminal IDs when tabs change (append new, remove deleted)
  useEffect(() => {
    setTerminalIds((prev) => {
      const currentIds = new Set(prev);
      const tabIds = new Set(tabs.map((t) => t.id));
      // Append new tabs (preserve creation order)
      const newIds = tabs.filter((t) => !currentIds.has(t.id)).map((t) => t.id);
      // Filter out deleted tabs
      const filtered = prev.filter((id) => tabIds.has(id));
      return newIds.length > 0 ? [...filtered, ...newIds] : filtered;
    });
  }, [tabs]);

  // Sync terminal tab counts to worktree activity store
  useEffect(() => {
    // Group tabs by worktree path and update counts
    const countsByWorktree = new Map<string, number>();
    for (const tab of tabs) {
      countsByWorktree.set(tab.cwd, (countsByWorktree.get(tab.cwd) || 0) + 1);
    }
    for (const [worktreePath, count] of countsByWorktree) {
      setTerminalCount(worktreePath, count);
    }
  }, [tabs, setTerminalCount]);

  // Register close handler for external close requests
  useEffect(() => {
    const handleCloseAll = (worktreePath: string) => {
      setState((prev) => {
        // Close all tabs for this worktree
        const tabsToClose = prev.tabs.filter((t) => t.cwd === worktreePath);
        if (tabsToClose.length === 0) return prev;

        const newTabs = prev.tabs.filter((t) => t.cwd !== worktreePath);
        const newActiveIds = { ...prev.activeIds };
        delete newActiveIds[worktreePath];

        // Don't create new tab - let user create manually
        // Remove from initialized set so next visit will create fresh tab
        initializedCwdsRef.current.delete(worktreePath);

        // Explicitly set count to 0
        setTerminalCount(worktreePath, 0);

        return { tabs: newTabs, activeIds: newActiveIds };
      });
    };

    return registerTerminalCloseHandler(handleCloseAll);
  }, [registerTerminalCloseHandler, setTerminalCount]);

  const handleNewTab = useCallback(() => {
    if (!cwd) return;
    setState((prev) => {
      const newTab: TerminalTab = {
        id: crypto.randomUUID(),
        name: getNextName(prev.tabs, cwd),
        cwd,
      };
      return {
        tabs: [...prev.tabs, newTab],
        activeIds: { ...prev.activeIds, [cwd]: newTab.id },
      };
    });
  }, [cwd]);

  const handleCloseTab = useCallback(
    (id: string) => {
      if (!cwd) return;
      setState((prev) => {
        const closingTab = prev.tabs.find((t) => t.id === id);
        if (!closingTab) return prev;

        const tabCwd = closingTab.cwd;
        const newTabs = prev.tabs.filter((t) => t.id !== id);
        const cwdTabs = newTabs.filter((t) => t.cwd === tabCwd);

        // Always keep at least one tab per worktree
        if (cwdTabs.length === 0) {
          const newTab: TerminalTab = { id: crypto.randomUUID(), name: 'Untitled-1', cwd: tabCwd };
          return {
            tabs: [...newTabs, newTab],
            activeIds: { ...prev.activeIds, [tabCwd]: newTab.id },
          };
        }

        const newActiveIds = { ...prev.activeIds };
        if (prev.activeIds[tabCwd] === id) {
          const oldCwdTabs = prev.tabs.filter((t) => t.cwd === tabCwd);
          const closedIndex = oldCwdTabs.findIndex((t) => t.id === id);
          const newIndex = Math.min(closedIndex, cwdTabs.length - 1);
          newActiveIds[tabCwd] = cwdTabs[newIndex].id;
        }
        return { tabs: newTabs, activeIds: newActiveIds };
      });
    },
    [cwd]
  );

  const handleSelectTab = useCallback(
    (id: string) => {
      if (!cwd) return;
      setState((prev) => ({ ...prev, activeIds: { ...prev.activeIds, [cwd]: id } }));
    },
    [cwd]
  );

  // Handle terminal title changes (OSC escape sequences)
  const handleTitleChange = useCallback((id: string, title: string) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  }, []);

  const handleNextTab = useCallback(() => {
    if (!cwd) return;
    setState((prev) => {
      const cwdTabs = prev.tabs.filter((t) => t.cwd === cwd);
      if (cwdTabs.length <= 1) return prev;
      const currentIndex = cwdTabs.findIndex((t) => t.id === prev.activeIds[cwd]);
      const nextIndex = (currentIndex + 1) % cwdTabs.length;
      return { ...prev, activeIds: { ...prev.activeIds, [cwd]: cwdTabs[nextIndex].id } };
    });
  }, [cwd]);

  const handlePrevTab = useCallback(() => {
    if (!cwd) return;
    setState((prev) => {
      const cwdTabs = prev.tabs.filter((t) => t.cwd === cwd);
      if (cwdTabs.length <= 1) return prev;
      const currentIndex = cwdTabs.findIndex((t) => t.id === prev.activeIds[cwd]);
      const prevIndex = currentIndex <= 0 ? cwdTabs.length - 1 : currentIndex - 1;
      return { ...prev, activeIds: { ...prev.activeIds, [cwd]: cwdTabs[prevIndex].id } };
    });
  }, [cwd]);

  // Terminal tab keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      // New tab
      if (matchesKeybinding(e, terminalKeybindings.newTab)) {
        e.preventDefault();
        handleNewTab();
        return;
      }

      // Close tab
      if (matchesKeybinding(e, terminalKeybindings.closeTab)) {
        e.preventDefault();
        if (activeId) {
          handleCloseTab(activeId);
        }
        return;
      }

      // Next tab
      if (matchesKeybinding(e, terminalKeybindings.nextTab)) {
        e.preventDefault();
        handleNextTab();
        return;
      }

      // Prev tab
      if (matchesKeybinding(e, terminalKeybindings.prevTab)) {
        e.preventDefault();
        handlePrevTab();
        return;
      }

      // Cmd+1-9 to switch tabs (keep this as a bonus feature)
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = Number.parseInt(e.key, 10) - 1;
        if (index < currentTabs.length) {
          handleSelectTab(currentTabs[index].id);
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    activeId,
    currentTabs,
    terminalKeybindings,
    handleNewTab,
    handleCloseTab,
    handleNextTab,
    handlePrevTab,
    handleSelectTab,
  ]);

  const handleStartEdit = useCallback((tab: TerminalTab) => {
    setEditingId(tab.id);
    setEditingName(tab.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const handleFinishEdit = useCallback(() => {
    if (editingId && editingName.trim()) {
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === editingId ? { ...t, name: editingName.trim(), userEdited: true } : t
        ),
      }));
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName]);

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
    // Make drag image semi-transparent
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

      setState((prev) => {
        const draggedIndex = prev.tabs.findIndex((t) => t.id === draggedId);
        const targetIndex = prev.tabs.findIndex((t) => t.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return prev;

        const newTabs = [...prev.tabs];
        const [removed] = newTabs.splice(draggedIndex, 1);
        newTabs.splice(targetIndex, 0, removed);
        return { ...prev, tabs: newTabs };
      });

      setDraggedId(null);
      setDropTargetId(null);
    },
    [draggedId]
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Tab Bar - only show current worktree's tabs */}
      <div className="flex h-9 items-center border-b border-border bg-background/50 backdrop-blur-sm">
        <div className="flex flex-1 items-center overflow-x-auto" onDoubleClick={handleNewTab}>
          {currentTabs.map((tab) => {
            const isTabActive = activeId === tab.id;
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
                onClick={() => handleSelectTab(tab.id)}
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
            onClick={handleNewTab}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={t('New Terminal')}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Terminal Content - render all worktrees' terminals to keep them mounted */}
      {/* Use opacity-0 instead of invisible to avoid WebGL rendering artifacts */}
      <div className="relative flex-1">
        {terminalIds.map((id) => {
          const tab = tabs.find((t) => t.id === id);
          if (!tab) return null;
          // Only show terminal if panel is active, belongs to current worktree AND is the active tab
          const isTerminalActive = isActive && tab.cwd === cwd && activeId === id;
          return (
            <div
              key={id}
              className={
                isTerminalActive
                  ? 'h-full w-full'
                  : 'absolute inset-0 opacity-0 pointer-events-none'
              }
            >
              <ShellTerminal
                cwd={tab.cwd}
                isActive={isTerminalActive}
                onExit={() => handleCloseTab(id)}
                onTitleChange={(title) => handleTitleChange(id, title)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
