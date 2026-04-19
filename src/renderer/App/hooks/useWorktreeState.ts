import type { GitWorktree } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabId } from '../constants';
import {
  getStoredTabMap,
  getStoredTabOrder,
  getStoredWorktreeMap,
  getStoredWorktreeOrderMap,
  STORAGE_KEYS,
  saveTabOrder,
  saveWorktreeOrderMap,
} from '../storage';

export function useWorktreeState() {
  // Per-worktree tab state: { [worktreePath]: TabId }
  const [worktreeTabMap, setWorktreeTabMap] = useState<Record<string, TabId>>(getStoredTabMap);
  // Per-repo worktree state: { [repoPath]: worktreePath }
  const [repoWorktreeMap, setRepoWorktreeMap] =
    useState<Record<string, string>>(getStoredWorktreeMap);
  // Per-repo worktree display order: { [repoPath]: { [worktreePath]: displayOrder } }
  const [worktreeOrderMap, setWorktreeOrderMap] =
    useState<Record<string, Record<string, number>>>(getStoredWorktreeOrderMap);
  // Panel tab order: custom order of tabs
  const [tabOrder, setTabOrder] = useState<TabId[]>(getStoredTabOrder);
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [previousTab, setPreviousTab] = useState<TabId | null>(null);
  const [activeWorktree, setActiveWorktree] = useState<GitWorktree | null>(null);

  // Ref to track current worktree path for fetch race condition prevention
  const currentWorktreePathRef = useRef<string | null>(null);

  // Persist worktree tab map to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKTREE_TABS, JSON.stringify(worktreeTabMap));
  }, [worktreeTabMap]);

  // Persist panel tab order to localStorage
  useEffect(() => {
    saveTabOrder(tabOrder);
  }, [tabOrder]);

  // Save active worktree to per-repo map
  const saveActiveWorktreeToMap = useCallback(
    (selectedRepo: string | null, worktree: GitWorktree | null) => {
      if (selectedRepo && worktree) {
        setRepoWorktreeMap((prev) => {
          const updated = { ...prev, [selectedRepo]: worktree.path };
          localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(updated));
          return updated;
        });
      } else if (selectedRepo && !worktree) {
        setRepoWorktreeMap((prev) => {
          const updated = { ...prev };
          delete updated[selectedRepo];
          localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKTREES, JSON.stringify(updated));
          return updated;
        });
      }
    },
    []
  );

  // Reorder worktrees (update display order)
  const handleReorderWorktrees = useCallback(
    (selectedRepo: string | null, worktrees: GitWorktree[], fromIndex: number, toIndex: number) => {
      if (!selectedRepo) return;

      // Get current order for this repo
      const currentRepoOrder = worktreeOrderMap[selectedRepo] || {};

      // Sort worktrees by current display order to get the visual order
      const sortedWorktrees = [...worktrees].sort((a, b) => {
        const orderA = currentRepoOrder[a.path] ?? Number.MAX_SAFE_INTEGER;
        const orderB = currentRepoOrder[b.path] ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });

      // Build new order
      const orderedPaths = sortedWorktrees.map((wt) => wt.path);
      const [movedPath] = orderedPaths.splice(fromIndex, 1);
      orderedPaths.splice(toIndex, 0, movedPath);

      // Create new order map for this repo
      const newRepoOrder: Record<string, number> = {};
      for (let i = 0; i < orderedPaths.length; i++) {
        newRepoOrder[orderedPaths[i]] = i;
      }

      const newOrderMap = { ...worktreeOrderMap, [selectedRepo]: newRepoOrder };
      setWorktreeOrderMap(newOrderMap);
      saveWorktreeOrderMap(newOrderMap);
    },
    [worktreeOrderMap]
  );

  // Reorder panel tabs
  const handleReorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabOrder((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // Get sorted worktrees by display order for a repo
  const getSortedWorktrees = useCallback(
    (selectedRepo: string | null, worktrees: GitWorktree[]) => {
      if (!selectedRepo) return worktrees;
      return [...worktrees].sort((a, b) => {
        const repoOrder = worktreeOrderMap[selectedRepo] || {};
        const orderA = repoOrder[a.path] ?? Number.MAX_SAFE_INTEGER;
        const orderB = repoOrder[b.path] ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
    },
    [worktreeOrderMap]
  );

  return {
    worktreeTabMap,
    repoWorktreeMap,
    worktreeOrderMap,
    tabOrder,
    activeTab,
    previousTab,
    activeWorktree,
    currentWorktreePathRef,
    setWorktreeTabMap,
    setRepoWorktreeMap,
    setTabOrder,
    setActiveTab,
    setPreviousTab,
    setActiveWorktree,
    saveActiveWorktreeToMap,
    handleReorderWorktrees,
    handleReorderTabs,
    getSortedWorktrees,
  };
}
