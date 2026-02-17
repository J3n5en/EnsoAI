import { useEffect } from 'react';
import { useNavigationStore } from '@/stores/navigation';
import { useEditor } from '@/hooks/useEditor';
import type { TabId } from '../constants';

export function useTerminalNavigation(
  activeWorktreePath: string | null,
  setActiveTab: (tab: TabId) => void,
  setWorktreeTabMap: (fn: (prev: Record<string, TabId>) => Record<string, TabId>) => void
) {
  const { pendingNavigation, clearNavigation } = useNavigationStore();
  const { navigateToFile } = useEditor();

  useEffect(() => {
    if (!pendingNavigation) return;

    const { path, line, column, previewMode } = pendingNavigation;

    // Open the file and set cursor position
    navigateToFile(path, line, column, undefined, previewMode);

    // Switch to file tab and update worktree tab map
    setActiveTab('file');
    if (activeWorktreePath) {
      setWorktreeTabMap((prev) => ({
        ...prev,
        [activeWorktreePath]: 'file',
      }));
    }

    // Clear the navigation request
    clearNavigation();
  }, [pendingNavigation, navigateToFile, clearNavigation, activeWorktreePath, setActiveTab, setWorktreeTabMap]);
}
