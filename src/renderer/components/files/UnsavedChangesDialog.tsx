import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
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

export type UnsavedChangesChoice = 'save' | 'dontSave' | 'cancel';

export function UnsavedChangesDialog({
  open,
  fileName,
  onChoice,
}: {
  open: boolean;
  fileName: string;
  onChoice: (choice: UnsavedChangesChoice) => void;
}) {
  const { t } = useI18n();
  const title = useMemo(
    () => t('Do you want to save the changes you made to {{file}}?', { file: fileName }),
    [t, fileName]
  );

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onChoice('cancel')}>
      <AlertDialogPopup className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <span className="min-w-0 flex-1">{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("Your changes will be lost if you don't save them.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onChoice('save')}>
            {t('Save')}
          </Button>
          <Button variant="secondary" onClick={() => onChoice('dontSave')}>
            {t("Don't Save")}
          </Button>
          <Button variant="ghost" onClick={() => onChoice('cancel')}>
            {t('Cancel')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
