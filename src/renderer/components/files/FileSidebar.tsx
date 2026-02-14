import { AnimatePresence, motion } from 'framer-motion';
import { FileCode } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { panelTransition } from '@/App/constants';
import { normalizePath } from '@/App/storage';
import { GlobalSearchDialog, type SearchMode } from '@/components/search';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { addToast, toastManager } from '@/components/ui/toast';
import { useEditor } from '@/hooks/useEditor';
import { useFileTree } from '@/hooks/useFileTree';
import { useI18n } from '@/i18n';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import { getEditorSelectionText } from './EditorArea';
import {
  type ConflictInfo,
  type ConflictResolution,
  FileConflictDialog,
} from './FileConflictDialog';
import { FileTree } from './FileTree';
import { NewItemDialog } from './NewItemDialog';

interface FileSidebarProps {
  rootPath: string | undefined;
  isActive?: boolean;
  sessionId?: string | null;
  width: number;
  collapsed: boolean;
  onCollapse: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onSwitchTab?: () => void;
}

type NewItemType = 'file' | 'directory' | null;

export function FileSidebar({
  rootPath,
  isActive = false,
  sessionId,
  width,
  collapsed,
  onCollapse,
  onResizeStart,
  onSwitchTab,
}: FileSidebarProps) {
  const { t } = useI18n();
  const {
    tree,
    isLoading,
    expandedPaths,
    toggleExpand,
    createFile,
    createDirectory,
    renameItem,
    deleteItem,
    refresh,
    handleExternalDrop,
    resolveConflictsAndContinue,
    revealFile,
  } = useFileTree({ rootPath, enabled: !!rootPath, isActive });

  const { tabs, activeTab, loadFile, closeFile, setActiveFile, navigateToFile } = useEditor();

  const [newItemType, setNewItemType] = useState<NewItemType>(null);
  const [newItemParentPath, setNewItemParentPath] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('content');
  const addOperationsRef = useRef<((operations: any[]) => void) | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [pendingDropData, setPendingDropData] = useState<{
    files: FileList;
    targetDir: string;
    operation: 'copy' | 'move';
  } | null>(null);

  // Auto-sync file tree selection with active tab
  useEffect(() => {
    if (!activeTab?.path || !rootPath) return;
    setSelectedFilePath(activeTab.path);
    revealFile(activeTab.path);
  }, [activeTab?.path, rootPath, revealFile]);

  const handleRecordOperations = useCallback((addFn: (operations: any[]) => void) => {
    addOperationsRef.current = addFn;
  }, []);

  const handleOpenSearch = useCallback((selectedText?: string) => {
    setSearchMode('content');
    const query = selectedText ?? getEditorSelectionText();
    if (query) {
      window._pendingSearchQuery = query;
    }
    setSearchOpen(true);
  }, []);

  const handleFileClick = useCallback(
    (path: string) => {
      onSwitchTab?.();
      const existingTab = tabs.find((t) => t.path === path);
      if (existingTab) {
        setActiveFile(path);
      } else {
        loadFile.mutate(path);
      }
    },
    [tabs, setActiveFile, loadFile, onSwitchTab]
  );

  const handleCreateFile = useCallback((parentPath: string) => {
    setNewItemType('file');
    setNewItemParentPath(parentPath);
  }, []);

  const handleCreateDirectory = useCallback((parentPath: string) => {
    setNewItemType('directory');
    setNewItemParentPath(parentPath);
  }, []);

  const handleNewItemConfirm = useCallback(
    async (name: string) => {
      const fullPath = `${newItemParentPath}/${name}`;
      if (newItemType === 'file') {
        await createFile(fullPath);
        loadFile.mutate(fullPath);
      } else if (newItemType === 'directory') {
        await createDirectory(fullPath);
      }
      setNewItemType(null);
      setNewItemParentPath('');
    },
    [newItemType, newItemParentPath, createFile, createDirectory, loadFile]
  );

  const handleRename = useCallback(
    async (path: string, newName: string) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      const newPath = `${parentPath}/${newName}`;
      await renameItem(path, newPath);
    },
    [renameItem]
  );

  const handleDelete = useCallback(
    async (path: string) => {
      const confirmed = window.confirm(`Delete "${path.split('/').pop()}"?`);
      if (confirmed) {
        await deleteItem(path);
        closeFile(path);
      }
    },
    [deleteItem, closeFile]
  );

  const terminalWrite = useTerminalWriteStore((state) => state.write);
  const terminalFocus = useTerminalWriteStore((state) => state.focus);
  const activeSessionId = useTerminalWriteStore((state) => state.activeSessionId);
  const effectiveSessionId = sessionId ?? activeSessionId;

  const handleSendToSession = useCallback(
    (path: string) => {
      if (!effectiveSessionId) return;
      let displayPath = path;
      const normalizedRoot = rootPath ? normalizePath(rootPath) : '';
      if (normalizedRoot && path.startsWith(normalizedRoot + '/')) {
        displayPath = path.slice(normalizedRoot.length + 1);
      }
      terminalWrite(effectiveSessionId, `@${displayPath} `);
      terminalFocus(effectiveSessionId);
      addToast({
        type: 'success',
        title: t('Sent to session'),
        description: `@${displayPath}`,
        timeout: 2000,
      });
    },
    [effectiveSessionId, rootPath, terminalWrite, terminalFocus, t]
  );

  const handleExternalFileDrop = useCallback(
    async (files: FileList, targetDir: string, operation: 'copy' | 'move') => {
      const result = await handleExternalDrop(files, targetDir, operation);

      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setPendingDropData({ files, targetDir, operation });
        setConflictDialogOpen(true);
        return;
      }

      if (result.success.length > 0) {
        toastManager.add({
          type: 'success',
          title: t('{{operation}} completed', {
            operation: operation === 'copy' ? 'Copy' : 'Move',
          }),
          description: t('{{count}} file(s) successful', { count: result.success.length }),
          timeout: 3000,
        });

        if (addOperationsRef.current) {
          const operations = result.success.map((sourcePath) => {
            const fileName = sourcePath.split('/').pop() || '';
            const targetPath = `${targetDir}/${fileName}`;
            return {
              type: operation,
              sourcePath,
              targetPath,
              isDirectory: false,
            };
          });
          addOperationsRef.current(operations);
        }

        let firstFile: string | null = null;
        for (const sourcePath of result.success) {
          const fileName = sourcePath.split('/').pop() || '';
          const hasExtension = fileName.includes('.') && !fileName.startsWith('.');
          if (hasExtension) {
            firstFile = `${targetDir}/${fileName}`;
            break;
          }
        }

        if (firstFile) {
          setTimeout(() => {
            setSelectedFilePath(firstFile!);
            loadFile.mutate(firstFile!);
          }, 500);
        }
      }
      if (result.failed.length > 0) {
        toastManager.add({
          type: 'error',
          title: t('Operation failed'),
          description: t('{{count}} file(s) failed', { count: result.failed.length }),
          timeout: 3000,
        });
      }
    },
    [handleExternalDrop, t, loadFile]
  );

  const handleConflictResolve = useCallback(
    async (resolutions: ConflictResolution[]) => {
      if (!pendingDropData) return;

      setConflictDialogOpen(false);

      const sourcePaths: string[] = [];
      for (let i = 0; i < pendingDropData.files.length; i++) {
        const file = pendingDropData.files[i];
        try {
          const filePath = window.electronAPI.utils.getPathForFile(file);
          if (filePath) {
            sourcePaths.push(filePath);
          }
        } catch (error) {
          console.error('Failed to get file path:', error);
        }
      }

      const result = await resolveConflictsAndContinue(
        sourcePaths,
        pendingDropData.targetDir,
        pendingDropData.operation,
        resolutions
      );

      setPendingDropData(null);
      setConflicts([]);

      if (result.success.length > 0) {
        toastManager.add({
          type: 'success',
          title: t('{{operation}} completed', {
            operation: pendingDropData.operation === 'copy' ? 'Copy' : 'Move',
          }),
          description: t('{{count}} file(s) successful', { count: result.success.length }),
          timeout: 3000,
        });

        if (addOperationsRef.current) {
          const operations = result.success.map((sourcePath) => {
            const fileName = sourcePath.split('/').pop() || '';
            const targetPath = `${pendingDropData.targetDir}/${fileName}`;
            return {
              type: pendingDropData.operation,
              sourcePath,
              targetPath,
              isDirectory: false,
            };
          });
          addOperationsRef.current(operations);
        }

        let firstFile: string | null = null;
        for (const sourcePath of result.success) {
          const fileName = sourcePath.split('/').pop() || '';
          const hasExtension = fileName.includes('.') && !fileName.startsWith('.');
          if (hasExtension) {
            firstFile = `${pendingDropData.targetDir}/${fileName}`;
            break;
          }
        }

        if (firstFile) {
          setTimeout(() => {
            setSelectedFilePath(firstFile!);
            loadFile.mutate(firstFile!);
          }, 500);
        }
      }
      if (result.failed.length > 0) {
        toastManager.add({
          type: 'error',
          title: t('Operation failed'),
          description: t('{{count}} file(s) failed', { count: result.failed.length }),
          timeout: 3000,
        });
      }
    },
    [pendingDropData, resolveConflictsAndContinue, t, loadFile]
  );

  const handleConflictCancel = useCallback(() => {
    setConflictDialogOpen(false);
    setPendingDropData(null);
    setConflicts([]);
  }, []);

  if (!rootPath) {
    return (
      <aside className="flex h-full w-full flex-col border-r bg-background">
        <Empty className="h-full">
          <EmptyMedia variant="icon">
            <FileCode className="h-4.5 w-4.5" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t('File Explorer')}</EmptyTitle>
            <EmptyDescription>{t('Select a Worktree to browse files')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </aside>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.aside
          key="file-sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={panelTransition}
          className="relative h-full shrink-0 overflow-hidden border-r bg-background"
          style={{ width }}
        >
          <FileTree
            tree={tree}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpand}
            onFileClick={handleFileClick}
            selectedPath={selectedFilePath}
            onSelectedPathChange={setSelectedFilePath}
            onCreateFile={handleCreateFile}
            onCreateDirectory={handleCreateDirectory}
            onRename={handleRename}
            onDelete={handleDelete}
            onRefresh={refresh}
            onOpenSearch={handleOpenSearch}
            onExternalDrop={handleExternalFileDrop}
            onRecordOperations={handleRecordOperations}
            onFileDeleted={closeFile}
            isLoading={isLoading}
            rootPath={rootPath}
            isCollapsed={false}
            onToggleCollapse={onCollapse}
            onSendToSession={effectiveSessionId ? handleSendToSession : undefined}
          />
          <div
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
            onMouseDown={onResizeStart}
          />
          <GlobalSearchDialog
            open={searchOpen}
            onOpenChange={setSearchOpen}
            rootPath={rootPath}
            initialMode={searchMode}
            onOpenFile={navigateToFile}
          />
          <NewItemDialog
            isOpen={newItemType !== null}
            type={newItemType || 'file'}
            onConfirm={handleNewItemConfirm}
            onCancel={() => {
              setNewItemType(null);
              setNewItemParentPath('');
            }}
          />
          <FileConflictDialog
            open={conflictDialogOpen}
            conflicts={conflicts}
            onResolve={handleConflictResolve}
            onCancel={handleConflictCancel}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
