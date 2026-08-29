export type SupportedFileUrlPlatform = 'darwin' | 'linux' | 'win32';

/**
 * Normalize an absolute filesystem path so it can be assigned to a URL pathname.
 *
 * This does NOT URL-encode; URL will handle encoding when converting to string.
 */
const PATH_HOST = 'ensoai';

function normalizeAbsolutePathForUrlPathname(absPath: string): string {
  let normalized = absPath.replace(/\\/g, '/');

  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.slice(2);
  }
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  return normalized;
}

/**
 * Convert an absolute filesystem path to a custom protocol URL string.
 * Supports Windows UNC paths such as \\wsl.localhost\Ubuntu\home\user.
 */
export function toCustomProtocolFileUrl(absPath: string, scheme: string): string {
  const normalized = absPath.replace(/\\/g, '/');
  if (normalized.startsWith('//')) {
    const withoutPrefix = normalized.slice(2);
    const firstSlashIndex = withoutPrefix.indexOf('/');
    const hostname =
      firstSlashIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSlashIndex);
    const pathname = firstSlashIndex === -1 ? '/' : withoutPrefix.slice(firstSlashIndex);
    return `${scheme}://${hostname}${encodeURI(pathname)}`;
  }

  const driveLetter = /^[a-zA-Z]:\//.exec(normalized)?.[0][0] ?? '';
  const encodedPath = encodeURI(normalizeAbsolutePathForUrlPathname(absPath));
  const hostname = driveLetter ? driveLetter.toLowerCase() : PATH_HOST;
  return `${scheme}://${hostname}${encodedPath}`;
}

/**
 * Create a base URL for resolving relative paths within a directory.
 * Ensures the resulting URL.pathname ends with a trailing slash.
 */
export function toCustomProtocolFileBaseUrl(absDirPath: string, scheme: string): URL {
  const urlString = toCustomProtocolFileUrl(absDirPath, scheme);
  const url = new URL(urlString);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

/**
 * Convert a file:// URI to a filesystem path.
 * Supports Windows drive letters, UNC hosts, and legacy //host/path forms.
 */
export function fileUriToPath(uri: string, platform: SupportedFileUrlPlatform): string | null {
  if (!uri.toLowerCase().startsWith('file://')) {
    return null;
  }

  try {
    return urlToFilePath(new URL(uri), platform);
  } catch {
    return null;
  }
}

/**
 * Convert a custom protocol URI such as local-file:// or local-image:// to a filesystem path.
 */
export function customProtocolUriToPath(
  uri: string,
  scheme: string,
  platform: SupportedFileUrlPlatform
): string | null {
  if (!uri.toLowerCase().startsWith(`${scheme.toLowerCase()}://`)) {
    return null;
  }

  try {
    return urlToFilePath(new URL(uri), platform);
  } catch {
    return null;
  }
}

function urlToFilePath(url: URL, platform: SupportedFileUrlPlatform): string {
  const pathname = decodeURIComponent(url.pathname);

  if (url.hostname === PATH_HOST) {
    return platform === 'win32' ? pathname.replace(/\//g, '\\') : pathname;
  }

  if (url.hostname) {
    if (platform === 'win32') {
      if (/^[a-zA-Z]$/.test(url.hostname)) {
        return `${url.hostname.toUpperCase()}:${pathname.replace(/\//g, '\\')}`;
      }
      return `\\\\${url.hostname}${pathname.replace(/\//g, '\\')}`;
    }

    return `//${url.hostname}${pathname}`;
  }

  if (platform === 'win32') {
    if (pathname.startsWith('//')) {
      return pathname.replace(/\//g, '\\');
    }

    if (/^\/[a-zA-Z]:/.test(pathname)) {
      return pathname.slice(1).replace(/\//g, '\\');
    }
  }

  return pathname;
}
