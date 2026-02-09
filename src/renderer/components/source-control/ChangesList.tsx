import type { FileChange, FileChangeStatus } from '@shared/types';
import {
  CheckCircle,
  Eye,
  FileEdit,
  FilePlus,
  FileWarning,
  FileX,
  List,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  TreeDeciduous,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
import { useSettingsStore } from '@/stores/settings';
import { useSourceControlStore } from '@/stores/sourceControl';
import { ChangesTree } from './ChangesTree';
import { CodeReviewModal } from './CodeReviewModal';
import { useChangesActions } from './useChangesActions';

interface ChangesListProps {
  staged: FileChange[];
  unstaged: FileChange[];
  selectedFile: { path: string; staged: boolean } | null;
  onFileClick: (file: { path: string; staged: boolean }) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
  onDeleteUntracked?: (paths: string[]) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  repoPath?: string;
  sessionId?: string | null;
}

// M=Modified, A=Added, D=Deleted, R=Renamed, C=Copied, U=Untracked, X=Conflict
const statusIcons: Record<FileChangeStatus, React.ElementType> = {
  M: FileEdit,
  A: FilePlus,
  D: FileX,
  R: FileEdit,
  C: FilePlus,
  U: FilePlus, // Untracked - new file not yet staged
  X: FileWarning, // Conflict
};

const statusColors: Record<FileChangeStatus, string> = {
  M: 'text-orange-500',
  A: 'text-green-500',
  D: 'text-red-500',
  R: 'text-blue-500',
  C: 'text-blue-500',
  U: 'text-green-500', // Untracked shows as green (new file)
  X: 'text-purple-500', // Conflict
};

function FileItem({
  file,
  isSelected,
  onFileClick,
  onAction,
  actionIcon: ActionIcon,
  actionTitle,
  onDiscard,
}: {
  file: FileChange;
  isSelected: boolean;
  onFileClick: () => void;
  onAction: () => void;
  actionIcon: React.ElementType;
  actionTitle: string;
  onDiscard?: () => void;
}) {
  const { t } = useI18n();
  const Icon = statusIcons[file.status];

  return (
    <div
      className={cn(
        'group relative flex h-7 items-center gap-2 rounded-sm px-2 text-sm cursor-pointer transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
      onClick={onFileClick}
      onKeyDown={(e) => e.key === 'Enter' && onFileClick()}
      role="button"
      tabIndex={0}
      title={file.path}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isSelected ? '' : statusColors[file.status])} />

      <span
        className={cn('shrink-0 font-mono text-xs', isSelected ? '' : statusColors[file.status])}
      >
        {file.status}
      </span>

      <span className="min-w-0 flex-1 truncate">{file.path}</span>

      {/* Action buttons */}
      <div className="hidden shrink-0 items-center group-hover:flex">
        {onDiscard && (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            title={t('Discard changes')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          title={actionTitle}
        >
          <ActionIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ChangesList({
  staged,
  unstaged,
  selectedFile,
  onFileClick,
  onStage,
  onUnstage,
  onDiscard,
  onDeleteUntracked,
  onRefresh,
  isRefreshing,
  repoPath,
  sessionId,
}: ChangesListProps) {
  const { t } = useI18n();
  const { viewMode, setViewMode } = useSourceControlStore();
  const codeReviewEnabled = useSettingsStore((s) => s.codeReview.enabled);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const isMinimized = useCodeReviewContinueStore((s) => s.isMinimized);
  const reviewRepoPath = useCodeReviewContinueStore((s) => s.review.repoPath);
  const reviewStatus = useCodeReviewContinueStore((s) => s.review.status);
  const isMinimizedForThisRepo = isMinimized && reviewRepoPath === repoPath;
  const isMinimizedInProgress =
    isMinimizedForThisRepo && (reviewStatus === 'streaming' || reviewStatus === 'initializing');
  const isMinimizedComplete = isMinimizedForThisRepo && reviewStatus === 'complete';

  const getReviewButtonIcon = () => {
    if (isMinimizedInProgress) return <Loader2 className="animate-spin" />;
    if (isMinimizedComplete) return <CheckCircle className="text-green-500" />;
    return <Eye />;
  };

  const getReviewButtonText = () => {
    if (isMinimizedInProgress) return t('Reviewing...');
    if (isMinimizedComplete) return t('Review complete');
    return t('Review');
  };

  // Separate tracked and untracked changes
  const trackedChanges = unstaged.filter((f) => f.status !== 'U');
  const untrackedChanges = unstaged.filter((f) => f.status === 'U');

  // Use shared hook for batch operations
  const {
    handleUnstageAll,
    handleStageTracked,
    handleDiscardTracked,
    handleStageUntracked,
    handleDeleteAllUntracked,
  } = useChangesActions({
    staged,
    trackedChanges,
    untrackedChanges,
    onStage,
    onUnstage,
    onDiscard,
    onDeleteUntracked,
  });

  // If tree mode, use ChangesTree component
  if (viewMode === 'tree') {
    return (
      <div className="flex h-full flex-col">
        {/* View Mode Toggle */}
        <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-b px-3">
          {codeReviewEnabled && (
            <Button
              variant={isMinimizedForThisRepo ? 'default' : 'outline'}
              size="xs"
              onClick={() => setIsReviewModalOpen(true)}
              title={isMinimizedForThisRepo ? t('View code review') : t('Start code review')}
            >
              {getReviewButtonIcon()}
              {getReviewButtonText()}
            </Button>
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={() => setViewMode('list')}
            title={t('Switch to list view')}
          >
            <List />
            {t('List view')}
          </Button>
          {onRefresh && (
            <Button
              variant="outline"
              size="icon-xs"
              onClick={onRefresh}
              disabled={isRefreshing}
              title={t('Refresh')}
            >
              <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
            </Button>
          )}
        </div>
        {/* Tree View */}
        <div className="flex-1 overflow-hidden">
          <ChangesTree
            staged={staged}
            trackedChanges={trackedChanges}
            untrackedChanges={untrackedChanges}
            selectedFile={selectedFile}
            onFileClick={onFileClick}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
            onDeleteUntracked={onDeleteUntracked}
          />
        </div>

        <CodeReviewModal
          open={isReviewModalOpen}
          onOpenChange={setIsReviewModalOpen}
          repoPath={repoPath}
          sessionId={sessionId}
        />
      </div>
    );
  }

  const isEmpty =
    staged.length === 0 && trackedChanges.length === 0 && untrackedChanges.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* View Mode Toggle */}
      <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-b px-3">
        {codeReviewEnabled && (
          <Button
            variant={isMinimizedForThisRepo ? 'default' : 'outline'}
            size="xs"
            onClick={() => setIsReviewModalOpen(true)}
            title={isMinimizedForThisRepo ? t('View code review') : t('Start code review')}
          >
            {getReviewButtonIcon()}
            {getReviewButtonText()}
          </Button>
        )}
        <Button
          variant="outline"
          size="xs"
          onClick={() => setViewMode(viewMode === 'list' ? 'tree' : 'list')}
          title={viewMode === 'list' ? t('Switch to tree view') : t('Switch to list view')}
        >
          {viewMode === 'list' ? (
            <>
              <TreeDeciduous />
              {t('Tree view')}
            </>
          ) : (
            <>
              <List />
              {t('List view')}
            </>
          )}
        </Button>
        {onRefresh && (
          <Button
            variant="outline"
            size="icon-xs"
            onClick={onRefresh}
            disabled={isRefreshing}
            title={t('Refresh')}
          >
            <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
          </Button>
        )}
      </div>

      {/* Empty State */}
      {isEmpty ? (
        <div className="flex flex-1 min-h-[120px] flex-col items-center justify-center text-center text-muted-foreground">
          <p className="text-sm">{t('No changes')}</p>
        </div>
      ) : (
        /* List View */
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-3">
            {/* Staged Changes */}
            {staged.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t('Staged changes ({{count}})', { count: staged.length })}
                  </h3>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={handleUnstageAll}
                  >
                    {t('Unstage all')}
                  </button>
                </div>
                <div className="space-y-0.5">
                  {staged.map((file) => (
                    <FileItem
                      key={`staged-${file.path}`}
                      file={file}
                      isSelected={selectedFile?.path === file.path && selectedFile?.staged === true}
                      onFileClick={() => onFileClick({ path: file.path, staged: true })}
                      onAction={() => onUnstage([file.path])}
                      actionIcon={Minus}
                      actionTitle={t('Unstage')}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Tracked Changes */}
            {trackedChanges.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t('Changes ({{count}})', { count: trackedChanges.length })}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={handleDiscardTracked}
                      title={t('Discard all changes')}
                    >
                      {t('Discard all')}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={handleStageTracked}
                    >
                      {t('Stage all')}
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {trackedChanges.map((file) => (
                    <FileItem
                      key={`unstaged-${file.path}`}
                      file={file}
                      isSelected={
                        selectedFile?.path === file.path && selectedFile?.staged === false
                      }
                      onFileClick={() => onFileClick({ path: file.path, staged: false })}
                      onAction={() => onStage([file.path])}
                      actionIcon={Plus}
                      actionTitle={t('Stage')}
                      onDiscard={() => onDiscard([file.path])}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Untracked Changes */}
            {untrackedChanges.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t('Untracked changes ({{count}})', { count: untrackedChanges.length })}
                  </h3>
                  <div className="flex items-center gap-2">
                    {onDeleteUntracked && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={handleDeleteAllUntracked}
                        title={t('Delete all untracked files')}
                      >
                        {t('Delete all')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={handleStageUntracked}
                    >
                      {t('Stage all')}
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {untrackedChanges.map((file) => (
                    <FileItem
                      key={`untracked-${file.path}`}
                      file={file}
                      isSelected={
                        selectedFile?.path === file.path && selectedFile?.staged === false
                      }
                      onFileClick={() => onFileClick({ path: file.path, staged: false })}
                      onAction={() => onStage([file.path])}
                      actionIcon={Plus}
                      actionTitle={t('Stage')}
                      onDiscard={
                        onDeleteUntracked ? () => onDeleteUntracked([file.path]) : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      <CodeReviewModal
        open={isReviewModalOpen}
        onOpenChange={setIsReviewModalOpen}
        repoPath={repoPath}
        sessionId={sessionId}
      />
    </div>
  );
}
