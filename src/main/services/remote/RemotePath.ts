import type { RemotePlatform } from '@shared/types';
import { parseWorkspaceId } from '@shared/utils/workspace';
import { createRemoteError } from './RemoteI18n';

const REMOTE_PATH_PREFIX = '/__enso_remote__';

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(value: string): string {
  return decodeURIComponent(value);
}

export interface ParsedRemoteVirtualPath {
  connectionId: string;
  remotePath: string;
}

export function isRemoteVirtualPath(inputPath: string): boolean {
  return typeof inputPath === 'string' && inputPath.startsWith(REMOTE_PATH_PREFIX);
}

export function toRemoteVirtualPath(connectionId: string, remotePath: string): string {
  const cleaned = remotePath.replace(/\\/g, '/');
  return `${REMOTE_PATH_PREFIX}/${encodeSegment(connectionId)}${cleaned.startsWith('/') ? cleaned : `/${cleaned}`}`;
}

export function parseRemoteVirtualPath(inputPath: string): ParsedRemoteVirtualPath {
  if (!isRemoteVirtualPath(inputPath)) {
    throw createRemoteError('Not a remote virtual path: {{path}}', { path: inputPath });
  }
  const rest = inputPath.slice(REMOTE_PATH_PREFIX.length + 1);
  const slashIndex = rest.indexOf('/');
  if (slashIndex < 0) {
    throw createRemoteError('Malformed remote virtual path: {{path}}', { path: inputPath });
  }
  const connectionId = decodeSegment(rest.slice(0, slashIndex));
  const rawRemotePath = rest.slice(slashIndex) || '/';
  const remotePath = rawRemotePath.match(/^\/[A-Za-z]:\//) ? rawRemotePath.slice(1) : rawRemotePath;
  return { connectionId, remotePath };
}

export function maybeParseRemoteVirtualPath(inputPath: string): ParsedRemoteVirtualPath | null {
  if (!isRemoteVirtualPath(inputPath)) {
    return null;
  }
  return parseRemoteVirtualPath(inputPath);
}

export function resolveRemoteTargetFromWorkspaceId(
  workspaceId: string
): ParsedRemoteVirtualPath | null {
  try {
    const parsed = parseWorkspaceId(workspaceId);
    if (parsed.kind !== 'remote' || !parsed.connectionId) {
      return null;
    }
    return {
      connectionId: parsed.connectionId,
      remotePath: parsed.path,
    };
  } catch {
    return null;
  }
}

export function normalizeRemotePath(
  inputPath: string,
  platform: RemotePlatform | 'linux' = 'linux'
): string {
  const normalized = inputPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  if (platform === 'win32') {
    return normalized.replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`);
  }
  return normalized;
}
