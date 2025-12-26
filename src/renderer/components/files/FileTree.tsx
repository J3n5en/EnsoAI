import {
  ChevronRight,
  Copy,
  FilePlus,
  FolderPlus,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Menu, MenuItem, MenuPopup, MenuSeparator } from '@/components/ui/menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { FileTreeNode } from '@/hooks/useFileTree';
import { cn } from '@/lib/utils';
import { getFileIcon, getFileIconColor } from './fileIcons';

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
  isLoading?: boolean;
  rootPath?: string;
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
  isLoading,
  rootPath,
}: FileTreeProps) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

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
        <p className="text-sm">No files</p>
        {rootPath && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCreateFile(rootPath)}
              className="flex items-center gap-1 text-xs hover:text-foreground"
            >
              <FilePlus className="h-3 w-3" />
              New File
            </button>
            <button
              type="button"
              onClick={() => onCreateDirectory(rootPath)}
              className="flex items-center gap-1 text-xs hover:text-foreground"
            >
              <FolderPlus className="h-3 w-3" />
              New Folder
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {/* Toolbar */}
        <div className="flex items-center justify-end gap-1 px-2 pb-1">
          <button
            type="button"
            onClick={() => rootPath && onCreateFile(rootPath)}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title="New File"
          >
            <FilePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rootPath && onCreateDirectory(rootPath)}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title="New Folder"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {/* Tree nodes */}
        {tree.map((node) => (
          <FileTreeNodeComponent
            key={node.path}
            node={node}
            depth={0}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            editingPath={editingPath}
            editValue={editValue}
            onToggleExpand={onToggleExpand}
            onFileClick={(path) => {
              setSelectedPath(path);
              onFileClick(path);
            }}
            onCreateFile={onCreateFile}
            onCreateDirectory={onCreateDirectory}
            onStartRename={handleStartRename}
            onFinishRename={handleFinishRename}
            onEditValueChange={setEditValue}
            onDelete={onDelete}
            onCopyPath={handleCopyPath}
          />
        ))}
      </div>
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
  onFileClick: (path: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onStartRename: (path: string, currentName: string) => void;
  onFinishRename: (path: string) => void;
  onEditValueChange: (value: string) => void;
  onDelete: (path: string) => void;
  onCopyPath: (path: string) => void;
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
}: FileTreeNodeComponentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isEditing = editingPath === node.path;

  const Icon = getFileIcon(node.name, node.isDirectory, isExpanded);
  const iconColor = getFileIconColor(node.name, node.isDirectory);

  const handleClick = useCallback(() => {
    if (node.isDirectory) {
      onToggleExpand(node.path);
    } else {
      onFileClick(node.path);
    }
  }, [node, onToggleExpand, onFileClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onFinishRename(node.path);
      } else if (e.key === 'Escape') {
        onEditValueChange('');
        onFinishRename(node.path);
      }
    },
    [node.path, onFinishRename, onEditValueChange]
  );

  return (
    <div>
      {/* Tree node row */}
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'flex h-7 cursor-pointer select-none items-center gap-1 rounded-sm px-2 text-sm hover:bg-accent/50',
          isSelected && 'bg-accent text-accent-foreground',
          node.ignored && 'opacity-50'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        {/* Chevron for directories */}
        {node.isDirectory ? (
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
        {node.isLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
        )}

        {/* Name or input */}
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onBlur={() => onFinishRename(node.path)}
            onKeyDown={handleKeyDown}
            className="h-5 min-w-0 flex-1 px-1 py-0 text-sm"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        )}
      </div>

      {/* Context Menu */}
      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuPopup
          style={{
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
          }}
        >
          {node.isDirectory && (
            <>
              <MenuItem onClick={() => onCreateFile(node.path)}>
                <FilePlus className="h-4 w-4" />
                New File
              </MenuItem>
              <MenuItem onClick={() => onCreateDirectory(node.path)}>
                <FolderPlus className="h-4 w-4" />
                New Folder
              </MenuItem>
              <MenuSeparator />
            </>
          )}
          <MenuItem onClick={() => onStartRename(node.path, node.name)}>
            <Pencil className="h-4 w-4" />
            Rename
          </MenuItem>
          <MenuItem onClick={() => onCopyPath(node.path)}>
            <Copy className="h-4 w-4" />
            Copy Path
          </MenuItem>
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={() => onDelete(node.path)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </MenuItem>
        </MenuPopup>
      </Menu>

      {/* Children */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
