/**
 * Path utility functions
 * For cross-platform path normalization
 */

/**
 * Normalize path separators to forward slashes
 * @param p Original path
 * @returns Normalized path
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Safely join path segments and normalize
 * Automatically handles extra slashes
 * @param segments Path segments to join
 * @returns Joined and normalized path
 */
export function joinPath(...segments: string[]): string {
  return segments.filter(Boolean).join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
}
