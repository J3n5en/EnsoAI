import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredBoolean, STORAGE_KEYS } from '../storage';

export function usePanelState() {
  // Panel collapsed states - initialize from localStorage
  const [repositoryCollapsed, setRepositoryCollapsed] = useState(() =>
    getStoredBoolean(STORAGE_KEYS.REPOSITORY_COLLAPSED, false)
  );
  const [worktreeCollapsed, setWorktreeCollapsed] = useState(() =>
    getStoredBoolean(STORAGE_KEYS.WORKTREE_COLLAPSED, false)
  );

  // Dialog states
  const [addRepoDialogOpen, setAddRepoDialogOpen] = useState(false);
  const [initialLocalPath, setInitialLocalPath] = useState<string | null>(null);
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  // Refs
  const toggleSelectedRepoExpandedRef = useRef<(() => void) | null>(null);
  const switchWorktreePathRef = useRef<((path: string) => void) | null>(null);

  // Save collapsed states to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REPOSITORY_COLLAPSED, String(repositoryCollapsed));
  }, [repositoryCollapsed]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKTREE_COLLAPSED, String(worktreeCollapsed));
  }, [worktreeCollapsed]);

  const handleAddRepository = useCallback(() => {
    setAddRepoDialogOpen(true);
  }, []);

  return {
    repositoryCollapsed,
    worktreeCollapsed,
    addRepoDialogOpen,
    initialLocalPath,
    actionPanelOpen,
    closeDialogOpen,
    toggleSelectedRepoExpandedRef,
    switchWorktreePathRef,
    setRepositoryCollapsed,
    setWorktreeCollapsed,
    setAddRepoDialogOpen,
    setInitialLocalPath,
    setActionPanelOpen,
    setCloseDialogOpen,
    handleAddRepository,
  };
}
