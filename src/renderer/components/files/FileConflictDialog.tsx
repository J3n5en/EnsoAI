import { useCallback, useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';

export interface ConflictInfo {
  path: string;
  name: string;
  sourceSize: number;
  targetSize: number;
  sourceModified: number;
  targetModified: number;
}

export interface ConflictResolution {
  path: string;
  action: 'replace' | 'skip' | 'rename';
  newName?: string;
}

interface FileConflictDialogProps {
  open: boolean;
  conflicts: ConflictInfo[];
  onResolve: (resolutions: ConflictResolution[]) => void;
  onCancel: () => void;
}

export function FileConflictDialog({
  open,
  conflicts,
  onResolve,
  onCancel,
}: FileConflictDialogProps) {
  const { t } = useI18n();
  const [resolutions, setResolutions] = useState<Map<string, ConflictResolution>>(new Map());

  // Initialize resolutions when conflicts change
  useEffect(() => {
    if (open && conflicts.length > 0) {
      const initial = new Map<string, ConflictResolution>();
      for (const conflict of conflicts) {
        initial.set(conflict.path, {
          path: conflict.path,
          action: 'replace',
        });
      }
      setResolutions(initial);
    }
  }, [open, conflicts]);

  const handleActionChange = useCallback((path: string, action: 'replace' | 'skip' | 'rename') => {
    setResolutions((prev) => {
      const next = new Map(prev);
      const resolution = next.get(path);
      if (resolution) {
        resolution.action = action;
        // Clear newName if not renaming
        if (action !== 'rename') {
          delete resolution.newName;
        }
      }
      return next;
    });
  }, []);

  const handleRenameChange = useCallback((path: string, newName: string) => {
    setResolutions((prev) => {
      const next = new Map(prev);
      const resolution = next.get(path);
      if (resolution) {
        resolution.newName = newName;
      }
      return next;
    });
  }, []);

  const handleApplyAll = useCallback(
    (action: 'replace' | 'skip' | 'rename') => {
      setResolutions((prev) => {
        const next = new Map(prev);
        for (const [path, resolution] of next) {
          resolution.action = action;
          if (action === 'rename') {
            // Generate default new name with -1 suffix
            const conflict = conflicts.find((c) => c.path === path);
            if (conflict) {
              const lastDot = conflict.name.lastIndexOf('.');
              if (lastDot > 0) {
                const base = conflict.name.substring(0, lastDot);
                const ext = conflict.name.substring(lastDot);
                resolution.newName = `${base}-1${ext}`;
              } else {
                resolution.newName = `${conflict.name}-1`;
              }
            }
          } else {
            delete resolution.newName;
          }
        }
        return next;
      });
    },
    [conflicts]
  );

  const handleConfirm = useCallback(() => {
    const resolutionArray = Array.from(resolutions.values());
    onResolve(resolutionArray);
  }, [resolutions, onResolve]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  // Check if all rename actions have valid names
  const canConfirm = Array.from(resolutions.values()).every(
    (r) => r.action !== 'rename' || r.newName?.trim()
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('File Conflict')}</DialogTitle>
          <DialogDescription>
            {t('{{count}} file(s) already exist in the destination. Choose how to handle them.', {
              count: conflicts.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('Apply to all:')}</span>
            <Button size="sm" variant="outline" onClick={() => handleApplyAll('replace')}>
              {t('Replace All')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleApplyAll('skip')}>
              {t('Skip All')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleApplyAll('rename')}>
              {t('Rename All')}
            </Button>
          </div>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {conflicts.map((conflict) => {
                const resolution = resolutions.get(conflict.path);
                if (!resolution) return null;

                return (
                  <div key={conflict.path} className="rounded border p-3">
                    <div className="mb-2 font-medium text-sm">{conflict.name}</div>
                    <div className="mb-2 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                      <div>
                        <div className="font-medium">{t('Source')}</div>
                        <div>{formatSize(conflict.sourceSize)}</div>
                        <div>{formatDate(conflict.sourceModified)}</div>
                      </div>
                      <div>
                        <div className="font-medium">{t('Destination')}</div>
                        <div>{formatSize(conflict.targetSize)}</div>
                        <div>{formatDate(conflict.targetModified)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={resolution.action === 'replace' ? 'default' : 'outline'}
                        onClick={() => handleActionChange(conflict.path, 'replace')}
                      >
                        {t('Replace')}
                      </Button>
                      <Button
                        size="sm"
                        variant={resolution.action === 'skip' ? 'default' : 'outline'}
                        onClick={() => handleActionChange(conflict.path, 'skip')}
                      >
                        {t('Skip')}
                      </Button>
                      <Button
                        size="sm"
                        variant={resolution.action === 'rename' ? 'default' : 'outline'}
                        onClick={() => handleActionChange(conflict.path, 'rename')}
                      >
                        {t('Rename')}
                      </Button>
                    </div>
                    {resolution.action === 'rename' && (
                      <div className="mt-2">
                        <Input
                          value={resolution.newName || ''}
                          onChange={(e) => handleRenameChange(conflict.path, e.target.value)}
                          placeholder={t('Enter new name')}
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogPanel>
        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline" />}>{t('Cancel')}</DialogClose>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {t('Confirm')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
