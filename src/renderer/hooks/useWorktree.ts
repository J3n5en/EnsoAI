import { useWorktreeStore } from '@/stores/worktree';
import type { WorktreeCreateOptions, WorktreeRemoveOptions } from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useWorktreeList(workdir: string | null) {
  const setWorktrees = useWorktreeStore((s) => s.setWorktrees);

  return useQuery({
    queryKey: ['worktree', 'list', workdir],
    queryFn: async () => {
      if (!workdir) return [];
      const worktrees = await window.electronAPI.worktree.list(workdir);
      setWorktrees(worktrees);
      return worktrees;
    },
    enabled: !!workdir,
  });
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
    },
  });
}
