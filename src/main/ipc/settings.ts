import { IPC_CHANNELS } from '@shared/types';
import { app, ipcMain } from 'electron';
import {
  readSharedSettings,
  writeSharedSettings,
  writeSharedSettingsToSession,
} from '../services/SharedSessionState';
import { toggleClaudeProviderWatcher } from './claudeProvider';

// 内存缓存和防抖配置
let cachedSettings: Record<string, unknown> | null = null;
let pendingWrite: NodeJS.Timeout | null = null;
let maxWaitTimer: NodeJS.Timeout | null = null;
let isDirty = false;

const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 5000;

/**
 * Read settings from disk (for use in main process)
 */
export function readSettings(): Record<string, unknown> | null {
  // 优先返回内存缓存
  if (cachedSettings !== null) {
    return cachedSettings;
  }

  try {
    cachedSettings = readSharedSettings();
    return cachedSettings;
  } catch {
    // Return null if file doesn't exist or is corrupted
  }
  cachedSettings = null;
  return null;
}

/**
 * 原子写入：先写临时文件，再重命名，避免崩溃导致文件损坏
 */
function atomicWriteSettings(data: Record<string, unknown>): boolean {
  try {
    writeSharedSettings(data);
    writeSharedSettingsToSession(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * 强制落盘（在退出前调用）
 */
export function flushSettings(): boolean {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  if (maxWaitTimer) {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
  }

  if (isDirty && cachedSettings !== null) {
    isDirty = false;
    return atomicWriteSettings(cachedSettings);
  }
  return true;
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_READ, async () => {
    return readSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_WRITE, async (_, data: unknown) => {
    try {
      const newData = data as Record<string, unknown>;

      // Detect enableProviderWatcher change and toggle watcher accordingly
      const oldEnabled = (cachedSettings?.claudeCodeIntegration as Record<string, unknown>)
        ?.enableProviderWatcher;
      const newEnabled = (newData.claudeCodeIntegration as Record<string, unknown>)
        ?.enableProviderWatcher;
      if (oldEnabled !== newEnabled) {
        toggleClaudeProviderWatcher(newEnabled !== false);
      }

      // 更新内存缓存
      cachedSettings = newData;
      isDirty = true;

      // 防抖写入
      if (pendingWrite) {
        clearTimeout(pendingWrite);
      }

      // 如果没有 maxWait 计时器，启动一个
      if (!maxWaitTimer) {
        maxWaitTimer = setTimeout(() => {
          if (cachedSettings !== null) {
            isDirty = false;
            atomicWriteSettings(cachedSettings);
          }
          maxWaitTimer = null;
          pendingWrite = null;
        }, MAX_WAIT_MS);
      }

      pendingWrite = setTimeout(() => {
        if (maxWaitTimer) {
          clearTimeout(maxWaitTimer);
          maxWaitTimer = null;
        }
        if (cachedSettings !== null) {
          isDirty = false;
          atomicWriteSettings(cachedSettings);
        }
        pendingWrite = null;
      }, DEBOUNCE_MS);

      return true;
    } catch {
      return false;
    }
  });

  // 在退出前强制落盘
  app.on('before-quit', () => {
    flushSettings();
  });
}
