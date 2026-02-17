import type { GitWorktree } from '@shared/types';
import { useEffect } from 'react';
import { useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
import type { TabId } from '../constants';

export function useCodeReviewContinue(
  activeWorktree: GitWorktree | null,
  handleTabChange: (tab: TabId) => void
) {
  const shouldSwitchToChatTab = useCodeReviewContinueStore(
    (s) => s.continueConversation.shouldSwitchToChatTab
  );
  const clearChatTabSwitch = useCodeReviewContinueStore((s) => s.clearChatTabSwitch);

  useEffect(() => {
    if (shouldSwitchToChatTab && activeWorktree) {
      handleTabChange('chat');
      clearChatTabSwitch();
    }
  }, [shouldSwitchToChatTab, activeWorktree, clearChatTabSwitch, handleTabChange]);
}
