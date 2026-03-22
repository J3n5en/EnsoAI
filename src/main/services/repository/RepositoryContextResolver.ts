import type { RepositoryRuntimeContext } from '@shared/types';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '../remote/RemotePath';

export function resolveRepositoryRuntimeContext(
  repoPath?: string | null
): RepositoryRuntimeContext {
  if (!repoPath || !isRemoteVirtualPath(repoPath)) {
    return {
      repoPath: repoPath ?? undefined,
      kind: 'local',
    };
  }

  const { connectionId } = parseRemoteVirtualPath(repoPath);
  return {
    repoPath,
    kind: 'remote',
    connectionId,
  };
}

export function isRemoteRepositoryContext(
  context: RepositoryRuntimeContext
): context is RepositoryRuntimeContext & { kind: 'remote'; connectionId: string } {
  return context.kind === 'remote' && typeof context.connectionId === 'string';
}
