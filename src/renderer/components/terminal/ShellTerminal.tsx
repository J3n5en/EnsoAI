import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTerminalScrollToBottom } from '@/hooks/useTerminalScrollToBottom';
import { useXterm } from '@/hooks/useXterm';
import { useI18n } from '@/i18n';
import { matchesKeybinding } from '@/lib/keybinding';
import { useSettingsStore } from '@/stores/settings';
import { TerminalSearchBar, type TerminalSearchBarRef } from './TerminalSearchBar';

interface ShellTerminalProps {
  cwd?: string;
  isActive?: boolean;
  canMerge?: boolean;
  initialCommand?: string;
  onExit?: () => void;
  onTitleChange?: (title: string) => void;
  onInit?: (ptyId: string) => void;
  onSplit?: () => void;
  onMerge?: () => void;
}

export function ShellTerminal({
  cwd,
  isActive = false,
  canMerge = false,
  initialCommand,
  onExit,
  onTitleChange,
  onInit,
  onSplit,
  onMerge,
}: ShellTerminalProps) {
  const { t } = useI18n();

  // Handle Shift+Enter for newline (send LF character)
  const handleCustomKey = useCallback((event: KeyboardEvent, ptyId: string) => {
    if (event.key === 'Enter' && event.shiftKey) {
      if (event.type === 'keydown') {
        window.electronAPI.terminal.write(ptyId, '\x0a');
      }
      return false; // Prevent default Enter behavior
    }
    return true;
  }, []);

  const {
    containerRef,
    isLoading,
    settings,
    findNext,
    findPrevious,
    clearSearch,
    terminal,
    clear,
    refreshRenderer,
  } = useXterm({
    cwd,
    isActive,
    initialCommand,
    onExit,
    onTitleChange,
    onInit,
    onSplit,
    onMerge,
    canMerge,
    onCustomKey: handleCustomKey,
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchBarRef = useRef<TerminalSearchBarRef>(null);
  const xtermKeybindings = useSettingsStore((state) => state.xtermKeybindings);
  const { showScrollToBottom, handleScrollToBottom } = useTerminalScrollToBottom(terminal);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd+F / Ctrl+F for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (isSearchOpen) {
          searchBarRef.current?.focus();
        } else {
          setIsSearchOpen(true);
        }
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.clear)) {
        e.preventDefault();
        clear();
        return;
      }
    },
    [isSearchOpen, xtermKeybindings, clear]
  );

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();

      const selectedId = await window.electronAPI.contextMenu.show([
        { id: 'split', label: t('Split Terminal') },
        { id: 'merge', label: t('Merge Terminal'), disabled: !canMerge },
        { id: 'separator-0', label: '', type: 'separator' },
        { id: 'clear', label: t('Clear terminal') },
        { id: 'refresh', label: t('Refresh terminal') },
        { id: 'separator-1', label: '', type: 'separator' },
        { id: 'copy', label: t('Copy'), disabled: !terminal?.hasSelection() },
        { id: 'paste', label: t('Paste') },
        { id: 'selectAll', label: t('Select all') },
      ]);

      if (!selectedId) return;

      switch (selectedId) {
        case 'split':
          onSplit?.();
          break;
        case 'merge':
          onMerge?.();
          break;
        case 'clear':
          clear();
          break;
        case 'refresh':
          refreshRenderer();
          break;
        case 'copy':
          if (terminal?.hasSelection()) {
            const selection = terminal.getSelection();
            navigator.clipboard.writeText(selection);
          }
          break;
        case 'paste':
          navigator.clipboard.readText().then((text) => {
            terminal?.paste(text);
          });
          break;
        case 'selectAll':
          terminal?.selectAll();
          break;
      }
    },
    [terminal, clear, refreshRenderer, t, onSplit, onMerge, canMerge]
  );

  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleKeyDown]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [handleContextMenu, containerRef]);

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: settings.theme.background, contain: 'strict' }}
    >
      <div ref={containerRef} className="h-full w-full" />
      <TerminalSearchBar
        ref={searchBarRef}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onFindNext={findNext}
        onFindPrevious={findPrevious}
        onClearSearch={clearSearch}
        theme={settings.theme}
      />
      {showScrollToBottom && (
        <button
          type="button"
          onClick={handleScrollToBottom}
          className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/80 text-primary-foreground shadow-lg transition-all hover:bg-primary hover:scale-105 active:scale-95"
          title={t('Scroll to bottom')}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: settings.theme.foreground, opacity: 0.5 }}
            />
            <span style={{ color: settings.theme.foreground, opacity: 0.5 }} className="text-sm">
              {t('Starting shell...')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
