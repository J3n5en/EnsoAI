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
      return window.electronAPI.file.list(rootPath, rootPath);
    },
    enabled: enabled && !!rootPath,
  });

  // Build tree structure with expanded directories
  const [tree, setTree] = useState<FileTreeNode[]>([]);

  // Update tree when root files change - merge to preserve loaded children
  useEffect(() => {
    if (rootFiles) {
      setTree((currentTree) => {
        // 合并新数据，保留已加载的 children
        const mergeNodes = (newNodes: FileEntry[], oldNodes: FileTreeNode[]): FileTreeNode[] => {
          return newNodes.map((newNode) => {
            const oldNode = oldNodes.find((o) => o.path === newNode.path);
            if (oldNode?.children) {
              // 保留已加载的 children
              return { ...newNode, children: oldNode.children };
            }
            return { ...newNode };
          });
        };
        return mergeNodes(rootFiles, currentTree);
      });
    }
  }, [rootFiles]);

  // Load children for a directory
  const loadChildren = useCallback(
    async (path: string): Promise<FileEntry[]> => {
      const cached = queryClient.getQueryData<FileEntry[]>(['file', 'list', path]);
      if (cached) return cached;

      const files = await window.electronAPI.file.list(path, rootPath);
      queryClient.setQueryData(['file', 'list', path], files);
      return files;
    },
    [queryClient, rootPath]
  );

  // 递归更新树，设置整个子目录链的 children
  const updateTreeWithChain = useCallback(
    (nodes: FileTreeNode[], targetPath: string, chainChildren: FileTreeNode[]): FileTreeNode[] => {
      return nodes.map((node) => {
        if (node.path === targetPath) {
          return { ...node, children: chainChildren, isLoading: false };
        }
        if (node.children) {
          return {
            ...node,
            children: updateTreeWithChain(node.children, targetPath, chainChildren),
          };
        }
        return node;
      });
    },
    []
  );

  // Toggle directory expansion
  const toggleExpand = useCallback(
    async (path: string) => {
      // Special case: collapse all
      if (path === '__COLLAPSE_ALL__') {
        setExpandedPaths(new Set());
        return;
      }

      const newExpanded = new Set(expandedPaths);

      if (newExpanded.has(path)) {
        // 折叠时，同时折叠所有被压缩的子目录
        const collectCompactedPaths = (nodes: FileTreeNode[], targetPath: string): string[] => {
          for (const node of nodes) {
            if (node.path === targetPath && node.isDirectory) {
              // 始终包含目标路径，即使 children 不存在（加载失败的情况）
              const paths = [targetPath];
              if (node.children) {
                let current = node;
                while (
                  current.children?.length === 1 &&
                  current.children[0].isDirectory &&
                  newExpanded.has(current.children[0].path)
                ) {
                  current = current.children[0];
                  paths.push(current.path);
                }
              }
              return paths;
            }
            if (node.children) {
              const found = collectCompactedPaths(node.children, targetPath);
              if (found.length > 0) return found;
            }
          }
          // 如果节点未在树中找到（边缘情况），仍删除目标路径
          return [targetPath];
        };

        const pathsToCollapse = collectCompactedPaths(tree, path);
        for (const p of pathsToCollapse) {
          newExpanded.delete(p);
        }
        setExpandedPaths(newExpanded);
      } else {
        // 展开时，自动加载单子目录链
        const markLoading = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map((node) => {
            if (node.path === path && node.isDirectory && !node.children) {
              return { ...node, isLoading: true };
            }
            if (node.children) {
              return { ...node, children: markLoading(node.children) };
            }
            return node;
          });
        };

        const clearLoading = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map((node) => {
            if (node.path === path && node.isLoading) {
              return { ...node, isLoading: false };
            }
            if (node.children) {
              return { ...node, children: clearLoading(node.children) };
            }
            return node;
          });
        };

        // 检查是否需要加载
        const needsLoad = (nodes: FileTreeNode[]): boolean => {
          for (const node of nodes) {
            if (node.path === path && node.isDirectory && !node.children) return true;
            if (node.children && needsLoad(node.children)) return true;
          }
          return false;
        };

        newExpanded.add(path);
        setExpandedPaths(newExpanded);

        if (needsLoad(tree)) {
          setTree((current) => markLoading(current));

          try {
            // 加载整个单子目录链
            const children = await loadChildren(path);
            const allPaths = [path];
            const finalChildren = children.map((c) => ({ ...c })) as FileTreeNode[];

            // 如果只有一个子目录，继续加载链
            if (children.length === 1 && children[0].isDirectory) {
              const loadChain = async (
                dirPath: string,
                _nodes: FileTreeNode[]
              ): Promise<FileTreeNode[]> => {
                const dirChildren = await loadChildren(dirPath);
                allPaths.push(dirPath);

                const childNodes = dirChildren.map((c) => ({ ...c })) as FileTreeNode[];

                if (dirChildren.length === 1 && dirChildren[0].isDirectory) {
                  childNodes[0].children = await loadChain(dirChildren[0].path, childNodes);
                }

                return childNodes;
              };

              finalChildren[0].children = await loadChain(children[0].path, finalChildren);
            }

            // 更新展开状态
            setExpandedPaths((prev) => {
              const next = new Set(prev);
              for (const p of allPaths) next.add(p);
              return next;
            });

            // 更新树
            setTree((current) => updateTreeWithChain(current, path, finalChildren));
          } catch (error) {
            // 加载失败时回滚状态
            setExpandedPaths((prev) => {
              const next = new Set(prev);
              next.delete(path);
              return next;
            });
            setTree((current) => clearLoading(current));
            console.error('Failed to load directory children:', error);
          }
        }
      }
    },
    [expandedPaths, loadChildren, tree, updateTreeWithChain]
  );

  // Use ref to access expandedPaths in effect without causing re-runs
  const expandedPathsRef = useRef(expandedPaths);
  expandedPathsRef.current = expandedPaths;

  // 递归更新树中某个目录的 children
  const refreshNodeChildren = useCallback(
    async (targetPath: string) => {
      try {
        const newChildren = await window.electronAPI.file.list(targetPath, rootPath);
        queryClient.setQueryData(['file', 'list', targetPath], newChildren);

        setTree((current) => {
          const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
            return nodes.map((node) => {
              if (node.path === targetPath && node.children) {
                // 合并新数据，保留子目录已加载的 children
                const mergedChildren = newChildren.map((newChild) => {
                  const oldChild = node.children?.find((o) => o.path === newChild.path);
                  if (oldChild?.children) {
                    return { ...newChild, children: oldChild.children };
                  }
                  return { ...newChild };
                });
                return { ...node, children: mergedChildren as FileTreeNode[] };
              }
              if (node.children) {
                return { ...node, children: updateNode(node.children) };
              }
              return node;
            });
          };
          return updateNode(current);
        });
      } catch (error) {
        // Directory was deleted - remove from expanded paths and tree
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          queryClient.removeQueries({ queryKey: ['file', 'list', targetPath] });
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            // Remove this path and all children paths
            for (const p of prev) {
              if (p === targetPath || p.startsWith(`${targetPath}/`)) {
                next.delete(p);
              }
            }
            return next;
          });
        }
      }
    },
    [queryClient, rootPath]
  );

  // Track if we need to refresh when becoming active
  const needsRefreshOnActiveRef = useRef(false);

  // Use ref for isActive to avoid effect re-runs on tab switch
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // File watch effect - always watch, but only update UI when active
  useEffect(() => {
    if (!rootPath || !enabled) return;

    // Start watching
    window.electronAPI.file.watchStart(rootPath);

    // Listen for changes
    const unsubscribe = window.electronAPI.file.onChange(async (event) => {
      const parentPath = event.path.substring(0, event.path.lastIndexOf('/')) || rootPath;

      // Always invalidate cache regardless of isActive
      if (parentPath !== rootPath) {
        queryClient.removeQueries({ queryKey: ['file', 'list', parentPath] });
      }

      // If not active, mark for refresh when becoming active
      if (!isActiveRef.current) {
        needsRefreshOnActiveRef.current = true;
        return;
      }

      if (parentPath === rootPath) {
        // Root directory change - refetch immediately
        await queryClient.refetchQueries({ queryKey: ['file', 'list', rootPath] });
      } else if (expandedPathsRef.current.has(parentPath)) {
        // Expanded subdirectory change - refresh its children
        await refreshNodeChildren(parentPath);
      }

      // If the changed path itself is an expanded directory, refresh its children
      if (expandedPathsRef.current.has(event.path)) {
        await refreshNodeChildren(event.path);
      }
    });

    return () => {
      unsubscribe();
      window.electronAPI.file.watchStop(rootPath);
    };
  }, [rootPath, enabled, queryClient, refreshNodeChildren]);

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

  const refresh = useCallback(async () => {
    console.log('[useFileTree] Refresh started');
    // Force invalidate all cached queries first
    queryClient.invalidateQueries({ queryKey: ['file', 'list'] });

    // Refetch root directory first
    await queryClient.refetchQueries({ queryKey: ['file', 'list', rootPath] });
    console.log('[useFileTree] Root refetched');

    // Refetch all expanded directories in parallel
    const currentExpanded = Array.from(expandedPathsRef.current);
    console.log('[useFileTree] Refetching expanded paths:', currentExpanded);
    await Promise.all(
      currentExpanded.filter((path) => path !== rootPath).map((path) => refreshNodeChildren(path))
    );
    console.log('[useFileTree] Refresh completed');
  }, [queryClient, rootPath, refreshNodeChildren]);

  // Handle external file drop
  const handleExternalDrop = useCallback(
    async (
      files: FileList,
      targetDir: string,
      operation: 'copy' | 'move'
    ): Promise<{
      success: string[];
      failed: Array<{ path: string; error: string }>;
      conflicts?: Array<{
        path: string;
        name: string;
        sourceSize: number;
        targetSize: number;
        sourceModified: number;
        targetModified: number;
      }>;
    }> => {
      console.log('[useFileTree] handleExternalDrop', {
        filesCount: files.length,
        targetDir,
        operation,
        rootPath,
      });

      if (!rootPath) {
        console.warn('[useFileTree] No rootPath');
        return { success: [], failed: [] };
      }

      // Convert FileList to array of paths
      const sourcePaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log('[useFileTree] Processing file:', {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        // Get the full path from the file using Electron's webUtils
        try {
          const filePath = window.electronAPI.utils.getPathForFile(file);
          console.log('[useFileTree] File path:', filePath);
          if (filePath) {
            sourcePaths.push(filePath);
          }
        } catch (error) {
          console.error('[useFileTree] Failed to get file path:', error);
        }
      }

      console.log('[useFileTree] Source paths:', sourcePaths);

      if (sourcePaths.length === 0) {
        console.warn('[useFileTree] No valid source paths');
        return { success: [], failed: [] };
      }

      // Check for conflicts
      console.log('[useFileTree] Checking conflicts...');
      const conflicts = await window.electronAPI.file.checkConflicts(sourcePaths, targetDir);
      console.log('[useFileTree] Conflicts:', conflicts);

      if (conflicts.length > 0) {
        // Return conflicts to be handled by the UI
        return { success: [], failed: [], conflicts };
      }

      // No conflicts, proceed with operation
      try {
        console.log('[useFileTree] Executing operation:', operation);
        if (operation === 'copy') {
          const result = await window.electronAPI.file.batchCopy(sourcePaths, targetDir, []);
          console.log('[useFileTree] Copy result:', result);
          await refresh();
          return result;
        }
        const result = await window.electronAPI.file.batchMove(sourcePaths, targetDir, []);
        console.log('[useFileTree] Move result:', result);
        await refresh();
        return result;
      } catch (error) {
        console.error('[useFileTree] Operation failed:', error);
        return {
          success: [],
          failed: sourcePaths.map((path) => ({
            path,
            error: error instanceof Error ? error.message : 'Unknown error',
          })),
        };
      }
    },
    [rootPath, refresh]
  );

  // Resolve conflicts and complete file operation
  const resolveConflictsAndContinue = useCallback(
    async (
      sourcePaths: string[],
      targetDir: string,
      operation: 'copy' | 'move',
      resolutions: Array<{ path: string; action: 'replace' | 'skip' | 'rename'; newName?: string }>
    ): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> => {
      try {
        if (operation === 'copy') {
          const result = await window.electronAPI.file.batchCopy(
            sourcePaths,
            targetDir,
            resolutions
          );
          await refresh();
          return result;
        }
        const result = await window.electronAPI.file.batchMove(sourcePaths, targetDir, resolutions);
        await refresh();
        return result;
      } catch (error) {
        console.error('Failed to resolve conflicts:', error);
        return {
          success: [],
          failed: sourcePaths.map((path) => ({
            path,
            error: error instanceof Error ? error.message : 'Unknown error',
          })),
        };
      }
    },
    [refresh]
  );

  // Refresh when becoming active if changes occurred while inactive
  useEffect(() => {
    if (isActive && needsRefreshOnActiveRef.current) {
      needsRefreshOnActiveRef.current = false;
      refresh();
    }
  }, [isActive, refresh]);

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
    handleExternalDrop,
    resolveConflictsAndContinue,
  };
}

export type { FileTreeNode };
