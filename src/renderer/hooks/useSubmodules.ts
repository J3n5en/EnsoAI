import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useShouldPoll } from '@/hooks/useWindowFocus';

export function useSubmodules(workdir: string | null) {
  const shouldPoll = useShouldPoll();

  return useQuery({
    queryKey: ['git', 'submodules', workdir],
    queryFn: async () => {
      if (!workdir) return [];
      return window.electronAPI.git.listSubmodules(workdir);
    },
    enabled: !!workdir,
    refetchInterval: shouldPoll ? 10000 : false,
    refetchIntervalInBackground: false,
    staleTime: 5000,
  });
}

export function useInitSubmodules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir, recursive }: { workdir: string; recursive?: boolean }) => {
      await window.electronAPI.git.initSubmodules(workdir, recursive);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function useUpdateSubmodules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir, recursive }: { workdir: string; recursive?: boolean }) => {
      await window.electronAPI.git.updateSubmodules(workdir, recursive);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function useSyncSubmodules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir }: { workdir: string }) => {
      await window.electronAPI.git.syncSubmodules(workdir);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function useFetchSubmodule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir, submodulePath }: { workdir: string; submodulePath: string }) => {
      await window.electronAPI.git.fetchSubmodule(workdir, submodulePath);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function usePullSubmodule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir, submodulePath }: { workdir: string; submodulePath: string }) => {
      await window.electronAPI.git.pullSubmodule(workdir, submodulePath);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function usePushSubmodule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir, submodulePath }: { workdir: string; submodulePath: string }) => {
      await window.electronAPI.git.pushSubmodule(workdir, submodulePath);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function useCommitSubmodule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      submodulePath,
      message,
    }: {
      workdir: string;
      submodulePath: string;
      message: string;
    }) => {
      return window.electronAPI.git.commitSubmodule(workdir, submodulePath, message);
    },
    onSuccess: (_, { workdir, submodulePath }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
      queryClient.invalidateQueries({
        queryKey: ['git', 'submodule', 'changes', workdir, submodulePath],
      });
    },
  });
}

export function useStageSubmodule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      submodulePath,
      paths,
    }: {
      workdir: string;
      submodulePath: string;
      paths: string[];
    }) => {
      await window.electronAPI.git.stageSubmodule(workdir, submodulePath, paths);
    },
    onSuccess: (_, { workdir, submodulePath }) => {
      queryClient.invalidateQueries({
        queryKey: ['git', 'submodule', 'changes', workdir, submodulePath],
      });
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function useUnstageSubmodule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      submodulePath,
      paths,
    }: {
      workdir: string;
      submodulePath: string;
      paths: string[];
    }) => {
      await window.electronAPI.git.unstageSubmodule(workdir, submodulePath, paths);
    },
    onSuccess: (_, { workdir, submodulePath }) => {
      queryClient.invalidateQueries({
        queryKey: ['git', 'submodule', 'changes', workdir, submodulePath],
      });
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function useDiscardSubmodule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      submodulePath,
      paths,
    }: {
      workdir: string;
      submodulePath: string;
      paths: string[];
    }) => {
      await window.electronAPI.git.discardSubmodule(workdir, submodulePath, paths);
    },
    onSuccess: (_, { workdir, submodulePath }) => {
      queryClient.invalidateQueries({
        queryKey: ['git', 'submodule', 'changes', workdir, submodulePath],
      });
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
    },
  });
}

export function useSubmoduleChanges(workdir: string | null, submodulePath: string | null) {
  const shouldPoll = useShouldPoll();

  return useQuery({
    queryKey: ['git', 'submodule', 'changes', workdir, submodulePath],
    queryFn: async () => {
      if (!workdir || !submodulePath) return [];
      return window.electronAPI.git.getSubmoduleChanges(workdir, submodulePath);
    },
    enabled: !!workdir && !!submodulePath,
    refetchInterval: shouldPoll ? 10000 : false,
    refetchIntervalInBackground: false,
    staleTime: 5000,
  });
}

export function useSubmoduleFileDiff(
  workdir: string | null,
  submodulePath: string | null,
  filePath: string | null,
  staged: boolean
) {
  return useQuery({
    queryKey: ['git', 'submodule', 'diff', workdir, submodulePath, filePath, staged],
    queryFn: async () => {
      if (!workdir || !submodulePath || !filePath) return null;
      return window.electronAPI.git.getSubmoduleFileDiff(workdir, submodulePath, filePath, staged);
    },
    enabled: !!workdir && !!submodulePath && !!filePath,
  });
}

export function useSubmoduleBranches(workdir: string | null, submodulePath: string | null) {
  return useQuery({
    queryKey: ['git', 'submodule', 'branches', workdir, submodulePath],
    queryFn: async () => {
      if (!workdir || !submodulePath) return [];
      return window.electronAPI.git.getSubmoduleBranches(workdir, submodulePath);
    },
    enabled: !!workdir && !!submodulePath,
  });
}

export function useCheckoutSubmoduleBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      submodulePath,
      branch,
    }: {
      workdir: string;
      submodulePath: string;
      branch: string;
    }) => {
      await window.electronAPI.git.checkoutSubmoduleBranch(workdir, submodulePath, branch);
    },
    onSuccess: (_, { workdir, submodulePath }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'submodules', workdir] });
      queryClient.invalidateQueries({
        queryKey: ['git', 'submodule', 'branches', workdir, submodulePath],
      });
    },
  });
}
