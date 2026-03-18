import type { GitBlameLineInfo } from '@shared/types';
import type * as monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';

type Monaco = typeof monaco;

// Constants
const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const MS_PER_MONTH = 2592000000; // 30 days
const MS_PER_YEAR = 31536000000; // 365 days
const CURSOR_DEBOUNCE_MS = 150;
const CACHE_INVALIDATE_DELAY_MS = 1000;
const MAX_CACHE_SIZE = 20; // FIFO cache limit - sufficient for typical workflows (not true LRU, but simple and effective)

// Global style element ID (shared across all editor instances)
// Managed by reference counting to avoid duplicate elements and ensure proper cleanup
const GLOBAL_BLAME_STYLE_ID = 'git-blame-inline-styles-global';
let globalStyleElementRefCount = 0;

function formatRelativeTime(
  isoDate: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const date = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < MS_PER_MINUTE) return t('Just now');
  if (diffMs < MS_PER_HOUR)
    return t('{{count}} minutes ago', { count: Math.floor(diffMs / MS_PER_MINUTE) });
  if (diffMs < MS_PER_DAY)
    return t('{{count}} hours ago', { count: Math.floor(diffMs / MS_PER_HOUR) });
  if (diffMs < MS_PER_MONTH)
    return t('{{count}} days ago', { count: Math.floor(diffMs / MS_PER_DAY) });
  if (diffMs < MS_PER_YEAR)
    return t('{{count}} months ago', { count: Math.floor(diffMs / MS_PER_MONTH) });
  return t('{{count}} years ago', { count: Math.floor(diffMs / MS_PER_YEAR) });
}

function isUncommitted(hash: string): boolean {
  return /^0+$/.test(hash);
}

