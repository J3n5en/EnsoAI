import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  Clipboard,
  ClipboardPaste,
  Copy,
  FilePlus,
  FolderPlus,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  SquareMinus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Menu, MenuItem, MenuPopup, MenuSeparator } from '@/components/ui/menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { FileTreeNode } from '@/hooks/useFileTree';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { getFileIcon, getFileIconColor } from './fileIcons';

const DRAG_CONFIRM_STORAGE_KEY = 'file-tree-drag-confirm-disabled';
const PASTE_CONFLICT_STORAGE_KEY = 'file-tree-paste-conflict-disabled';

interface FileOperation {
  type: 'move' | 'copy';
  sourcePath: string;
  targetPath: string;
  isDirectory: boolean;
}

interface FileTreeProps {
  tree: FileTreeNode[];
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onFileClick: (path: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onRefresh: () => void;
  onOpenSearch?: () => void;
  onExternalDrop?: (files: FileList, targetDir: string, operation: 'copy' | 'move') => void;
  isLoading?: boolean;
  rootPath?: string;
  selectedPath?: string | null;
  onSelectedPathChange?: (path: string | null) => void;
  onRecordOperations?: (addFn: (operations: FileOperation[]) => void) => void;
  onFileDeleted?: (path: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSendToSession?: (path: string) => void;
}

export function FileTree({
  tree,
  expandedPaths,
  onToggleExpand,
  onFileClick,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onDelete,
  onRefresh,
  onOpenSearch,
  onExternalDrop,
  isLoading,
  rootPath,
  selectedPath: externalSelectedPath,
  onSelectedPathChange,
  onRecordOperations,
  onFileDeleted,
  isCollapsed: _isCollapsed,
  onToggleCollapse,
  onSendToSession,
}: FileTreeProps) {
  const { t } = useI18n();
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [internalSelectedNode, setInternalSelectedNode] = useState<{
    path: string;
    isDirectory: boolean;
  } | null>(null);

  // Drag and drop state
  const [_isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);
  // Track which folder should be highlighted during drag
  const [draggingOverFolderPath, setDraggingOverFolderPath] = useState<string | null>(null);
  // Timer for auto-expanding folders
  const autoExpandTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [draggingNode, setDraggingNode] = useState<{
    path: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);

  // Use external selectedPath if provided, otherwise use internal state
  const selectedNode =
    externalSelectedPath !== undefined
      ? externalSelectedPath
        ? { path: externalSelectedPath, isDirectory: false }
        : null
      : internalSelectedNode;

  const setSelectedNode = useCallback(
    (node: { path: string; isDirectory: boolean } | null) => {
      if (onSelectedPathChange) {
        onSelectedPathChange(node?.path ?? null);
      } else {
        setInternalSelectedNode(node);
      }
    },
    [onSelectedPathChange]
  );

  // Auto-scroll to selected node when selection changes
  useEffect(() => {
    if (selectedNode?.path) {
      // Use setTimeout to ensure the DOM is updated after selection
      setTimeout(() => {
        const selectedElement = document.querySelector(
          `[data-node-path="${CSS.escape(selectedNode.path)}"]`
        );
        if (selectedElement) {
          selectedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
          });
        }
      }, 100);
    }
  }, [selectedNode?.path]);

