import type { AIProvider } from '@shared/types';
import { create } from 'zustand';

export type ReviewStatus = 'idle' | 'initializing' | 'streaming' | 'complete' | 'error';
type ContinueConversationProvider = Extract<AIProvider, 'claude-code' | 'cursor-cli'>;

function supportsContinueConversation(
  provider: AIProvider | null | undefined
): provider is ContinueConversationProvider {
  return provider === 'claude-code' || provider === 'cursor-cli';
}

interface CodeReviewState {
  content: string;
  status: ReviewStatus;
  error: string | null;
  repoPath: string | null;
  reviewId: string | null; // IPC flow control ID (timestamp format)
  sessionId: string | null; // Review session token for the providers that still expose "Continue Conversation"
}

interface ContinueConversationState {
  sessionId: string | null;
  /** AI provider used for the review; used to select agent when switching to chat */
  provider: ContinueConversationProvider | null;
  shouldSwitchToChatTab: boolean;
}

interface CodeReviewContinueState {
  isMinimized: boolean;
  review: CodeReviewState;

  // Continue conversation state
  continueConversation: ContinueConversationState;

  minimize: () => void;
  restore: () => void;

  updateReview: (partial: Partial<CodeReviewState>) => void;
  appendContent: (text: string) => void;
  resetReview: () => void;
  setReviewId: (reviewId: string | null) => void;
  setSessionId: (sessionId: string | null) => void;

  // Continue conversation actions
  requestContinue: (sessionId: string, provider?: AIProvider | null) => void;
  requestChatTabSwitch: () => void;
  clearContinueRequest: () => void;
  clearChatTabSwitch: () => void;
}

const initialReviewState: CodeReviewState = {
  content: '',
  status: 'idle',
  error: null,
  repoPath: null,
  reviewId: null,
  sessionId: null,
};

const initialContinueConversationState: ContinueConversationState = {
  sessionId: null,
  provider: null,
  shouldSwitchToChatTab: false,
};

export const useCodeReviewContinueStore = create<CodeReviewContinueState>((set) => ({
  isMinimized: false,
  review: { ...initialReviewState },
  continueConversation: { ...initialContinueConversationState },

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

  setSessionId: (sessionId) =>
    set((state) => ({
      review: { ...state.review, sessionId },
    })),

  requestContinue: (sessionId, provider = null) => {
    const continueProvider = supportsContinueConversation(provider) ? provider : null;
    set({
      continueConversation: {
        sessionId,
        provider: continueProvider,
        shouldSwitchToChatTab: true,
      },
    });
  },
  requestChatTabSwitch: () =>
    set((state) => ({
      continueConversation: {
        ...state.continueConversation,
        shouldSwitchToChatTab: true,
      },
    })),
  clearContinueRequest: () =>
    set((state) => ({
      continueConversation: {
        ...state.continueConversation,
        sessionId: null,
        provider: null,
      },
    })),
  clearChatTabSwitch: () =>
    set((state) => ({
      continueConversation: {
        ...state.continueConversation,
        shouldSwitchToChatTab: false,
      },
    })),
}));

let cleanupFn: (() => void) | null = null;

export async function startCodeReview(
  repoPath: string,
  settings: {
    provider: AIProvider;
    model: string;
    reasoningEffort?: string;
    bareEnabled?: boolean;
    effortEnabled?: boolean;
    effortLevel?: string;
    language: string;
    prompt?: string;
  }
): Promise<void> {
  const store = useCodeReviewContinueStore.getState();

  // Clear previous review state when starting new review
  store.setReviewId(null);
  store.setSessionId(null);

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

  // Generate reviewId for IPC flow control
  const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Only providers that still expose "Continue Conversation" need a stored session token.
  const sessionId = supportsContinueConversation(settings.provider) ? crypto.randomUUID() : null;

  // Store both IDs separately
  store.setReviewId(reviewId); // For IPC event filtering
  store.setSessionId(sessionId); // For "Continue Conversation" when available

  const onDataCleanup = window.electronAPI.git.onCodeReviewData((event) => {
    if (event.reviewId !== reviewId) return;

    if (useCodeReviewContinueStore.getState().review.reviewId !== reviewId) return;

    if (event.type === 'data' && event.data) {
      store.updateReview({ status: 'streaming' });
      store.appendContent(event.data);
    } else if (event.type === 'error' && event.data) {
      store.updateReview({
        status: 'error',
        error: event.data,
      });
      // Keep reviewId for potential retry or debugging
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
      // Keep reviewId until the next review/reset so stale IPC events can still be ignored.
    }
  });
  cleanupFn = onDataCleanup;

  try {
    const result = await window.electronAPI.git.startCodeReview(repoPath, {
      provider: settings.provider,
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
      bareEnabled: settings.bareEnabled,
      effortEnabled: settings.effortEnabled,
      effortLevel: settings.effortLevel,
      language: settings.language ?? '中文',
      reviewId,
      sessionId: sessionId ?? undefined, // Pass only when this review flow can continue in chat
      prompt: settings.prompt, // Pass custom prompt template
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
