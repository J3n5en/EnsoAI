import type { FileEntry } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFileTreeOptions {
  rootPath: string | undefined;
  enabled?: boolean;
  isActive?: boolean;
}

interface FileTreeNode extends FileEntry {
  children?: FileTreeNode[];
  isLoading?: boolean;
}

export function useFileTree({ rootPath, enabled = true, isActive = true }: UseFileTreeOptions) {
  const queryClient = useQueryClient();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Fetch root directory
  const { data: rootFiles, isLoading: isRootLoading } = useQuery({
    queryKey: ['file', 'list', rootPath],
    queryFn: async () => {
      if (!rootPath) return [];
      return window.electronAPI.file.list(rootPath);
    },
    enabled: enabled && !!rootPath,
  });

  // Build tree structure with expanded directories
  const [tree, setTree] = useState<FileTreeNode[]>([]);

  // Update tree when root files change
  useEffect(() => {
    if (rootFiles) {
      setTree(rootFiles.map((file) => ({ ...file })));
    }
  }, [rootFiles]);

  // Load children for a directory
  const loadChildren = useCallback(
    async (path: string): Promise<FileEntry[]> => {
      const cached = queryClient.getQueryData<FileEntry[]>(['file', 'list', path]);
      if (cached) return cached;

      const files = await window.electronAPI.file.list(path);
      queryClient.setQueryData(['file', 'list', path], files);
      return files;
    },
    [queryClient]
  );

  // Toggle directory expansion
  const toggleExpand = useCallback(
    async (path: string) => {
      const newExpanded = new Set(expandedPaths);

      if (newExpanded.has(path)) {
        newExpanded.delete(path);
        setExpandedPaths(newExpanded);
      } else {
        newExpanded.add(path);
        setExpandedPaths(newExpanded);

        // Load children if not already loaded
        const updateTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map((node) => {
            if (node.path === path && node.isDirectory) {
              if (!node.children) {
                // Mark as loading and fetch
                loadChildren(path).then((children) => {
                  setTree((current) =>
                    updateNodeChildren(
                      current,
                      path,
                      children.map((c) => ({ ...c }))
                    )
                  );
                });
                return { ...node, isLoading: true };
              }
            }
            if (node.children) {
              return { ...node, children: updateTree(node.children) };
            }
            return node;
          });
        };

        setTree((current) => updateTree(current));
      }
    },
    [expandedPaths, loadChildren]
  );

  // Use ref to access expandedPaths in effect without causing re-runs
  const expandedPathsRef = useRef(expandedPaths);
  expandedPathsRef.current = expandedPaths;

  // File watch effect - only watch when active
  useEffect(() => {
    if (!rootPath || !enabled || !isActive) return;

    // Start watching
    window.electronAPI.file.watchStart(rootPath);

    // Listen for changes
    const unsubscribe = window.electronAPI.file.onChange((event) => {
      // Invalidate the parent directory query
      const parentPath = event.path.substring(0, event.path.lastIndexOf('/')) || rootPath;
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });

      // If it's a directory that was expanded, refresh its children
      if (expandedPathsRef.current.has(event.path)) {
        queryClient.invalidateQueries({ queryKey: ['file', 'list', event.path] });
      }
    });

    return () => {
      unsubscribe();
      window.electronAPI.file.watchStop(rootPath);
    };
  }, [rootPath, enabled, isActive, queryClient]);

  // File operations
  const createFile = useCallback(
    async (path: string, content = '') => {
      await window.electronAPI.file.createFile(path, content);
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });
    },
    [queryClient]
  );

  const createDirectory = useCallback(
    async (path: string) => {
      await window.electronAPI.file.createDirectory(path);
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });
    },
    [queryClient]
  );

  const renameItem = useCallback(
    async (fromPath: string, toPath: string) => {
      await window.electronAPI.file.rename(fromPath, toPath);
      const parentPath = fromPath.substring(0, fromPath.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });
    },
    [queryClient]
  );

  const deleteItem = useCallback(
    async (path: string) => {
      await window.electronAPI.file.delete(path);
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      queryClient.invalidateQueries({ queryKey: ['file', 'list', parentPath] });
    },
    [queryClient]
  );

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['file', 'list'] });
  }, [queryClient]);

  return {
    tree,
    isLoading: isRootLoading,
    expandedPaths,
    toggleExpand,
    createFile,
    createDirectory,
    renameItem,
    deleteItem,
    refresh,
  };
}

function updateNodeChildren(
  nodes: FileTreeNode[],
  targetPath: string,
  children: FileTreeNode[]
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children, isLoading: false };
    }
    if (node.children) {
      return { ...node, children: updateNodeChildren(node.children, targetPath, children) };
    }
    return node;
  });
}

export type { FileTreeNode };
