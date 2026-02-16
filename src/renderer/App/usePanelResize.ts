import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FILE_SIDEBAR_DEFAULT,
  FILE_SIDEBAR_MAX,
  FILE_SIDEBAR_MIN,
  REPOSITORY_DEFAULT,
  REPOSITORY_MAX,
  REPOSITORY_MIN,
  TREE_SIDEBAR_DEFAULT,
  TREE_SIDEBAR_MIN,
  WORKTREE_DEFAULT,
  WORKTREE_MAX,
  WORKTREE_MIN,
} from './constants';
import { getStoredNumber, STORAGE_KEYS } from './storage';

type ResizePanel = 'repository' | 'worktree' | 'fileSidebar' | null;
type LayoutMode = 'columns' | 'tree';

export function usePanelResize(layoutMode: LayoutMode = 'columns') {
  const [repositoryWidth, setRepositoryWidth] = useState(() =>
    getStoredNumber(STORAGE_KEYS.REPOSITORY_WIDTH, REPOSITORY_DEFAULT)
  );
  const [worktreeWidth, setWorktreeWidth] = useState(() =>
    getStoredNumber(STORAGE_KEYS.WORKTREE_WIDTH, WORKTREE_DEFAULT)
  );
  const [treeSidebarWidth, setTreeSidebarWidth] = useState(() =>
    getStoredNumber(STORAGE_KEYS.TREE_SIDEBAR_WIDTH, TREE_SIDEBAR_DEFAULT)
  );
  const [fileSidebarWidth, setFileSidebarWidth] = useState(() =>
    getStoredNumber(STORAGE_KEYS.FILE_SIDEBAR_WIDTH, FILE_SIDEBAR_DEFAULT)
  );
  const [resizing, setResizing] = useState<ResizePanel>(null);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizeStart = useCallback(
    (panel: 'repository' | 'worktree' | 'fileSidebar') => (e: React.MouseEvent) => {
      e.preventDefault();
      setResizing(panel);
      startXRef.current = e.clientX;
      if (layoutMode === 'tree' && panel === 'repository') {
        startWidthRef.current = treeSidebarWidth;
      } else if (panel === 'fileSidebar') {
        startWidthRef.current = fileSidebarWidth;
      } else {
        startWidthRef.current = panel === 'repository' ? repositoryWidth : worktreeWidth;
      }
    },
    [repositoryWidth, worktreeWidth, treeSidebarWidth, fileSidebarWidth, layoutMode]
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + delta;

      if (resizing === 'repository') {
        if (layoutMode === 'tree') {
          const treeMax = REPOSITORY_MAX + WORKTREE_MAX;
          const clampedWidth = Math.max(TREE_SIDEBAR_MIN, Math.min(treeMax, newWidth));
          setTreeSidebarWidth(clampedWidth);
        } else {
          setRepositoryWidth(Math.max(REPOSITORY_MIN, Math.min(REPOSITORY_MAX, newWidth)));
        }
      } else if (resizing === 'worktree') {
        setWorktreeWidth(Math.max(WORKTREE_MIN, Math.min(WORKTREE_MAX, newWidth)));
      } else if (resizing === 'fileSidebar') {
        setFileSidebarWidth(Math.max(FILE_SIDEBAR_MIN, Math.min(FILE_SIDEBAR_MAX, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, layoutMode]);

  // Save panel sizes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REPOSITORY_WIDTH, String(repositoryWidth));
  }, [repositoryWidth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKTREE_WIDTH, String(worktreeWidth));
  }, [worktreeWidth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FILE_SIDEBAR_WIDTH, String(fileSidebarWidth));
  }, [fileSidebarWidth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TREE_SIDEBAR_WIDTH, String(treeSidebarWidth));
  }, [treeSidebarWidth]);

  return {
    repositoryWidth,
    worktreeWidth,
    fileSidebarWidth,
    treeSidebarWidth,
    resizing: !!resizing,
    handleResizeStart,
  };
}
