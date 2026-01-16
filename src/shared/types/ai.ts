export type AIProvider = 'claude-code' | 'codex-cli' | 'gemini-cli';

export type ClaudeModelId = 'haiku' | 'sonnet' | 'opus';
export type CodexModelId = 'gpt-5.2' | 'gpt-5.2-codex';
export type GeminiModelId = 'gemini-3-pro-preview' | 'gemini-3-flash-preview';

export type ModelId = ClaudeModelId | CodexModelId | GeminiModelId;

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
