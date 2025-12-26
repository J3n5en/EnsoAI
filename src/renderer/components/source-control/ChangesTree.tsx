import type { FileChange, FileChangeStatus } from '@shared/types';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileEdit,
  FilePlus,
  FileWarning,
  FileX,
  Folder,
  FolderOpen,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSourceControlStore } from '@/stores/sourceControl';

interface ChangesTreeProps {
  staged: FileChange[];
  trackedChanges: FileChange[];
  untrackedChanges: FileChange[];
  selectedFile: { path: string; staged: boolean } | null;
  onFileClick: (file: { path: string; staged: boolean }) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (path: string) => void;
  onDeleteUntracked?: (path: string) => void;
}

// M=Modified, A=Added, D=Deleted, R=Renamed, C=Copied, U=Untracked, X=Conflict
const statusIcons: Record<FileChangeStatus, React.ElementType> = {
  M: FileEdit,
  A: FilePlus,
  D: FileX,
  R: FileEdit,
  C: FilePlus,
  U: FilePlus,
  X: FileWarning,
};

const statusColors: Record<FileChangeStatus, string> = {
  M: 'text-orange-500',
  A: 'text-green-500',
  D: 'text-red-500',
  R: 'text-blue-500',
  C: 'text-blue-500',
  U: 'text-green-500',
  X: 'text-purple-500',
};

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  file?: FileChange;
  children?: TreeNode[];
}

function buildTree(files: FileChange[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      let node = currentLevel.find((n) => n.name === part);

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          ...(isFile ? { file } : { children: [] }),
        };
        currentLevel.push(node);
      }

      if (!isFile && node.children) {
        currentLevel = node.children;
      }
    }
  }

  return root;
}

interface FileTreeNodeProps {
  node: TreeNode;
  level: number;
  staged: boolean;
  selectedFile: { path: string; staged: boolean } | null;
  onFileClick: (file: { path: string; staged: boolean }) => void;
  onAction: (path: string) => void;
  actionIcon: React.ElementType;
  actionTitle: string;
  onDiscard?: (path: string) => void;
}

