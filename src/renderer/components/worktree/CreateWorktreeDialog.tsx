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
import type { GitBranch as GitBranchType, WorktreeCreateOptions } from '@shared/types';
import { GitBranch, Plus } from 'lucide-react';
import * as React from 'react';

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
  const [open, setOpen] = React.useState(false);
  const [baseBranch, setBaseBranch] = React.useState<string>('');
  const [newBranchName, setNewBranchName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // 固定路径: ~/ensoai/workspaces/{projectName}/{branchName}
  const home = window.electronAPI?.env?.HOME || '';
  const getWorktreePath = (branchName: string) => {
    if (!home) return '';
    return `${home}/ensoai/workspaces/${projectName}/${branchName}`;
  };

  const localBranches = branches.filter((b) => !b.name.startsWith('remotes/'));
  const remoteBranches = branches.filter((b) => b.name.startsWith('remotes/'));

  // 找到当前分支作为默认基准
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
      setError('请输入新分支名');
      return;
    }

    if (!baseBranch) {
      setError('请选择基于哪个分支创建');
      return;
    }

    if (!home) {
      setError('无法获取用户目录');
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
      const message = err instanceof Error ? err.message : '创建失败';
      if (message.includes('already exists')) {
        setError('目录已存在，请选择其他路径或分支名');
      } else if (
        message.includes('is already used by worktree') ||
        message.includes('already checked out')
      ) {
        setError('该分支已存在，请使用其他分支名');
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
              新建
            </Button>
          )
        }
      />
      <DialogPopup>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>新建 Worktree</DialogTitle>
            <DialogDescription>创建新分支并在独立目录中工作，可同时处理多个功能</DialogDescription>
          </DialogHeader>

          <DialogPanel className="space-y-4">
            {/* New Branch Name */}
            <Field>
              <FieldLabel>新分支名</FieldLabel>
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/my-feature"
                autoFocus
              />
              <FieldDescription>将创建此分支并在新 worktree 中检出</FieldDescription>
            </Field>

            {/* Base Branch Selection */}
            <Field>
              <FieldLabel>基于分支</FieldLabel>
              <Select value={baseBranch} onValueChange={(v) => setBaseBranch(v || '')}>
                <SelectTrigger>
                  <SelectValue>{baseBranch || '选择基准分支...'}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {localBranches.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        本地分支
                      </div>
                      {localBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          <GitBranch className="mr-2 h-4 w-4" />
                          {branch.name}
                          {branch.current && (
                            <span className="ml-2 text-xs text-muted-foreground">(当前)</span>
                          )}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {remoteBranches.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        远程分支
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
                <span className="font-medium">保存位置：</span>
                <code className="ml-1 break-all">{getWorktreePath(newBranchName)}</code>
              </div>
            )}

            {error && <div className="text-sm text-destructive">{error}</div>}
          </DialogPanel>

          <DialogFooter variant="bare">
            <DialogClose render={<Button variant="outline">取消</Button>} />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
