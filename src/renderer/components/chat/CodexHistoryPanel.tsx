import type { CodexHistoryMessage } from '@shared/types';
import { Check, Copy, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

const HISTORY_BATCH_SIZE = 500;
const isMac = typeof window !== 'undefined' && window.electronAPI?.env?.platform === 'darwin';

interface CodexHistoryPanelProps {
  sessionId: string | undefined;
  currentSessionId?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBindToCurrentSession?: () => void;
  onBackToSessionList?: () => void;
  onBackToCurrentSession?: () => void;
}

function roleLabel(role: CodexHistoryMessage['role']): string {
  if (role === 'user') return 'User';
  return 'Codex';
}

export function CodexHistoryPanel({
  sessionId,
  currentSessionId,
  open,
  onOpenChange,
  onBindToCurrentSession,
  onBackToSessionList,
  onBackToCurrentSession,
}: CodexHistoryPanelProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<CodexHistoryMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [limit, setLimit] = useState(HISTORY_BATCH_SIZE);
  const [copiedSessionId, setCopiedSessionId] = useState(false);

  useEffect(() => {
    if (!open) {
      setLimit(HISTORY_BATCH_SIZE);
      return;
    }
    if (!sessionId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    window.electronAPI.codexHistory
      .get({ sessionId, maxMessages: limit })
      .then((result) => {
        if (cancelled) return;
        setMessages(result.messages);
        setTruncated(result.truncated);
        setError(result.error ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sessionId, limit]);

  const handleCopySessionId = async () => {
    if (!sessionId) return;

    const copied = await copyTextToClipboard(sessionId);
    if (!copied) return;

    setCopiedSessionId(true);
    window.setTimeout(() => setCopiedSessionId(false), 1200);
  };

  if (!open) return null;

  const isViewingCurrentSession = !!currentSessionId && currentSessionId === sessionId;
  const canBindToCurrentSession =
    !!sessionId && !!onBindToCurrentSession && !isViewingCurrentSession;
  const canBackToCurrentSession =
    !!currentSessionId && !isViewingCurrentSession && !!onBackToCurrentSession;

  return (
    <div
      className={cn(
        'no-drag pointer-events-auto fixed right-0 bottom-0 z-30 flex w-[min(720px,calc(100vw-24px))] select-text flex-col border-l bg-background shadow-lg',
        isMac ? 'top-12' : 'top-20'
      )}
    >
      <div className="flex h-10 items-center gap-2 border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {sessionId && (
            <>
              <div className="min-w-0 truncate font-mono text-sm">
                <span className="font-sans text-muted-foreground">{t('ID')}:</span> {sessionId}
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 select-none"
                title={copiedSessionId ? t('Copied session id') : t('Copy session id')}
                aria-label={copiedSessionId ? t('Copied session id') : t('Copy session id')}
                onClick={handleCopySessionId}
              >
                {copiedSessionId ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canBindToCurrentSession && (
            <Button
              variant="ghost"
              size="xs"
              className="select-none"
              onClick={onBindToCurrentSession}
            >
              {t('Bind session')}
            </Button>
          )}
          {canBackToCurrentSession && (
            <Button
              variant="ghost"
              size="xs"
              className="select-none"
              onClick={onBackToCurrentSession}
            >
              {t('Current binding')}
            </Button>
          )}
          {onBackToSessionList && (
            <Button variant="ghost" size="xs" className="select-none" onClick={onBackToSessionList}>
              {t('Back to list')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 select-none"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {loading && <p className="text-sm text-muted-foreground">{t('Loading...')}</p>}
        {error && <p className="text-sm text-destructive">{t('Failed to load Codex history')}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('No Codex history found')}</p>
        )}
        <div className="space-y-3">
          {messages.map((message) => {
            const isUser = message.role === 'user';

            return (
              <div
                key={message.id}
                className={cn('flex', isUser ? 'justify-start' : 'justify-end')}
              >
                <article
                  className={cn(
                    'max-w-[92%] rounded-lg border px-3 py-2 shadow-xs',
                    isUser
                      ? 'border-blue-500/20 bg-blue-500/10 text-foreground'
                      : 'border-border bg-muted/60 text-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'mb-1 text-xs font-medium',
                      isUser
                        ? 'text-left text-blue-600 dark:text-blue-300'
                        : 'text-right text-muted-foreground'
                    )}
                  >
                    {roleLabel(message.role)}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
                    {message.text}
                  </pre>
                </article>
              </div>
            );
          })}
        </div>
        {truncated && (
          <div className="flex flex-col gap-2 py-3">
            <p className="text-xs text-muted-foreground">
              {t('History is truncated. Load more to continue.')}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setLimit((current) => current + HISTORY_BATCH_SIZE)}
            >
              {t('Load more history')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
