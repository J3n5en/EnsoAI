import { toCustomProtocolFileBaseUrl, toCustomProtocolFileUrl } from '@shared/utils/fileUrl';

/**
 * Convert an absolute filesystem path to a `local-file://` URL string.
 */
export function toLocalFileUrl(absPath: string): string {
  return toCustomProtocolFileUrl(absPath, 'local-file');
}

/**
 * Create a base URL for resolving relative paths within a directory.
 * Ensures the resulting URL.pathname ends with a trailing slash.
 */
export function toLocalFileBaseUrl(absDirPath: string): URL {
  return toCustomProtocolFileBaseUrl(absDirPath, 'local-file');
}
