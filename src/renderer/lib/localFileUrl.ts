/**
 * Utilities for building safe `local-file://` URLs.
 *
 * We use a custom Electron protocol instead of `file://` or `blob:` due to CSP restrictions.
 * The main process protocol handler validates paths against an allowlist.
 *
 * Cross-platform notes:
 * - Convert Windows backslashes to forward slashes for URL pathname.
 * - For Windows drive paths like `C:/...`, URL.pathname should be `/C:/...`.
 */

/**
 * Normalize an absolute filesystem path so it can be assigned to a URL pathname.
 *
 * This does NOT URL-encode; URL will handle encoding when converting to string.
 */
export function normalizeAbsolutePathForUrlPathname(absPath: string): string {
  let normalized = absPath.replace(/\\/g, '/');

  // Windows drive path (C:/...) needs a leading slash in URL pathname (/C:/...)
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = `/${normalized}`;
  } else if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  return normalized;
}

/**
 * Convert an absolute filesystem path to a `local-file://` URL string.
 */
export function toLocalFileUrl(absPath: string): string {
  const url = new URL('local-file://');
  url.pathname = normalizeAbsolutePathForUrlPathname(absPath);
  return url.toString();
}

/**
 * Create a base URL for resolving relative paths within a directory.
 * Ensures the resulting URL.pathname ends with a trailing slash.
 */
export function toLocalFileBaseUrl(absDirPath: string): URL {
  const url = new URL('local-file://');
  url.pathname = `${normalizeAbsolutePathForUrlPathname(absDirPath).replace(/\/+$/, '')}/`;
  return url;
}
