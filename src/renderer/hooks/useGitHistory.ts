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

/**
 * Fetch git commit history with infinite scroll support
 * @param workdir Working directory path
 * @param initialCount Number of commits to fetch per page
 * @param submodulePath Optional submodule path for fetching submodule history
 */
export function useGitHistoryInfinite(
  workdir: string | null,
  initialCount = 20,
  submodulePath?: string | null
) {
  return useInfiniteQuery<GitLogEntry[], Error, InfiniteData<GitLogEntry[]>>({
    queryKey: ['git', 'log-infinite', workdir, submodulePath],
    queryFn: async ({ pageParam }) => {
      if (!workdir) return [];
      const skip = (pageParam ?? 0) as number;
      const count = initialCount;
      // Use || to treat empty string as no submodule (empty string should be undefined)
      return window.electronAPI.git.getLog(workdir, count, skip, submodulePath || undefined);
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

/**
 * Fetch files changed in a specific commit
 * @param workdir Working directory path
 * @param hash Commit hash
 * @param submodulePath Optional submodule path for fetching submodule commit files
 */
export function useCommitFiles(
  workdir: string | null,
  hash: string | null,
  submodulePath?: string | null
) {
  return useQuery({
    queryKey: ['git', 'commit-files', workdir, hash, submodulePath],
    queryFn: async () => {
      if (!workdir || !hash) return [];
      // Use || to treat empty string as no submodule
      return window.electronAPI.git.getCommitFiles(workdir, hash, submodulePath || undefined);
    },
    enabled: !!workdir && !!hash,
  });
}

/**
 * Fetch diff content for a specific file in a commit
 * @param workdir Working directory path
 * @param hash Commit hash
 * @param filePath File path to get diff for
 * @param status Optional file change status for handling special cases (e.g., renamed files)
 * @param submodulePath Optional submodule path for fetching submodule commit diff
 */
export function useCommitDiff(
  workdir: string | null,
  hash: string | null,
  filePath: string | null,
  status?: import('@shared/types').FileChangeStatus,
  submodulePath?: string | null
) {
  return useQuery({
    queryKey: ['git', 'commit-diff', workdir, hash, filePath, status, submodulePath],
    queryFn: async () => {
      if (!workdir || !hash || !filePath) return null;
      return window.electronAPI.git.getCommitDiff(
        workdir,
        hash,
        filePath,
        status,
        submodulePath || undefined // Use || to treat empty string as no submodule
      );
    },
    enabled: !!workdir && !!hash && !!filePath,
  });
}
