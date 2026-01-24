import { useEffect } from 'react';
import { matchesKeybinding } from '../lib/keybinding';
import { useSettingsStore } from '../stores/settings';
import type { TabId } from './constants';

interface UseAppKeyboardShortcutsOptions {
  activeWorktreePath: string | undefined;
  onTabSwitch: (tab: TabId) => void;
  onActionPanelToggle: () => void;
}

export function useAppKeyboardShortcuts({
  activeWorktreePath: _activeWorktreePath,
  onTabSwitch,
  onActionPanelToggle,
}: UseAppKeyboardShortcutsOptions) {
  // Listen for Action Panel keyboard shortcut (Shift+Cmd+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onActionPanelToggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onActionPanelToggle]);

  // Listen for main tab switching keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const bindings = useSettingsStore.getState().mainTabKeybindings;

      if (matchesKeybinding(e, bindings.switchToAgent)) {
        e.preventDefault();
        onTabSwitch('chat');
        return;
      }

      if (matchesKeybinding(e, bindings.switchToFile)) {
        e.preventDefault();
        onTabSwitch('file');
        return;
      }

      if (matchesKeybinding(e, bindings.switchToTerminal)) {
        e.preventDefault();
        onTabSwitch('terminal');
        return;
      }

      if (matchesKeybinding(e, bindings.switchToSourceControl)) {
        e.preventDefault();
        onTabSwitch('source-control');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTabSwitch]);
}
