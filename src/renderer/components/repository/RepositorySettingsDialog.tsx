import { CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_REPOSITORY_SETTINGS,
  getRepositorySettings,
  type RepositorySettings,
  saveRepositorySettings,
} from '@/App/storage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';

interface RepositorySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  repoName: string;
}

export function RepositorySettingsDialog({
  open,
  onOpenChange,
  repoPath,
  repoName,
}: RepositorySettingsDialogProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<RepositorySettings>(DEFAULT_REPOSITORY_SETTINGS);

  useEffect(() => {
    if (open && repoPath) {
      setSettings(getRepositorySettings(repoPath));
    }
  }, [open, repoPath]);

  const handleSave = useCallback(() => {
    saveRepositorySettings(repoPath, settings);
    onOpenChange(false);
  }, [repoPath, settings, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Repository Settings')}</DialogTitle>
          <DialogDescription>{repoName}</DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-6">
          <div className="space-y-4">
            {/* Hide Repository */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm font-medium" htmlFor="hidden-switch">
                    {t('Hide Repository')}
                  </label>
                  <Tooltip>
                    <TooltipTrigger className="text-muted-foreground hover:text-foreground transition-colors">
                      <CircleHelp className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipPopup>
                      {t(
                        'Tip: Use the list button in the top-left corner to manage hidden repositories'
                      )}
                    </TooltipPopup>
                  </Tooltip>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('Hidden repositories will not appear in the sidebar')}
                </p>
              </div>
              <Switch
                id="hidden-switch"
                checked={settings.hidden}
                onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, hidden: checked }))}
              />
            </div>

            {/* Auto-initialize */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <label className="text-sm font-medium" htmlFor="auto-init-switch">
                  {t('Auto-initialize new worktrees')}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t('Automatically run init script when creating new worktrees')}
                </p>
              </div>
              <Switch
                id="auto-init-switch"
                checked={settings.autoInitWorktree}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, autoInitWorktree: checked }))
                }
              />
            </div>

            {settings.autoInitWorktree && (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="init-script">
                  {t('Init Script')}
                </label>
                <Textarea
                  id="init-script"
                  placeholder={t('e.g., pnpm install && pnpm dev')}
                  value={settings.initScript}
                  onChange={(e) => setSettings((prev) => ({ ...prev, initScript: e.target.value }))}
                  className="min-h-24 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Commands to run after creating a new worktree. Multiple commands can be separated by && or newlines.'
                  )}
                </p>
              </div>
            )}
          </div>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button onClick={handleSave}>{t('Save')}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
