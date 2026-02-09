import { GitCommit, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';


interface CommitBoxProps {
  stagedCount: number;
  onCommit: (message: string) => void;
  isCommitting?: boolean;
  rootPath?: string | null;
}

export function CommitBox({
  stagedCount,
  onCommit,
  isCommitting = false,
  rootPath,
}: CommitBoxProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { commitMessageGenerator } = useSettingsStore();
  const bgImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);

  const handleCommit = () => {
    const finalMessage = message.trim();
    if (finalMessage && stagedCount > 0) {
      onCommit(finalMessage);
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  const handleGenerateMessage = async () => {
    if (!rootPath || isGenerating) return;

    setIsGenerating(true);
    try {
      const result = await window.electronAPI.git.generateCommitMessage(rootPath, {
        maxDiffLines: commitMessageGenerator.maxDiffLines,
        timeout: commitMessageGenerator.timeout,
        provider: commitMessageGenerator.provider,
        model: commitMessageGenerator.model,
        reasoningEffort: commitMessageGenerator.reasoningEffort,
        prompt: commitMessageGenerator.prompt,
      });

      if (result.success && result.message) {
        setMessage(result.message);
      } else {
        toastManager.add({
          title: t('Failed to generate commit message'),
          description: result.error === 'timeout' ? t('Generation timed out') : result.error,
          type: 'error',
          timeout: 5000,
        });
      }
    } catch (error) {
      toastManager.add({
        title: t('Failed to generate commit message'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const hasMessage = message.trim().length > 0;
  const canCommit = hasMessage && stagedCount > 0 && !isCommitting;
  const canGenerate = commitMessageGenerator.enabled && rootPath && !isGenerating && !isCommitting;

  return (
    <div className={cn("flex shrink-0 flex-col border-t", !bgImageEnabled && "bg-background")}>
      {/* Message Input with Generate Button */}
      <div className="relative">
        <textarea
          className={cn(
            'w-full resize-none border-0 bg-transparent px-3 py-2 pr-10 text-sm',
            'placeholder:text-muted-foreground focus:outline-none',
            'min-h-[80px] max-h-[200px]'
          )}
          placeholder={
            stagedCount > 0
              ? t('Enter commit message... (Cmd/Ctrl+Enter to commit)')
              : t('Stage changes before committing')
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={stagedCount === 0 || isCommitting}
        />
        {/* Generate Button - floating at bottom right of textarea */}
        {commitMessageGenerator.enabled && (
          <button
            type="button"
            className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
            onClick={handleGenerateMessage}
            disabled={!canGenerate}
            title={t('Generate commit message')}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        {/* Staged count */}
        <span className="text-xs text-muted-foreground">
          {stagedCount > 0
            ? t('{{count}} staged changes', { count: stagedCount })
            : t('No staged changes')}
        </span>

        {/* Commit button */}
        <Button
          size="sm"
          onClick={handleCommit}
          disabled={!canCommit}
          className="h-7 gap-1.5 text-xs"
        >
          {isCommitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('Committing...')}
            </>
          ) : (
            <>
              <GitCommit className="h-3.5 w-3.5" />
              {t('Commit')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
