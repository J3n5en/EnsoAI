import type { LanguageModel } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

export type AIProvider = 'claude-code';

export type ModelId = 'haiku' | 'sonnet' | 'opus';

type ModelFactory = (provider: AIProvider) => LanguageModel;

const MODEL_MAP: Record<ModelId, ModelFactory> = {
  haiku: () => claudeCode('claude-haiku'),
  sonnet: () => claudeCode('claude-sonnet-4-20250514'),
  opus: () => claudeCode('claude-opus-4-20250514'),
};

export function getModel(modelId: ModelId, provider: AIProvider = 'claude-code'): LanguageModel {
  const factory = MODEL_MAP[modelId];
  if (!factory) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  return factory(provider);
}
