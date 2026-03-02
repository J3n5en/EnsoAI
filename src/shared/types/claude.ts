/**
 * Claude provider config
 * Used to manage multiple Claude API configurations.
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
  displayOrder?: number; // Display order (used for drag sorting)
  enabled?: boolean; // Whether enabled (default: true)
}

/**
 * `env` field shape in Claude `settings.json`
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
 * Claude `settings.json` (partial)
 */
export interface ClaudeSettings {
  env?: ClaudeSettingsEnv;
  model?: string;
  hooks?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Claude Code CLI `/` completion items
 * - Supports built-in seeds and user-defined items (from `~/.claude/commands`, `~/.claude/skills`)
 * - Only used for UI hints and insert text; it does not change CLI behavior
 */
export type ClaudeSlashCompletionKind = 'command' | 'skill';

export interface ClaudeSlashCompletionItem {
  kind: ClaudeSlashCompletionKind;
  /** Display label (with `/` prefix), e.g. `/save-context` */
  label: string;
  /** Insert text, e.g. `/save-context ` */
  insertText: string;
  /** Optional description */
  description?: string;
  /** Data source */
  source: 'builtin' | 'user' | 'learned';
}

export interface ClaudeSlashCompletionsSnapshot {
  items: ClaudeSlashCompletionItem[];
  /** Generated timestamp (ms) */
  updatedAt: number;
}
