import type { FileEntry } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import { getFileIcon, getFileIconColor } from './fileIcons';

// Query key constants to avoid magic strings
const QUERY_KEYS = {
  FILE_LIST: ['file', 'list'] as const,
};

interface BreadcrumbTreeMenuProps {
  children: React.ReactNode;
  dirPath: string;
  rootPath: string;
  onFileClick: (path: string) => void;
  onNavigateToFile?: (path: string) => Promise<void>;
  activeTabPath: string | null;
}

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  isLoading?: boolean;
}

// Helper function to toggle path in a Set
const togglePathInSet = (set: Set<string>, path: string): Set<string> => {
  const newSet = new Set(set);
  if (newSet.has(path)) {
    newSet.delete(path);
  } else {
    newSet.add(path);
  }
  return newSet;
};

export function BreadcrumbTreeMenu({
  children,
  dirPath,
  rootPath,
  onFileClick,
  onNavigateToFile,
  activeTabPath,
}: BreadcrumbTreeMenuProps) {
  const queryClient = useQueryClient();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [tree, setTree] = useState<TreeNode[]>([]);

  // Use refs to avoid callback recreation
  const treeRef = useRef(tree);
  const expandedPathsRef = useRef(expandedPaths);

  // Keep refs in sync with state
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  useEffect(() => {
    expandedPathsRef.current = expandedPaths;
  }, [expandedPaths]);

  // Determine if dirPath is a file or directory by checking breadcrumb context
  // The last segment in breadcrumb is always the active file, show its parent's contents
  const { listPath } = useMemo(() => {
    if (!dirPath) return { listPath: dirPath };

    // Check if this path is the active file (last breadcrumb segment)
    const isActiveFile = activeTabPath === dirPath;

    if (isActiveFile) {
      // For the file segment, show parent directory's contents
      const parts = dirPath.split('/');
      parts.pop(); // Remove file name
      const parentDir = parts.join('/');
      return {
        listPath: parentDir || dirPath, // Fallback to dirPath if no parent
      };
    }

    return {
      listPath: dirPath,
    };
  }, [dirPath, activeTabPath]);

  // Fetch directory contents - reuse file tree cache by using same queryKey
  const { data: entries = [], isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.FILE_LIST, listPath],
    queryFn: async () => {
      if (!listPath || !rootPath) return [];
      return window.electronAPI.file.list(listPath, rootPath);
    },
    enabled: !!listPath && !!rootPath,
  });

  // Build tree: current directory + its children, reset when listPath changes
  useEffect(() => {
    if (!listPath) return;

    // Reset expanded paths when switching directories
    setExpandedPaths(new Set());

    setTree(() => {
      // Map entries to tree nodes
      const entryNodes = entries.map(
        (entry) =>
          ({
            ...entry,
            children: undefined,
          }) as TreeNode
      );

      return entryNodes;
    });
  }, [listPath, entries]);

  // Load children for a directory
  const loadChildren = useCallback(
    async (path: string): Promise<FileEntry[]> => {
      const cached = queryClient.getQueryData<FileEntry[]>([...QUERY_KEYS.FILE_LIST, path]);
      if (cached) return cached;

      const files = await window.electronAPI.file.list(path, rootPath);
      queryClient.setQueryData([...QUERY_KEYS.FILE_LIST, path], files);
      return files;
    },
    [queryClient, rootPath]
  );

  const toggleExpand = useCallback(
    async (e: React.MouseEvent, path: string) => {
      e.stopPropagation();

      // Use helper function to avoid duplicate code
      const newExpanded = togglePathInSet(expandedPathsRef.current, path);
      setExpandedPaths(newExpanded);

      // Load children if expanding and not already loaded
      const node = treeRef.current.find((n) => n.path === path);
      if (node && !node.children && !expandedPathsRef.current.has(path)) {
        setTree((current) => current.map((n) => (n.path === path ? { ...n, isLoading: true } : n)));

        try {
          const children = await loadChildren(path);
          const childNodes = children.map((c) => ({ ...c })) as TreeNode[];

          setTree((current) =>
            current.map((n) =>
              n.path === path ? { ...n, children: childNodes, isLoading: false } : n
            )
          );
        } catch (_error) {
          // Remove from expanded on error using helper
          setExpandedPaths((prev) => togglePathInSet(prev, path));
          setTree((current) =>
            current.map((n) => (n.path === path ? { ...n, isLoading: false } : n))
          );
        }
      }
    },
    [loadChildren]
  );

  const handleNodeClick = useCallback(
    (node: TreeNode) => {
      try {
        // Directories: use onFileClick (synchronous, for navigation)
        // Files: use onNavigateToFile (handles both new and existing tabs)
        if (node.isDirectory) {
          onFileClick(node.path);
        } else if (onNavigateToFile) {
          // Fire and forget - don't await to avoid blocking UI
          onNavigateToFile(node.path).catch((error) => {
            console.error('Failed to open file:', node.path, error);
          });
        } else {
          onFileClick(node.path);
        }
      } catch (error) {
        console.error('Failed to open file:', node.path, error);
      }
    },
    [onFileClick, onNavigateToFile]
  );

  const renderTree = useCallback(
    (nodes: TreeNode[], currentLevel: number): React.ReactNode => {
      return nodes.map((node) => {
        const Icon = getFileIcon(node.name, node.isDirectory);
        const iconColor = getFileIconColor(node.name, node.isDirectory);
        const isExpanded = expandedPaths.has(node.path);
        const isActive = node.path === activeTabPath;

        return (
          <div key={node.path}>
            <MenuItem
              className={cn('min-h-7', isActive && 'bg-accent/50', node.isDirectory && 'pr-2')}
              style={{ paddingLeft: `${currentLevel * 12 + 8}px` }}
              onClick={() => handleNodeClick(node)}
            >
              {node.isDirectory && node.isLoading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground animate-spin" />
              ) : node.isDirectory ? (
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                  onClick={(e) => toggleExpand(e, node.path)}
                />
              ) : (
                <span className="w-3.5" />
              )}
              <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
              <span className="ml-1 flex-1 truncate">{node.name}</span>
            </MenuItem>

            {/* Render children if directory is expanded */}
            {node.isDirectory &&
              isExpanded &&
              node.children &&
              renderTree(node.children, currentLevel + 1)}
          </div>
        );
      });
    },
    [expandedPaths, activeTabPath, handleNodeClick, toggleExpand]
  );

  return (
    <Menu>
      <MenuTrigger>{children}</MenuTrigger>
      <MenuPopup align="start" sideOffset={4} className="max-h-80">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : tree.length === 0 ? (
          <div className="py-2 text-center text-muted-foreground text-xs">Empty directory</div>
        ) : (
          <div className="py-1">{renderTree(tree, 0)}</div>
        )}
      </MenuPopup>
    </Menu>
  );
}
