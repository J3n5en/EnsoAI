import type { CodexRuntime, CodexSessionListItem } from '@shared/types';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { copyTextToClipboard } from '@/lib/clipboard';
import { normalizeCliSessionId } from '@/lib/cliSessionId';
import { canSubmitCodexManualSession } from '@/lib/codexSessionManualBinding';
import { cn } from '@/lib/utils';

const CODEX_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CodexSessionPickerDialogProps {
  open: boolean;
  cwd: string | undefined;
  runtime?: CodexRuntime;
  wslDistro?: string;
  initialSessionId?: string | undefined;
  onOpenChange: (open: boolean) => void;
  onSelectSession: (selection: CodexSessionSelection) => void;
}

export interface CodexSessionSelection {
  sessionId: string;
  wslDistro?: string;
}

function formatSessionTime(session: CodexSessionListItem): string {
  const date = new Date(session.modifiedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export function CodexSessionPickerDialog({
  open,
  cwd,
  runtime,
  wslDistro,
  initialSessionId,
  onOpenChange,
  onSelectSession,
}: CodexSessionPickerDialogProps) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<CodexSessionListItem[]>([]);
  const [manualSessionId, setManualSessionId] = useState(initialSessionId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queriedWslDistro, setQueriedWslDistro] = useState(wslDistro);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  const normalizedManualSessionId = normalizeCliSessionId(manualSessionId);
  const canUseManualSessionId = useMemo(
    () => CODEX_SESSION_ID_PATTERN.test(normalizedManualSessionId),
    [normalizedManualSessionId]
  );
  const canSubmitManualSessionId = canSubmitCodexManualSession({
    hasValidSessionId: canUseManualSessionId,
    runtime,
    loading,
    hasError: error !== null,
    wslDistro: queriedWslDistro,
  });

  useEffect(() => {
    if (open) {
      setManualSessionId(initialSessionId ?? '');
      setQueriedWslDistro(wslDistro);
    }
  }, [open, initialSessionId, wslDistro]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    // refreshKey 只用于让用户手动重新读取当前目录的 Codex 会话列表。
    void refreshKey;
    const query = {
      ...(cwd ? { cwd } : {}),
      ...(runtime ? { runtime } : {}),
      ...(wslDistro ? { wslDistro } : {}),
      maxSessions: 50,
    };
    window.electronAPI.codexHistory
      .listSessions(query)
      .then((result) => {
        if (cancelled) return;
        setSessions(result.sessions);
        setQueriedWslDistro(result.wslDistro ?? wslDistro);
      })
      .catch((err) => {
        if (!cancelled) {
          setSessions([]);
          setError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, cwd, runtime, wslDistro, refreshKey]);

  const handleSelectSession = (sessionId: string, selectedWslDistro?: string) => {
    onSelectSession({
      sessionId,
      ...(selectedWslDistro ? { wslDistro: selectedWslDistro } : {}),
    });
  };

  const handleManualSubmit = () => {
    if (!canSubmitManualSessionId) return;
    handleSelectSession(normalizedManualSessionId, queriedWslDistro);
  };

  const handleCopySessionId = async (sessionId: string) => {
    const copied = await copyTextToClipboard(sessionId);
    if (!copied) return;

    setCopiedSessionId(sessionId);
    window.setTimeout(() => {
      setCopiedSessionId((current) => (current === sessionId ? null : current));
    }, 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="fixed left-1/2 top-[clamp(144px,16vh,176px)] max-h-[calc(100vh-120px)] w-[calc(100vw-32px)] max-w-2xl -translate-x-1/2 translate-y-0">
        <DialogHeader>
          <DialogTitle>{t('Choose Codex session')}</DialogTitle>
          <DialogDescription>
            {t('Current directory')}: {cwd || t('Unknown')}
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{t('Codex sessions in this directory')}</div>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => setRefreshKey((current) => current + 1)}
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                {t('Refresh')}
              </Button>
            </div>

            <div className="max-h-[45vh] overflow-auto rounded-lg border">
              {loading && (
                <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                  {t('Loading...')}
                </div>
              )}
              {!loading && error && (
                <div className="px-3 py-6 text-center text-destructive text-sm">
                  {t('Failed to load Codex sessions')}
                </div>
              )}
              {!loading && !error && sessions.length === 0 && (
                <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                  {t('No Codex sessions found for this directory')}
                </div>
              )}
              {!loading &&
                !error &&
                sessions.map((session) => {
                  const copied = copiedSessionId === session.sessionId;
                  const sessionTime = formatSessionTime(session) || t('Unknown time');
                  const sessionTitle = session.title || session.sessionId;

                  return (
                    <div
                      key={session.sessionId}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-accent"
                    >
                      <button
                        type="button"
                        className="col-span-2 min-w-0 text-left"
                        onClick={() => handleSelectSession(session.sessionId, session.wslDistro)}
                      >
                        <span className="block truncate font-medium text-foreground text-sm">
                          {sessionTitle}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="mt-1 min-w-0 break-all text-left font-mono text-muted-foreground text-xs"
                        onClick={() => handleSelectSession(session.sessionId, session.wslDistro)}
                      >
                        {session.sessionId}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mt-0.5"
                        title={copied ? t('Copied session id') : t('Copy session id')}
                        aria-label={copied ? t('Copied session id') : t('Copy session id')}
                        onClick={() => handleCopySessionId(session.sessionId)}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>

                      <button
                        type="button"
                        className="col-span-2 mt-1 flex min-w-0 items-center justify-between gap-3 text-left text-muted-foreground text-xs"
                        title={`${session.cwd || session.filePath} · ${t('Last active')}: ${sessionTime}`}
                        onClick={() => handleSelectSession(session.sessionId, session.wslDistro)}
                      >
                        <span className="min-w-0 truncate">{session.cwd || session.filePath}</span>
                        <span className="shrink-0 tabular-nums">{sessionTime}</span>
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t('Manual session id')}</div>
            <Input
              value={manualSessionId}
              placeholder={t('Paste Codex session id')}
              spellCheck={false}
              onChange={(event) => setManualSessionId(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleManualSubmit();
                }
              }}
            />
          </div>
        </DialogPanel>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button disabled={!canSubmitManualSessionId} onClick={handleManualSubmit}>
            <Check className="h-4 w-4" />
            {t('Use session id')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
