import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizePath } from '@/App/storage';
import { matchesKeybinding } from '@/lib/keybinding';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { ResizeHandle } from './ResizeHandle';
import { TerminalGroup } from './TerminalGroup';
import type { TerminalGroup as TerminalGroupType, TerminalTab } from './types';
import { getNextTabName } from './types';

interface TerminalPanelProps {
  cwd?: string;
  isActive?: boolean;
}

interface GroupState {
  groups: TerminalGroupType[];
  activeGroupId: string | null;
  // Flex percentages for each group
  flexPercents: number[];
}

function createInitialGroupState(): GroupState {
  return {
    groups: [],
    activeGroupId: null,
    flexPercents: [],
  };
}

// Per-worktree state
type WorktreeGroupStates = Record<string, GroupState>;

export function TerminalPanel({ cwd, isActive = false }: TerminalPanelProps) {
  const [worktreeStates, setWorktreeStates] = useState<WorktreeGroupStates>({});
  const terminalKeybindings = useSettingsStore((state) => state.terminalKeybindings);
  const { setTerminalCount, registerTerminalCloseHandler } = useWorktreeActivityStore();

  // Get current worktree's state
  const currentState = useMemo(() => {
    if (!cwd) return createInitialGroupState();
    const normalizedCwd = normalizePath(cwd);
    return worktreeStates[normalizedCwd] || createInitialGroupState();
  }, [cwd, worktreeStates]);

  const { groups, activeGroupId } = currentState;

  // Count total tabs for worktree activity tracking
  useEffect(() => {
    if (!cwd) return;
    const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);
    setTerminalCount(cwd, totalTabs);
  }, [groups, cwd, setTerminalCount]);

  // Register close handler for external close requests
  useEffect(() => {
    const handleCloseAll = (worktreePath: string) => {
      const normalizedPath = normalizePath(worktreePath);
      setWorktreeStates((prev) => {
        const newStates = { ...prev };
        delete newStates[normalizedPath];
        return newStates;
      });
      setTerminalCount(worktreePath, 0);
    };

    return registerTerminalCloseHandler(handleCloseAll);
  }, [registerTerminalCloseHandler, setTerminalCount]);

  // Update state helper
  const updateCurrentState = useCallback(
    (updater: (state: GroupState) => GroupState) => {
      if (!cwd) return;
      const normalizedCwd = normalizePath(cwd);
      setWorktreeStates((prev) => ({
        ...prev,
        [normalizedCwd]: updater(prev[normalizedCwd] || createInitialGroupState()),
      }));
    },
    [cwd]
  );

  // Handle tab changes within a group (searches all worktrees for the group)
  const handleTabsChange = useCallback(
    (groupId: string, tabs: TerminalTab[], activeTabId: string | null) => {
      setWorktreeStates((prev) => {
        // Find which worktree contains this group
        for (const [path, state] of Object.entries(prev)) {
          const groupIndex = state.groups.findIndex((g) => g.id === groupId);
          if (groupIndex !== -1) {
            return {
              ...prev,
              [path]: {
                ...state,
                groups: state.groups.map((g) =>
                  g.id === groupId ? { ...g, tabs, activeTabId } : g
                ),
              },
            };
          }
        }
        return prev;
      });
    },
    []
  );

  // Handle group activation
  const handleGroupClick = useCallback(
    (groupId: string) => {
      updateCurrentState((state) => ({
        ...state,
        activeGroupId: groupId,
      }));
    },
    [updateCurrentState]
  );

  // Handle split - create new group to the right
  const handleSplit = useCallback(
    (fromGroupId: string) => {
      if (!cwd) return;

      updateCurrentState((state) => {
        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex === -1) return state;

        const newGroup: TerminalGroupType = {
          id: crypto.randomUUID(),
          tabs: [
            {
              id: crypto.randomUUID(),
              name: getNextTabName(
                state.groups.flatMap((g) => g.tabs),
                cwd
              ),
              cwd,
            },
          ],
          activeTabId: null,
        };
        // Set activeTabId to the first tab
        newGroup.activeTabId = newGroup.tabs[0].id;

        const newGroups = [...state.groups];
        newGroups.splice(fromIndex + 1, 0, newGroup);

        // Recalculate flex percentages evenly
        const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

        return {
          ...state,
          groups: newGroups,
          activeGroupId: newGroup.id,
          flexPercents: newFlexPercents,
        };
      });
    },
    [cwd, updateCurrentState]
  );

  // Handle group becoming empty - remove it (searches all worktrees)
  const handleGroupEmpty = useCallback((groupId: string) => {
    setWorktreeStates((prev) => {
      // Find which worktree contains this group
      for (const [path, state] of Object.entries(prev)) {
        const groupIndex = state.groups.findIndex((g) => g.id === groupId);
        if (groupIndex !== -1) {
          const newGroups = state.groups.filter((g) => g.id !== groupId);

          if (newGroups.length === 0) {
            // Remove this worktree's state entirely
            const newStates = { ...prev };
            delete newStates[path];
            return newStates;
          }

          // Recalculate flex percentages
          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          // Update active group if needed
          let newActiveGroupId = state.activeGroupId;
          if (state.activeGroupId === groupId) {
            const removedIndex = state.groups.findIndex((g) => g.id === groupId);
            const newIndex = Math.min(removedIndex, newGroups.length - 1);
            newActiveGroupId = newGroups[newIndex]?.id || null;
          }

          return {
            ...prev,
            [path]: {
              ...state,
              groups: newGroups,
              activeGroupId: newActiveGroupId,
              flexPercents: newFlexPercents,
            },
          };
        }
      }
      return prev;
    });
  }, []);

  // Handle resize between groups
  const handleResize = useCallback(
    (index: number, deltaPercent: number) => {
      updateCurrentState((state) => {
        if (state.groups.length < 2) return state;

        const newFlexPercents = [...state.flexPercents];
        const minPercent = 20;

        // Adjust the two adjacent groups
        const leftNew = newFlexPercents[index] + deltaPercent;
        const rightNew = newFlexPercents[index + 1] - deltaPercent;

        // Clamp to minimum
        if (leftNew >= minPercent && rightNew >= minPercent) {
          newFlexPercents[index] = leftNew;
          newFlexPercents[index + 1] = rightNew;
        }

        return {
          ...state,
          flexPercents: newFlexPercents,
        };
      });
    },
    [updateCurrentState]
  );

  // Create initial group with a terminal if none exists
  const handleNewTerminal = useCallback(() => {
    if (!cwd) return;

    updateCurrentState((state) => {
      if (state.groups.length > 0) {
        // Add tab to active group
        const targetGroupId = state.activeGroupId || state.groups[0].id;
        const allTabs = state.groups.flatMap((g) => g.tabs);
        const newTab: TerminalTab = {
          id: crypto.randomUUID(),
          name: getNextTabName(allTabs, cwd),
          cwd,
        };

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === targetGroupId ? { ...g, tabs: [...g.tabs, newTab], activeTabId: newTab.id } : g
          ),
        };
      }

      // Create first group
      const newGroup: TerminalGroupType = {
        id: crypto.randomUUID(),
        tabs: [
          {
            id: crypto.randomUUID(),
            name: 'Untitled-1',
            cwd,
          },
        ],
        activeTabId: null,
      };
      newGroup.activeTabId = newGroup.tabs[0].id;

      return {
        groups: [newGroup],
        activeGroupId: newGroup.id,
        flexPercents: [100],
      };
    });
  }, [cwd, updateCurrentState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      // New tab
      if (matchesKeybinding(e, terminalKeybindings.newTab)) {
        e.preventDefault();
        handleNewTerminal();
        return;
      }

      // Close tab
      if (matchesKeybinding(e, terminalKeybindings.closeTab)) {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup?.activeTabId) {
          const newTabs = activeGroup.tabs.filter((t) => t.id !== activeGroup.activeTabId);
          if (newTabs.length === 0) {
            handleGroupEmpty(activeGroup.id);
          } else {
            const closedIndex = activeGroup.tabs.findIndex((t) => t.id === activeGroup.activeTabId);
            const newIndex = Math.min(closedIndex, newTabs.length - 1);
            handleTabsChange(activeGroup.id, newTabs, newTabs[newIndex].id);
          }
        }
        return;
      }

      // Next/Prev tab within active group
      if (matchesKeybinding(e, terminalKeybindings.nextTab)) {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup && activeGroup.tabs.length > 1) {
          const currentIndex = activeGroup.tabs.findIndex((t) => t.id === activeGroup.activeTabId);
          const nextIndex = (currentIndex + 1) % activeGroup.tabs.length;
          handleTabsChange(activeGroup.id, activeGroup.tabs, activeGroup.tabs[nextIndex].id);
        }
        return;
      }

      if (matchesKeybinding(e, terminalKeybindings.prevTab)) {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup && activeGroup.tabs.length > 1) {
          const currentIndex = activeGroup.tabs.findIndex((t) => t.id === activeGroup.activeTabId);
          const prevIndex = currentIndex <= 0 ? activeGroup.tabs.length - 1 : currentIndex - 1;
          handleTabsChange(activeGroup.id, activeGroup.tabs, activeGroup.tabs[prevIndex].id);
        }
        return;
      }

      // Cmd+1-9 to switch tabs in active group
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup) {
          const index = Number.parseInt(e.key, 10) - 1;
          if (index < activeGroup.tabs.length) {
            handleTabsChange(activeGroup.id, activeGroup.tabs, activeGroup.tabs[index].id);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    groups,
    activeGroupId,
    terminalKeybindings,
    handleNewTerminal,
    handleTabsChange,
    handleGroupEmpty,
  ]);

  // Auto-create first terminal when panel becomes active and empty
  useEffect(() => {
    if (isActive && cwd && groups.length === 0) {
      handleNewTerminal();
    }
  }, [isActive, cwd, groups.length, handleNewTerminal]);

  if (!cwd) return null;

  const normalizedCwd = normalizePath(cwd);

  // Check if there are any terminals across all worktrees
  const hasAnyTerminals = Object.keys(worktreeStates).length > 0;

  if (!hasAnyTerminals) {
    // No terminals anywhere, auto-creation effect will handle it
    return null;
  }

  return (
    <div className="relative h-full w-full">
      {/* Render all worktrees' terminals to keep them mounted */}
      {Object.entries(worktreeStates).map(([worktreePath, state]) => {
        const isCurrentWorktree = worktreePath === normalizedCwd;
        return (
          <div
            key={worktreePath}
            className={
              isCurrentWorktree
                ? 'flex h-full w-full'
                : 'absolute inset-0 opacity-0 pointer-events-none'
            }
          >
            {state.groups.map((group, index) => (
              <div
                key={group.id}
                className="flex h-full"
                style={{ flex: `0 0 ${state.flexPercents[index]}%` }}
              >
                <TerminalGroup
                  group={group}
                  cwd={worktreePath}
                  isActive={isActive && isCurrentWorktree}
                  isGroupActive={group.id === state.activeGroupId}
                  onTabsChange={handleTabsChange}
                  onGroupClick={() => handleGroupClick(group.id)}
                  onSplit={() => handleSplit(group.id)}
                  onGroupEmpty={handleGroupEmpty}
                />
                {index < state.groups.length - 1 && (
                  <ResizeHandle onResize={(delta) => handleResize(index, delta)} />
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
