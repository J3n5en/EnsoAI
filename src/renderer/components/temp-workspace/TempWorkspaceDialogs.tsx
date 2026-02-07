import { useEffect, useMemo, useState } from 'react';
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
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { useTempWorkspaceStore } from '@/stores/tempWorkspace';

interface TempWorkspaceDialogsProps {
  onConfirmDelete: (id: string) => Promise<void> | void;
  onConfirmRename: (id: string, title: string) => void;
}

export function TempWorkspaceDialogs({
  onConfirmDelete,
  onConfirmRename,
}: TempWorkspaceDialogsProps) {
  const { t } = useI18n();
  const items = useTempWorkspaceStore((s) => s.items);
  const renameTargetId = useTempWorkspaceStore((s) => s.renameTargetId);
  const deleteTargetId = useTempWorkspaceStore((s) => s.deleteTargetId);
  const openRename = useTempWorkspaceStore((s) => s.openRename);
  const openDelete = useTempWorkspaceStore((s) => s.openDelete);

  const renameTarget = useMemo(
    () => items.find((item) => item.id === renameTargetId) || null,
    [items, renameTargetId]
  );
  const deleteTarget = useMemo(
    () => items.find((item) => item.id === deleteTargetId) || null,
    [items, deleteTargetId]
  );

  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    if (renameTarget) {
      setRenameValue(renameTarget.title);
    }
  }, [renameTarget]);

  return (
    <>
      <Dialog open={!!renameTarget} onOpenChange={(open) => (!open ? openRename(null) : null)}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Rename temp session')}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={t('Enter a new title')}
              autoFocus
            />
          </div>
          <DialogFooter className="border-t">
            <Button variant="outline" onClick={() => openRename(null)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => {
                if (renameTarget) {
                  const title = renameValue.trim();
                  if (title) {
                    onConfirmRename(renameTarget.id, title);
                  }
                }
                openRename(null);
              }}
            >
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => (!open ? openDelete(null) : null)}>
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete temp session?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This will delete the temp session directory and its contents.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteTarget) {
                  await onConfirmDelete(deleteTarget.id);
                }
                openDelete(null);
              }}
            >
              {t('Delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
