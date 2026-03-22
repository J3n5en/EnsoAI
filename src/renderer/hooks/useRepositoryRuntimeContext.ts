import { useQuery } from '@tanstack/react-query';

export function useRepositoryRuntimeContext(repoPath?: string) {
  return useQuery({
    queryKey: ['repository-runtime-context', repoPath ?? null],
    queryFn: () => window.electronAPI.window.getRepositoryRuntimeContext(repoPath),
    staleTime: 30_000,
  });
}
