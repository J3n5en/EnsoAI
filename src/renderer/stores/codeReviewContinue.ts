import { create } from 'zustand';

export type ReviewStatus = 'idle' | 'initializing' | 'streaming' | 'complete' | 'error';

interface CodeReviewState {
  content: string;
  status: ReviewStatus;
  error: string | null;
  repoPath: string | null;
  reviewId: string | null;
}

interface CodeReviewContinueState {
  isMinimized: boolean;
  review: CodeReviewState;

  minimize: () => void;
  restore: () => void;

  updateReview: (partial: Partial<CodeReviewState>) => void;
  appendContent: (text: string) => void;
  resetReview: () => void;
  setReviewId: (reviewId: string | null) => void;
}

const initialReviewState: CodeReviewState = {
  content: '',
  status: 'idle',
  error: null,
  repoPath: null,
  reviewId: null,
};

export const useCodeReviewContinueStore = create<CodeReviewContinueState>((set) => ({
  isMinimized: false,
  review: { ...initialReviewState },

  minimize: () => set({ isMinimized: true }),
  restore: () => set({ isMinimized: false }),

  updateReview: (partial) =>
    set((state) => ({
      review: { ...state.review, ...partial },
    })),

  appendContent: (text) =>
    set((state) => ({
      review: { ...state.review, content: state.review.content + text },
    })),

  resetReview: () =>
    set({
      review: { ...initialReviewState },
      isMinimized: false,
    }),

  setReviewId: (reviewId) =>
    set((state) => ({
      review: { ...state.review, reviewId },
    })),
}));

let cleanupFn: (() => void) | null = null;

export async function startCodeReview(
  repoPath: string,
  settings: {
    provider: string;
    model: string;
    reasoningEffort?: string;
    language: string;
  }
): Promise<void> {
  const store = useCodeReviewContinueStore.getState();

  store.updateReview({
    content: '',
    status: 'initializing',
    error: null,
    repoPath,
  });

  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }

  const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  store.setReviewId(reviewId);

  const onDataCleanup = window.electronAPI.git.onCodeReviewData((event) => {
    if (event.reviewId !== reviewId) return;

    const currentReviewId = useCodeReviewContinueStore.getState().review.reviewId;
    if (currentReviewId !== reviewId) return;

    if (event.type === 'data' && event.data) {
      store.updateReview({ status: 'streaming' });
      store.appendContent(event.data);
    } else if (event.type === 'error' && event.data) {
      store.updateReview({
        status: 'error',
        error: event.data,
      });
      store.setReviewId(null);
    } else if (event.type === 'exit') {
      const currentStatus = useCodeReviewContinueStore.getState().review.status;
      if (event.exitCode !== 0 && currentStatus !== 'complete') {
        store.updateReview({
          status: 'error',
          error: `Process exited with code ${event.exitCode}`,
        });
      } else if (currentStatus !== 'error') {
        store.updateReview({ status: 'complete' });
      }
      store.setReviewId(null);
    }
  });
  cleanupFn = onDataCleanup;

  try {
    const result = await window.electronAPI.git.startCodeReview(repoPath, {
      provider: settings.provider,
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
      language: settings.language ?? '中文',
      reviewId,
    });

    if (!result.success) {
      store.updateReview({
        status: 'error',
        error: result.error || 'Failed to start review',
      });
      stopCodeReview();
    }
  } catch (err) {
    store.updateReview({
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to start review',
    });
    stopCodeReview();
  }
}

export function stopCodeReview(): void {
  const store = useCodeReviewContinueStore.getState();
  const reviewId = store.review.reviewId;

  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }

  if (reviewId) {
    window.electronAPI.git.stopCodeReview(reviewId).catch(console.error);
    store.setReviewId(null);
  }

  store.updateReview({ status: 'idle' });
}
