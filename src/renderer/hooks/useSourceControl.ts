import type { FileChangesResult } from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toastManager } from '@/components/ui/toast';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';

const emptyResult: FileChangesResult = { changes: [] };

export function useFileChanges(workdir: string | null, isActive = true) {
  const shouldPoll = useShouldPoll();

  return useQuery({
    queryKey: ['git', 'file-changes', workdir],
    queryFn: async () => {
      if (!workdir) return emptyResult;
      return window.electronAPI.git.getFileChanges(workdir);
    },
    enabled: !!workdir,
    refetchInterval: (query) => {
      if (!isActive || !shouldPoll) return false;
      return query.state.data?.truncated ? 60000 : 5000;
    }, // Only poll when tab is active and user is not idle
    refetchIntervalInBackground: false, // Only poll when window is focused
    staleTime: 2000, // Avoid redundant requests within 2s
  });
}

export function useFileDiff(
  workdir: string | null,
  path: string | null,
  staged: boolean,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['git', 'file-diff', workdir, path, staged],
    queryFn: async () => {
      if (!workdir || !path) return null;
      return window.electronAPI.git.getFileDiff(workdir, path, staged);
    },
    enabled: (options?.enabled ?? true) && !!workdir && !!path,
  });
}

export function useGitStage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async ({ workdir, paths }: { workdir: string; paths: string[] }) => {
      await window.electronAPI.git.stage(workdir, paths);
    },
    onSuccess: async (_, { workdir }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', workdir] }),
      ]);
    },
    onError: (error) => {
      toastManager.add({
        title: t('Stage failed'),
        description: error instanceof Error ? error.message : t('Unknown error'),
        type: 'error',
        timeout: 5000,
      });
    },
  });
}

export function useGitUnstage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async ({ workdir, paths }: { workdir: string; paths: string[] }) => {
      await window.electronAPI.git.unstage(workdir, paths);
    },
    onSuccess: async (_, { workdir }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', workdir] }),
      ]);
    },
    onError: (error) => {
      toastManager.add({
        title: t('Unstage failed'),
        description: error instanceof Error ? error.message : t('Unknown error'),
        type: 'error',
        timeout: 5000,
      });
    },
  });
}

export function useGitDiscard() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async ({ workdir, paths }: { workdir: string; paths: string[] }) => {
      await window.electronAPI.git.discard(workdir, paths);
    },
    onSuccess: async (_, { workdir }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', workdir] }),
      ]);
    },
    onError: (error) => {
      toastManager.add({
        title: t('Discard failed'),
        description: error instanceof Error ? error.message : t('Unknown error'),
        type: 'error',
        timeout: 5000,
      });
    },
  });
}

export function useGitCommit() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async ({ workdir, message }: { workdir: string; message: string }) => {
      return window.electronAPI.git.commit(workdir, message);
    },
    onSuccess: async (_, { workdir }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'log', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'log-infinite', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', workdir] }),
      ]);
    },
    onError: (error) => {
      toastManager.add({
        title: t('Commit failed'),
        description: error instanceof Error ? error.message : t('Unknown error'),
        type: 'error',
        timeout: 5000,
      });
    },
  });
}

export function useGitFetch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir }: { workdir: string }) => {
      await window.electronAPI.git.fetch(workdir);
    },
    onSuccess: async (_, { workdir }) => {
      await queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] });
    },
  });
}
