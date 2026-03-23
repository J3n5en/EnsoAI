export type SupportedFileUrlPlatform = 'darwin' | 'linux' | 'win32';

/**
 * Normalize an absolute filesystem path so it can be assigned to a URL pathname.
 *
 * This does NOT URL-encode; URL will handle encoding when converting to string.
 */
function normalizeAbsolutePathForUrlPathname(absPath: string): string {
  let normalized = absPath.replace(/\\/g, '/');

  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = `/${normalized}`;
  } else if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  return normalized;
}

/**
 * Convert an absolute filesystem path to a custom protocol URL string.
 * Supports Windows UNC paths such as \\wsl.localhost\Ubuntu\home\user.
 */
export function toCustomProtocolFileUrl(absPath: string, scheme: string): string {
  const url = new URL(`${scheme}://`);
  assignAbsolutePathToUrl(url, absPath);
  return url.toString();
}

/**
 * Create a base URL for resolving relative paths within a directory.
 * Ensures the resulting URL.pathname ends with a trailing slash.
 */
export function toCustomProtocolFileBaseUrl(absDirPath: string, scheme: string): URL {
  const url = new URL(`${scheme}://`);
  assignAbsolutePathToUrl(url, absDirPath);
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

function assignAbsolutePathToUrl(url: URL, absPath: string): void {
  const normalized = absPath.replace(/\\/g, '/');

  if (normalized.startsWith('//')) {
    const withoutPrefix = normalized.slice(2);
    const firstSlashIndex = withoutPrefix.indexOf('/');
    const hostname =
      firstSlashIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSlashIndex);

    if (hostname) {
      url.hostname = hostname;
      url.pathname = firstSlashIndex === -1 ? '/' : withoutPrefix.slice(firstSlashIndex);
      return;
    }
  }

  url.pathname = normalizeAbsolutePathForUrlPathname(absPath);
}

function urlToFilePath(url: URL, platform: SupportedFileUrlPlatform): string {
  const pathname = decodeURIComponent(url.pathname);

  if (url.hostname) {
    if (platform === 'win32') {
      if (/^[a-zA-Z]$/.test(url.hostname)) {
        return `${url.hostname}:${pathname.replace(/\//g, '\\')}`;
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
