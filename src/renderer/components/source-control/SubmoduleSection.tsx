import type { FileChange, GitSubmodule } from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FolderGit2,
  GitBranch,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
import { toastManager } from '@/components/ui/toast';
import {
  useCommitSubmodule,
  useDiscardSubmodule,
  useFetchSubmodule,
  usePullSubmodule,
  usePushSubmodule,
  useStageSubmodule,
  useSubmoduleChanges,
  useUnstageSubmodule,
} from '@/hooks/useSubmodules';
import { useI18n } from '@/i18n';
import { heightVariants, springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { ChangesList } from './ChangesList';
import { CommitBox } from './CommitBox';

interface SubmoduleSectionProps {
  submodule: GitSubmodule;
  rootPath: string;
  expanded: boolean;
  onToggle: () => void;
  selectedFile: { path: string; staged: boolean; submodulePath?: string } | null;
  onFileClick: (file: { path: string; staged: boolean; submodulePath: string }) => void;
}

export function SubmoduleSection({
  submodule,
  rootPath,
  expanded,
  onToggle,
  selectedFile,
  onFileClick,
}: SubmoduleSectionProps) {
  const { t, tNode } = useI18n();

  // Fetch submodule changes
  const { data: changes = [], isLoading, refetch } = useSubmoduleChanges(rootPath, submodule.path);

  // Mutations
  const fetchMutation = useFetchSubmodule();
  const pullMutation = usePullSubmodule();
  const pushMutation = usePushSubmodule();
  const commitMutation = useCommitSubmodule();
  const stageMutation = useStageSubmodule();
  const unstageMutation = useUnstageSubmodule();
  const discardMutation = useDiscardSubmodule();

  const isSyncing = fetchMutation.isPending || pullMutation.isPending || pushMutation.isPending;

  // Confirmation dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'discard' | 'delete';
    paths: string[];
  } | null>(null);

  // Separate staged and unstaged
  const staged = useMemo(() => changes.filter((c) => c.staged), [changes]);
  const unstaged = useMemo(() => changes.filter((c) => !c.staged), [changes]);

  // Handlers
  const handleFetch = async () => {
    try {
      await fetchMutation.mutateAsync({ workdir: rootPath, submodulePath: submodule.path });
      refetch();
    } catch (error) {
      toastManager.add({
        title: t('Fetch failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handlePull = async () => {
    try {
      await pullMutation.mutateAsync({ workdir: rootPath, submodulePath: submodule.path });
      refetch();
      toastManager.add({
        title: t('Pull successful'),
        type: 'success',
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        title: t('Pull failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handlePush = async () => {
    try {
      await pushMutation.mutateAsync({ workdir: rootPath, submodulePath: submodule.path });
      toastManager.add({
        title: t('Pushed'),
        type: 'success',
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        title: t('Push failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleStage = async (paths: string[]) => {
    try {
      await stageMutation.mutateAsync({
        workdir: rootPath,
        submodulePath: submodule.path,
        paths,
      });
      refetch();
    } catch (error) {
      toastManager.add({
        title: t('Stage failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleUnstage = async (paths: string[]) => {
    try {
      await unstageMutation.mutateAsync({
        workdir: rootPath,
        submodulePath: submodule.path,
        paths,
      });
      refetch();
    } catch (error) {
      toastManager.add({
        title: t('Unstage failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleDiscard = (paths: string[]) => {
    setConfirmAction({ type: 'discard', paths });
    setDialogOpen(true);
  };

  const handleDeleteUntracked = (paths: string[]) => {
    setConfirmAction({ type: 'delete', paths });
    setDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    try {
      await discardMutation.mutateAsync({
        workdir: rootPath,
        submodulePath: submodule.path,
        paths: confirmAction.paths,
      });
      refetch();
      setDialogOpen(false);
      setConfirmAction(null);
    } catch (error) {
      toastManager.add({
        title: t('Discard failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleCommit = async (message: string) => {
    try {
      await commitMutation.mutateAsync({
        workdir: rootPath,
        submodulePath: submodule.path,
        message,
      });
      refetch();
      toastManager.add({
        title: t('Commit successful'),
        type: 'success',
        timeout: 3000,
      });
    } catch (error) {
      toastManager.add({
        title: t('Commit failed'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    }
  };

  const handleFileClick = (file: { path: string; staged: boolean }) => {
    onFileClick({ ...file, submodulePath: submodule.path });
  };

  // Check if this submodule's file is selected
  const getSelectedFile = () => {
    if (selectedFile?.submodulePath === submodule.path) {
      return { path: selectedFile.path, staged: selectedFile.staged };
    }
    return null;
  };

  return (
    <div
      className={cn(
        'flex flex-col border-t transition-all duration-200 ease-out',
        expanded ? 'flex-1 min-h-0' : 'shrink-0'
      )}
    >
      {/* Header */}
      <div className="group flex items-center shrink-0 rounded-sm hover:bg-accent/50 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 px-4 py-2 text-left focus:outline-none"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200',
              !expanded && '-rotate-90'
            )}
          />
          <FolderGit2 className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium truncate">{submodule.name}</span>

          {/* Branch info */}
          {submodule.branch && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              {submodule.branch}
            </span>
          )}

          {/* Changes count */}
          {changes.length > 0 && (
            <span className="text-xs text-muted-foreground">({changes.length})</span>
          )}
        </button>

        {/* Sync buttons */}
        <div className="flex items-center gap-1 mr-2">
          {/* Ahead/Behind indicators with sync */}
          {(submodule.ahead > 0 || submodule.behind > 0) && (
            <div className="flex items-center gap-1 text-xs">
              {submodule.behind > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePull();
                  }}
                  disabled={isSyncing}
                  className="flex items-center gap-0.5 text-orange-500 hover:bg-accent rounded px-1 py-0.5 transition-colors disabled:opacity-50"
                  title={t('Pull')}
                >
                  {pullMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {submodule.behind}
                </button>
              )}
              {submodule.ahead > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePush();
                  }}
                  disabled={isSyncing}
                  className="flex items-center gap-0.5 text-blue-500 hover:bg-accent rounded px-1 py-0.5 transition-colors disabled:opacity-50"
                  title={t('Push')}
                >
                  {pushMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3 w-3" />
                  )}
                  {submodule.ahead}
                </button>
              )}
            </div>
          )}

          {/* Fetch button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleFetch();
            }}
            disabled={isSyncing}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
            title={t('Fetch')}
          >
            {fetchMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="submodule-content"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springFast}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {isLoading ? (
              <div className="flex h-20 items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <>
                {/* Changes List */}
                <div className="flex-1 overflow-hidden min-h-0">
                  <ChangesList
                    staged={staged}
                    unstaged={unstaged}
                    selectedFile={getSelectedFile()}
                    onFileClick={handleFileClick}
                    onStage={handleStage}
                    onUnstage={handleUnstage}
                    onDiscard={handleDiscard}
                    onDeleteUntracked={handleDeleteUntracked}
                    onRefresh={() => {
                      handleFetch();
                      refetch();
                    }}
                    isRefreshing={isLoading || fetchMutation.isPending}
                    repoPath={`${rootPath}/${submodule.path}`.replace(/\\/g, '/')}
                  />
                </div>

                {/* Commit Box */}
                <CommitBox
                  stagedCount={staged.length}
                  onCommit={handleCommit}
                  isCommitting={commitMutation.isPending}
                  rootPath={`${rootPath}/${submodule.path}`.replace(/\\/g, '/')}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discard/Delete Confirmation Dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'discard'
                ? confirmAction.paths.length > 1
                  ? t('Discard {{count}} changes', { count: confirmAction.paths.length })
                  : t('Discard changes')
                : (confirmAction?.paths.length ?? 0) > 1
                  ? t('Delete {{count}} files', { count: confirmAction?.paths.length ?? 0 })
                  : t('Delete file')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.paths.length === 1
                ? confirmAction.type === 'discard'
                  ? tNode(
                      'Are you sure you want to discard changes to {{path}}? This cannot be undone.',
                      {
                        path: (
                          <span className="font-medium text-foreground break-all">
                            {confirmAction.paths[0]}
                          </span>
                        ),
                      }
                    )
                  : tNode(
                      'Are you sure you want to delete the untracked file {{path}}? This cannot be undone.',
                      {
                        path: (
                          <span className="font-medium text-foreground break-all">
                            {confirmAction.paths[0]}
                          </span>
                        ),
                      }
                    )
                : confirmAction?.type === 'discard'
                  ? t(
                      'Are you sure you want to discard changes to {{count}} files? This cannot be undone.',
                      { count: confirmAction.paths.length }
                    )
                  : t(
                      'Are you sure you want to delete {{count}} untracked files? This cannot be undone.',
                      { count: confirmAction?.paths.length ?? 0 }
                    )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={handleConfirmAction}>
              {confirmAction?.type === 'discard' ? t('Discard') : t('Delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
