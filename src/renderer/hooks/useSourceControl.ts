import type { FileChangesResult } from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';

const emptyResult: FileChangesResult = { changes: [] };

const FILE_CHANGES_ACTIVE_MS = 5000;
const FILE_CHANGES_IDLE_MS = 30000;
const FILE_CHANGES_IDLE_THRESHOLD = 6;

const FILE_DIFF_ACTIVE_MS = 2000;
const FILE_DIFF_IDLE_MS = 15000;
const FILE_DIFF_IDLE_THRESHOLD = 10;

export function useFileChanges(workdir: string | null, isActive = true) {
  const shouldPoll = useShouldPoll();
  const unchangedCountRef = useRef(0);
  const prevDataRef = useRef<FileChangesResult | undefined>(undefined);

  return useQuery({
    queryKey: ['git', 'file-changes', workdir],
    queryFn: async () => {
      if (!workdir) return emptyResult;
      const result = await window.electronAPI.git.getFileChanges(workdir);
      const prevLen = prevDataRef.current?.changes?.length ?? -1;
      if (result.changes.length === prevLen) {
        unchangedCountRef.current++;
      } else {
        unchangedCountRef.current = 0;
      }
      prevDataRef.current = result;
      return result;
    },
    enabled: !!workdir,
    refetchInterval: (query) => {
      if (!isActive || !shouldPoll) return false;
      if (query.state.data?.truncated) return 60000;
      return unchangedCountRef.current >= FILE_CHANGES_IDLE_THRESHOLD
        ? FILE_CHANGES_IDLE_MS
        : FILE_CHANGES_ACTIVE_MS;
    },
    refetchIntervalInBackground: false,
    staleTime: 2000,
  });
}

export function useFileDiff(
  workdir: string | null,
  path: string | null,
  staged: boolean,
  options?: { enabled?: boolean }
) {
  const shouldPoll = useShouldPoll();
  const unchangedCountRef = useRef(0);
  const prevHashRef = useRef('');

  return useQuery({
    queryKey: ['git', 'file-diff', workdir, path, staged],
    queryFn: async () => {
      if (!workdir || !path) return null;
      const result = await window.electronAPI.git.getFileDiff(workdir, path, staged);
      const serialized = typeof result === 'string' ? result : (JSON.stringify(result) ?? '');
      const hash = String(serialized.length);
      if (hash === prevHashRef.current) {
        unchangedCountRef.current++;
      } else {
        unchangedCountRef.current = 0;
      }
      prevHashRef.current = hash;
      return result;
    },
    enabled: (options?.enabled ?? true) && !!workdir && !!path,
    staleTime: 0,
    refetchInterval: shouldPoll
      ? unchangedCountRef.current >= FILE_DIFF_IDLE_THRESHOLD
        ? FILE_DIFF_IDLE_MS
        : FILE_DIFF_ACTIVE_MS
      : false,
    refetchIntervalInBackground: false,
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
