import { getPathBasename, normalizePath, trimTrailingPathSeparators } from '@shared/utils/path';
import { useEffect, useMemo, useRef } from 'react';

type FileChangeEvent = {
  type: 'create' | 'update' | 'delete';
  path: string;
};

type ChangeCallbackRef = { current: (event: FileChangeEvent) => void };

type WatchEntry = {
  dirPath: string;
  normalizedDirPath: string;
  refCount: number;
  // All subscribers' callbacks; the single IPC listener dispatches to each one
  callbacks: Set<ChangeCallbackRef>;
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
      entry = { dirPath, normalizedDirPath, refCount: 0, callbacks: new Set() };
      watches.set(key, entry);
    }
    entry.refCount += 1;
    // Register this subscriber's callback: previously only the first subscriber
    // received events because the IPC listener captured a single onChangeRef
    entry.callbacks.add(onChangeRef);

    if (!entry.stop) {
      const currentEntry = entry;
      const dispatch = (event: FileChangeEvent) => {
        for (const callback of currentEntry.callbacks) {
          callback.current(event);
        }
      };
      void window.electronAPI.file.watchStart(dirPath);
      const unsubscribe = window.electronAPI.file.onChange((event) => {
        const eventPath = normalizeWatchedPath(event.path);
        // Deliver only events under the watched dir (or the bulk marker inside it)
        if (eventPath === key || eventPath.startsWith(`${key}/`)) {
          dispatch(event);
          return;
        }

        // Bulk marker: allow delivery even if the watcher reports a different prefix.
        if (getPathBasename(eventPath) === '.enso-bulk') {
          dispatch(event);
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
      current.callbacks.delete(onChangeRef);
      if (current.refCount <= 0) {
        current.stop?.();
        watches.delete(key);
      }
    };
  }, [dirPath, normalizedDirPath, enabled]);
}
