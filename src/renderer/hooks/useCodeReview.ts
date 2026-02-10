import { useCallback } from 'react';
import {
  startCodeReview,
  stopCodeReview,
  useCodeReviewContinueStore,
} from '@/stores/codeReviewContinue';
import { useSettingsStore } from '@/stores/settings';

interface UseCodeReviewOptions {
  repoPath: string | undefined;
}

interface UseCodeReviewReturn {
  content: string;
  status: 'idle' | 'initializing' | 'streaming' | 'complete' | 'error';
  error: string | null;
  startReview: () => Promise<void>;
  stopReview: () => void;
  reset: () => void;
}

export function useCodeReview({ repoPath }: UseCodeReviewOptions): UseCodeReviewReturn {
  const codeReviewSettings = useSettingsStore((s) => s.codeReview);
  const review = useCodeReviewContinueStore((s) => s.review);
  const resetReview = useCodeReviewContinueStore((s) => s.resetReview);

  const startReview = useCallback(async () => {
    if (!repoPath) return;

    await startCodeReview(repoPath, {
      provider: codeReviewSettings.provider,
      model: codeReviewSettings.model,
      reasoningEffort: codeReviewSettings.reasoningEffort,
      language: codeReviewSettings.language ?? '中文',
      prompt: codeReviewSettings.prompt,
    });
  }, [
    repoPath,
    codeReviewSettings.provider,
    codeReviewSettings.model,
    codeReviewSettings.reasoningEffort,
    codeReviewSettings.language,
    codeReviewSettings.prompt,
  ]);

  return {
    content: review.content,
    status: review.status,
    error: review.error,
    startReview,
    stopReview: stopCodeReview,
    reset: resetReview,
  };
}
