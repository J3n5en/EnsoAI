import { getPathBasename, normalizePath, trimTrailingPathSeparators } from '@shared/utils/path';
import { useEffect, useMemo, useRef } from 'react';

type FileChangeEvent = {
  type: 'create' | 'update' | 'delete';
  path: string;
};

type WatchEntry = {
  dirPath: string;
  normalizedDirPath: string;
  refCount: number;
  stop?: () => void;
};

const watches = new Map<string, WatchEntry>();

function normalizeWatchedPath(p: string) {
  return trimTrailingPathSeparators(normalizePath(p));
}

export function useSharedFileWatch(
  dirPath: string | null,
  onChange: (event: FileChangeEvent) => void,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;

  const normalizedDirPath = useMemo(
    () => (dirPath ? normalizeWatchedPath(dirPath) : null),
    [dirPath]
  );
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!dirPath || !normalizedDirPath || !enabled) return;

    const key = normalizedDirPath;
    let entry = watches.get(key);
    if (!entry) {
      entry = { dirPath, normalizedDirPath, refCount: 0 };
      watches.set(key, entry);
    }
    entry.refCount += 1;

    if (!entry.stop) {
      void window.electronAPI.file.watchStart(dirPath);
      const unsubscribe = window.electronAPI.file.onChange((event) => {
        const eventPath = normalizeWatchedPath(event.path);
        // Deliver only events under the watched dir (or the bulk marker inside it)
        if (eventPath === key || eventPath.startsWith(`${key}/`)) {
          onChangeRef.current(event);
          return;
        }

        // Bulk marker: allow delivery even if the watcher reports a different prefix.
        if (getPathBasename(eventPath) === '.enso-bulk') {
          onChangeRef.current(event);
        }
      });
      entry.stop = () => {
        unsubscribe();
        void window.electronAPI.file.watchStop(dirPath);
      };
    }

    return () => {
      const current = watches.get(key);
      if (!current) return;
      current.refCount -= 1;
      if (current.refCount <= 0) {
        current.stop?.();
        watches.delete(key);
      }
    };
  }, [dirPath, normalizedDirPath, enabled]);
}
