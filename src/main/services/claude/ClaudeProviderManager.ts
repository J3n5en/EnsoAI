import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ClaudeProvider, ClaudeSettings } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';

function getClaudeConfigDir(): string {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return process.env.CLAUDE_CONFIG_DIR;
  }
  return path.join(os.homedir(), '.claude');
}

function getClaudeSettingsPath(): string {
  return path.join(getClaudeConfigDir(), 'settings.json');
}

let settingsWatcher: fs.FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let maxWaitTimer: NodeJS.Timeout | null = null;
let lastProviderSnapshot: string | null = null; // 上次 Provider 配置快照
let lastMtimeMs: number | null = null; // 文件最后修改时间
let lastFileSize: number | null = null; // 文件大小

/**
 * 比较 Provider 配置是否变化
 */
function hasProviderChanged(extracted: Partial<ClaudeProvider> | null): boolean {
  const currentSnapshot = JSON.stringify(extracted);
  if (currentSnapshot === lastProviderSnapshot) {
    return false;
  }
  lastProviderSnapshot = currentSnapshot;
  return true;
}

/**
 * 监听 ~/.claude/settings.json 的变化
 */
export function watchClaudeSettings(window: BrowserWindow): void {
  // 防止重复监听
  if (settingsWatcher) {
    settingsWatcher.close();
  }

  const settingsPath = getClaudeSettingsPath();
  const configDir = getClaudeConfigDir();

  // 确保目录存在，否则无法监听
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    } catch (err) {
      console.error('[ClaudeProviderManager] Failed to create config dir for watching:', err);
      return;
    }
  }

  // 初始化快照
  lastProviderSnapshot = JSON.stringify(extractProviderFromSettings());

  // 监听目录而不是文件，因为很多编辑器保存时会先删除文件再新建
  try {
    settingsWatcher = fs.watch(configDir, (eventType, filename) => {
      // filename 在某些平台上可能为 null，需要做健壮性检查
      if (filename && filename === 'settings.json') {
        console.log(`[ClaudeProviderManager] Detected ${filename} change (${eventType})`);

        const processChange = () => {
          // 清理计时器
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          if (maxWaitTimer) {
            clearTimeout(maxWaitTimer);
            maxWaitTimer = null;
          }

          // 检查窗口是否已销毁
          if (window.isDestroyed()) {
            console.log('[ClaudeProviderManager] Window destroyed, skipping notification');
            return;
          }

          // 检查文件元数据，避免无意义读取
          try {
            if (fs.existsSync(settingsPath)) {
              const stats = fs.statSync(settingsPath);
              const currentMtime = stats.mtimeMs;
              const currentSize = stats.size;

              // 如果文件未实际变化（相同修改时间和大小），跳过
              if (
                lastMtimeMs !== null &&
                lastFileSize !== null &&
                currentMtime === lastMtimeMs &&
                currentSize === lastFileSize
              ) {
                console.log('[ClaudeProviderManager] File metadata unchanged, skipping read');
                return;
              }

              lastMtimeMs = currentMtime;
              lastFileSize = currentSize;
            }
          } catch (err) {
            console.warn('[ClaudeProviderManager] Failed to check file stats:', err);
          }

          // 读取新配置
          try {
            const settings = readClaudeSettings();
            const extracted = extractProviderFromSettings();

            // 仅在 Provider 配置实际变化时推送通知
            if (hasProviderChanged(extracted)) {
              console.log('[ClaudeProviderManager] Provider config changed, notifying frontend');
              window.webContents.send(IPC_CHANNELS.CLAUDE_PROVIDER_SETTINGS_CHANGED, {
                settings,
                extracted,
              });
            } else {
              console.log(
                '[ClaudeProviderManager] Provider config unchanged, skipping notification'
              );
            }
          } catch (err) {
            console.warn('[ClaudeProviderManager] Failed to read settings after change:', err);
          }
        };

        // 防抖处理：合并短时间内的多次事件
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        // 如果没有 maxWait 计时器在运行，启动一个
        if (!maxWaitTimer) {
          maxWaitTimer = setTimeout(() => {
            processChange();
          }, 2000); // 最多等待 2 秒
        }

        debounceTimer = setTimeout(() => {
          processChange();
        }, 400); // 400ms 防抖延迟
      }
    });

    // 监听 watcher 错误事件
    settingsWatcher.on('error', (err) => {
      console.error('[ClaudeProviderManager] Watcher error:', err);
    });

    console.log(`[ClaudeProviderManager] Started watching ${settingsPath}`);
  } catch (err) {
    console.error('[ClaudeProviderManager] Failed to start watcher:', err);
  }
}

