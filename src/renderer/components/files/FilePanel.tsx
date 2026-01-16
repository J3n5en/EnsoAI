import { FileCode } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalSearchDialog, type SearchMode } from '@/components/search';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { requestUnsavedChoice } from '@/stores/unsavedPrompt';

// Global ref for passing selected text to search dialog
declare global {
  interface Window {
    _pendingSearchQuery?: string;
  }
}

import { useEditor } from '@/hooks/useEditor';
import { useFileTree } from '@/hooks/useFileTree';
import { type TerminalKeybinding, useSettingsStore } from '@/stores/settings';
import { EditorArea, type EditorAreaRef } from './EditorArea';
import { FileTree } from './FileTree';
import { NewItemDialog } from './NewItemDialog';
import type { UnsavedChangesChoice } from './UnsavedChangesDialog';

// Panel size constraints
const PANEL_MIN_WIDTH = 180;
const PANEL_MAX_WIDTH = 500;
const PANEL_DEFAULT_WIDTH = 256;
const STORAGE_KEY = 'enso-file-panel-width';

// Helper to check if a keyboard event matches a keybinding
function matchesKeybinding(e: KeyboardEvent, binding: TerminalKeybinding): boolean {
  const keyMatches = e.key.toLowerCase() === binding.key.toLowerCase();
  const ctrlMatches = !!binding.ctrl === e.ctrlKey;
  const altMatches = !!binding.alt === e.altKey;
  const shiftMatches = !!binding.shift === e.shiftKey;
  const metaMatches = !!binding.meta === e.metaKey;
  return keyMatches && ctrlMatches && altMatches && shiftMatches && metaMatches;
}

interface FilePanelProps {
  rootPath: string | undefined;
  isActive?: boolean;
  sessionId?: string | null;
}

type NewItemType = 'file' | 'directory' | null;

