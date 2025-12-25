import { GitBranch, RefreshCw } from 'lucide-react';
import * as React from 'react';
import {
  BranchSelector,
  CommitForm,
  CommitHistory,
  FileChanges,
  SyncStatus,
} from '@/components/git';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  useGitBranches,
  useGitCheckout,
  useGitCommit,
  useGitCreateBranch,
  useGitLog,
  useGitPull,
  useGitPush,
  useGitStatus,
} from '@/hooks/useGit';
import { useI18n } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWorktreeStore } from '@/stores/worktree';

export function GitView() {
  const { t } = useI18n();
  const { currentWorkspace } = useWorkspaceStore();
  const { currentWorktree } = useWorktreeStore();

  // Use worktree path if available, otherwise workspace path
  const workdir = currentWorktree?.path || currentWorkspace?.path || null;

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useGitStatus(workdir, true);
  const {
    data: branches = [],
    isLoading: branchesLoading,
    refetch: refetchBranches,
  } = useGitBranches(workdir);
  const { data: commits = [] } = useGitLog(workdir, 10);

  const commitMutation = useGitCommit();
  const pushMutation = useGitPush();
  const pullMutation = useGitPull();
  const checkoutMutation = useGitCheckout();
  const createBranchMutation = useGitCreateBranch();

  const [commitMessage, setCommitMessage] = React.useState('');

  const handleRefresh = () => {
    refetchStatus();
    refetchBranches();
  };

  const handleCommit = async () => {
    if (!workdir || !commitMessage.trim()) return;

    await commitMutation.mutateAsync({
      workdir,
      message: commitMessage,
    });

    setCommitMessage('');
  };

  const handleCheckout = async (branch: string) => {
    if (!workdir) return;
    await checkoutMutation.mutateAsync({ workdir, branch });
  };

  const handleCreateBranch = async (name: string) => {
    if (!workdir) return;
    await createBranchMutation.mutateAsync({ workdir, name });
  };

  const handlePush = async () => {
    if (!workdir) return;
    await pushMutation.mutateAsync({ workdir });
  };

  const handlePull = async () => {
    if (!workdir) return;
    await pullMutation.mutateAsync({ workdir });
  };

  const handleStageFile = async (_path: string) => {
    // TODO: Implement file staging
  };

  const handleUnstageFile = async (_path: string) => {
    // TODO: Implement file unstaging
  };

  const handleStageAll = async () => {
    // TODO: Implement stage all
  };

  const handleUnstageAll = async () => {
    // TODO: Implement unstage all
  };

  const handleViewFile = (_path: string) => {
    // TODO: Open file in editor/diff view
  };

  if (!currentWorkspace) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>{t('Please select a workspace first.')}</p>
      </div>
    );
  }

  const isLoading = statusLoading || branchesLoading;
  const stagedFiles = status?.staged || [];
  const unstagedFiles = [...(status?.modified || []), ...(status?.deleted || [])];
  const untrackedFiles = status?.untracked || [];
  const hasStagedChanges = stagedFiles.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('Version Control')}</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Branch & Sync */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <BranchSelector
            branches={branches}
            currentBranch={status?.current || null}
            onCheckout={handleCheckout}
            onCreateBranch={handleCreateBranch}
            onRefresh={() => refetchBranches()}
            isLoading={branchesLoading}
          />
        </div>

        <SyncStatus
          ahead={status?.ahead || 0}
          behind={status?.behind || 0}
          tracking={status?.tracking || null}
          onPush={handlePush}
          onPull={handlePull}
          isPushing={pushMutation.isPending}
          isPulling={pullMutation.isPending}
        />
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {/* Staged Changes */}
        <FileChanges
          title={t('Staged changes')}
          files={stagedFiles}
          type="staged"
          onUnstageAll={handleUnstageAll}
          onUnstageFile={handleUnstageFile}
          onFileClick={handleViewFile}
        />

        {/* Unstaged Changes */}
        <FileChanges
          title={t('Unstaged changes')}
          files={unstagedFiles}
          type="unstaged"
          onStageAll={handleStageAll}
          onStageFile={handleStageFile}
          onFileClick={handleViewFile}
        />

        {/* Untracked Files */}
        <FileChanges
          title={t('Untracked files')}
          files={untrackedFiles}
          type="untracked"
          onStageAll={handleStageAll}
          onStageFile={handleStageFile}
          onFileClick={handleViewFile}
        />

        <Separator />

        {/* Commit Form */}
        <CommitForm
          message={commitMessage}
          onMessageChange={setCommitMessage}
          onCommit={handleCommit}
          isCommitting={commitMutation.isPending}
          hasStagedChanges={hasStagedChanges}
        />

        <Separator />

        {/* Commit History */}
        <CommitHistory commits={commits} />
      </div>
    </div>
  );
}