/**
 * 停止监听
 */
export function unwatchClaudeSettings(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (maxWaitTimer) {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
  }
  if (settingsWatcher) {
    settingsWatcher.close();
    settingsWatcher = null;
  }
  lastProviderSnapshot = null;
  lastMtimeMs = null;
  lastFileSize = null;
}

/**
 * 读取 ~/.claude/settings.json
 */
export function readClaudeSettings(): ClaudeSettings | null {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const content = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
  } catch (error) {
    console.error('[ClaudeProviderManager] Failed to read settings:', error);
    return null;
  }
}

/**
 * 从当前 settings.json 提取 Provider 相关字段
 * 用于配置匹配和"保存为新配置"功能
 * 注意：不提取 model 和 smallFastModel 字段，因为这些字段会被用户临时切换模型而改变
 */
export function extractProviderFromSettings(): Partial<ClaudeProvider> | null {
  const settings = readClaudeSettings();
  if (!settings?.env?.ANTHROPIC_BASE_URL) {
    return null;
  }

  return {
    baseUrl: settings.env.ANTHROPIC_BASE_URL,
    authToken: settings.env.ANTHROPIC_AUTH_TOKEN,
    defaultSonnetModel: settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    defaultOpusModel: settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    defaultHaikuModel: settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  };
}

/**
 * 应用 Provider 配置到 ~/.claude/settings.json
 * 只更新 Provider 相关字段，保留其他配置
 */
export function applyProvider(provider: ClaudeProvider): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();
    let settings: ClaudeSettings = {};

    // 读取现有配置
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    // 保留现有 env 中非 Provider 字段
    const existingEnv = { ...(settings.env ?? {}) };

    // 先清除所有 Provider 相关字段（防止残留）
    delete existingEnv.ANTHROPIC_BASE_URL;
    delete existingEnv.ANTHROPIC_AUTH_TOKEN;
    delete existingEnv.ANTHROPIC_SMALL_FAST_MODEL;
    delete existingEnv.ANTHROPIC_DEFAULT_SONNET_MODEL;
    delete existingEnv.ANTHROPIC_DEFAULT_OPUS_MODEL;
    delete existingEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL;

    // 构建 Provider env 字段
    const providerEnv: Record<string, string> = {
      ANTHROPIC_BASE_URL: provider.baseUrl,
      ANTHROPIC_AUTH_TOKEN: provider.authToken,
    };

    // 可选字段
    if (provider.smallFastModel) {
      providerEnv.ANTHROPIC_SMALL_FAST_MODEL = provider.smallFastModel;
    }
    if (provider.defaultSonnetModel) {
      providerEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = provider.defaultSonnetModel;
    }
    if (provider.defaultOpusModel) {
      providerEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = provider.defaultOpusModel;
    }
    if (provider.defaultHaikuModel) {
      providerEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = provider.defaultHaikuModel;
    }

    // 合并 env（Provider 字段覆盖现有值）
    settings.env = { ...existingEnv, ...providerEnv };

    // 设置/清除 model 字段
    if (provider.model) {
      settings.model = provider.model;
    } else {
      delete settings.model;
    }

    // 确保目录存在
    const configDir = getClaudeConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    // 写入配置
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });

    console.log(`[ClaudeProviderManager] Applied provider: ${provider.name}`);
    return true;
  } catch (error) {
    console.error('[ClaudeProviderManager] Failed to apply provider:', error);
    return false;
  }
}
