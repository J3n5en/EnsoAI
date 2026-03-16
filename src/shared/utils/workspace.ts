import type {
  ConnectionProfile,
  RemotePlatform,
  RepositoryDescriptor,
  WorkspaceHandle,
  WorkspaceKind,
  WorkspacePlatform,
} from '../types/remote';

const LOCAL_PREFIX = 'local:';
const REMOTE_PREFIX = 'remote:';

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function trimTrailingSlash(value: string): string {
  if (/^[A-Za-z]:\/$/.test(value)) {
    return value;
  }
  return value.replace(/\/+$/, '') || '/';
}

export function normalizeWorkspacePath(
  inputPath: string,
  platform: WorkspacePlatform = 'linux'
): string {
  const normalized = trimTrailingSlash(normalizeSlashes(inputPath));
  if (platform === 'win32') {
    return normalized.replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`);
  }
  return normalized;
}

export function normalizeWorkspaceKey(
  inputPath: string,
  platform: WorkspacePlatform = 'linux'
): string {
  const normalized = normalizeWorkspacePath(inputPath, platform);
  if (platform === 'win32' || platform === 'darwin') {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function buildWorkspaceId(
  kind: WorkspaceKind,
  path: string,
  options?: { connectionId?: string; platform?: WorkspacePlatform }
): string {
  const platform = options?.platform ?? 'linux';
  const normalized = normalizeWorkspaceKey(path, platform);
  if (kind === 'local') {
    return `${LOCAL_PREFIX}${normalized}`;
  }
  if (!options?.connectionId) {
    throw new Error('Remote workspace id requires connectionId');
  }
  return `${REMOTE_PREFIX}${options.connectionId}:${normalized}`;
}

export function buildRepositoryId(
  kind: WorkspaceKind,
  path: string,
  options?: { connectionId?: string; platform?: WorkspacePlatform }
): string {
  return buildWorkspaceId(kind, path, options);
}

export function isRemoteWorkspaceId(id: string): boolean {
  return id.startsWith(REMOTE_PREFIX);
}

export function parseWorkspaceId(id: string): {
  kind: WorkspaceKind;
  connectionId?: string;
  path: string;
} {
  if (id.startsWith(LOCAL_PREFIX)) {
    return { kind: 'local', path: id.slice(LOCAL_PREFIX.length) };
  }
  if (id.startsWith(REMOTE_PREFIX)) {
    const rest = id.slice(REMOTE_PREFIX.length);
    const index = rest.indexOf(':');
    if (index <= 0) {
      throw new Error(`Invalid remote workspace id: ${id}`);
    }
    return {
      kind: 'remote',
      connectionId: rest.slice(0, index),
      path: rest.slice(index + 1),
    };
  }
  throw new Error(`Unsupported workspace id: ${id}`);
}

export function createLocalWorkspaceHandle(
  rootPath: string,
  platform: WorkspacePlatform = 'linux'
): WorkspaceHandle {
  const normalizedPath = normalizeWorkspacePath(rootPath, platform);
  return {
    id: buildWorkspaceId('local', normalizedPath, { platform }),
    kind: 'local',
    rootPath: normalizedPath,
    platform,
  };
}

export function createRemoteWorkspaceHandle(
  profile: Pick<ConnectionProfile, 'id'>,
  rootPath: string,
  platform?: RemotePlatform
): WorkspaceHandle {
  const resolvedPlatform = platform ?? 'linux';
  const normalizedPath = normalizeWorkspacePath(rootPath, resolvedPlatform);
  return {
    id: buildWorkspaceId('remote', normalizedPath, {
      connectionId: profile.id,
      platform: resolvedPlatform,
    }),
    kind: 'remote',
    rootPath: normalizedPath,
    connectionId: profile.id,
    platform: resolvedPlatform,
  };
}

export function deriveRepositoryDescriptor(input: {
  name: string;
  path: string;
  kind?: WorkspaceKind;
  connectionId?: string;
  groupId?: string;
  platform?: WorkspacePlatform;
}): RepositoryDescriptor {
  const kind = input.kind ?? 'local';
  const platform = input.platform ?? 'linux';
  const normalizedPath = normalizeWorkspacePath(input.path, platform);
  return {
    id: buildRepositoryId(kind, normalizedPath, {
      connectionId: input.connectionId,
      platform,
    }),
    name: input.name,
    path: normalizedPath,
    kind,
    connectionId: input.connectionId,
    groupId: input.groupId,
  };
}
