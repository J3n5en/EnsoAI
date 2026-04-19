/**
 * Path utility functions
 * For cross-platform path normalization
 */

/**
 * WSL UNC path prefixes used across renderer/main.
 * Keep this as the single source of truth for WSL UNC detection rules.
 */
export const WSL_UNC_PREFIXES = ['//wsl.localhost/', '//wsl$/'] as const;

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

/**
 * Remove trailing path separators from a path string.
 * Preserves root paths like "/" and "C:\".
 * @param inputPath Original path
 * @returns Path without trailing separators
 */
export function trimTrailingPathSeparators(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (/^[a-zA-Z]:[\\/]?$/.test(inputPath)) return inputPath;

  const trimmed = inputPath.replace(/[\\/]+$/, '');
  return trimmed || inputPath;
}

/**
 * Whether path is a Windows WSL UNC path.
 * Supports both "\\wsl.localhost\..." and "//wsl.localhost/..." forms.
 * @param inputPath Original path
 * @returns True when path points to WSL via UNC prefix
 */
export function isWslUncPath(inputPath: string): boolean {
  const normalized = inputPath.replace(/\\/g, '/');
  return WSL_UNC_PREFIXES.some((prefix) => normalized.toLowerCase().startsWith(prefix));
}

/**
 * Get the final path segment from a filesystem path.
 * Handles both "/" and "\" separators and ignores trailing separators.
 * @param inputPath Original path
 * @returns Last segment or the original input when parsing fails
 */
export function getPathBasename(inputPath: string): string {
  const trimmed = trimTrailingPathSeparators(inputPath);
  if (!trimmed) return inputPath;
  const segments = trimmed.split(/[\\/]/);
  return segments[segments.length - 1] || inputPath;
}
