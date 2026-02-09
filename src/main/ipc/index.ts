import { stopAllCodeReviews } from '../services/ai';
import { disposeClaudeIdeBridge } from '../services/claude/ClaudeIdeBridge';
import { autoUpdaterService } from '../services/updater/AutoUpdater';
import { webInspectorServer } from '../services/webInspector';
import { registerAgentHandlers } from './agent';
import { registerAppHandlers } from './app';
import { registerClaudeConfigHandlers } from './claudeConfig';
import { registerClaudeProviderHandlers } from './claudeProvider';
import { registerCliHandlers } from './cli';
import { registerDialogHandlers } from './dialog';
import { registerFileHandlers, stopAllFileWatchers, stopAllFileWatchersSync } from './files';
import { clearAllGitServices, registerGitHandlers } from './git';
import { autoStartHapi, cleanupHapi, registerHapiHandlers } from './hapi';

export { autoStartHapi };

import { registerNotificationHandlers } from './notification';
import { registerSearchHandlers } from './search';
import { registerSettingsHandlers } from './settings';
import { registerShellHandlers } from './shell';
import { registerTempWorkspaceHandlers } from './tempWorkspace';
import {
  destroyAllTerminals,
  destroyAllTerminalsAndWait,
  registerTerminalHandlers,
} from './terminal';
import { cleanupTmux, cleanupTmuxSync, registerTmuxHandlers } from './tmux';
import { registerUpdaterHandlers } from './updater';
import { registerWebInspectorHandlers } from './webInspector';
import { clearAllWorktreeServices, registerWorktreeHandlers } from './worktree';

export function registerIpcHandlers(): void {
  registerGitHandlers();
  registerWorktreeHandlers();
  registerFileHandlers();
  registerTerminalHandlers();
  registerAgentHandlers();
  registerDialogHandlers();
  registerAppHandlers();
  registerCliHandlers();
  registerShellHandlers();
  registerSettingsHandlers();
  registerNotificationHandlers();
  registerUpdaterHandlers();
  registerSearchHandlers();
  registerHapiHandlers();
  registerClaudeProviderHandlers();
  registerClaudeConfigHandlers();
  registerWebInspectorHandlers();
  registerTempWorkspaceHandlers();
  registerTmuxHandlers();
}

export async function cleanupAllResources(): Promise<void> {
  const CLEANUP_TIMEOUT = 3000;

  // Stop Hapi server first (sync, fast)
  cleanupHapi();

  // Kill tmux enso server (async, fast)
  cleanupTmux().catch((err) => console.warn('Tmux cleanup warning:', err));

  // Stop Web Inspector server (sync, fast)
  webInspectorServer.stop();

  // Stop all code review processes (sync, fast)
  stopAllCodeReviews();

  // Destroy all PTY sessions and wait for them to exit
  // This prevents crashes when PTY exit callbacks fire during Node cleanup
  try {
    await Promise.race([
      destroyAllTerminalsAndWait(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Terminal cleanup timeout')), CLEANUP_TIMEOUT)
      ),
    ]);
  } catch (err) {
    console.warn('Terminal cleanup warning:', err);
    // Force destroy without waiting as fallback
    destroyAllTerminals();
  }

  // Stop file watchers with timeout to prevent hanging
  try {
    await Promise.race([
      stopAllFileWatchers(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('File watcher cleanup timeout')), CLEANUP_TIMEOUT)
      ),
    ]);
  } catch (err) {
    console.warn('File watcher cleanup warning:', err);
  }

  // Clear service caches (sync, fast)
  clearAllGitServices();
  clearAllWorktreeServices();

  autoUpdaterService.cleanup();

  // Dispose Claude IDE Bridge
  disposeClaudeIdeBridge();
}

/**
 * Synchronous cleanup for signal handlers (SIGINT/SIGTERM).
 * Kills child processes immediately without waiting for graceful shutdown.
 * This ensures clean exit when electron-vite terminates quickly.
 */
export function cleanupAllResourcesSync(): void {
  console.log('[app] Sync cleanup starting...');

  // Kill Hapi/Cloudflared processes (sync)
  cleanupHapi();

  // Kill tmux enso server (sync)
  cleanupTmuxSync();

  // Stop Web Inspector server (sync)
  webInspectorServer.stop();

  // Kill all PTY sessions immediately (sync)
  destroyAllTerminals();

  // Stop all code review processes (sync)
  stopAllCodeReviews();

  // Stop file watchers (sync)
  stopAllFileWatchersSync();

  // Clear service caches (sync)
  clearAllGitServices();
  clearAllWorktreeServices();

  autoUpdaterService.cleanup();

  // Dispose Claude IDE Bridge (sync)
  disposeClaudeIdeBridge();

  console.log('[app] Sync cleanup done');
}
