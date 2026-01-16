import { generateText } from 'ai';
import { type AIProvider, getModel, type ModelId, type ReasoningEffort } from './providers';

export interface BranchNameOptions {
  workdir: string;
  prompt: string;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  timeout?: number;
}

export interface BranchNameResult {
  success: boolean;
  branchName?: string;
  error?: string;
}

export async function generateBranchName(options: BranchNameOptions): Promise<BranchNameResult> {
  const { prompt, provider, model, reasoningEffort, timeout = 120 } = options;

  try {
    const { text } = await generateText({
      model: getModel(model, { provider, reasoningEffort }),
      prompt,
      abortSignal: AbortSignal.timeout(timeout * 1000),
    });
    return { success: true, branchName: text.trim() };
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return { success: false, error: 'timeout' };
    }
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}