  // Auto-expand folder when dragging over it
  useEffect(() => {
    // Clear any existing timer
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }

    // If dragging over a folder that's not expanded, set timer to expand it
    if (draggingOverFolderPath && !expandedPaths.has(draggingOverFolderPath)) {
      console.log('[FileTree] Setting timer to auto-expand folder:', draggingOverFolderPath);
      autoExpandTimerRef.current = setTimeout(() => {
        console.log('[FileTree] Auto-expanding folder:', draggingOverFolderPath);
        onToggleExpand(draggingOverFolderPath);
        autoExpandTimerRef.current = null;
      }, 300);
    }

    // Cleanup on unmount
    return () => {
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current);
        autoExpandTimerRef.current = null;
      }
    };
  }, [draggingOverFolderPath, expandedPaths, onToggleExpand]);

  // Confirmation dialog state
  const [showDragConfirm, setShowDragConfirm] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [pendingDragData, setPendingDragData] = useState<{
    targetPath: string;
    targetIsDirectory: boolean;
    draggingNode: { path: string; name: string; isDirectory: boolean };
    sourcePath: string;
    targetDir: string;
  } | null>(null);

  // Clipboard state for copy/cut/paste
  const [clipboard, setClipboard] = useState<{
    path: string;
    name: string;
    isDirectory: boolean;
    operation: 'copy' | 'cut';
  } | null>(null);

  // Root context menu state
  const [rootMenuOpen, setRootMenuOpen] = useState(false);
  const [rootMenuPosition, setRootMenuPosition] = useState({ x: 0, y: 0 });

  // Paste conflict dialog state
  const [showPasteConflict, setShowPasteConflict] = useState(false);
  const [dontShowConflictAgain, setDontShowConflictAgain] = useState(false);
  const [conflictData, setConflictData] = useState<{
    targetPath: string;
    targetIsDirectory: boolean;
    newPath: string;
    source: 'paste' | 'drag';
    dragNode?: { path: string; name: string; isDirectory: boolean };
  } | null>(null);

  // Operation history for undo/redo
  const [operationHistory, setOperationHistory] = useState<FileOperation[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Add operation to history
  const addOperation = useCallback((operation: FileOperation) => {
    console.log('[FileTree] Adding operation to history:', operation);

    // Update index first and use it to update history
    setHistoryIndex((currentIndex) => {
      console.log('[FileTree] Current index:', currentIndex);

      // Update history using current index
      setOperationHistory((prev) => {
        // Remove any operations after current index (when doing new operation after undo)
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(operation);
        // Keep only last 50 operations
        const finalHistory = newHistory.length > 50 ? newHistory.slice(-50) : newHistory;
        console.log('[FileTree] New history length:', finalHistory.length);
        return finalHistory;
      });

      // Calculate new index: if history was at limit, index stays at 49, otherwise increment
      const newIndex = currentIndex + 1 >= 50 ? 49 : currentIndex + 1;
      console.log('[FileTree] New index:', newIndex);
      return newIndex;
    });
  }, []);

  // Batch add operations to history (for external drag-drop)
  const addOperations = useCallback((operations: FileOperation[]) => {
    if (operations.length === 0) return;

    console.log('[FileTree] Adding batch operations to history:', operations.length);

    setHistoryIndex((currentIndex) => {
      setOperationHistory((prev) => {
        // Remove any operations after current index
        const newHistory = prev.slice(0, currentIndex + 1);
        // Add all new operations
        newHistory.push(...operations);
        // Keep only last 50 operations
        const finalHistory = newHistory.length > 50 ? newHistory.slice(-50) : newHistory;
        console.log('[FileTree] New history length after batch:', finalHistory.length);
        return finalHistory;
      });

      // Calculate new index
      const newIndex = Math.min(currentIndex + operations.length, 49);
      console.log('[FileTree] New index after batch:', newIndex);
      return newIndex;
    });
  }, []);

  // Notify parent with addOperations function
  useEffect(() => {
    if (onRecordOperations) {
      onRecordOperations(addOperations);
    }
  }, [onRecordOperations, addOperations]);

  // Undo operation
  const handleUndo = useCallback(async () => {
    if (historyIndex < 0) {
      console.log('[FileTree] Nothing to undo');
      return;
    }

    const operation = operationHistory[historyIndex];
    console.log('[FileTree] Undoing operation:', operation);

    // Always update index before attempting undo, so we can move to next operation even if this fails
    setHistoryIndex((i) => i - 1);

    try {
      if (operation.type === 'move') {
        // Undo move: move back to original location
        await window.electronAPI.file.move(operation.targetPath, operation.sourcePath);
      } else if (operation.type === 'copy') {
        // Undo copy: delete the copied file
        await window.electronAPI.file.delete(operation.targetPath);
        // Notify parent that file was deleted (to close editor tab if open)
        if (onFileDeleted) {
          onFileDeleted(operation.targetPath);
        }
      }
      console.log('[FileTree] Undo completed');
    } catch (error) {
      console.error('[FileTree] Undo failed:', error);
      // Show user-friendly error message
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('ENOENT')) {
        console.warn('[FileTree] File no longer exists, skipping undo');
      }
    }

    // Always refresh to show current state
    await onRefresh();
  }, [historyIndex, operationHistory, onRefresh, onFileDeleted]);

  // Redo operation
  const handleRedo = useCallback(async () => {
    if (historyIndex >= operationHistory.length - 1) {
      console.log('[FileTree] Nothing to redo');
      return;
    }

    const operation = operationHistory[historyIndex + 1];
    console.log('[FileTree] Redoing operation:', operation);

    // Always update index before attempting redo, so we can move to next operation even if this fails
    setHistoryIndex((i) => i + 1);

    try {
      if (operation.type === 'move') {
        await window.electronAPI.file.move(operation.sourcePath, operation.targetPath);
      } else if (operation.type === 'copy') {
        await window.electronAPI.file.copy(operation.sourcePath, operation.targetPath);
      }
      console.log('[FileTree] Redo completed');
    } catch (error) {
      console.error('[FileTree] Redo failed:', error);
      // Show user-friendly error message
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('ENOENT')) {
        console.warn('[FileTree] File no longer exists, skipping redo');
      }
    }

    // Always refresh to show current state
    await onRefresh();
  }, [historyIndex, operationHistory, onRefresh]);

  // 计算新建文件/文件夹的目标路径
  const getCreateTargetPath = useCallback(() => {
    if (!selectedNode) return rootPath;
    // 如果选中的是目录，在该目录下创建
    if (selectedNode.isDirectory) return selectedNode.path;
    // 如果选中的是文件，在其父目录下创建
    return selectedNode.path.substring(0, selectedNode.path.lastIndexOf('/')) || rootPath;
  }, [selectedNode, rootPath]);

  const handleStartRename = useCallback((path: string, currentName: string) => {
    setEditingPath(path);
    setEditValue(currentName);
  }, []);

  const handleFinishRename = useCallback(
    (path: string) => {
      if (editValue.trim() && editValue !== path.split('/').pop()) {
        onRename(path, editValue.trim());
      }
      setEditingPath(null);
      setEditValue('');
    },
    [editValue, onRename]
  );

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
  }, []);

  const handleCopyRelativePath = useCallback(
    (path: string) => {
      if (!rootPath) return;
      const relativePath = path.startsWith(rootPath) ? path.substring(rootPath.length + 1) : path;
      navigator.clipboard.writeText(relativePath);
    },
    [rootPath]
  );

  const handleRevealInFinder = useCallback(async (path: string) => {
    try {
      await window.electronAPI.file.revealInFileManager(path);
    } catch (error) {
      console.error('[FileTree] Failed to reveal in file manager:', error);
    }
  }, []);

  // Clipboard handlers
  const handleCopy = useCallback((path: string, name: string, isDirectory: boolean) => {
    setClipboard({ path, name, isDirectory, operation: 'copy' });
  }, []);

  const handleCut = useCallback((path: string, name: string, isDirectory: boolean) => {
    setClipboard({ path, name, isDirectory, operation: 'cut' });
  }, []);

  const handlePaste = useCallback(
    async (targetPath: string, targetIsDirectory: boolean) => {
      if (!clipboard) return;

      try {
        // Determine target directory
        let targetDir = targetPath;
        if (!targetIsDirectory) {
          targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
        }

        const newPath = `${targetDir}/${clipboard.name}`;

        console.log('[FileTree] Paste:', {
          clipboard,
          targetDir,
          newPath,
        });

        // Only skip if it's a cut operation to the same location
        if (clipboard.path === newPath && clipboard.operation === 'cut') {
          console.log('[FileTree] Cut to same location, skipping');
          setClipboard(null);
          return;
        }

        // Check if target already exists
        const exists = await window.electronAPI.file.exists(newPath);
        console.log('[FileTree] Target exists:', exists);

        if (exists) {
          // Special case: copying to same location - always auto-rename without showing conflict dialog
          if (clipboard.path === newPath && clipboard.operation === 'copy') {
            console.log('[FileTree] Copy to same location, auto-renaming');
            let copyIndex = 1;
            let copyName = `${clipboard.name} copy`;
            let finalPath = `${targetDir}/${copyName}`;

            while (await window.electronAPI.file.exists(finalPath)) {
              copyIndex++;
              copyName = `${clipboard.name} copy ${copyIndex}`;
              finalPath = `${targetDir}/${copyName}`;
            }

            await window.electronAPI.file.copy(clipboard.path, finalPath);
            addOperation({
              type: 'copy',
              sourcePath: clipboard.path,
              targetPath: finalPath,
              isDirectory: clipboard.isDirectory,
            });

            await new Promise((resolve) => setTimeout(resolve, 500));
            await onRefresh();
            console.log('[FileTree] Refresh completed after auto-rename (same location)');
            return;
          }

          // File exists - check if conflict warning is disabled
          const conflictDisabled = localStorage.getItem(PASTE_CONFLICT_STORAGE_KEY) === 'true';
          console.log('[FileTree] Conflict dialog disabled:', conflictDisabled);

          if (conflictDisabled) {
            // Auto-rename - find an available name
            let copyIndex = 1;
            let copyName = `${clipboard.name} copy`;
            let finalPath = `${targetDir}/${copyName}`;

            // Keep incrementing until we find an available name
            while (await window.electronAPI.file.exists(finalPath)) {
              copyIndex++;
              copyName = `${clipboard.name} copy ${copyIndex}`;
              finalPath = `${targetDir}/${copyName}`;
            }

            console.log('[FileTree] Auto-renaming to:', finalPath);

            if (clipboard.operation === 'copy') {
              await window.electronAPI.file.copy(clipboard.path, finalPath);
              // Record operation for undo
              addOperation({
                type: 'copy',
                sourcePath: clipboard.path,
                targetPath: finalPath,
                isDirectory: clipboard.isDirectory,
              });
            } else {
              await window.electronAPI.file.move(clipboard.path, finalPath);
              // Record operation for undo
              addOperation({
                type: 'move',
                sourcePath: clipboard.path,
                targetPath: finalPath,
                isDirectory: clipboard.isDirectory,
              });
              setClipboard(null);
            }
            // Small delay to ensure file system is updated before refresh
            await new Promise((resolve) => setTimeout(resolve, 500));
            await onRefresh();
            console.log('[FileTree] Refresh completed after auto-rename');
          } else {
            // Show conflict dialog
            console.log('[FileTree] Showing conflict dialog');
            setConflictData({ targetPath, targetIsDirectory, newPath, source: 'paste' });
            setShowPasteConflict(true);
          }
          return;
        }

        console.log('[FileTree] Executing paste operation');
        if (clipboard.operation === 'copy') {
          // Copy operation
          await window.electronAPI.file.copy(clipboard.path, newPath);
          // Record operation for undo
          addOperation({
            type: 'copy',
            sourcePath: clipboard.path,
            targetPath: newPath,
            isDirectory: clipboard.isDirectory,
          });
        } else {
          // Cut operation (move)
          await window.electronAPI.file.move(clipboard.path, newPath);
          // Record operation for undo
          addOperation({
            type: 'move',
            sourcePath: clipboard.path,
            targetPath: newPath,
            isDirectory: clipboard.isDirectory,
          });
          setClipboard(null); // Clear clipboard after cut
        }

        // Refresh the file tree
        console.log('[FileTree] Refreshing after paste');
        // Small delay to ensure file system is updated before refresh
        await new Promise((resolve) => setTimeout(resolve, 500));
        await onRefresh();
        console.log('[FileTree] Refresh completed after paste');
      } catch (error) {
        console.error('[FileTree] Paste failed:', error);
      }
    },
    [clipboard, onRefresh, addOperation]
  );

  // Handle root directory context menu
  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Calculate menu position with boundary checks
    const menuHeight = 300; // Approximate max menu height
    const menuWidth = 250; // Approximate menu width
    const padding = 10;

    let x = e.clientX;
    let y = e.clientY;

    // Check if menu would overflow bottom
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Check if menu would overflow right
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Ensure menu doesn't go off top or left
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setRootMenuPosition({ x, y });
    setRootMenuOpen(true);
  }, []);

  // Handle paste conflict - replace
  const handleConflictReplace = useCallback(async () => {
    if (!conflictData) return;

    // For paste conflicts, need clipboard; for drag conflicts, need dragNode
    if (conflictData.source === 'paste' && !clipboard) return;
    if (conflictData.source === 'drag' && !conflictData.dragNode) return;

    if (dontShowConflictAgain) {
      localStorage.setItem(PASTE_CONFLICT_STORAGE_KEY, 'true');
    }

    try {
      // Delete existing file/folder first
      await window.electronAPI.file.delete(conflictData.newPath);

      if (conflictData.source === 'paste' && clipboard) {
        // Paste operation
        if (clipboard.operation === 'copy') {
          await window.electronAPI.file.copy(clipboard.path, conflictData.newPath);
          addOperation({
            type: 'copy',
            sourcePath: clipboard.path,
            targetPath: conflictData.newPath,
            isDirectory: clipboard.isDirectory,
          });
        } else {
          await window.electronAPI.file.move(clipboard.path, conflictData.newPath);
          addOperation({
            type: 'move',
            sourcePath: clipboard.path,
            targetPath: conflictData.newPath,
            isDirectory: clipboard.isDirectory,
          });
          setClipboard(null);
        }
      } else if (conflictData.source === 'drag' && conflictData.dragNode) {
        // Drag operation - always move
        await window.electronAPI.file.move(conflictData.dragNode.path, conflictData.newPath);
        addOperation({
          type: 'move',
          sourcePath: conflictData.dragNode.path,
          targetPath: conflictData.newPath,
          isDirectory: conflictData.dragNode.isDirectory,
        });
        setDraggingNode(null);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      await onRefresh();
      console.log('[FileTree] Refresh completed after replace');
    } catch (error) {
      console.error('[FileTree] Replace failed:', error);
    }

    setShowPasteConflict(false);
    setConflictData(null);
    setDontShowConflictAgain(false);
  }, [clipboard, conflictData, dontShowConflictAgain, onRefresh, addOperation]);

  // Handle paste conflict - rename
  const handleConflictRename = useCallback(async () => {
    if (!conflictData) return;

    // For paste conflicts, need clipboard; for drag conflicts, need dragNode
    if (conflictData.source === 'paste' && !clipboard) return;
    if (conflictData.source === 'drag' && !conflictData.dragNode) return;

    if (dontShowConflictAgain) {
      localStorage.setItem(PASTE_CONFLICT_STORAGE_KEY, 'true');
    }

    try {
      const targetDir = conflictData.targetIsDirectory
        ? conflictData.targetPath
        : conflictData.targetPath.substring(0, conflictData.targetPath.lastIndexOf('/'));

      // Get the name to use for renaming
      const sourceName =
        conflictData.source === 'paste' && clipboard
          ? clipboard.name
          : conflictData.dragNode?.name || '';

      // Find an available name
      let copyIndex = 1;
      let copyName = `${sourceName} copy`;
      let finalPath = `${targetDir}/${copyName}`;

      // Keep incrementing until we find an available name
      while (await window.electronAPI.file.exists(finalPath)) {
        copyIndex++;
        copyName = `${sourceName} copy ${copyIndex}`;
        finalPath = `${targetDir}/${copyName}`;
      }

      if (conflictData.source === 'paste' && clipboard) {
        // Paste operation
        if (clipboard.operation === 'copy') {
          await window.electronAPI.file.copy(clipboard.path, finalPath);
          addOperation({
            type: 'copy',
            sourcePath: clipboard.path,
            targetPath: finalPath,
            isDirectory: clipboard.isDirectory,
          });
        } else {
          await window.electronAPI.file.move(clipboard.path, finalPath);
          addOperation({
            type: 'move',
            sourcePath: clipboard.path,
            targetPath: finalPath,
            isDirectory: clipboard.isDirectory,
          });
          setClipboard(null);
        }
      } else if (conflictData.source === 'drag' && conflictData.dragNode) {
        // Drag operation - always move
        await window.electronAPI.file.move(conflictData.dragNode.path, finalPath);
        addOperation({
          type: 'move',
          sourcePath: conflictData.dragNode.path,
          targetPath: finalPath,
          isDirectory: conflictData.dragNode.isDirectory,
        });
        setDraggingNode(null);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      await onRefresh();
      console.log('[FileTree] Refresh completed after conflict rename');
    } catch (error) {
      console.error('[FileTree] Rename failed:', error);
    }

    setShowPasteConflict(false);
    setConflictData(null);
    setDontShowConflictAgain(false);
  }, [clipboard, conflictData, dontShowConflictAgain, onRefresh, addOperation]);

  // Handle paste conflict - cancel
  const handleConflictCancel = useCallback(() => {
    // Clean up drag state if it was a drag conflict
    if (conflictData?.source === 'drag') {
      setDraggingNode(null);
    }
    setShowPasteConflict(false);
    setConflictData(null);
    setDontShowConflictAgain(false);
  }, [conflictData]);

  // Handle drag events for external files
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      console.log('[FileTree] DragEnter', {
        types: e.dataTransfer.types,
        hasFiles: e.dataTransfer.types.includes('Files'),
      });

      // Only handle external files (not internal drag)
      if (e.dataTransfer.types.includes('Files') && !draggingNode) {
        dragCounterRef.current += 1;
        setIsDraggingOver(true);
        // Highlight root folder when entering root area
        if (rootPath) {
          setDraggingOverFolderPath(rootPath);
        }
      }
    },
    [draggingNode, rootPath]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Set drop effect based on modifier keys (default to copy)
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = e.altKey ? 'move' : 'copy';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
      setDraggingOverFolderPath(null);
    }
  }, []);

  // Execute internal drag drop (without confirmation)
  const executeInternalDrop = useCallback(
    async (
      targetPath: string,
      targetIsDirectory: boolean,
      dragNode: { path: string; name: string; isDirectory: boolean }
    ) => {
      console.log('[FileTree] Internal drop:', {
        from: dragNode.path,
        to: targetPath,
        targetIsDirectory,
      });

      // Don't allow dropping on self
      if (dragNode.path === targetPath) {
        setDraggingNode(null);
        return;
      }

      // Don't allow dropping parent into child
      if (targetPath.startsWith(`${dragNode.path}/`)) {
        console.warn('[FileTree] Cannot move parent into child');
        setDraggingNode(null);
        return;
      }

      // Determine target directory
      let targetDir = targetPath;
      if (!targetIsDirectory) {
        // If target is a file, use its parent directory
        targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
      }

      // Build new path
      const newPath = `${targetDir}/${dragNode.name}`;

      // Don't do anything if already in the same location
      if (dragNode.path === newPath) {
        setDraggingNode(null);
        return;
      }

      // Check if target already exists - show conflict dialog
      const exists = await window.electronAPI.file.exists(newPath);
      if (exists) {
        console.log('[FileTree] Drag target exists, showing conflict dialog');
        setConflictData({
          targetPath,
          targetIsDirectory,
          newPath,
          source: 'drag',
          dragNode,
        });
        setShowPasteConflict(true);
        return;
      }

      try {
        // Use the file move API
        await window.electronAPI.file.move(dragNode.path, newPath);
        console.log('[FileTree] Internal move completed');
        // Record operation for undo
        addOperation({
          type: 'move',
          sourcePath: dragNode.path,
          targetPath: newPath,
          isDirectory: dragNode.isDirectory,
        });
        // Small delay to ensure file system is updated before refresh
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Refresh the file tree
        await onRefresh();
        console.log('[FileTree] Refresh completed after internal move');
      } catch (error) {
        console.error('[FileTree] Internal move failed:', error);
      }

      setDraggingNode(null);
    },
    [onRefresh, addOperation]
  );

  // Handle internal drop on directory (with confirmation check)
  const handleInternalDrop = useCallback(
    async (targetPath: string, targetIsDirectory: boolean) => {
      if (!draggingNode) return;

      // Determine target directory
      let targetDir = targetPath;
      if (!targetIsDirectory) {
        targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
      }

      const newPath = `${targetDir}/${draggingNode.name}`;

      // Don't do anything if already in the same location (skip confirmation dialog)
      if (draggingNode.path === newPath) {
        setDraggingNode(null);
        return;
      }

      // Check if confirmation is disabled
      const confirmDisabled = localStorage.getItem(DRAG_CONFIRM_STORAGE_KEY) === 'true';

      if (confirmDisabled) {
        // Execute directly without confirmation
        executeInternalDrop(targetPath, targetIsDirectory, draggingNode);
      } else {
        // Show confirmation dialog - save draggingNode info and path details to pendingDragData
        setPendingDragData({
          targetPath,
          targetIsDirectory,
          draggingNode,
          sourcePath: draggingNode.path,
          targetDir,
        });
        setShowDragConfirm(true);
      }
    },
    [draggingNode, executeInternalDrop]
  );

  // Handle confirmation dialog confirm
  const handleConfirmDrag = useCallback(() => {
    if (dontShowAgain) {
      localStorage.setItem(DRAG_CONFIRM_STORAGE_KEY, 'true');
    }

    if (pendingDragData) {
      executeInternalDrop(
        pendingDragData.targetPath,
        pendingDragData.targetIsDirectory,
        pendingDragData.draggingNode
      );
    }

    setShowDragConfirm(false);
    setPendingDragData(null);
    setDontShowAgain(false);
  }, [dontShowAgain, pendingDragData, executeInternalDrop]);

  // Handle confirmation dialog cancel
  const handleCancelDrag = useCallback(() => {
    setShowDragConfirm(false);
    setPendingDragData(null);
    setDontShowAgain(false);
    setDraggingNode(null);
  }, []);

  // Ref for the FileTree container to check focus
  const fileTreeContainerRef = useRef<HTMLDivElement>(null);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when focus is within the FileTree container
      // This prevents intercepting copy/paste in Monaco editor and other inputs
      const activeElement = document.activeElement;
      if (!fileTreeContainerRef.current?.contains(activeElement)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + C - Copy
      if (modKey && e.key === 'c' && selectedNode && !editingPath) {
        e.preventDefault();
        handleCopy(
          selectedNode.path,
          selectedNode.path.split('/').pop() || '',
          selectedNode.isDirectory
        );
      }

      // Cmd/Ctrl + X - Cut
      if (modKey && e.key === 'x' && selectedNode && !editingPath) {
        e.preventDefault();
        handleCut(
          selectedNode.path,
          selectedNode.path.split('/').pop() || '',
          selectedNode.isDirectory
        );
      }

      // Cmd/Ctrl + V - Paste
      if (modKey && e.key === 'v' && clipboard && selectedNode && !editingPath) {
        e.preventDefault();
        // When a file is selected, paste to its parent directory (same level)
        // When a directory is selected, paste into that directory
        const targetPath = selectedNode.isDirectory
          ? selectedNode.path
          : selectedNode.path.substring(0, selectedNode.path.lastIndexOf('/')) || rootPath || '';
        const targetIsDirectory = true; // Parent or selected dir is always a directory
        handlePaste(targetPath, targetIsDirectory);
      }

      // Cmd/Ctrl + Z - Undo
      if (modKey && e.key === 'z' && !e.shiftKey && !editingPath) {
        e.preventDefault();
        handleUndo();
      }

      // Cmd/Ctrl + Shift + Z - Redo
      if (modKey && e.key === 'z' && e.shiftKey && !editingPath) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    selectedNode,
    clipboard,
    editingPath,
    handleCopy,
    handleCut,
    handlePaste,
    handleUndo,
    handleRedo,
    rootPath,
  ]);

  // Handle collapse all
  const handleCollapseAll = useCallback(() => {
    onToggleExpand('__COLLAPSE_ALL__');
  }, [onToggleExpand]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      console.log('[FileTree] Drop', {
        filesCount: e.dataTransfer.files.length,
        rootPath,
        onExternalDrop: !!onExternalDrop,
        hasDraggingNode: !!draggingNode,
      });

      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      setDraggingOverFolderPath(null);

      // Handle internal drag drop to root
      if (draggingNode && rootPath) {
        console.log('[FileTree] Internal drop to root');
        handleInternalDrop(rootPath, true);
        return;
      }

      // Handle external files only if not dragging internal node
      if (!draggingNode && onExternalDrop && rootPath && e.dataTransfer.files.length > 0) {
        // Default to copy for external files (move only with Alt/Option key)
        const operation = e.altKey ? 'move' : 'copy';
        console.log('[FileTree] Executing drop operation:', operation);
        onExternalDrop(e.dataTransfer.files, rootPath, operation);
      } else if (!onExternalDrop || !rootPath || !e.dataTransfer.files.length) {
        console.warn('[FileTree] Drop ignored:', {
          hasHandler: !!onExternalDrop,
          hasRootPath: !!rootPath,
          filesCount: e.dataTransfer.files.length,
        });
      }
    },
    [onExternalDrop, rootPath, draggingNode, handleInternalDrop]
  );

  // Handle internal drag start
  const handleInternalDragStart = useCallback(
    (path: string, name: string, isDirectory: boolean) => {
      console.log('[FileTree] Internal drag start:', { path, name, isDirectory });
      setDraggingNode({ path, name, isDirectory });
    },
    []
  );

  // Handle internal drag end
  const handleInternalDragEnd = useCallback(() => {
    console.log('[FileTree] Internal drag end');
    setDraggingNode(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">{t('No files')}</p>
        {rootPath && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCreateFile(rootPath)}
              className="flex items-center gap-1 text-xs hover:text-foreground"
            >
              <FilePlus className="h-3 w-3" />
              {t('New File')}
            </button>
            <button
              type="button"
              onClick={() => onCreateDirectory(rootPath)}
              className="flex items-center gap-1 text-xs hover:text-foreground"
            >
              <FolderPlus className="h-3 w-3" />
              {t('New Folder')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div
        ref={fileTreeContainerRef}
        tabIndex={-1}
        className={cn(
          'py-1 pb-20 outline-none',
          // Highlight root folder when dragging over
          draggingOverFolderPath === rootPath && 'bg-primary/10'
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleRootContextMenu}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-1 pl-2 pr-3 pb-1">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              title={t('Collapse file tree')}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const targetPath = getCreateTargetPath();
                if (targetPath) onCreateFile(targetPath);
              }}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
              title={t('New File')}
            >
              <FilePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const targetPath = getCreateTargetPath();
                if (targetPath) onCreateDirectory(targetPath);
              }}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
              title={t('New Folder')}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
              title={t('Refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
              title={t('Collapse all folders')}
            >
              <SquareMinus className="h-4 w-4" />
            </button>
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
                title={t('Search')}
              >
                <Search className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {/* Tree nodes */}
        {tree.map((node) => (
          <FileTreeNodeComponent
            key={node.path}
            node={node}
            depth={0}
            expandedPaths={expandedPaths}
            selectedPath={selectedNode?.path ?? null}
            editingPath={editingPath}
            editValue={editValue}
            onToggleExpand={onToggleExpand}
            onFileClick={(path, isDirectory) => {
              setSelectedNode({ path, isDirectory });
              if (!isDirectory) {
                onFileClick(path);
              }
            }}
            onCreateFile={onCreateFile}
            onCreateDirectory={onCreateDirectory}
            onStartRename={handleStartRename}
            onFinishRename={handleFinishRename}
            onEditValueChange={setEditValue}
            onDelete={onDelete}
            onCopyPath={handleCopyPath}
            onCopyRelativePath={handleCopyRelativePath}
            onRevealInFinder={handleRevealInFinder}
            onExternalDrop={onExternalDrop}
            onInternalDragStart={handleInternalDragStart}
            onInternalDragEnd={handleInternalDragEnd}
            onInternalDrop={handleInternalDrop}
            draggingNode={draggingNode}
            draggingOverFolderPath={draggingOverFolderPath}
            onDraggingOverFolderChange={setDraggingOverFolderPath}
            clipboard={clipboard}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onSendToSession={onSendToSession}
          />
        ))}
      </div>

      {/* Drag confirmation dialog */}
      <AlertDialog open={showDragConfirm} onOpenChange={setShowDragConfirm}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Confirm Move')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDragData && (
                <span className="block text-sm">
                  {t('Are you sure you want to move "')}
                  <span className="font-medium">{pendingDragData.draggingNode.name}</span>
                  {t('" to "')}
                  <span className="font-medium">
                    {pendingDragData.targetDir.split('/').pop() || pendingDragData.targetDir}
                  </span>
                  {t('"?')}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <div className="flex w-full items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={dontShowAgain}
                  onCheckedChange={(checked) => setDontShowAgain(checked === true)}
                />
                <span>{t("Don't show again")}</span>
              </label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancelDrag}>
                  {t('Cancel')}
                </Button>
                <Button onClick={handleConfirmDrag}>{t('Confirm')}</Button>
              </div>
            </div>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Root directory context menu */}
      <Menu open={rootMenuOpen} onOpenChange={setRootMenuOpen}>
        <MenuPopup
          className="min-w-48"
          style={{
            position: 'fixed',
            left: rootMenuPosition.x,
            top: rootMenuPosition.y,
          }}
        >
          {rootPath && (
            <>
              <MenuItem onClick={() => onCreateFile(rootPath)}>
                <FilePlus className="h-4 w-4" />
                {t('New File')}
              </MenuItem>
              <MenuItem onClick={() => onCreateDirectory(rootPath)}>
                <FolderPlus className="h-4 w-4" />
                {t('New Folder')}
              </MenuItem>
              <MenuSeparator />
            </>
          )}
          {clipboard && rootPath && (
            <MenuItem onClick={() => handlePaste(rootPath, true)}>
              <ClipboardPaste className="h-4 w-4" />
              {t('Paste')}
            </MenuItem>
          )}
          {rootPath && (
            <>
              <MenuItem onClick={() => handleCopyPath(rootPath)}>
                <Copy className="h-4 w-4" />
                {t('Copy Path')}
              </MenuItem>
              <MenuItem onClick={() => handleRevealInFinder(rootPath)}>
                <Search className="h-4 w-4" />
                {navigator.platform.toUpperCase().indexOf('MAC') >= 0
                  ? t('Reveal in Finder')
                  : t('Reveal in Explorer')}
              </MenuItem>
            </>
          )}
        </MenuPopup>
      </Menu>

      {/* Paste conflict dialog */}
      <AlertDialog open={showPasteConflict} onOpenChange={setShowPasteConflict}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('File Already Exists')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('A file or folder with this name already exists in the destination.')}
              {conflictData && (
                <>
                  <br />
                  <span className="font-medium text-sm">
                    {conflictData.source === 'paste' && clipboard
                      ? clipboard.name
                      : conflictData.dragNode?.name || ''}
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <div className="flex w-full flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={dontShowConflictAgain}
                  onCheckedChange={(checked) => setDontShowConflictAgain(checked === true)}
                />
                <span>{t("Don't show again")}</span>
              </label>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handleConflictCancel}>
                  {t('Cancel')}
                </Button>
                <Button variant="outline" onClick={handleConflictRename}>
                  {t('Rename')}
                </Button>
                <Button onClick={handleConflictReplace}>{t('Replace')}</Button>
              </div>
            </div>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </ScrollArea>
  );
}

