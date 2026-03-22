import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';

export function useClaudeIntegration(activeWorktreePath: string | null, enabled = true) {
  const claudeCodeIntegration = useSettingsStore((s) => s.claudeCodeIntegration);

  // Sync Claude IDE Bridge with active worktree
  useEffect(() => {
    if (!enabled) {
      window.electronAPI.mcp.setEnabled(false);
      return;
    }

    if (claudeCodeIntegration.enabled) {
      const folders = activeWorktreePath ? [activeWorktreePath] : [];
      window.electronAPI.mcp.setEnabled(true, folders);
    } else {
      window.electronAPI.mcp.setEnabled(false);
    }
  }, [enabled, claudeCodeIntegration.enabled, activeWorktreePath]);

  // Sync Stop hook setting
  useEffect(() => {
    if (!enabled) {
      return;
    }
    window.electronAPI.mcp.setStopHookEnabled(claudeCodeIntegration.stopHookEnabled);
  }, [enabled, claudeCodeIntegration.stopHookEnabled]);

  // Sync Status Line hook setting
  useEffect(() => {
    if (!enabled) {
      return;
    }
    window.electronAPI.mcp.setStatusLineHookEnabled(claudeCodeIntegration.statusLineEnabled);
  }, [enabled, claudeCodeIntegration.statusLineEnabled]);

  // Sync PermissionRequest hook setting
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const setHook = window.electronAPI?.mcp?.setPermissionRequestHookEnabled;
    if (typeof setHook === 'function') {
      setHook(claudeCodeIntegration.permissionRequestHookEnabled);
      return;
    }

    console.warn(
      '[mcp] setPermissionRequestHookEnabled is not available. Please restart Electron dev process to update preload.'
    );
  }, [enabled, claudeCodeIntegration.permissionRequestHookEnabled]);
}
