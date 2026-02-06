export type AIProvider = 'claude-code' | 'codex-cli' | 'cursor-cli' | 'gemini-cli';

export type ClaudeModelId = 'haiku' | 'sonnet' | 'opus';
export type CodexModelId = 'gpt-5.2' | 'gpt-5.2-codex';
export type CursorModelId = 'auto' | 'composer-1' | 'gpt-5.2' | 'sonnet-4.5' | 'opus-4.6';
export type GeminiModelId = 'gemini-3-pro-preview' | 'gemini-3-flash-preview';

export type ModelId = ClaudeModelId | CodexModelId | CursorModelId | GeminiModelId;

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
