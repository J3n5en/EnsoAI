export interface RepositoryRuntimeContext {
  repoPath?: string;
  kind: 'local' | 'remote';
  connectionId?: string;
}
