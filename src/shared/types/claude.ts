/**
 * Claude Provider 配置
 * 用于管理多组 Claude API 配置
 */
export interface ClaudeProvider {
  id: string;
  name: string;
  baseUrl: string;
  authToken: string;
  model?: string;
  smallFastModel?: string;
  defaultSonnetModel?: string;
  defaultOpusModel?: string;
  defaultHaikuModel?: string;
  displayOrder?: number; // 显示顺序，用于拖拽排序
  enabled?: boolean; // 是否启用，默认 true
}

/**
 * Claude settings.json 中的 env 字段结构
 */
export interface ClaudeSettingsEnv {
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  ANTHROPIC_SMALL_FAST_MODEL?: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
  [key: string]: string | undefined;
}

/**
 * Claude settings.json 结构（部分）
 */
export interface ClaudeSettings {
  env?: ClaudeSettingsEnv;
  model?: string;
  hooks?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  [key: string]: unknown;
}