function escapeCssString(str: string): string {
  return str.replace(/([\\'"()])/g, '\\$1').replace(/\n/g, '');
}

interface UseEditorBlameOptions {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  monacoInstance: Monaco | null;
  filePath: string | null;
  rootPath: string | undefined;
  enabled: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useEditorBlame({
  editor,
  monacoInstance,
  filePath,
  rootPath,
  enabled,
  t,
}: UseEditorBlameOptions): { refreshBlame: () => void } {
  // Ref to store the latest refreshBlame function
  const refreshBlameRef = useRef<(() => void) | null>(null);

  // Consolidated state refs
  const stateRef = useRef<{
    cache: Map<string, Map<number, GitBlameLineInfo>>;
    decorations: string[];
    currentLine: number | null;
    loadingFiles: Set<string>;
    debounceTimer: ReturnType<typeof setTimeout> | null;
    contentChangeTimer: ReturnType<typeof setTimeout> | null;
  }>({
    cache: new Map(),
    decorations: [],
    currentLine: null,
    loadingFiles: new Set(),
    debounceTimer: null,
    contentChangeTimer: null,
  });

  useEffect(() => {
    if (!editor || !monacoInstance || !filePath || !rootPath || !enabled) {
      if (editor && stateRef.current.decorations.length > 0) {
        stateRef.current.decorations = editor.deltaDecorations(stateRef.current.decorations, []);
      }
      stateRef.current.currentLine = null;
      refreshBlameRef.current = null;
      return;
    }

    // Get editor DOM node for scoped CSS variables
    const editorDom = editor.getDomNode();
    if (!editorDom) return;

    // Create or reference global style element
    if (!document.getElementById(GLOBAL_BLAME_STYLE_ID)) {
      const styleElement = document.createElement('style');
      styleElement.id = GLOBAL_BLAME_STYLE_ID;
      styleElement.textContent = `
        .git-blame-decoration::after {
          content: var(--git-blame-content, '');
          color: var(--muted-foreground);
          opacity: 0.5;
          font-style: italic;
          padding-left: 2em;
          pointer-events: none;
          white-space: pre;
        }
      `;
      document.head.appendChild(styleElement);
    }
    globalStyleElementRefCount++;

    let disposed = false;
    let decorationCleared = false;

    const clearDeco = (): void => {
      if (stateRef.current.decorations.length > 0) {
        stateRef.current.decorations = editor.deltaDecorations(stateRef.current.decorations, []);
      }
      stateRef.current.currentLine = null;
      editorDom.style.setProperty('--git-blame-content', "''");
    };

    const showBlameForLine = (lineNumber: number): void => {
      if (disposed) return;

      const lineData = stateRef.current.cache.get(filePath);
      if (!lineData) {
        clearDeco();
        fetchAndShow();
        return;
      }

      const info = lineData.get(lineNumber);
      if (!info || isUncommitted(info.hash)) {
        clearDeco();
        return;
      }

      if (stateRef.current.currentLine === lineNumber) return;
      stateRef.current.currentLine = lineNumber;

      const timeAgo = formatRelativeTime(info.date, t);
      const shortHash = info.hash.slice(0, 7);
      const blameText = `  ${info.author}, ${timeAgo} · ${info.message} (${shortHash})`;

      const escaped = escapeCssString(blameText);
      editorDom.style.setProperty('--git-blame-content', `'${escaped}'`);

      const model = editor.getModel();
      if (!model) return;

      const lineLength = model.getLineLength(lineNumber);
      const endColumn = lineLength + 1;

      const decoration: monaco.editor.IModelDeltaDecoration = {
        range: new monacoInstance.Range(lineNumber, endColumn, lineNumber, endColumn),
        options: {
          afterContentClassName: 'git-blame-decoration',
        },
      };

      stateRef.current.decorations = editor.deltaDecorations(stateRef.current.decorations, [
        decoration,
      ]);
    };

    const fetchAndShow = async (): Promise<void> => {
      if (stateRef.current.cache.has(filePath)) {
        const pos = editor.getPosition();
        if (pos) showBlameForLine(pos.lineNumber);
        return;
      }

      if (stateRef.current.loadingFiles.has(filePath)) return;

      if (!filePath.startsWith(rootPath)) return;

      const relativePath = filePath.slice(rootPath.length).replace(/^\//, '');
      if (!relativePath) return;

      stateRef.current.loadingFiles.add(filePath);
      try {
        const blameData: GitBlameLineInfo[] = await window.electronAPI.git.blame(
          rootPath,
          relativePath
        );

        const lineMap = new Map<number, GitBlameLineInfo>();
        for (const entry of blameData) {
          lineMap.set(entry.lineNumber, entry);
        }

        // LRU cache with size limit
        if (stateRef.current.cache.size >= MAX_CACHE_SIZE) {
          const firstKey = stateRef.current.cache.keys().next().value;
          if (firstKey) {
            stateRef.current.cache.delete(firstKey);
          }
        }
        stateRef.current.cache.set(filePath, lineMap);

        if (!disposed) {
          const pos = editor.getPosition();
          if (pos) showBlameForLine(pos.lineNumber);
        }
      } catch (err) {
        console.warn('[git-blame] Failed to fetch blame data:', err);
      } finally {
        stateRef.current.loadingFiles.delete(filePath);
      }
    };

    // Store refresh function in ref for external access
    refreshBlameRef.current = (): void => {
      // Clear cache and re-fetch blame (e.g., after file save)
      stateRef.current.cache.delete(filePath);
      fetchAndShow();
    };

    fetchAndShow();

    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      if (stateRef.current.debounceTimer) {
        clearTimeout(stateRef.current.debounceTimer);
      }
      stateRef.current.debounceTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          showBlameForLine(e.position.lineNumber);
        });
      }, CURSOR_DEBOUNCE_MS);
    });

    const blurDisposable = editor.onDidBlurEditorText(() => {
      clearDeco();
      decorationCleared = false;
    });

    const modelDisposable = editor.onDidChangeModelContent(() => {
      if (!decorationCleared) {
        clearDeco();
        decorationCleared = true;
      }

      if (stateRef.current.contentChangeTimer) {
        clearTimeout(stateRef.current.contentChangeTimer);
      }
      stateRef.current.contentChangeTimer = setTimeout(() => {
        stateRef.current.cache.delete(filePath);
        decorationCleared = false;
      }, CACHE_INVALIDATE_DELAY_MS);
    });

    return () => {
      disposed = true;
      cursorDisposable.dispose();
      blurDisposable.dispose();
      modelDisposable.dispose();
      if (stateRef.current.debounceTimer) {
        clearTimeout(stateRef.current.debounceTimer);
        stateRef.current.debounceTimer = null;
      }
      if (stateRef.current.contentChangeTimer) {
        clearTimeout(stateRef.current.contentChangeTimer);
        stateRef.current.contentChangeTimer = null;
      }
      clearDeco();
      stateRef.current.cache.delete(filePath);
      refreshBlameRef.current = null;

      globalStyleElementRefCount--;
      if (globalStyleElementRefCount <= 0) {
        const styleEl = document.getElementById(GLOBAL_BLAME_STYLE_ID);
        if (styleEl) {
          document.head.removeChild(styleEl);
        }
        globalStyleElementRefCount = 0;
      }
    };
    // Note: `t` from useI18n is a stable reference (useCallback), safe to include in dependencies
  }, [editor, monacoInstance, filePath, rootPath, enabled, t]);

  // Return stable object with refresh function
  return {
    refreshBlame: () => refreshBlameRef.current?.(),
  };
}
