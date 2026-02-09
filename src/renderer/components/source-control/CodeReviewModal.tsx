import {
  AlertCircle,
  CheckCircle,
  Copy,
  Expand,
  Loader2,
  MessageSquare,
  Minimize2,
  RefreshCw,
  Send,
  Shrink,
  Square,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { MermaidRenderer } from '@/components/ui/mermaid-renderer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toastManager } from '@/components/ui/toast';
import { useCodeReview } from '@/hooks/useCodeReview';
import { useI18n } from '@/i18n';
import { stopCodeReview, useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';

const markdownComponents: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match?.[1];
    const codeString = String(children).replace(/\n$/, '');

    if (language === 'mermaid') {
      return <MermaidRenderer code={codeString} />;
    }

    if (language) {
      return <CodeBlock code={codeString} language={language} />;
    }

    if (codeString.includes('\n')) {
      return <CodeBlock code={codeString} />;
    }

    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
        {children}
      </code>
    );
  },
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-border bg-muted/50 px-3 py-2 text-left font-medium" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-border px-3 py-2" {...props}>
      {children}
    </td>
  ),
  p: ({ children, ...props }) => (
    <p className="my-3 leading-relaxed" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-3 list-disc pl-6 space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-3 list-decimal pl-6 space-y-1" {...props}>
      {children}
    </ol>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="mt-6 mb-4 text-xl font-bold" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mt-5 mb-3 text-lg font-semibold" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mt-4 mb-2 text-base font-semibold" {...props}>
      {children}
    </h3>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-3 border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: (props) => <hr className="my-6 border-border" {...props} />,
};

interface CodeReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string | undefined;
  sessionId?: string | null; // Current active chat session
}

