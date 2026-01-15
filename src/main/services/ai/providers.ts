import type { LanguageModel } from 'ai';
import { createClaudeCode } from 'ai-sdk-provider-claude-code';

export type AIProvider = 'claude-code';

export type ModelId = 'haiku' | 'sonnet' | 'opus';

// Create provider with default settings
const claudeCodeProvider = createClaudeCode({
  defaultSettings: {
    settingSources: ['user', 'project', 'local'],
  },
});

export function getModel(modelId: ModelId, _provider: AIProvider = 'claude-code'): LanguageModel {
  return claudeCodeProvider(modelId);
}
