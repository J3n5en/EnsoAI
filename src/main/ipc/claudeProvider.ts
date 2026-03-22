import type { ClaudeProvider } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { type BrowserWindow, ipcMain } from 'electron';
import {
  applyProvider,
  applyProviderToClaudeSettings,
  extractProviderFromClaudeSettings,
  extractProviderFromSettings,
  readClaudeSettings,
  unwatchClaudeSettings,
  watchClaudeSettings,
} from '../services/claude/ClaudeProviderManager';
import {
  readRepositoryClaudeSettings,
  writeRepositoryClaudeSettings,
} from '../services/remote/RemoteEnvironmentService';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';

export function registerClaudeProviderHandlers(): void {
  // 读取当前 Claude settings
  ipcMain.handle(IPC_CHANNELS.CLAUDE_PROVIDER_READ_SETTINGS, async (_, repoPath?: string) => {
    const context = resolveRepositoryRuntimeContext(repoPath);
    if (context.kind === 'remote') {
      const settings = await readRepositoryClaudeSettings(repoPath);
      const extracted = extractProviderFromClaudeSettings(settings);
      return { settings, extracted };
    }

    const settings = readClaudeSettings();
    const extracted = extractProviderFromSettings();
    return { settings, extracted };
  });

  // 应用 Provider 配置
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PROVIDER_APPLY,
    async (_, repoPath: string | undefined, provider: ClaudeProvider) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote') {
        const settings = (await readRepositoryClaudeSettings(repoPath)) ?? {};
        return writeRepositoryClaudeSettings(
          repoPath,
          applyProviderToClaudeSettings(settings, provider)
        );
      }
      return applyProvider(provider);
    }
  );
}

// Keep a reference to the window for dynamic watcher toggling
let watcherWindow: BrowserWindow | null = null;

/**
 * Initialize provider watcher (only starts watching if enabled)
 */
export function initClaudeProviderWatcher(window: BrowserWindow, enabled: boolean): void {
  watcherWindow = window;
  if (enabled) {
    watchClaudeSettings(window);
  }
}

/**
 * Toggle provider watcher based on setting change
 */
export function toggleClaudeProviderWatcher(enabled: boolean): void {
  if (enabled && watcherWindow && !watcherWindow.isDestroyed()) {
    watchClaudeSettings(watcherWindow);
  } else {
    unwatchClaudeSettings();
  }
}