interface FileTreeNodeComponentProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  editingPath: string | null;
  editValue: string;
  onToggleExpand: (path: string) => void;
  onFileClick: (path: string, isDirectory: boolean) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onStartRename: (path: string, currentName: string) => void;
  onFinishRename: (path: string) => void;
  onEditValueChange: (value: string) => void;
  onDelete: (path: string) => void;
  onCopyPath: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onRevealInFinder?: (path: string) => void;
  onExternalDrop?: (files: FileList, targetDir: string, operation: 'copy' | 'move') => void;
  onInternalDragStart?: (path: string, name: string, isDirectory: boolean) => void;
  onInternalDragEnd?: () => void;
  onInternalDrop?: (targetPath: string, targetIsDirectory: boolean) => void;
  draggingNode?: { path: string; name: string; isDirectory: boolean } | null;
  draggingOverFolderPath?: string | null;
  onDraggingOverFolderChange?: (path: string | null) => void;
  clipboard?: {
    path: string;
    name: string;
    isDirectory: boolean;
    operation: 'copy' | 'cut';
  } | null;
  onCopy?: (path: string, name: string, isDirectory: boolean) => void;
  onCut?: (path: string, name: string, isDirectory: boolean) => void;
  onPaste?: (targetPath: string, targetIsDirectory: boolean) => void;
  onSendToSession?: (path: string) => void;
}

