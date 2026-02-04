import type {
  GitBranch as GitBranchType,
  GitWorktree,
  MergeStrategy,
  WorktreeMergeOptions,
  WorktreeMergeResult,
} from '@shared/types';
import { GitBranch, GitMerge } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { Z_INDEX } from '@/lib/z-index';

interface MergeWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: GitWorktree;
  branches: GitBranchType[];
  isLoading?: boolean;
  onMerge: (options: WorktreeMergeOptions) => Promise<WorktreeMergeResult>;
  onConflicts?: (result: WorktreeMergeResult, options: WorktreeMergeOptions) => void;
  onSuccess?: (options: { deletedWorktree: boolean }) => void;
}

export function MergeWorktreeDialog({
  open,
  onOpenChange,
  worktree,
  branches,
  isLoading,
  onMerge,
  onConflicts,
  onSuccess,
}: MergeWorktreeDialogProps) {
  const { t } = useI18n();
  const [targetBranch, setTargetBranch] = React.useState<string>('');
  const [strategy, setStrategy] = React.useState<MergeStrategy>('merge');
  const [autoStash, setAutoStash] = React.useState(true);
  const [deleteWorktree, setDeleteWorktree] = React.useState(false);
  const [deleteBranch, setDeleteBranch] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isMerging, setIsMerging] = React.useState(false);

  // Find main/master branch as default target
  const mainBranch = React.useMemo(() => {
    return branches.find((b) => b.name === 'main' || b.name === 'master' || b.name === 'develop');
  }, [branches]);

  // Filter out the worktree's own branch and remote branches
  const availableBranches = React.useMemo(() => {
    return branches.filter((b) => b.name !== worktree.branch && !b.name.startsWith('remotes/'));
  }, [branches, worktree.branch]);

  // Set default target branch when dialog opens
  React.useEffect(() => {
    if (open && !targetBranch && mainBranch) {
      setTargetBranch(mainBranch.name);
    }
  }, [open, targetBranch, mainBranch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetBranch) {
      setError(t('Please select a target branch'));
      return;
    }

    if (targetBranch === worktree.branch) {
      setError(t('Cannot merge a branch into itself'));
      return;
    }

    setIsMerging(true);

    try {
      const mergeOptions: WorktreeMergeOptions = {
        worktreePath: worktree.path,
        targetBranch,
        strategy,
        noFf: strategy === 'merge',
        autoStash,
        deleteWorktreeAfterMerge: deleteWorktree,
        deleteBranchAfterMerge: deleteBranch,
      };
      const result = await onMerge(mergeOptions);

      if (result.success && result.merged) {
        // Show warnings if any (combined into a single toast)
        if (result.warnings && result.warnings.length > 0) {
          addToast({
            type: 'warning',
            title: t('Merge completed with warnings'),
            description: result.warnings.join('\n'),
          });
        }
        onOpenChange(false);
        resetForm();
        onSuccess?.({ deletedWorktree: deleteWorktree });
      } else if (result.conflicts && result.conflicts.length > 0) {
        // Handle conflicts - pass options for cleanup after conflict resolution
        onOpenChange(false);
        onConflicts?.(result, mergeOptions);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('Merge failed');
      setError(message);
    } finally {
      setIsMerging(false);
    }
  };

  const resetForm = () => {
    setTargetBranch(mainBranch?.name || '');
    setStrategy('merge');
    setAutoStash(true);
    setDeleteWorktree(false);
    setDeleteBranch(false);
    setError(null);
  };

  const strategyOptions: { value: MergeStrategy; label: string; description: string }[] = [
    {
      value: 'merge',
      label: t('Merge'),
      description: t('Create a merge commit (--no-ff)'),
    },
    {
      value: 'squash',
      label: t('Squash'),
      description: t('Squash all commits into one'),
    },
    {
      value: 'rebase',
      label: t('Rebase'),
      description: t('Rebase commits onto target branch'),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              {t('Merge Worktree')}
            </DialogTitle>
            <DialogDescription>
              {t('Merge branch "{{branch}}" into another branch', {
                branch: worktree.branch || 'unknown',
              })}
            </DialogDescription>
          </DialogHeader>

          <DialogPanel className="space-y-4">
            {/* Target Branch Selection */}
            <Field>
              <FieldLabel>{t('Target branch')}</FieldLabel>
              <Select value={targetBranch} onValueChange={(v) => setTargetBranch(v || '')}>
                <SelectTrigger>
                  <SelectValue>{targetBranch || t('Choose target branch...')}</SelectValue>
                </SelectTrigger>
                <SelectPopup zIndex={Z_INDEX.DROPDOWN_IN_MODAL}>
                  {availableBranches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      <GitBranch className="mr-2 h-4 w-4" />
                      {branch.name}
                      {(branch.name === 'main' || branch.name === 'master') && (
                        <span className="ml-2 text-xs text-muted-foreground">{t('Default')}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <FieldDescription>{t('The branch to merge your changes into')}</FieldDescription>
            </Field>

            {/* Strategy Selection */}
            <Field>
              <FieldLabel>{t('Merge strategy')}</FieldLabel>
              <Select
                value={strategy}
                onValueChange={(v) => setStrategy((v as MergeStrategy) || 'merge')}
              >
                <SelectTrigger>
                  <SelectValue>
                    {strategyOptions.find((s) => s.value === strategy)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup zIndex={Z_INDEX.DROPDOWN_IN_MODAL}>
                  {strategyOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>

            {/* Auto Stash Option */}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoStash}
                onCheckedChange={(checked) => setAutoStash(checked === true)}
              />
              <div className="flex flex-col">
                <span>{t('Auto stash uncommitted changes')}</span>
                <span className="text-xs text-muted-foreground">
                  {t('Automatically stash and restore uncommitted changes')}
                </span>
              </div>
            </label>

            {/* Cleanup Options */}
            <div className="space-y-3">
              <span className="text-sm font-medium">{t('After merge')}</span>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={deleteWorktree}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    setDeleteWorktree(isChecked);
                    // Auto-enable deleteBranch when deleteWorktree is checked
                    if (isChecked) {
                      setDeleteBranch(true);
                    }
                  }}
                />
                {t('Delete worktree')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={deleteBranch}
                  onCheckedChange={(checked) => setDeleteBranch(checked === true)}
                  disabled={deleteWorktree}
                />
                {t('Delete branch')}
                {deleteWorktree && (
                  <span className="text-xs text-muted-foreground">
                    ({t('Included with worktree deletion')})
                  </span>
                )}
              </label>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
          </DialogPanel>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button
              variant="outline"
              type="submit"
              disabled={isLoading || isMerging || !targetBranch}
            >
              {isMerging ? t('Merging...') : t('Merge')}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
