import { Eye, EyeOff, FolderGit2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Repository } from '@/App/constants';
import {
  DEFAULT_REPOSITORY_SETTINGS,
  getRepositorySettings,
  type RepositorySettings,
  saveRepositorySettings,
} from '@/App/storage';
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
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface RepositoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: Repository[];
  selectedRepo?: string | null;
  onSelectRepo?: (repoPath: string) => void;
  onRemoveRepository?: (repoPath: string) => void;
  onSettingsChange?: () => void;
}

export function RepositoryManagerDialog({
  open,
  onOpenChange,
  repositories,
  selectedRepo,
  onSelectRepo,
  onRemoveRepository,
  onSettingsChange,
}: RepositoryManagerDialogProps) {
  const { t, tNode } = useI18n();
  const [settingsMap, setSettingsMap] = useState<Record<string, RepositorySettings>>({});
  const [repoToRemove, setRepoToRemove] = useState<Repository | null>(null);

  // Load settings for all repositories
  useEffect(() => {
    if (open) {
      const map: Record<string, RepositorySettings> = {};
      for (const repo of repositories) {
        map[repo.path] = getRepositorySettings(repo.path);
      }
      setSettingsMap(map);
    }
  }, [open, repositories]);

  const toggleVisibility = useCallback(
    (repoPath: string) => {
      const current = settingsMap[repoPath] || DEFAULT_REPOSITORY_SETTINGS;
      const updated = { ...current, hidden: !current.hidden };
      saveRepositorySettings(repoPath, updated);
      setSettingsMap((prev) => ({ ...prev, [repoPath]: updated }));
      onSettingsChange?.();
      // If hiding the currently selected repo, switch to next visible one
      if (updated.hidden && selectedRepo === repoPath) {
        const nextVisible = repositories.find(
          (r) => r.path !== repoPath && !settingsMap[r.path]?.hidden
        );
        if (nextVisible) {
          onSelectRepo?.(nextVisible.path);
        }
      }
    },
    [settingsMap, onSettingsChange, selectedRepo, repositories, onSelectRepo]
  );

  const handleRepoClick = useCallback(
    (repoPath: string) => {
      onSelectRepo?.(repoPath);
      onOpenChange(false);
    },
    [onSelectRepo, onOpenChange]
  );

  const handleConfirmRemove = useCallback(() => {
    if (repoToRemove && onRemoveRepository) {
      onRemoveRepository(repoToRemove.path);
    }
    setRepoToRemove(null);
  }, [repoToRemove, onRemoveRepository]);

  const hiddenCount = Object.values(settingsMap).filter((s) => s.hidden).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Manage Repositories')}</DialogTitle>
            <DialogDescription>
              {t('{{total}} repositories, {{hidden}} hidden', {
                total: repositories.length,
                hidden: hiddenCount,
              })}
            </DialogDescription>
          </DialogHeader>

          <DialogPanel className="max-h-80 overflow-y-auto">
            <div className="space-y-1">
              {repositories.map((repo) => {
                const settings = settingsMap[repo.path];
                const isHidden = settings?.hidden ?? false;

                return (
                  <div
                    key={repo.path}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                      'hover:bg-accent/50',
                      isHidden && 'opacity-50'
                    )}
                  >
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-2 min-w-0 text-left"
                      onClick={() => handleRepoClick(repo.path)}
                    >
                      <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{repo.name}</span>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                        'hover:bg-accent text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => toggleVisibility(repo.path)}
                      title={isHidden ? t('Show Repository') : t('Hide Repository')}
                    >
                      {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    {onRemoveRepository && (
                      <button
                        type="button"
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                          'hover:bg-destructive/10 text-muted-foreground hover:text-destructive'
                        )}
                        onClick={() => setRepoToRemove(repo)}
                        title={t('Remove repository')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      {/* Remove repository confirmation dialog */}
      <AlertDialog
        open={!!repoToRemove}
        onOpenChange={(open) => {
          if (!open) setRepoToRemove(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Remove repository')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tNode('Are you sure you want to remove {{name}} from the workspace?', {
                name: <strong>{repoToRemove?.name}</strong>,
              })}
              <span className="block mt-2 text-muted-foreground">
                {t('This will only remove it from the app and will not delete local files.')}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={handleConfirmRemove}>
              {t('Remove')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
