import { normalizePath } from '@shared/utils/path';
import { useEffect, useRef } from 'react';

interface UseFileDropOptions {
  /** Project working directory, used to convert absolute paths to relative */
  cwd?: string;
  /** Callback when file paths are resolved from a drop event */
  onDrop: (paths: string[]) => void;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook to handle external file drops (from OS file manager, VS Code, etc.)
 * onto a target element. Uses capture-phase listeners to intercept before
 * child elements (e.g., xterm.js) can swallow the events.
 *
 * Supports:
 * - Native file drops (Finder, Explorer) via `dataTransfer.files` + Electron `webUtils`
 * - VS Code / IDE drops via `text/uri-list` (file:// URIs)
 */
export function useFileDrop<T extends HTMLElement>({
  cwd,
  onDrop,
  enabled = true,
}: UseFileDropOptions) {
  const ref = useRef<T>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const hasDroppableData = (dt: DataTransfer | null): boolean => {
      if (!dt) return false;
      return dt.types.includes('Files') || dt.types.includes('text/uri-list');
    };

    const handleDragOver = (e: DragEvent) => {
      if (hasDroppableData(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer!.dropEffect = 'copy';
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (!hasDroppableData(e.dataTransfer)) return;

      e.preventDefault();
      e.stopPropagation();

      const resolved = resolveDroppedPaths(e.dataTransfer!, cwd);
      if (resolved.length > 0) {
        onDropRef.current(resolved);
      }
    };

    el.addEventListener('dragover', handleDragOver, true);
    el.addEventListener('drop', handleDrop, true);
    return () => {
      el.removeEventListener('dragover', handleDragOver, true);
      el.removeEventListener('drop', handleDrop, true);
    };
  }, [cwd, enabled]);

  return ref;
}

/**
 * Parse a file:// URI to a local file path.
 * Handles both Unix and Windows formats:
 * - Unix: file:///path/to/file → /path/to/file
 * - Windows: file:///C:/path/to/file → C:/path/to/file
 */
function fileUriToPath(uri: string): string {
  try {
    const url = new URL(uri);
    let pathname = decodeURIComponent(url.pathname);
    // On Windows, pathname starts with /C:/..., need to remove leading slash
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname;
  } catch {
    // Fallback for malformed URIs
    return '';
  }
}

/**
 * Extract file paths from a DataTransfer, supporting:
 * 1. Native file drops (dataTransfer.files + Electron webUtils)
 * 2. URI list drops (text/uri-list from VS Code, etc.)
 */
function resolveDroppedPaths(dt: DataTransfer, cwd?: string): string[] {
  const paths: string[] = [];

  // 1. Try native files first (Finder / Explorer)
  if (dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      try {
        const filePath = window.electronAPI.utils.getPathForFile(dt.files[i]);
        if (filePath) {
          paths.push(filePath);
        }
      } catch {
        // getPathForFile may fail for non-native files
      }
    }
  }

  // 2. Fallback: parse text/uri-list (VS Code, other IDEs)
  if (paths.length === 0) {
    const uriList = dt.getData('text/uri-list');
    if (uriList) {
      for (const line of uriList.split(/\r?\n/)) {
        const trimmed = line.trim();
        // Skip comments and empty lines per RFC 2483
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.startsWith('file://')) {
          const decoded = fileUriToPath(trimmed);
          if (decoded) {
            paths.push(decoded);
          }
        }
      }
    }
  }

  // Convert to relative path if inside cwd, otherwise keep absolute path
  // Normalize separators for cross-platform compatibility
  const normalizedCwd = cwd ? normalizePath(cwd) : '';
  return paths.map((p) => {
    const normalizedPath = normalizePath(p);
    if (normalizedCwd && normalizedPath.startsWith(`${normalizedCwd}/`)) {
      // File is inside current repo → use relative path
      return normalizedPath.substring(normalizedCwd.length + 1);
    }
    // File is outside current repo → use absolute path
    return normalizedPath;
  });
}