// 压缩链中的节点信息
interface CompactedNodeInfo {
  path: string;
  name: string;
}

// 获取压缩后的显示信息：合并只有单个子目录的路径
function getCompactedNode(
  node: FileTreeNode,
  expandedPaths: Set<string>
): { displayName: string; actualNode: FileTreeNode; compactedChain: CompactedNodeInfo[] } {
  const compactedChain: CompactedNodeInfo[] = [{ path: node.path, name: node.name }];
  let current = node;
  let displayName = node.name;

  // 只在目录展开且只有一个子目录时压缩
  while (
    current.isDirectory &&
    expandedPaths.has(current.path) &&
    current.children?.length === 1 &&
    current.children[0].isDirectory
  ) {
    current = current.children[0];
    compactedChain.push({ path: current.path, name: current.name });
    displayName = `${displayName}/${current.name}`;
  }

  return { displayName, actualNode: current, compactedChain };
}

function FileTreeNodeComponent({
  node,
  depth,
  expandedPaths,
  selectedPath,
  editingPath,
  editValue,
  onToggleExpand,
  onFileClick,
  onCreateFile,
  onCreateDirectory,
  onStartRename,
  onFinishRename,
  onEditValueChange,
  onDelete,
  onCopyPath,
  onCopyRelativePath,
  onRevealInFinder,
  onExternalDrop,
  onInternalDragStart,
  onInternalDragEnd,
  onInternalDrop,
  draggingNode,
  draggingOverFolderPath,
  onDraggingOverFolderChange,
  clipboard,
  onCopy,
  onCut,
  onPaste,
  onSendToSession,
}: FileTreeNodeComponentProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [_isDraggingOver, setIsDraggingOver] = useState(false);
  const [isBeingDragged, setIsBeingDragged] = useState(false);

  // 获取压缩后的节点信息
  const { displayName, actualNode, compactedChain } = getCompactedNode(node, expandedPaths);
  const isExpanded = expandedPaths.has(actualNode.path);
  const isSelected = selectedPath === actualNode.path;

  // Debug: log when a node is selected
  if (isSelected) {
    console.log('[FileTreeNode] Node is selected:', {
      nodePath: actualNode.path,
      selectedPath,
      match: selectedPath === actualNode.path,
    });
  }

  // 检查压缩链中是否有正在编辑的节点
  const editingNode = compactedChain.find((n) => n.path === editingPath);
  const isEditing = !!editingNode;

  const Icon = getFileIcon(actualNode.name, actualNode.isDirectory, isExpanded);
  const iconColor = getFileIconColor(actualNode.name, actualNode.isDirectory);

  // 编辑时自动聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = useCallback(() => {
    // 总是更新选中状态
    onFileClick(actualNode.path, actualNode.isDirectory);
    if (actualNode.isDirectory) {
      // 点击压缩节点时，展开/折叠实际节点
      onToggleExpand(actualNode.path);
    }
  }, [actualNode, onToggleExpand, onFileClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Calculate menu position with boundary checks
    const menuHeight = 400; // Approximate max menu height
    const menuWidth = 250; // Approximate menu width
    const padding = 10;

    let x = e.clientX;
    let y = e.clientY;

    // Check if menu would overflow bottom
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Check if menu would overflow right
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Ensure menu doesn't go off top or left
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setMenuPosition({ x, y });
    setMenuOpen(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingPath) return;
      if (e.key === 'Enter') {
        onFinishRename(editingPath);
      } else if (e.key === 'Escape') {
        onEditValueChange('');
        onFinishRename(editingPath);
      }
    },
    [editingPath, onFinishRename, onEditValueChange]
  );

  // Handle drag events for dropping on directory nodes
  const handleNodeDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      console.log(
        '[FileTreeNode] DragEnter on:',
        actualNode.path,
        'isDirectory:',
        actualNode.isDirectory
      );

      // Calculate which folder should be highlighted
      let targetFolderPath: string;
      if (actualNode.isDirectory) {
        // Hovering over a folder - highlight that folder
        targetFolderPath = actualNode.path;
      } else {
        // Hovering over a file - highlight its parent folder
        const lastSlash = actualNode.path.lastIndexOf('/');
        targetFolderPath =
          lastSlash > 0 ? actualNode.path.substring(0, lastSlash) : actualNode.path;
      }

      console.log('[FileTreeNode] Calculated target folder:', targetFolderPath);

      // Show visual feedback for both files and directories
      if (e.dataTransfer.types.includes('Files') || draggingNode) {
        setIsDraggingOver(true);
        // Update parent's draggingOverFolderPath (this will trigger auto-expand in parent)
        if (onDraggingOverFolderChange) {
          console.log('[FileTreeNode] Setting draggingOverFolderPath to:', targetFolderPath);
          onDraggingOverFolderChange(targetFolderPath);
        }
      }
    },
    [actualNode.isDirectory, actualNode.path, draggingNode, onDraggingOverFolderChange]
  );

  const handleNodeDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Allow drop on both files and directories (files will drop to parent folder)
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = e.altKey ? 'move' : 'copy';
    }
  }, []);

  const handleNodeDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      console.log('[FileTreeNode] DragLeave on:', actualNode.path);
      setIsDraggingOver(false);
    },
    [actualNode.path]
  );

  const handleNodeDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      console.log('[FileTreeNode] Drop on:', actualNode.path);

      // Clear the folder highlighting
      if (onDraggingOverFolderChange) {
        onDraggingOverFolderChange(null);
      }

      // Determine target directory
      // If dropping on a file, use its parent directory
      // If dropping on a directory, use the directory itself
      let targetDir: string;
      if (actualNode.isDirectory) {
        targetDir = actualNode.path;
      } else {
        // Get parent directory of the file
        const lastSlash = actualNode.path.lastIndexOf('/');
        targetDir = lastSlash > 0 ? actualNode.path.substring(0, lastSlash) : actualNode.path;
      }

      // Handle internal drag drop
      if (draggingNode && onInternalDrop) {
        onInternalDrop(targetDir, true); // Always treat as directory since we computed the folder
        return;
      }

      // Handle external drag drop
      if (!onExternalDrop || !e.dataTransfer.files.length) return;

      // Default to copy for external files (move only with Alt/Option key)
      const operation = e.altKey ? 'move' : 'copy';
      onExternalDrop(e.dataTransfer.files, targetDir, operation);
    },
    [
      actualNode.isDirectory,
      actualNode.path,
      onExternalDrop,
      draggingNode,
      onInternalDrop,
      onDraggingOverFolderChange,
    ]
  );

  // Handle internal drag start
  const handleInternalDragStart = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      setIsBeingDragged(true);
      // Set drag data
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', actualNode.path);

      if (onInternalDragStart) {
        onInternalDragStart(actualNode.path, actualNode.name, actualNode.isDirectory);
      }
    },
    [actualNode.path, actualNode.name, actualNode.isDirectory, onInternalDragStart]
  );

  // Handle internal drag end
  const handleInternalDragEnd = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      setIsBeingDragged(false);

      if (onInternalDragEnd) {
        onInternalDragEnd();
      }
    },
    [onInternalDragEnd]
  );

  // Check if this folder should be highlighted (only exact match)
  const shouldHighlightThisFolder =
    actualNode.isDirectory && draggingOverFolderPath === actualNode.path;

  return (
    <div className={cn(shouldHighlightThisFolder && 'bg-primary/10 rounded-sm')}>
      {/* Tree node row */}
      <div
        role="button"
        tabIndex={0}
        draggable={!isEditing}
        data-node-path={actualNode.path}
        className={cn(
          'flex h-7 cursor-pointer select-none items-center gap-1 rounded-sm px-2 text-sm hover:bg-accent/50',
          isSelected && 'bg-accent text-accent-foreground',
          actualNode.ignored && 'opacity-50',
          isBeingDragged && 'opacity-40'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        onDragStart={handleInternalDragStart}
        onDragEnd={handleInternalDragEnd}
        onDragEnter={handleNodeDragEnter}
        onDragOver={handleNodeDragOver}
        onDragLeave={handleNodeDragLeave}
        onDrop={handleNodeDrop}
      >
        {/* Chevron for directories */}
        {actualNode.isDirectory ? (
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        ) : (
          <span className="w-4" />
        )}

        {/* Icon */}
        {actualNode.isLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
        )}

        {/* Name or input */}
        {isEditing && editingPath ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onBlur={() => onFinishRename(editingPath)}
            onKeyDown={handleKeyDown}
            className="h-5 min-w-0 flex-1 rounded border border-ring bg-background px-1 py-0 text-sm outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" title={actualNode.path}>
            {displayName}
          </span>
        )}
      </div>

      {/* Context Menu */}
      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuPopup
          className="min-w-48"
          style={{
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
          }}
        >
          {actualNode.isDirectory && (
            <>
              <MenuItem onClick={() => onCreateFile(actualNode.path)}>
                <FilePlus className="h-4 w-4" />
                {t('New File')}
              </MenuItem>
              <MenuItem onClick={() => onCreateDirectory(actualNode.path)}>
                <FolderPlus className="h-4 w-4" />
                {t('New Folder')}
              </MenuItem>
              <MenuSeparator />
            </>
          )}
          {compactedChain.length === 1 ? (
            <MenuItem onClick={() => onStartRename(node.path, node.name)}>
              <Pencil className="h-4 w-4" />
              {t('Rename')}
            </MenuItem>
          ) : (
            <>
              <MenuItem disabled inset>
                <Pencil className="h-4 w-4" />
                {t('Rename')}
              </MenuItem>
              {compactedChain.map((n) => (
                <MenuItem key={n.path} inset onClick={() => onStartRename(n.path, n.name)}>
                  {n.name}
                </MenuItem>
              ))}
            </>
          )}
          <MenuSeparator />
          {onCopy && (
            <MenuItem
              onClick={() => onCopy(actualNode.path, actualNode.name, actualNode.isDirectory)}
            >
              <Clipboard className="h-4 w-4" />
              {t('Copy')}
            </MenuItem>
          )}
          {onCut && (
            <MenuItem
              onClick={() => onCut(actualNode.path, actualNode.name, actualNode.isDirectory)}
            >
              <Scissors className="h-4 w-4" />
              {t('Cut')}
            </MenuItem>
          )}
          {actualNode.isDirectory && clipboard && onPaste && (
            <MenuItem onClick={() => onPaste(actualNode.path, actualNode.isDirectory)}>
              <ClipboardPaste className="h-4 w-4" />
              {t('Paste')}
            </MenuItem>
          )}
          <MenuItem onClick={() => onCopyPath(actualNode.path)}>
            <Copy className="h-4 w-4" />
            {t('Copy Path')}
          </MenuItem>
          {onCopyRelativePath && (
            <MenuItem onClick={() => onCopyRelativePath(actualNode.path)}>
              <Copy className="h-4 w-4" />
              {t('Copy Relative Path')}
            </MenuItem>
          )}
          {onRevealInFinder && (
            <MenuItem onClick={() => onRevealInFinder(actualNode.path)}>
              <Search className="h-4 w-4" />
              {navigator.platform.toUpperCase().indexOf('MAC') >= 0
                ? t('Reveal in Finder')
                : t('Reveal in Explorer')}
            </MenuItem>
          )}
          {onSendToSession && (
            <MenuItem onClick={() => onSendToSession(actualNode.path)}>
              <MessageSquarePlus className="h-4 w-4" />
              {t('Send to Session')}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={() => onDelete(actualNode.path)}>
            <Trash2 className="h-4 w-4" />
            {t('Delete')}
          </MenuItem>
        </MenuPopup>
      </Menu>

      {/* Children - 渲染 actualNode 的子节点 */}
      <AnimatePresence initial={false}>
        {actualNode.isDirectory && isExpanded && actualNode.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {actualNode.children.map((child) => (
              <FileTreeNodeComponent
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
                editingPath={editingPath}
                editValue={editValue}
                onToggleExpand={onToggleExpand}
                onFileClick={onFileClick}
                onCreateFile={onCreateFile}
                onCreateDirectory={onCreateDirectory}
                onStartRename={onStartRename}
                onFinishRename={onFinishRename}
                onEditValueChange={onEditValueChange}
                onDelete={onDelete}
                onCopyPath={onCopyPath}
                onCopyRelativePath={onCopyRelativePath}
                onRevealInFinder={onRevealInFinder}
                onExternalDrop={onExternalDrop}
                onInternalDragStart={onInternalDragStart}
                onInternalDragEnd={onInternalDragEnd}
                onInternalDrop={onInternalDrop}
                draggingNode={draggingNode}
                draggingOverFolderPath={draggingOverFolderPath}
                onDraggingOverFolderChange={onDraggingOverFolderChange}
                clipboard={clipboard}
                onCopy={onCopy}
                onCut={onCut}
                onPaste={onPaste}
                onSendToSession={onSendToSession}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
