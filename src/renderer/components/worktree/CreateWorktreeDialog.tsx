import type { GitBranch as GitBranchType, WorktreeCreateOptions } from '@shared/types';
import { GitBranch, Plus } from 'lucide-react';
import * as React from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/i18n';

interface CreateWorktreeDialogProps {
  branches: GitBranchType[];
  projectName: string;
  isLoading?: boolean;
  onSubmit: (options: WorktreeCreateOptions) => Promise<void>;
  trigger?: React.ReactElement;
}

export function CreateWorktreeDialog({
  branches,
  projectName,
  isLoading,
  onSubmit,
  trigger,
}: CreateWorktreeDialogProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [baseBranch, setBaseBranch] = React.useState<string>('');
  const [newBranchName, setNewBranchName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Fixed path: ~/ensoai/workspaces/{projectName}/{branchName}
  const home = window.electronAPI?.env?.HOME || '';
  const isWindows = window.electronAPI?.env?.platform === 'win32';
  const pathSep = isWindows ? '\\' : '/';
  const getWorktreePath = (branchName: string) => {
    if (!home) return '';
    // Extract last directory name from projectName when a full path is passed in.
    const normalizedName = projectName.replace(/\\/g, '/');
    const projectBaseName = normalizedName.split('/').filter(Boolean).pop() || projectName;
    return [home, 'ensoai', 'workspaces', projectBaseName, branchName].join(pathSep);
  };

  const localBranches = branches.filter((b) => !b.name.startsWith('remotes/'));
  const remoteBranches = branches.filter((b) => b.name.startsWith('remotes/'));

  // Use current branch as default base
  const currentBranch = branches.find((b) => b.current);

  React.useEffect(() => {
    if (open && !baseBranch && currentBranch) {
      setBaseBranch(currentBranch.name);
    }
  }, [open, baseBranch, currentBranch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newBranchName) {
      setError(t('Enter new branch name'));
      return;
    }

    if (!baseBranch) {
      setError(t('Select base branch'));
      return;
    }

    if (!home) {
      setError(t('Unable to determine your home directory'));
      return;
    }

    try {
      await onSubmit({
        path: getWorktreePath(newBranchName),
        branch: baseBranch,
        newBranch: newBranchName,
      });
      setOpen(false);
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('Failed to create');
      if (message.includes('already exists')) {
        setError(t('Worktree path already exists. Choose a different path or branch name.'));
      } else if (
        message.includes('is already used by worktree') ||
        message.includes('already checked out')
      ) {
        setError(t('Branch already exists. Choose a different name.'));
      } else {
        setError(message);
      }
    }
  };

  const resetForm = () => {
    setBaseBranch(currentBranch?.name || '');
    setNewBranchName('');
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t('New')}
            </Button>
          )
        }
      />
      <DialogPopup>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('New Worktree')}</DialogTitle>
            <DialogDescription>
              {t('Create a new branch and work in a separate directory to handle multiple tasks.')}
            </DialogDescription>
          </DialogHeader>

          <DialogPanel className="space-y-4">
            {/* New Branch Name */}
            <Field>
              <FieldLabel>{t('Branch name')}</FieldLabel>
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/my-feature"
                autoFocus
              />
              <FieldDescription>
                {t('This branch will be created and checked out in the new worktree.')}
              </FieldDescription>
            </Field>

            {/* Base Branch Selection */}
            <Field>
              <FieldLabel>{t('Base branch')}</FieldLabel>
              <Select value={baseBranch} onValueChange={(v) => setBaseBranch(v || '')}>
                <SelectTrigger>
                  <SelectValue>{baseBranch || t('Choose base branch...')}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {localBranches.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        {t('Local branches')}
                      </div>
                      {localBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          <GitBranch className="mr-2 h-4 w-4" />
                          {branch.name}
                          {branch.current && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t('Current')}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {remoteBranches.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        {t('Remote branches')}
                      </div>
                      {remoteBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          <GitBranch className="mr-2 h-4 w-4" />
                          {branch.name.replace('remotes/', '')}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectPopup>
              </Select>
            </Field>

            {/* Path Preview */}
            {newBranchName && home && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium">{t('Save location')}:</span>
                <code className="ml-1 break-all">{getWorktreePath(newBranchName)}</code>
              </div>
            )}

            {error && <div className="text-sm text-destructive">{error}</div>}
          </DialogPanel>

          <DialogFooter variant="bare">
            <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('Creating...') : t('Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