function FileTreeNode({
  node,
  level,
  staged,
  selectedFile,
  onFileClick,
  onAction,
  actionIcon: ActionIcon,
  actionTitle,
  onDiscard,
}: FileTreeNodeProps) {
  const { t } = useI18n();
  const { expandedFolders, toggleFolder } = useSourceControlStore();
  const isExpanded = expandedFolders.has(node.path);

  if (node.type === 'folder') {
    const Icon = isExpanded ? FolderOpen : Folder;
    return (
      <>
        <div
          className="group flex h-7 items-center gap-2 rounded-sm px-2 text-sm cursor-pointer transition-colors hover:bg-accent/50"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => toggleFolder(node.path)}
          onKeyDown={(e) => e.key === 'Enter' && toggleFolder(node.path)}
          role="button"
          tabIndex={0}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{node.name}</span>
        </div>

        {isExpanded &&
          node.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              staged={staged}
              selectedFile={selectedFile}
              onFileClick={onFileClick}
              onAction={onAction}
              actionIcon={ActionIcon}
              actionTitle={actionTitle}
              onDiscard={onDiscard}
            />
          ))}
      </>
    );
  }

  // File node
  const file = node.file!;
  const Icon = statusIcons[file.status];
  const isSelected = selectedFile?.path === file.path && selectedFile?.staged === staged;

  return (
    <div
      className={cn(
        'group relative flex h-7 items-center gap-2 rounded-sm px-2 text-sm cursor-pointer transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
      style={{ paddingLeft: `${level * 12 + 8}px` }}
      onClick={() => onFileClick({ path: file.path, staged })}
      onKeyDown={(e) => e.key === 'Enter' && onFileClick({ path: file.path, staged })}
      role="button"
      tabIndex={0}
    >
      <div className="h-3.5 w-3.5 shrink-0" />
      <Icon className={cn('h-4 w-4 shrink-0', isSelected ? '' : statusColors[file.status])} />

      <span
        className={cn('shrink-0 font-mono text-xs', isSelected ? '' : statusColors[file.status])}
      >
        {file.status}
      </span>

      <span className="min-w-0 flex-1 truncate">{node.name}</span>

      {/* Action buttons */}
      <div className="hidden shrink-0 items-center group-hover:flex">
        {onDiscard && (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard(file.path);
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
            onAction(file.path);
          }}
          title={actionTitle}
        >
          <ActionIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ChangesTree({
  staged,
  trackedChanges,
  untrackedChanges,
  selectedFile,
  onFileClick,
  onStage,
  onUnstage,
  onDiscard,
  onDeleteUntracked,
}: ChangesTreeProps) {
  const { t } = useI18n();
  const { expandedFolders, toggleFolder } = useSourceControlStore();
  const stagedTree = useMemo(() => buildTree(staged), [staged]);
  const trackedTree = useMemo(() => buildTree(trackedChanges), [trackedChanges]);
  const untrackedTree = useMemo(() => buildTree(untrackedChanges), [untrackedChanges]);

  // Collect all folder paths from all trees
  const allFolderPaths = useMemo(() => {
    const folders = new Set<string>();
    const collectFolders = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          folders.add(node.path);
          if (node.children) {
            collectFolders(node.children);
          }
        }
      }
    };
    collectFolders(stagedTree);
    collectFolders(trackedTree);
    collectFolders(untrackedTree);
    return folders;
  }, [stagedTree, trackedTree, untrackedTree]);

  const allExpanded = useMemo(() => {
    if (allFolderPaths.size === 0) return false;
    for (const folder of allFolderPaths) {
      if (!expandedFolders.has(folder)) return false;
    }
    return true;
  }, [allFolderPaths, expandedFolders]);

  const handleUnstageAll = () => {
    const paths = staged.map((f) => f.path);
    if (paths.length > 0) onUnstage(paths);
  };

  const handleStageTracked = () => {
    const paths = trackedChanges.map((f) => f.path);
    if (paths.length > 0) onStage(paths);
  };

  const handleStageUntracked = () => {
    const paths = untrackedChanges.map((f) => f.path);
    if (paths.length > 0) onStage(paths);
  };

  const handleToggleAll = useCallback(() => {
    if (allExpanded) {
      // Collapse all
      for (const folder of allFolderPaths) {
        if (expandedFolders.has(folder)) {
          toggleFolder(folder);
        }
      }
    } else {
      // Expand all
      for (const folder of allFolderPaths) {
        if (!expandedFolders.has(folder)) {
          toggleFolder(folder);
        }
      }
    }
  }, [allExpanded, allFolderPaths, expandedFolders, toggleFolder]);

  const isEmpty =
    staged.length === 0 && trackedChanges.length === 0 && untrackedChanges.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-center text-muted-foreground">
        <p className="text-sm">{t('No changes')}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        {/* Collapse/Expand All Button */}
        {allFolderPaths.size > 0 && (
          <div className="flex justify-end px-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleToggleAll}
              title={allExpanded ? t('Collapse all folders') : t('Expand all folders')}
            >
              {allExpanded ? (
                <>
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                  {t('Collapse all')}
                </>
              ) : (
                <>
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  {t('Expand all')}
                </>
              )}
            </button>
          </div>
        )}

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
              {stagedTree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  level={0}
                  staged={true}
                  selectedFile={selectedFile}
                  onFileClick={onFileClick}
                  onAction={(path) => onUnstage([path])}
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
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleStageTracked}
              >
                {t('Stage all')}
              </button>
            </div>
            <div className="space-y-0.5">
              {trackedTree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  level={0}
                  staged={false}
                  selectedFile={selectedFile}
                  onFileClick={onFileClick}
                  onAction={(path) => onStage([path])}
                  actionIcon={Plus}
                  actionTitle={t('Stage')}
                  onDiscard={onDiscard}
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
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleStageUntracked}
              >
                {t('Stage all')}
              </button>
            </div>
            <div className="space-y-0.5">
              {untrackedTree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  level={0}
                  staged={false}
                  selectedFile={selectedFile}
                  onFileClick={onFileClick}
                  onAction={(path) => onStage([path])}
                  actionIcon={Plus}
                  actionTitle={t('Stage')}
                  onDiscard={onDeleteUntracked}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
