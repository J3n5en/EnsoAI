import { useCallback, useEffect, useRef, useState } from 'react';
import { useTerminalEmulator } from '@/hooks/useTerminalEmulator';
import { useI18n } from '@/i18n';
import { matchesKeybinding } from '@/lib/keybinding';
import { useSettingsStore } from '@/stores/settings';
import { TerminalSearchBar, type TerminalSearchBarRef } from './TerminalSearchBar';

interface ShellTerminalProps {
  cwd?: string;
  isActive?: boolean;
  canMerge?: boolean; // whether merge option should be enabled (has multiple groups)
  onExit?: () => void;
  onTitleChange?: (title: string) => void;
  onSplit?: () => void;
  onMerge?: () => void;
}

export function ShellTerminal({
  cwd,
  isActive = false,
  canMerge = false,
  onExit,
  onTitleChange,
  onSplit,
  onMerge,
}: ShellTerminalProps) {
  const { t } = useI18n();

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
  } = useTerminalEmulator({
    cwd,
    isActive,
    onExit,
    onTitleChange,
    onSplit,
    onMerge,
    canMerge,
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchBarRef = useRef<TerminalSearchBarRef>(null);
  const xtermKeybindings = useSettingsStore((state) => state.xtermKeybindings);

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
      className="relative h-full w-full px-[5px] py-[2px]"
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
