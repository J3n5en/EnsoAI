import type {
  ConflictResolution,
  GitWorktree,
  WorktreeCreateOptions,
  WorktreeMergeCleanupOptions,
  WorktreeMergeOptions,
  WorktreeRemoveOptions,
} from '@shared/types';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useWorktreeStore } from '@/stores/worktree';

export function useWorktreeList(workdir: string | null) {
  const setWorktrees = useWorktreeStore((s) => s.setWorktrees);
  const setError = useWorktreeStore((s) => s.setError);

  return useQuery({
    queryKey: ['worktree', 'list', workdir],
    queryFn: async () => {
      if (!workdir) return [];
      try {
        const worktrees = await window.electronAPI.worktree.list(workdir);
        setWorktrees(worktrees);
        setError(null);
        return worktrees;
      } catch (error) {
        // Handle not a git repository error
        setError(error instanceof Error ? error.message : 'Failed to load worktrees');
        setWorktrees([]);
        return [];
      }
    },
    enabled: !!workdir,
    retry: false, // Don't retry on git errors
  });
}

/**
 * Fetch worktrees for multiple repositories in parallel.
 * Returns a map of repo path -> worktrees array and error map.
 */
export function useWorktreeListMultiple(repoPaths: string[]) {
  const queries = useQueries({
    queries: repoPaths.map((repoPath) => ({
      queryKey: ['worktree', 'listMultiple', repoPath],
      queryFn: async () => {
        const worktrees = await window.electronAPI.worktree.list(repoPath);
        return { repoPath, worktrees };
      },
      enabled: true,
      retry: false,
      staleTime: 30000, // Cache for 30 seconds to avoid excessive refetching
    })),
  });

  const worktreesMap = useMemo(() => {
    const map: Record<string, GitWorktree[]> = {};
    for (let i = 0; i < repoPaths.length; i++) {
      const query = queries[i];
      if (query?.data) {
        map[query.data.repoPath] = query.data.worktrees;
      }
    }
    return map;
  }, [queries, repoPaths]);

  const errorsMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (let i = 0; i < repoPaths.length; i++) {
      const query = queries[i];
      if (query?.error) {
        map[repoPaths[i]] = query.error instanceof Error ? query.error.message : 'Failed to load';
      } else {
        map[repoPaths[i]] = null;
      }
    }
    return map;
  }, [queries, repoPaths]);

  const loadingMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (let i = 0; i < repoPaths.length; i++) {
      map[repoPaths[i]] = queries[i]?.isLoading ?? false;
    }
    return map;
  }, [queries, repoPaths]);

  const isLoading = queries.some((q) => q.isLoading);

  const refetchAll = () => {
    for (const query of queries) {
      query.refetch();
    }
  };

  return { worktreesMap, errorsMap, loadingMap, isLoading, refetchAll };
}

export function useWorktreeCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      options,
    }: {
      workdir: string;
      options: WorktreeCreateOptions;
    }) => {
      await window.electronAPI.worktree.add(workdir, options);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', 'list', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'listMultiple', workdir] });
    },
  });
}

export function useWorktreeRemove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      options,
    }: {
      workdir: string;
      options: WorktreeRemoveOptions;
    }) => {
      await window.electronAPI.worktree.remove(workdir, options);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', 'list', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'listMultiple', workdir] });
    },
  });
}

// Merge operations
export function useWorktreeMerge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      options,
    }: {
      workdir: string;
      options: WorktreeMergeOptions;
    }) => {
      return window.electronAPI.worktree.merge(workdir, options);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', 'list', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'listMultiple', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'mergeState', workdir] });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', workdir] });
    },
  });
}

export function useWorktreeMergeState(workdir: string | null) {
  return useQuery({
    queryKey: ['worktree', 'mergeState', workdir],
    queryFn: async () => {
      if (!workdir) return { inProgress: false };
      return window.electronAPI.worktree.getMergeState(workdir);
    },
    enabled: !!workdir,
  });
}

export function useWorktreeConflicts(workdir: string | null) {
  return useQuery({
    queryKey: ['worktree', 'conflicts', workdir],
    queryFn: async () => {
      if (!workdir) return [];
      return window.electronAPI.worktree.getConflicts(workdir);
    },
    enabled: !!workdir,
  });
}

export function useWorktreeConflictContent(workdir: string | null, filePath: string | null) {
  return useQuery({
    queryKey: ['worktree', 'conflictContent', workdir, filePath],
    queryFn: async () => {
      if (!workdir || !filePath) return null;
      return window.electronAPI.worktree.getConflictContent(workdir, filePath);
    },
    enabled: !!workdir && !!filePath,
  });
}

export function useWorktreeResolveConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      resolution,
    }: {
      workdir: string;
      resolution: ConflictResolution;
    }) => {
      await window.electronAPI.worktree.resolveConflict(workdir, resolution);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', 'conflicts', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'mergeState', workdir] });
    },
  });
}

export function useWorktreeMergeAbort() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir }: { workdir: string }) => {
      await window.electronAPI.worktree.abortMerge(workdir);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', 'mergeState', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'conflicts', workdir] });
    },
  });
}

export function useWorktreeMergeContinue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      message,
      cleanupOptions,
    }: {
      workdir: string;
      message?: string;
      cleanupOptions?: WorktreeMergeCleanupOptions;
    }) => {
      return window.electronAPI.worktree.continueMerge(workdir, message, cleanupOptions);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['worktree', 'list', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'listMultiple', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'mergeState', workdir] });
      queryClient.invalidateQueries({ queryKey: ['worktree', 'conflicts', workdir] });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', workdir] });
    },
  });
}
