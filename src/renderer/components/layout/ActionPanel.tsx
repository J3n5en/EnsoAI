import {
  CommandDialog,
  CommandDialogPopup,
  CommandPanel,
  CommandShortcut,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { FolderOpen, GitBranch, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import * as React from 'react';
import { useEffect, useRef } from 'react';

interface ActionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceCollapsed: boolean;
  worktreeCollapsed: boolean;
  onToggleWorkspace: () => void;
  onToggleWorktree: () => void;
  onOpenSettings: () => void;
}

interface ActionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
}

export function ActionPanel({
  open,
  onOpenChange,
  workspaceCollapsed,
  worktreeCollapsed,
  onToggleWorkspace,
  onToggleWorktree,
  onOpenSettings,
}: ActionPanelProps) {
  const [search, setSearch] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: ActionItem[] = React.useMemo(
    () => [
      {
        id: 'toggle-workspace',
        label: workspaceCollapsed ? '展开 Workspace' : '折叠 Workspace',
        icon: workspaceCollapsed ? FolderOpen : PanelLeftClose,
        action: onToggleWorkspace,
      },
      {
        id: 'toggle-worktree',
        label: worktreeCollapsed ? '展开 Worktree' : '折叠 Worktree',
        icon: worktreeCollapsed ? GitBranch : PanelLeftOpen,
        action: onToggleWorktree,
      },
      {
        id: 'open-settings',
        label: '打开设置',
        icon: Settings,
        shortcut: '⌘,',
        action: onOpenSettings,
      },
    ],
    [workspaceCollapsed, worktreeCollapsed, onToggleWorkspace, onToggleWorktree, onOpenSettings]
  );

  const filteredActions = React.useMemo(() => {
    if (!search) return actions;
    const lower = search.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(lower));
  }, [actions, search]);

  // Reset selection when filtered list changes
  const filteredCount = filteredActions.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset index on count change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCount]);

  // Reset search and focus input when dialog opens/closes
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  const executeAction = React.useCallback(
    (action: ActionItem) => {
      action.action();
      onOpenChange(false);
    },
    [onOpenChange]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredActions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredActions.length) % filteredActions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const action = filteredActions[selectedIndex];
        if (action) {
          executeAction(action);
        }
      }
    },
    [filteredActions, selectedIndex, executeAction]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup>
        <CommandPanel>
          <div className="px-3 py-2" onKeyDown={handleKeyDown}>
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="搜索操作..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="border-t" />
          <div className="max-h-72 overflow-y-auto p-2">
            {filteredActions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                没有找到匹配的操作
              </div>
            ) : (
              filteredActions.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
                    index === selectedIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-accent/50'
                  )}
                  onClick={() => executeAction(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </button>
              ))
            )}
          </div>
        </CommandPanel>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
