import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export type ResetMode = 'soft' | 'mixed' | 'hard';

interface ResetModeOption {
  value: ResetMode;
  labelKey: string;
  descriptionKey: string;
  color: string;
  hoverBorder: string;
}

const RESET_MODES: ResetModeOption[] = [
  {
    value: 'soft',
    labelKey: 'Soft Reset',
    descriptionKey: 'Keep all changes staged',
    color: 'text-blue-500',
    hoverBorder: 'hover:border-blue-500/50',
  },
  {
    value: 'mixed',
    labelKey: 'Mixed Reset',
    descriptionKey: 'Unstage all changes',
    color: 'text-orange-500',
    hoverBorder: 'hover:border-orange-500/50',
  },
  {
    value: 'hard',
    labelKey: 'Hard Reset',
    descriptionKey: 'Discard all changes',
    color: 'text-red-500',
    hoverBorder: 'hover:border-red-500/50',
  },
];

interface ResetModeDialogProps {
  open: boolean;
  commitHash: string;
  commitMessage: string;
  onConfirm: (mode: ResetMode) => void;
  onCancel: () => void;
}

export function ResetModeDialog({
  open,
  commitHash,
  commitMessage,
  onConfirm,
  onCancel,
}: ResetModeDialogProps) {
  const { t } = useI18n();
  const shortHash = commitHash.slice(0, 8);

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <AlertDialogPopup className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Reset to commit')}</AlertDialogTitle>
          <AlertDialogDescription>
            <code className="text-xs">{shortHash}</code>
            <span className="mx-1 text-muted-foreground">·</span>
            <span className="line-clamp-1 text-xs">{commitMessage}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1 px-6 pb-2">
          {RESET_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={cn(
                'flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-accent/50',
                mode.hoverBorder
              )}
              onClick={() => onConfirm(mode.value)}
            >
              <span className={cn('h-2 w-2 rounded-full', mode.color.replace('text-', 'bg-'))} />
              <div className="min-w-0 flex-1">
                <div className={cn('text-sm font-medium', mode.color)}>{t(mode.labelKey)}</div>
                <div className="text-xs text-muted-foreground">{t(mode.descriptionKey)}</div>
              </div>
            </button>
          ))}
        </div>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t('Cancel')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
