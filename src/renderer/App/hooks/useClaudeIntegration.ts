import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';

export function useClaudeIntegration(activeWorktreePath: string | null) {
  const claudeCodeIntegration = useSettingsStore((s) => s.claudeCodeIntegration);

  // Sync Claude IDE Bridge with active worktree
  useEffect(() => {
    if (claudeCodeIntegration.enabled) {
      const folders = activeWorktreePath ? [activeWorktreePath] : [];
      window.electronAPI.mcp.setEnabled(true, folders);
    } else {
      window.electronAPI.mcp.setEnabled(false);
    }
  }, [claudeCodeIntegration.enabled, activeWorktreePath]);

  // Sync Stop hook setting
  useEffect(() => {
    window.electronAPI.mcp.setStopHookEnabled(claudeCodeIntegration.stopHookEnabled);
  }, [claudeCodeIntegration.stopHookEnabled]);

  // Sync Status Line hook setting
  useEffect(() => {
    window.electronAPI.mcp.setStatusLineHookEnabled(claudeCodeIntegration.statusLineEnabled);
  }, [claudeCodeIntegration.statusLineEnabled]);

  // Sync PermissionRequest hook setting
  useEffect(() => {
    const setHook = window.electronAPI?.mcp?.setPermissionRequestHookEnabled;
    if (typeof setHook === 'function') {
      setHook(claudeCodeIntegration.permissionRequestHookEnabled);
      return;
    }

    console.warn(
      '[mcp] setPermissionRequestHookEnabled is not available. Please restart Electron dev process to update preload.'
    );
  }, [claudeCodeIntegration.permissionRequestHookEnabled]);
}
