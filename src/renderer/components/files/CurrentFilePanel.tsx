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
import { type TerminalKeybinding, useSettingsStore } from '@/stores/settings';
import { EditorArea, type EditorAreaRef } from './EditorArea';
import type { UnsavedChangesChoice } from './UnsavedChangesDialog';

// Helper to check if a keyboard event matches a keybinding
function matchesKeybinding(e: KeyboardEvent, binding: TerminalKeybinding): boolean {
  const keyMatches = e.key.toLowerCase() === binding.key.toLowerCase();
  const ctrlMatches = !!binding.ctrl === e.ctrlKey;
  const altMatches = !!binding.alt === e.altKey;
  const shiftMatches = !!binding.shift === e.shiftKey;
  const metaMatches = !!binding.meta === e.metaKey;
  return keyMatches && ctrlMatches && altMatches && shiftMatches && metaMatches;
}

interface CurrentFilePanelProps {
  rootPath: string | undefined;
  isActive?: boolean;
  sessionId?: string | null;
}

export function CurrentFilePanel({ rootPath, isActive = false, sessionId }: CurrentFilePanelProps) {
  const { t } = useI18n();
  const {
    tabs,
    activeTab,
    pendingCursor,
    saveFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    setTabViewState,
    reorderTabs,
    setPendingCursor,
    navigateToFile,
  } = useEditor();

  const editorAreaRef = useRef<EditorAreaRef>(null);

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
  // Use capture phase so search shortcuts run before Monaco/inputs consume them
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      // File search (default: Cmd+P)
      if (matchesKeybinding(e, searchKeybindings.searchFiles)) {
        e.preventDefault();
        e.stopPropagation();
        setSearchMode('files');
        setSearchOpen(true);
        return;
      }

      if (matchesKeybinding(e, searchKeybindings.searchContent)) {
        e.preventDefault();
        e.stopPropagation();
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
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
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
      const fileName = path.split(/[/\\]/).pop() ?? path;
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

  // Clear pending cursor
  const handleClearPendingCursor = useCallback(() => {
    setPendingCursor(null);
  }, [setPendingCursor]);

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
    <div className="flex h-full">
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
          onGlobalSearch={(selectedText) => openSearch('content', selectedText)}
        />
      </div>

      <GlobalSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        rootPath={rootPath}
        initialMode={searchMode}
        onOpenFile={(path, line, column, matchLength) => {
          navigateToFile(path, line, column, matchLength);
        }}
      />
    </div>
  );
}
