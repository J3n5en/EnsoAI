import type { RemoteAuthPrompt } from '@shared/types';
import { KeyRound, ShieldAlert } from 'lucide-react';
import * as React from 'react';
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

function getPromptIcon(prompt: RemoteAuthPrompt) {
  if (prompt.kind === 'host-verification') {
    return <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />;
  }
  return <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />;
}

export function RemoteAuthPromptHost() {
  const { t } = useI18n();
  const [currentPrompt, setCurrentPrompt] = React.useState<RemoteAuthPrompt | null>(null);
  const [secret, setSecret] = React.useState('');
  const queueRef = React.useRef<RemoteAuthPrompt[]>([]);

  React.useEffect(() => {
    return window.electronAPI.remote.onAuthPrompt((prompt) => {
      setSecret('');
      setCurrentPrompt((existing) => {
        if (!existing) {
          return prompt;
        }
        queueRef.current.push(prompt);
        return existing;
      });
    });
  }, []);

  const shiftQueue = React.useCallback(() => {
    const nextPrompt = queueRef.current.shift() ?? null;
    setSecret('');
    setCurrentPrompt(nextPrompt);
  }, []);

  const respond = React.useCallback(
    async (accepted: boolean) => {
      if (!currentPrompt) {
        return;
      }

      try {
        await window.electronAPI.remote.respondAuthPrompt({
          promptId: currentPrompt.id,
          accepted,
          secret: accepted && currentPrompt.kind !== 'host-verification' ? secret : undefined,
        });
      } finally {
        shiftQueue();
      }
    },
    [currentPrompt, secret, shiftQueue]
  );

  const isSecretPrompt = currentPrompt?.kind !== 'host-verification';

  return (
    <Dialog
      open={!!currentPrompt}
      onOpenChange={(open) => {
        if (!open && currentPrompt) {
          void respond(false);
        }
      }}
    >
      <DialogPopup className="sm:max-w-lg" showCloseButton={false} zIndexLevel="nested">
        {currentPrompt && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-start gap-3">
                {getPromptIcon(currentPrompt)}
                <span className="min-w-0 flex-1">{currentPrompt.title}</span>
              </DialogTitle>
              <DialogDescription>{currentPrompt.message}</DialogDescription>
            </DialogHeader>

            <DialogPanel className="space-y-4">
              <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                <div className="font-medium">{currentPrompt.profileName}</div>
                <div className="text-muted-foreground">{currentPrompt.sshTarget}</div>
              </div>

              {currentPrompt.promptText && (
                <div className="rounded-xl border bg-background p-3 text-sm text-muted-foreground">
                  {currentPrompt.promptText}
                </div>
              )}

              {currentPrompt.kind === 'host-verification' && currentPrompt.fingerprints?.length ? (
                <div className="space-y-2 rounded-xl border bg-background p-3">
                  <div className="font-medium text-sm">
                    {currentPrompt.host}:{currentPrompt.port}
                  </div>
                  <div className="space-y-2 text-sm">
                    {currentPrompt.fingerprints.map((fingerprint) => (
                      <div
                        key={`${fingerprint.keyType}:${fingerprint.fingerprint}`}
                        className="rounded-lg border bg-muted/30 p-2"
                      >
                        <div className="font-medium">{fingerprint.keyType}</div>
                        <div className="break-all text-muted-foreground">
                          {fingerprint.fingerprint}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {isSecretPrompt ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!secret) return;
                    void respond(true);
                  }}
                >
                  <label className="space-y-2">
                    <div className="font-medium text-sm">
                      {currentPrompt.secretLabel || t('Password')}
                    </div>
                    <Input
                      autoFocus
                      type="password"
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                    />
                  </label>
                </form>
              ) : null}
            </DialogPanel>

            <DialogFooter variant="bare">
              <Button variant="outline" onClick={() => void respond(false)}>
                {currentPrompt.cancelLabel || t('Cancel')}
              </Button>
              <Button
                onClick={() => void respond(true)}
                disabled={isSecretPrompt ? !secret : false}
              >
                {currentPrompt.confirmLabel || t('Continue')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
