import { GitCommit, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface CommitBoxProps {
  stagedCount: number;
  onCommit: (message: string) => void;
  isCommitting?: boolean;
}

export function CommitBox({ stagedCount, onCommit, isCommitting = false }: CommitBoxProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');

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

  const hasMessage = message.trim().length > 0;
  const canCommit = hasMessage && stagedCount > 0 && !isCommitting;

  return (
    <div className="flex shrink-0 flex-col border-t bg-background">
      {/* Message Input */}
      <textarea
        className={cn(
          'w-full resize-none border-0 bg-transparent px-3 py-2 text-sm',
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

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        {/* Staged count */}
        <span className="text-xs text-muted-foreground">
          {stagedCount > 0
            ? t('{count} staged changes', { count: stagedCount })
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
