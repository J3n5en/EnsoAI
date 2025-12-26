import type { GitLogEntry } from '@shared/types';
import { type InfiniteData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

export function useGitHistory(workdir: string | null, initialCount = 20) {
  return useQuery({
    queryKey: ['git', 'log', workdir, initialCount],
    queryFn: async () => {
      if (!workdir) return [];
      return window.electronAPI.git.getLog(workdir, initialCount);
    },
    enabled: !!workdir,
  });
}

export function useGitHistoryInfinite(workdir: string | null, initialCount = 20) {
  return useInfiniteQuery<GitLogEntry[], Error, InfiniteData<GitLogEntry[]>>({
    queryKey: ['git', 'log-infinite', workdir],
    queryFn: async ({ pageParam }) => {
      if (!workdir) return [];
      const skip = (pageParam ?? 0) as number;
      const count = initialCount;
      return window.electronAPI.git.getLog(workdir, count, skip);
    },
    enabled: !!workdir,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If we got less than requested, we've reached the end
      if (lastPage.length < initialCount) {
        return undefined;
      }
      return allPages.length * initialCount;
    },
  });
}

export function useCommitFiles(workdir: string | null, hash: string | null) {
  return useQuery({
    queryKey: ['git', 'commit-files', workdir, hash],
    queryFn: async () => {
      if (!workdir || !hash) return [];
      return window.electronAPI.git.getCommitFiles(workdir, hash);
    },
    enabled: !!workdir && !!hash,
  });
}

export function useCommitDiff(
  workdir: string | null,
  hash: string | null,
  filePath: string | null,
  status?: import('@shared/types').FileChangeStatus
) {
  return useQuery({
    queryKey: ['git', 'commit-diff', workdir, hash, filePath, status],
    queryFn: async () => {
      if (!workdir || !hash || !filePath) return null;
      return window.electronAPI.git.getCommitDiff(workdir, hash, filePath, status);
    },
    enabled: !!workdir && !!hash && !!filePath,
  });
}