export function CodeReviewModal({ open, onOpenChange, repoPath, sessionId }: CodeReviewModalProps) {
  const { t } = useI18n();
  const { content, status, error, startReview, reset } = useCodeReview({ repoPath });
  const codeReviewSettings = useSettingsStore((s) => s.codeReview);
  const [isMaximized, setIsMaximized] = useState(true);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  const reviewRepoPath = useCodeReviewContinueStore((s) => s.review.repoPath);
  const reviewSessionId = useCodeReviewContinueStore((s) => s.review.sessionId); // For continue conversation
  const minimize = useCodeReviewContinueStore((s) => s.minimize);
  const isMinimized = useCodeReviewContinueStore((s) => s.isMinimized);
  const requestContinue = useCodeReviewContinueStore((s) => s.requestContinue);
  const requestChatTabSwitch = useCodeReviewContinueStore((s) => s.requestChatTabSwitch);
  const write = useTerminalWriteStore((s) => s.write);
  const focus = useTerminalWriteStore((s) => s.focus);
  const hasWriter = useTerminalWriteStore((s) => (sessionId ? s.writers.has(sessionId) : false));

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    if (open && isMinimized) {
      useCodeReviewContinueStore.getState().restore();
    }
  }, [open, isMinimized]);

  useEffect(() => {
    if (open && status === 'idle' && !isMinimized) {
      startReview();
    }
  }, [open, status, isMinimized, startReview]);

  useEffect(() => {
    if (!open && !isMinimized) {
      reset();
    }
  }, [open, isMinimized, reset]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: content changes trigger scroll
  useEffect(() => {
    if (autoScrollRef.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-slot="scroll-area-viewport"]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [content]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollContainer = target.querySelector('[data-slot="scroll-area-viewport"]');
    if (scrollContainer) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      toastManager.add({
        title: t('Copied'),
        description: t('Review content copied to clipboard'),
        type: 'success',
        timeout: 2000,
      });
    } catch {
      toastManager.add({
        title: t('Copy failed'),
        description: t('Failed to copy content'),
        type: 'error',
        timeout: 3000,
      });
    }
  }, [content, t]);

  const isCurrentRepo = reviewRepoPath === repoPath || reviewRepoPath === null;

  const handleMinimize = useCallback(() => {
    minimize();
    onOpenChange(false);
  }, [minimize, onOpenChange]);

  const handleRestart = useCallback(() => {
    const isReviewInProgress = status === 'streaming' || status === 'initializing';
    if (isReviewInProgress) {
      setShowRestartConfirm(true);
      return;
    }
    stopCodeReview();
    reset();
    // Use queueMicrotask to ensure reset() state updates are flushed
    // before startReview() checks the status (which must be 'idle')
    queueMicrotask(() => startReview());
  }, [reset, startReview, status]);

  const handleConfirmRestart = useCallback(() => {
    setShowRestartConfirm(false);
    stopCodeReview();
    reset();
    // Use queueMicrotask to ensure reset() state updates are flushed
    // before startReview() checks the status (which must be 'idle')
    queueMicrotask(() => startReview());
  }, [reset, startReview]);

  const handleStop = useCallback(() => {
    stopCodeReview();
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      // When clicking backdrop to close, minimize instead if review is in progress
      if (!newOpen && status !== 'idle' && status !== 'error' && isCurrentRepo) {
        handleMinimize();
      } else {
        onOpenChange(newOpen);
      }
    },
    [status, isCurrentRepo, handleMinimize, onOpenChange]
  );

  const handleContinueConversation = useCallback(() => {
    if (reviewSessionId) {
      requestContinue(reviewSessionId, codeReviewSettings.provider ?? undefined);
      onOpenChange(false);
    }
  }, [reviewSessionId, codeReviewSettings.provider, requestContinue, onOpenChange]);

  const handleSendToCurrentSession = useCallback(() => {
    if (!sessionId || !hasWriter || !content) return;
    write(sessionId, `${content}\r`);
    focus(sessionId);
    requestChatTabSwitch();
    handleMinimize();
  }, [sessionId, hasWriter, content, write, focus, requestChatTabSwitch, handleMinimize]);

  const StatusIcon = () => {
    switch (status) {
      case 'initializing':
      case 'streaming':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const statusText = () => {
    switch (status) {
      case 'initializing':
        return t('Initializing...');
      case 'streaming':
        return t('Reviewing code...');
      case 'complete':
        return t('Review complete');
      case 'error':
        return t('Review failed');
      default:
        return '';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal>
        <DialogPopup
          className={
            isMaximized
              ? 'max-w-[98vw] w-[98vw] h-[95vh] flex flex-col'
              : 'max-w-4xl max-h-[85vh] flex flex-col'
          }
        >
          {/* Maximize button in top right corner */}
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="absolute end-12 top-2.5 z-50 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            title={isMaximized ? t('Restore') : t('Maximize')}
          >
            {isMaximized ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </button>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StatusIcon />
              <span>
                {t('Code Review')}
                <span className="text-muted-foreground font-normal">
                  ({codeReviewSettings.provider}/{codeReviewSettings.model})
                </span>
              </span>
            </DialogTitle>
            <DialogDescription>{statusText()}</DialogDescription>
          </DialogHeader>

          <div
            ref={scrollAreaRef}
            className="flex-1 min-h-0 overflow-hidden"
            onScroll={handleScroll}
          >
            <ScrollArea className="h-full">
              <div className="px-6 py-4">
                {error ? (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                ) : content ? (
                  <div className="text-sm text-foreground select-text">
                    <Markdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={markdownComponents}
                    >
                      {content}
                    </Markdown>
                  </div>
                ) : status === 'initializing' ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>{t('Starting code review...')}</span>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="border-t">
            {content && (
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-2" />
                {t('Copy')}
              </Button>
            )}
            {status !== 'idle' && status !== 'error' && isCurrentRepo && (
              <Button variant="outline" onClick={handleMinimize}>
                <Minimize2 className="h-4 w-4 mr-2" />
                {t('Minimize')}
              </Button>
            )}
            {(codeReviewSettings.provider === 'claude-code' ||
              codeReviewSettings.provider === 'cursor-cli') &&
              status === 'complete' &&
              content && (
                <Button variant="outline" onClick={handleContinueConversation}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t('Continue Conversation')}
                </Button>
              )}
            {content && sessionId && (
              <Button variant="outline" onClick={handleSendToCurrentSession} disabled={!hasWriter}>
                <Send className="h-4 w-4 mr-2" />
                {t('Send to Current Session')}
              </Button>
            )}
            {(status === 'streaming' || status === 'initializing') && (
              <Button variant="outline" onClick={handleStop}>
                <Square className="h-4 w-4 mr-2" />
                {t('Stop')}
              </Button>
            )}
            <Button onClick={handleRestart}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('Re-review')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={showRestartConfirm} onOpenChange={setShowRestartConfirm}>
        <AlertDialogPopup zIndexLevel="nested">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Confirm Restart')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Review in progress. Are you sure you want to restart?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button onClick={handleConfirmRestart}>{t('Restart')}</Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
