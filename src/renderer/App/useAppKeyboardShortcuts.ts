import { useEffect } from 'react';
import { matchesKeybinding } from '../lib/keybinding';
import { useSettingsStore } from '../stores/settings';
import type { TabId } from './constants';

interface UseAppKeyboardShortcutsOptions {
  activeWorktreePath: string | undefined;
  onTabSwitch: (tab: TabId) => void;
  onActionPanelToggle: () => void;
  onToggleWorktree: () => void;
  onToggleRepository: () => void;
  onSwitchActiveWorktree: () => void;
}

// 判断是否应跳过快捷键处理（可编辑场景、IME、快捷键录制）
function shouldSkipShortcut(e: KeyboardEvent): boolean {
  // IME 组合输入中
  if (e.isComposing) return true;

  const target = e.target as HTMLElement | null;
  if (!target) return false;

  // 快捷键录制模式
  if (target.hasAttribute('data-keybinding-recording')) return true;

  // 输入框、文本区域、可编辑元素
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea') return true;
  if (target.isContentEditable) return true;

  return false;
}

export function useAppKeyboardShortcuts({
  activeWorktreePath: _activeWorktreePath,
  onTabSwitch,
  onActionPanelToggle,
  onToggleWorktree,
  onToggleRepository,
  onSwitchActiveWorktree,
}: UseAppKeyboardShortcutsOptions) {
  // Listen for Action Panel keyboard shortcut (Shift+Cmd+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldSkipShortcut(e)) return;
      if (e.key === 'p' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onActionPanelToggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onActionPanelToggle]);

  // Listen for main tab switching keyboard shortcuts (capture phase to override xterm)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip IME composition and keybinding recording
      if (e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.hasAttribute('data-keybinding-recording')) return;

      const bindings = useSettingsStore.getState().mainTabKeybindings;

      // Check main tab shortcuts using matchesKeybinding for each configured binding
      // This allows tab switching to work even when xterm has focus
      const tabBindings: { binding: typeof bindings.switchToAgent; tab: TabId }[] = [
        { binding: bindings.switchToAgent, tab: 'chat' },
        { binding: bindings.switchToFile, tab: 'file' },
        { binding: bindings.switchToTerminal, tab: 'terminal' },
        { binding: bindings.switchToSourceControl, tab: 'source-control' },
      ];

      for (const { binding, tab } of tabBindings) {
        if (matchesKeybinding(e, binding)) {
          e.preventDefault();
          onTabSwitch(tab);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onTabSwitch]);

  // Listen for workspace panel toggle shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip IME composition and keybinding recording
      if (e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.hasAttribute('data-keybinding-recording')) return;

      const bindings = useSettingsStore.getState().workspaceKeybindings;

      // Handle workspace toggle shortcuts before input/textarea checks
      // This keeps them working even when xterm/Agent input has focus
      if (matchesKeybinding(e, bindings.toggleWorktree)) {
        e.preventDefault();
        onToggleWorktree();
        return;
      }

      if (matchesKeybinding(e, bindings.toggleRepository)) {
        e.preventDefault();
        onToggleRepository();
        return;
      }

      if (matchesKeybinding(e, bindings.switchActiveWorktree)) {
        e.preventDefault();
        onSwitchActiveWorktree();
        return;
      }

      // For other shortcuts, skip if target is input/textarea
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea') return;
        if (target.isContentEditable) return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onToggleWorktree, onToggleRepository, onSwitchActiveWorktree]);
}