export function FilePanel({ rootPath, isActive = false, sessionId }: FilePanelProps) {
  const { t } = useI18n();
  const {
    tree,
    isLoading,
    expandedPaths,
    toggleExpand,
    createFile,
    createDirectory,
    renameItem,
    deleteItem,
    refresh,
  } = useFileTree({ rootPath, enabled: !!rootPath, isActive });

  const {
    tabs,
    activeTab,
    pendingCursor,
    loadFile,
    saveFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    setTabViewState,
    reorderTabs,
    setPendingCursor,
    navigateToFile,
  } = useEditor();

  const [newItemType, setNewItemType] = useState<NewItemType>(null);
  const [newItemParentPath, setNewItemParentPath] = useState<string>('');

  const editorAreaRef = useRef<EditorAreaRef>(null);

  // Panel resize state
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : PANEL_DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Panel resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const clampedWidth = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(STORAGE_KEY, String(panelWidth));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, panelWidth]);

  // Global search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('content');

  // Get search keybindings from settings
  const searchKeybindings = useSettingsStore((s) => s.searchKeybindings);
  const editorSettings = useSettingsStore((s) => s.editorSettings);

  // Helper to open search dialog with current selection
  const openSearch = useCallback((mode: SearchMode, selectedText?: string) => {
    setSearchMode(mode);
    // Store selected text in a ref so GlobalSearchDialog can access it when opening
    if (selectedText !== undefined) {
      window._pendingSearchQuery = selectedText;
    }
    setSearchOpen(true);
  }, []);

  // Cmd+W: close tab, Cmd+1-9: switch tab, search shortcuts from settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      // File search (default: Cmd+P)
      if (matchesKeybinding(e, searchKeybindings.searchFiles)) {
        e.preventDefault();
        setSearchMode('files');
        setSearchOpen(true);
        return;
      }

      if (matchesKeybinding(e, searchKeybindings.searchContent)) {
        e.preventDefault();
        const selectedText = editorAreaRef.current?.getSelectedText() ?? '';
        openSearch('content', selectedText);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTab) {
          editorAreaRef.current?.requestCloseTab(activeTab.path);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = Number.parseInt(e.key, 10) - 1;
        if (index < tabs.length) {
          setActiveFile(tabs[index].path);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, tabs, activeTab, setActiveFile, searchKeybindings, openSearch]);

  const shouldPromptUnsaved = useCallback(
    (path: string) => {
      const tab = tabs.find((t) => t.path === path);
      if (!tab) return false;
      const autoSaveOff = editorSettings.autoSave === 'off';
      return autoSaveOff && tab.isDirty;
    },
    [tabs, editorSettings.autoSave]
  );

  const promptUnsaved = useCallback(
    async (path: string): Promise<UnsavedChangesChoice> => {
      if (!shouldPromptUnsaved(path)) return 'dontSave';
      const fileName = path.split(/[/\\\\]/).pop() ?? path;
      return requestUnsavedChoice(fileName);
    },
    [shouldPromptUnsaved]
  );

  const requestCloseTab = useCallback(
    async (path: string) => {
      const choice = await promptUnsaved(path);
      if (choice === 'cancel') return;

      if (choice === 'save') {
        try {
          await saveFile.mutateAsync(path);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toastManager.add({
            type: 'error',
            title: t('Save failed'),
            description: message,
          });
          return;
        }
      }

      closeFile(path);
    },
    [promptUnsaved, saveFile, closeFile, t]
  );

  const requestCloseTabs = useCallback(
    async (paths: string[]) => {
      for (const path of paths) {
        const tab = tabs.find((t) => t.path === path);
        if (!tab) continue;
        const choice = await promptUnsaved(path);
        if (choice === 'cancel') return;

        if (choice === 'save') {
          try {
            await saveFile.mutateAsync(path);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toastManager.add({
              type: 'error',
              title: t('Save failed'),
              description: message,
            });
            return;
          }
        }

        closeFile(path);
      }
    },
    [tabs, promptUnsaved, saveFile, closeFile, t]
  );

  // Handle file click (single click = open in editor)
  const handleFileClick = useCallback(
    (path: string) => {
      const existingTab = tabs.find((t) => t.path === path);
      if (existingTab) {
        setActiveFile(path);
      } else {
        loadFile.mutate(path);
      }
    },
    [tabs, setActiveFile, loadFile]
  );

  // Handle tab click
  const handleTabClick = useCallback(
    (path: string) => {
      setActiveFile(path);
    },
    [setActiveFile]
  );

  // Handle tab close
  const handleTabClose = useCallback(
    (path: string) => {
      requestCloseTab(path);
    },
    [requestCloseTab]
  );

  // Handle save
  const handleSave = useCallback(
    (path: string) => {
      saveFile.mutate(path);
    },
    [saveFile]
  );

  // Handle create file
  const handleCreateFile = useCallback((parentPath: string) => {
    setNewItemType('file');
    setNewItemParentPath(parentPath);
  }, []);

  // Handle create directory
  const handleCreateDirectory = useCallback((parentPath: string) => {
    setNewItemType('directory');
    setNewItemParentPath(parentPath);
  }, []);

  // Handle new item confirm
  const handleNewItemConfirm = useCallback(
    async (name: string) => {
      const fullPath = `${newItemParentPath}/${name}`;
      if (newItemType === 'file') {
        await createFile(fullPath);
        // Open the new file
        loadFile.mutate(fullPath);
      } else if (newItemType === 'directory') {
        await createDirectory(fullPath);
      }
      setNewItemType(null);
      setNewItemParentPath('');
    },
    [newItemType, newItemParentPath, createFile, createDirectory, loadFile]
  );

  // Handle rename
  const handleRename = useCallback(
    async (path: string, newName: string) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      const newPath = `${parentPath}/${newName}`;
      await renameItem(path, newPath);
    },
    [renameItem]
  );

  // Handle delete with confirmation
  const handleDelete = useCallback(
    async (path: string) => {
      const confirmed = window.confirm(`Delete "${path.split('/').pop()}"?`);
      if (confirmed) {
        await deleteItem(path);
        // Close tab if open
        closeFile(path);
      }
    },
    [deleteItem, closeFile]
  );

  // Clear pending cursor
  const handleClearPendingCursor = useCallback(() => {
    setPendingCursor(null);
  }, [setPendingCursor]);

  // Handle breadcrumb click - expand path in file tree
  const handleBreadcrumbClick = useCallback(
    (path: string) => {
      if (!rootPath) return;

      // Get all parent paths that need to be expanded
      const relativePath = path.startsWith(rootPath)
        ? path.slice(rootPath.length).replace(/^\//, '')
        : path;

      const parts = relativePath.split('/');
      let currentPath = rootPath;

      // Expand each parent directory
      for (const part of parts) {
        currentPath = `${currentPath}/${part}`;
        if (!expandedPaths.has(currentPath)) {
          toggleExpand(currentPath);
        }
      }
    },
    [rootPath, expandedPaths, toggleExpand]
  );

  // Handle open file from search
  const handleSearchOpenFile = useCallback(
    (path: string, line?: number, column?: number, matchLength?: number) => {
      navigateToFile(path, line, column, matchLength);
    },
    [navigateToFile]
  );

  const handleGlobalSearch = useCallback(
    (selectedText: string) => {
      openSearch('content', selectedText);
    },
    [openSearch]
  );

  if (!rootPath) {
    return (
      <Empty className="h-full">
        <EmptyMedia variant="icon">
          <FileCode className="h-4.5 w-4.5" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t('File Explorer')}</EmptyTitle>
          <EmptyDescription>{t('Select a Worktree to browse files')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div ref={containerRef} className={`flex h-full ${isResizing ? 'select-none' : ''}`}>
      {/* File Tree - left panel */}
      <div className="relative shrink-0 border-r" style={{ width: panelWidth }}>
        <FileTree
          tree={tree}
          expandedPaths={expandedPaths}
          onToggleExpand={toggleExpand}
          onFileClick={handleFileClick}
          onCreateFile={handleCreateFile}
          onCreateDirectory={handleCreateDirectory}
          onRename={handleRename}
          onDelete={handleDelete}
          onRefresh={refresh}
          onOpenSearch={() => {
            const selectedText = editorAreaRef.current?.getSelectedText() ?? '';
            openSearch('content', selectedText);
          }}
          isLoading={isLoading}
          rootPath={rootPath}
        />
        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
          onMouseDown={handleResizeStart}
        />
      </div>

      {/* Editor Area - right panel */}
      <div className="flex-1 overflow-hidden">
        <EditorArea
          ref={editorAreaRef}
          tabs={tabs}
          activeTab={activeTab}
          activeTabPath={activeTab?.path ?? null}
          pendingCursor={pendingCursor}
          rootPath={rootPath}
          sessionId={sessionId}
          onTabClick={handleTabClick}
          onTabClose={handleTabClose}
          onCloseOthers={async (keepPath) => {
            const paths = tabs.filter((t) => t.path !== keepPath).map((t) => t.path);
            await requestCloseTabs(paths);
          }}
          onCloseAll={async () => {
            const paths = tabs.map((t) => t.path);
            await requestCloseTabs(paths);
          }}
          onCloseLeft={async (path) => {
            const index = tabs.findIndex((t) => t.path === path);
            if (index <= 0) return;
            const paths = tabs.slice(0, index).map((t) => t.path);
            await requestCloseTabs(paths);
          }}
          onCloseRight={async (path) => {
            const index = tabs.findIndex((t) => t.path === path);
            if (index < 0 || index >= tabs.length - 1) return;
            const paths = tabs.slice(index + 1).map((t) => t.path);
            await requestCloseTabs(paths);
          }}
          onTabReorder={reorderTabs}
          onContentChange={updateFileContent}
          onViewStateChange={setTabViewState}
          onSave={handleSave}
          onClearPendingCursor={handleClearPendingCursor}
          onBreadcrumbClick={handleBreadcrumbClick}
          onGlobalSearch={handleGlobalSearch}
        />
      </div>

      {/* New Item Dialog */}
      <NewItemDialog
        isOpen={newItemType !== null}
        type={newItemType || 'file'}
        onConfirm={handleNewItemConfirm}
        onCancel={() => {
          setNewItemType(null);
          setNewItemParentPath('');
        }}
      />

      {/* Global Search Dialog */}
      <GlobalSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        rootPath={rootPath}
        initialMode={searchMode}
        onOpenFile={handleSearchOpenFile}
      />
    </div>
  );
}
