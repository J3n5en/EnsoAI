import { Plus, Terminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizePath } from '@/App/storage';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';
import { matchesKeybinding } from '@/lib/keybinding';
import { useInitScriptStore } from '@/stores/initScript';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { ResizeHandle } from './ResizeHandle';
import { ShellTerminal } from './ShellTerminal';
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
  const { t } = useI18n();
  const [worktreeStates, setWorktreeStates] = useState<WorktreeGroupStates>({});
  // Global terminal IDs to keep terminals mounted across group moves
  const [globalTerminalIds, setGlobalTerminalIds] = useState<Set<string>>(new Set());
  const xtermKeybindings = useSettingsStore((state) => state.xtermKeybindings);
  const autoCreateSessionOnActivate = useSettingsStore(
    (state) => state.autoCreateSessionOnActivate
  );
  const { setTerminalCount, registerTerminalCloseHandler } = useWorktreeActivityStore();
  const syncTerminalSessions = useTerminalStore((s) => s.syncSessions);
  const { pendingScript, clearPendingScript } = useInitScriptStore();
  const pendingScriptProcessedRef = useRef<string | null>(null);

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

  // Sync all terminal sessions to global store for RunningProjectsPopover
  useEffect(() => {
    const allSessions = Object.values(worktreeStates).flatMap((state) =>
      state.groups.flatMap((g) =>
        g.tabs.map((t) => ({
          id: t.id,
          title: t.title || t.name,
          cwd: t.cwd,
        }))
      )
    );
    syncTerminalSessions(allSessions);
  }, [worktreeStates, syncTerminalSessions]);

  // Maintain global terminal IDs - only add new ones, never remove while tab exists
  useEffect(() => {
    const allTabIds = Object.values(worktreeStates).flatMap((state) =>
      state.groups.flatMap((g) => g.tabs.map((t) => t.id))
    );
    const allTabIdSet = new Set(allTabIds);

    setGlobalTerminalIds((prev) => {
      const next = new Set(prev);
      // Add new terminals
      for (const id of allTabIds) {
        next.add(id);
      }
      // Remove terminals that no longer exist
      for (const id of next) {
        if (!allTabIdSet.has(id)) {
          next.delete(id);
        }
      }
      return next;
    });
  }, [worktreeStates]);

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

  // Handle terminal title change
  const handleTitleChange = useCallback((tabId: string, title: string) => {
    setWorktreeStates((prev) => {
      // Find which worktree and group contains this tab
      for (const [path, state] of Object.entries(prev)) {
        for (const group of state.groups) {
          const tab = group.tabs.find((t) => t.id === tabId);
          if (tab) {
            return {
              ...prev,
              [path]: {
                ...state,
                groups: state.groups.map((g) =>
                  g.id === group.id
                    ? {
                        ...g,
                        tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
                      }
                    : g
                ),
              },
            };
          }
        }
      }
      return prev;
    });
  }, []);

  // Handle terminal close
  const handleTerminalClose = useCallback((tabId: string) => {
    setWorktreeStates((prev) => {
      // Find which worktree and group contains this tab
      for (const [path, state] of Object.entries(prev)) {
        for (const group of state.groups) {
          const tabIndex = group.tabs.findIndex((t) => t.id === tabId);
          if (tabIndex !== -1) {
            const newTabs = group.tabs.filter((t) => t.id !== tabId);

            // If group becomes empty, remove it
            if (newTabs.length === 0) {
              const newGroups = state.groups.filter((g) => g.id !== group.id);

              if (newGroups.length === 0) {
                // Remove worktree state entirely
                const newStates = { ...prev };
                delete newStates[path];
                return newStates;
              }

              const newFlexPercents = newGroups.map(() => 100 / newGroups.length);
              let newActiveGroupId = state.activeGroupId;
              if (state.activeGroupId === group.id) {
                const removedIndex = state.groups.findIndex((g) => g.id === group.id);
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

            // Update active tab if needed
            let newActiveTabId = group.activeTabId;
            if (group.activeTabId === tabId) {
              const newIndex = Math.min(tabIndex, newTabs.length - 1);
              newActiveTabId = newTabs[newIndex].id;
            }

            return {
              ...prev,
              [path]: {
                ...state,
                groups: state.groups.map((g) =>
                  g.id === group.id ? { ...g, tabs: newTabs, activeTabId: newActiveTabId } : g
                ),
              },
            };
          }
        }
      }
      return prev;
    });
  }, []);

  // Handle split - create new group to the right
  // If source group has multiple tabs, move the active tab to new group
  // If source group has only 1 tab, create a new terminal in new group
  const handleSplit = useCallback(
    (fromGroupId: string) => {
      if (!cwd) return;

      updateCurrentState((state) => {
        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex === -1) return state;

        const sourceGroup = state.groups[fromIndex];

        // If source group has multiple tabs, move the active tab to new group
        if (sourceGroup.tabs.length > 1 && sourceGroup.activeTabId) {
          const tabToMove = sourceGroup.tabs.find((t) => t.id === sourceGroup.activeTabId);
          if (!tabToMove) return state;

          // Remove tab from source group
          const newSourceTabs = sourceGroup.tabs.filter((t) => t.id !== sourceGroup.activeTabId);
          const closedIndex = sourceGroup.tabs.findIndex((t) => t.id === sourceGroup.activeTabId);
          const newSourceActiveIndex = Math.min(closedIndex, newSourceTabs.length - 1);
          const newSourceActiveTabId = newSourceTabs[newSourceActiveIndex]?.id || null;

          // Create new group with the moved tab
          const newGroup: TerminalGroupType = {
            id: crypto.randomUUID(),
            tabs: [tabToMove],
            activeTabId: tabToMove.id,
          };

          const newGroups = state.groups.map((g) =>
            g.id === fromGroupId
              ? { ...g, tabs: newSourceTabs, activeTabId: newSourceActiveTabId }
              : g
          );
          newGroups.splice(fromIndex + 1, 0, newGroup);

          // Recalculate flex percentages evenly
          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          return {
            ...state,
            groups: newGroups,
            activeGroupId: newGroup.id,
            flexPercents: newFlexPercents,
          };
        }

        // Source group has only 1 tab, create a new terminal in new group
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

  // Handle merge - merge current group with the previous group (or next if first)
  const handleMerge = useCallback(
    (fromGroupId: string) => {
      updateCurrentState((state) => {
        if (state.groups.length < 2) return state;

        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex === -1) return state;

        // Determine target group (prefer merging to the left, else right)
        const targetIndex = fromIndex > 0 ? fromIndex - 1 : fromIndex + 1;
        const sourceGroup = state.groups[fromIndex];
        const targetGroup = state.groups[targetIndex];

        // Move all tabs from source to target
        const newTargetTabs = [...targetGroup.tabs, ...sourceGroup.tabs];

        // Remove source group
        const newGroups = state.groups
          .filter((g) => g.id !== fromGroupId)
          .map((g) =>
            g.id === targetGroup.id
              ? {
                  ...g,
                  tabs: newTargetTabs,
                  activeTabId: sourceGroup.activeTabId || g.activeTabId,
                }
              : g
          );

        // Recalculate flex percentages evenly
        const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

        // Update active group to target
        return {
          groups: newGroups,
          activeGroupId: targetGroup.id,
          flexPercents: newFlexPercents,
        };
      });
    },
    [updateCurrentState]
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

  // Handle moving a tab between groups
  const handleTabMoveToGroup = useCallback(
    (tabId: string, sourceGroupId: string, targetGroupId: string, targetIndex?: number) => {
      updateCurrentState((state) => {
        const sourceGroup = state.groups.find((g) => g.id === sourceGroupId);
        const targetGroup = state.groups.find((g) => g.id === targetGroupId);
        if (!sourceGroup || !targetGroup) return state;

        // Find the tab in source group
        const tab = sourceGroup.tabs.find((t) => t.id === tabId);
        if (!tab) return state;

        // Remove tab from source group
        const newSourceTabs = sourceGroup.tabs.filter((t) => t.id !== tabId);

        // Add tab to target group
        const newTargetTabs = [...targetGroup.tabs];
        if (targetIndex !== undefined && targetIndex >= 0) {
          newTargetTabs.splice(targetIndex, 0, tab);
        } else {
          newTargetTabs.push(tab);
        }

        // Calculate new active tab for source group
        let newSourceActiveTabId = sourceGroup.activeTabId;
        if (sourceGroup.activeTabId === tabId) {
          if (newSourceTabs.length > 0) {
            const closedIndex = sourceGroup.tabs.findIndex((t) => t.id === tabId);
            const newIndex = Math.min(closedIndex, newSourceTabs.length - 1);
            newSourceActiveTabId = newSourceTabs[newIndex].id;
          } else {
            newSourceActiveTabId = null;
          }
        }

        // If source group becomes empty, remove it
        if (newSourceTabs.length === 0) {
          const newGroups = state.groups
            .filter((g) => g.id !== sourceGroupId)
            .map((g) =>
              g.id === targetGroupId ? { ...g, tabs: newTargetTabs, activeTabId: tabId } : g
            );

          // Recalculate flex percentages
          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          // Update active group
          let newActiveGroupId = state.activeGroupId;
          if (state.activeGroupId === sourceGroupId) {
            newActiveGroupId = targetGroupId;
          }

          return {
            groups: newGroups,
            activeGroupId: newActiveGroupId,
            flexPercents: newFlexPercents,
          };
        }

        // Update both groups
        return {
          ...state,
          groups: state.groups.map((g) => {
            if (g.id === sourceGroupId) {
              return { ...g, tabs: newSourceTabs, activeTabId: newSourceActiveTabId };
            }
            if (g.id === targetGroupId) {
              return { ...g, tabs: newTargetTabs, activeTabId: tabId };
            }
            return g;
          }),
          activeGroupId: targetGroupId,
        };
      });
    },
    [updateCurrentState]
  );

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

      if (matchesKeybinding(e, xtermKeybindings.newTab)) {
        e.preventDefault();
        handleNewTerminal();
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.closeTab)) {
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

      if (matchesKeybinding(e, xtermKeybindings.nextTab)) {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup && activeGroup.tabs.length > 1) {
          const currentIndex = activeGroup.tabs.findIndex((t) => t.id === activeGroup.activeTabId);
          const nextIndex = (currentIndex + 1) % activeGroup.tabs.length;
          handleTabsChange(activeGroup.id, activeGroup.tabs, activeGroup.tabs[nextIndex].id);
        }
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.prevTab)) {
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
    xtermKeybindings,
    handleNewTerminal,
    handleTabsChange,
    handleGroupEmpty,
  ]);

  // Auto-create first terminal when panel becomes active and empty (if enabled in settings)
  // Skip if there's a pending init script - let that create the terminal instead
  useEffect(() => {
    if (autoCreateSessionOnActivate && isActive && cwd && groups.length === 0 && !pendingScript) {
      handleNewTerminal();
    }
  }, [autoCreateSessionOnActivate, isActive, cwd, groups.length, handleNewTerminal, pendingScript]);

  useEffect(() => {
    if (!pendingScript || !cwd) return;

    const normalizedPendingPath = normalizePath(pendingScript.worktreePath);
    const normalizedCurrentCwd = normalizePath(cwd);

    if (normalizedPendingPath !== normalizedCurrentCwd) return;

    const scriptKey = `${normalizedPendingPath}:${pendingScript.script}`;
    if (pendingScriptProcessedRef.current === scriptKey) {
      clearPendingScript();
      return;
    }
    pendingScriptProcessedRef.current = scriptKey;

    const script = pendingScript.script.trim().replace(/\n+/g, ' && ');

    if (groups.length === 0) {
      updateCurrentState(() => {
        const newGroup: TerminalGroupType = {
          id: crypto.randomUUID(),
          tabs: [
            {
              id: crypto.randomUUID(),
              name: 'Init',
              cwd,
              initialCommand: script,
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
    } else {
      const targetGroupId = activeGroupId || groups[0].id;
      const newTab: TerminalTab = {
        id: crypto.randomUUID(),
        name: 'Init',
        cwd,
        initialCommand: script,
      };

      updateCurrentState((state) => ({
        ...state,
        groups: state.groups.map((g) =>
          g.id === targetGroupId ? { ...g, tabs: [...g.tabs, newTab], activeTabId: newTab.id } : g
        ),
      }));
    }

    clearPendingScript();
  }, [pendingScript, cwd, groups, activeGroupId, updateCurrentState, clearPendingScript]);

  if (!cwd) return null;

  const normalizedCwd = normalizePath(cwd);

  // Check if current worktree has any terminals (not all worktrees)
  const hasCurrentWorktreeTerminals = groups.length > 0;

  // Show empty state for current worktree (use overlay, not early return)
  const showEmptyState = !hasCurrentWorktreeTerminals;

  // Helper to find tab info
  const findTabInfo = (tabId: string) => {
    for (const [worktreePath, state] of Object.entries(worktreeStates)) {
      for (let groupIndex = 0; groupIndex < state.groups.length; groupIndex++) {
        const group = state.groups[groupIndex];
        const tab = group.tabs.find((t) => t.id === tabId);
        if (tab) {
          return { worktreePath, state, group, groupIndex, tab };
        }
      }
    }
    return null;
  };

  // Calculate cumulative left positions for groups
  const getGroupPositions = (state: GroupState) => {
    const positions: { left: number; width: number }[] = [];
    let cumulative = 0;
    for (const percent of state.flexPercents) {
      positions.push({ left: cumulative, width: percent });
      cumulative += percent;
    }
    return positions;
  };

  return (
    <div className="relative h-full w-full">
      {/* Empty state overlay - shown when current worktree has no terminals */}
      {/* IMPORTANT: Don't use early return here - terminals must stay mounted to prevent PTY destruction */}
      {showEmptyState && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background">
          <Empty className="border-0">
            <EmptyMedia variant="icon">
              <Terminal className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{t('No terminals open')}</EmptyTitle>
              <EmptyDescription>{t('Create a terminal to start working')}</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" size="sm" onClick={handleNewTerminal}>
              <Plus className="mr-2 h-4 w-4" />
              {t('New Terminal')}
            </Button>
          </Empty>
        </div>
      )}
      {/* Render all worktrees' group structures (tab bars only) */}
      {Object.entries(worktreeStates).map(([worktreePath, state]) => {
        const isCurrentWorktree = worktreePath === normalizedCwd;
        const groupPositions = getGroupPositions(state);

        return (
          <div
            key={worktreePath}
            className={
              isCurrentWorktree
                ? 'relative h-full w-full'
                : 'absolute inset-0 opacity-0 pointer-events-none'
            }
          >
            {/* Tab bars row - flex layout */}
            <div className="flex h-9 w-full">
              {state.groups.map((group, index) => (
                <div
                  key={group.id}
                  className="h-full"
                  style={{ flex: `0 0 ${state.flexPercents[index]}%` }}
                >
                  <TerminalGroup
                    group={group}
                    cwd={worktreePath}
                    isGroupActive={group.id === state.activeGroupId}
                    onTabsChange={handleTabsChange}
                    onGroupClick={() => handleGroupClick(group.id)}
                    onGroupEmpty={handleGroupEmpty}
                    onTabMoveToGroup={handleTabMoveToGroup}
                  />
                </div>
              ))}
            </div>

            {/* Resize handles - positioned absolutely with z-index above terminals */}
            {state.groups.map((group, index) => {
              if (index >= state.groups.length - 1) return null;
              const leftPos = groupPositions
                .slice(0, index + 1)
                .reduce((sum, p) => sum + p.width, 0);
              return (
                <ResizeHandle
                  key={`resize-${group.id}`}
                  style={{ left: `${leftPos}%` }}
                  onResize={(delta) => handleResize(index, delta)}
                />
              );
            })}

            {/* All terminals - rendered in a single container with stable keys */}
            <div className="absolute left-0 right-0 bottom-0 z-0" style={{ top: 36 }}>
              {Array.from(globalTerminalIds).map((tabId) => {
                const info = findTabInfo(tabId);
                if (!info) return null;
                // Only render for this worktree
                if (info.worktreePath !== worktreePath) return null;

                const position = groupPositions[info.groupIndex];
                if (!position) return null;

                const isTabVisible = info.group.activeTabId === tabId;
                const isTerminalActive =
                  isActive &&
                  isCurrentWorktree &&
                  info.group.id === state.activeGroupId &&
                  isTabVisible;

                return (
                  <div
                    key={tabId}
                    className={
                      isTabVisible
                        ? 'absolute h-full'
                        : 'absolute h-full opacity-0 pointer-events-none'
                    }
                    style={{
                      left: `${position.left}%`,
                      width: `${position.width}%`,
                    }}
                  >
                    <ShellTerminal
                      cwd={info.tab.cwd}
                      isActive={isTerminalActive}
                      canMerge={state.groups.length > 1}
                      initialCommand={info.tab.initialCommand}
                      onExit={() => handleTerminalClose(tabId)}
                      onTitleChange={(title) => handleTitleChange(tabId, title)}
                      onSplit={() => handleSplit(info.group.id)}
                      onMerge={() => handleMerge(info.group.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
