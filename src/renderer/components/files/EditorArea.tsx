import Editor, { type OnMount } from '@monaco-editor/react';
import {
  ChevronRight,
  Eye,
  EyeOff,
  FileCode,
  FileX,
  Maximize2,
  MessageSquare,
  MoreVertical,
} from 'lucide-react';
import type * as monaco from 'monaco-editor';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { normalizePath } from '@/App/storage';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { addToast } from '@/components/ui/toast';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useI18n } from '@/i18n';
import { toMonacoFileUri } from '@/lib/monacoModelPath';
import { useActiveSessionId } from '@/stores/agentSessions';
import type { EditorTab, NavEntry, PendingCursor } from '@/stores/editor';
import { useEditorStore } from '@/stores/editor';
import { type TerminalKeybinding, useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import { BreadcrumbTreeMenu } from './BreadcrumbTreeMenu';
import { CommentForm, useEditorLineComment } from './EditorLineComment';
import { EditorTabs } from './EditorTabs';
import { ExternalModificationBanner } from './ExternalModificationBanner';
import { setupDefinitionNavigation } from './editorDefinitionProvider';
import { setupDoubleClickScope } from './editorScopeSelection';
import { isImageFile, isPdfFile } from './fileIcons';
import { ImagePreview } from './ImagePreview';
import { MarkdownPreview } from './MarkdownPreview';
import { CUSTOM_THEME_NAME, defineMonacoTheme } from './monacoTheme';
import { PdfPreview } from './PdfPreview';
import { useEditorBlame } from './useEditorBlame';
// Import for side effects (Monaco setup)
import './monacoSetup';

type Monaco = typeof monaco;

// Map from codeToKey() output to Monaco KeyCode property names
const SPECIAL_KEY_MAP: Record<string, string> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  "'": 'Quote',
  '`': 'Backquote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '\\': 'Backslash',
  '-': 'Minus',
  '=': 'Equal',
  space: 'Space',
  enter: 'Enter',
  escape: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  arrowup: 'UpArrow',
  arrowdown: 'DownArrow',
  arrowleft: 'LeftArrow',
  arrowright: 'RightArrow',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

// Convert a TerminalKeybinding to a Monaco editor chord number.
// Returns 0 if the key cannot be mapped (caller should skip addCommand).
function bindingToMonacoChord(binding: TerminalKeybinding, m: Monaco): number {
  let chord = 0;
  if (binding.ctrl) chord |= m.KeyMod.WinCtrl;
  if (binding.meta) chord |= m.KeyMod.CtrlCmd;
  if (binding.shift) chord |= m.KeyMod.Shift;
  if (binding.alt) chord |= m.KeyMod.Alt;

  const key = binding.key.toLowerCase();
  if (!key) return 0;
  let keyCode: number | undefined;

  if (/^[a-z]$/.test(key)) {
    keyCode = m.KeyCode[`Key${key.toUpperCase()}` as keyof typeof m.KeyCode] as number;
  } else if (/^f\d+$/.test(key)) {
    keyCode = m.KeyCode[key.toUpperCase() as keyof typeof m.KeyCode] as number;
  } else if (/^\d$/.test(key)) {
    keyCode = m.KeyCode[`Digit${key}` as keyof typeof m.KeyCode] as number;
  } else {
    const monacoName = SPECIAL_KEY_MAP[key];
    if (monacoName) {
      keyCode = m.KeyCode[monacoName as keyof typeof m.KeyCode] as number;
    }
  }

  if (keyCode === undefined || keyCode === 0) return 0;
  return chord | keyCode;
}

let latestSelectionText = '';

export function getEditorSelectionText(): string {
  return latestSelectionText;
}

type MarkdownPreviewMode = 'off' | 'split' | 'fullscreen';

export interface EditorAreaRef {
  getSelectedText: () => string;
  requestCloseTab: (path: string) => void;
}

function isMarkdownFile(path: string | null): boolean {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
}

interface EditorAreaProps {
  tabs: EditorTab[];
  activeTab: EditorTab | null;
  activeTabPath: string | null;
  pendingCursor: PendingCursor | null;
  rootPath?: string;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void | Promise<void>;
  onCloseOthers?: (keepPath: string) => void | Promise<void>;
  onCloseAll?: () => void | Promise<void>;
  onCloseSaved?: () => void | Promise<void>;
  onCloseLeft?: (path: string) => void | Promise<void>;
  onCloseRight?: (path: string) => void | Promise<void>;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onContentChange: (path: string, content: string, isDirty?: boolean) => void;
  onViewStateChange: (path: string, viewState: unknown) => void;
  onSave: (path: string) => void;
  onClearPendingCursor: () => void;
  onGlobalSearch?: (selectedText: string) => void;
  isFileTreeCollapsed?: boolean;
  onToggleFileTree?: () => void;
  onNavigateToFile?: (path: string) => Promise<void>;
}

export const EditorArea = forwardRef<EditorAreaRef, EditorAreaProps>(function EditorArea(
  {
    tabs,
    activeTab,
    activeTabPath,
    pendingCursor,
    rootPath,
    onTabClick,
    onTabClose,
    onCloseOthers,
    onCloseAll,
    onCloseSaved,
    onCloseLeft,
    onCloseRight,
    onTabReorder,
    onContentChange,
    onViewStateChange,
    onSave,
    onClearPendingCursor,
    onGlobalSearch,
    isFileTreeCollapsed,
    onToggleFileTree,
    onNavigateToFile,
  }: EditorAreaProps,
  ref: React.Ref<EditorAreaRef>
) {
  const { t } = useI18n();
  const sessionId = useActiveSessionId(rootPath ?? null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [editorInstance, setEditorInstance] = useState<monaco.editor.IStandaloneCodeEditor | null>(
    null
  );
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const {
    terminalTheme,
    editorSettings,
    editorKeybindings,
    claudeCodeIntegration,
    backgroundImageEnabled,
    backgroundOpacity,
  } = useSettingsStore();
  const write = useTerminalWriteStore((state) => state.write);
  const focus = useTerminalWriteStore((state) => state.focus);

  // Helper function to format line reference from selection
  const formatLineRef = useCallback((selection: monaco.Selection): string => {
    const endLine =
      selection.endColumn === 1 ? selection.endLineNumber - 1 : selection.endLineNumber;
    return selection.startLineNumber === endLine
      ? `L${selection.startLineNumber}`
      : `L${selection.startLineNumber}-L${endLine}`;
  }, []);

  // Helper function to convert absolute path to relative path
  const getRelativePath = useCallback(
    (absolutePath: string): string => {
      if (!rootPath) return absolutePath;
      const normalizedRoot = normalizePath(rootPath);
      const normalizedPath = normalizePath(absolutePath);
      if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
        // Return original case path (not normalized) for display
        return absolutePath.slice(rootPath.length + 1);
      }
      return absolutePath;
    },
    [rootPath]
  );

  // Send file path to current session (for tab context menu)
  const handleSendToSession = useCallback(
    (path: string) => {
      if (!sessionId) return;
      const displayPath = getRelativePath(path);
      write(sessionId, `@${displayPath} `);
      focus(sessionId);
      addToast({
        type: 'success',
        title: t('Sent to session'),
        description: `@${displayPath}`,
        timeout: 2000,
      });
    },
    [sessionId, getRelativePath, write, focus, t]
  );

  // Markdown preview state
  const isMarkdown = isMarkdownFile(activeTabPath);
  const isImage = isImageFile(activeTabPath);
  const isPdf = isPdfFile(activeTabPath);
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>('off');
  const previewModeRef = useRef<MarkdownPreviewMode>('off');
  previewModeRef.current = previewMode;
  const [editorReady, setEditorReady] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(50); // percentage

  // Sync preview mode from pendingCursor
  useEffect(() => {
    if (pendingCursor?.previewMode && isMarkdown) {
      setPreviewMode(pendingCursor.previewMode);
    }
  }, [pendingCursor?.previewMode, isMarkdown]);
  const resizingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false); // Prevent scroll loop
  const setCurrentCursorLine = useEditorStore((state) => state.setCurrentCursorLine);
  const markExternalChange = useEditorStore((state) => state.markExternalChange);
  const applyExternalChange = useEditorStore((state) => state.applyExternalChange);
  const dismissExternalChange = useEditorStore((state) => state.dismissExternalChange);
  const themeDefinedRef = useRef(false);
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const widgetRootRef = useRef<Root | null>(null);
  const widgetPositionRef = useRef<monaco.IPosition | null>(null);
  const hasPendingAutoSaveRef = useRef(false);
  const blurDisposableRef = useRef<monaco.IDisposable | null>(null);
  const activeTabPathRef = useRef<string | null>(null);
  // Keep a ref to the latest tabs so the file-change listener never goes stale
  // without needing to re-register on every tab state update.
  const tabsRef = useRef<EditorTab[]>(tabs);
  const sessionIdRef = useRef<string | null>(null);
  const pendingCursorRef = useRef<PendingCursor | null>(null);
  const editorForPathRef = useRef<string | null>(null);
  const rootPathRef = useRef<string | undefined>(rootPath);
  const definitionNavDisposableRef = useRef<{ dispose: () => void } | null>(null);
  // Flag to suppress onChange events triggered by programmatic setValue calls (not user input)
  const isProgrammaticUpdateRef = useRef(false);
  // Debounce timer for recording edit positions into navigation history
  const editNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref to onNavigateToFile prop to avoid stale closures inside addCommand handlers
  const onNavigateToFileRef = useRef(onNavigateToFile);

  // Keep onNavigateToFileRef in sync with the latest prop value
  useEffect(() => {
    onNavigateToFileRef.current = onNavigateToFile;
  }, [onNavigateToFile]);

  // Navigate to a NavEntry: same-file → direct cursor, open tab → switch + pending cursor, new file → load + pending cursor.
  // Uses only stable refs so the callback reference never changes and is safe as a useEffect dependency.
  const navigateToEntry = useCallback((target: NavEntry) => {
    const store = useEditorStore.getState();
    const colOffset = target.column - 1; // NavEntry is Monaco 1-indexed; pendingCursor uses 0-indexed
    if (target.path === activeTabPathRef.current) {
      const ed = editorRef.current;
      if (ed) {
        ed.setPosition({ lineNumber: target.line, column: target.column });
        ed.revealLineInCenter(target.line);
        ed.focus();
      }
    } else if (store.tabs.some((t) => t.path === target.path)) {
      store.setActiveFile(target.path);
      store.setPendingCursor({ path: target.path, line: target.line, column: colOffset });
    } else if (onNavigateToFileRef.current) {
      store.setPendingCursor({ path: target.path, line: target.line, column: colOffset });
      onNavigateToFileRef.current(target.path);
    }
  }, []);

  // Cleanup edit-position debounce timer on unmount
  useEffect(() => {
    return () => {
      if (editNavTimerRef.current) clearTimeout(editNavTimerRef.current);
    };
  }, []);

  // Set editor value without triggering the onChange handler (not treated as user input)
  const setEditorValueProgrammatically = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, value: string) => {
      const position = editor.getPosition();
      isProgrammaticUpdateRef.current = true;
      try {
        editor.setValue(value);
      } finally {
        isProgrammaticUpdateRef.current = false;
      }
      if (position) {
        editor.setPosition(position);
      }
    },
    []
  );

  // Line comment feature
  // Use sessionIdRef.current instead of sessionId state to avoid race conditions
  useEditorLineComment({
    editor: editorInstance,
    monacoInstance: monacoInstance,
    filePath: activeTabPath,
    rootPath: rootPath ?? null,
    enabled: editorReady && !!sessionIdRef.current,
  });

  // Inline git blame
  const { refreshBlame } = useEditorBlame({
    editor: editorInstance,
    monacoInstance: monacoInstance,
    filePath: activeTabPath,
    rootPath,
    enabled: editorReady && editorSettings.gitBlameEnabled,
    t,
  });

  // Wrap onSave to refresh blame after save
  const handleSaveWithBlameRefresh = useCallback(
    (path: string) => {
      onSave(path);
      // Refresh blame after file is saved
      if (path === activeTabPath) {
        refreshBlame();
      }
    },
    [onSave, activeTabPath, refreshBlame]
  );

  // Calculate breadcrumb segments from active file path
  const breadcrumbSegments = useMemo(() => {
    if (!activeTabPath || !rootPath) return [];

    const relativePath = activeTabPath.startsWith(rootPath)
      ? activeTabPath.slice(rootPath.length).replace(/^\//, '')
      : activeTabPath;

    if (!relativePath) return [];

    const parts = relativePath.split('/');
    return parts.map((name, index) => ({
      name,
      path: `${rootPath}/${parts.slice(0, index + 1).join('/')}`,
      isLast: index === parts.length - 1,
    }));
  }, [activeTabPath, rootPath]);

  // Keep refs in sync with state
  useEffect(() => {
    activeTabPathRef.current = activeTabPath;
  }, [activeTabPath]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    sessionIdRef.current = sessionId ?? null;
  }, [sessionId]);

  // Sync rootPath ref immediately during render so the definition provider
  // always sees the latest value without being a useCallback dependency.
  rootPathRef.current = rootPath;

  // Sync ref immediately during render (not in useEffect) to ensure
  // it's available when Monaco's onMount callback fires
  pendingCursorRef.current = pendingCursor;

  // Auto save: Debounced save for 'afterDelay' mode
  // Use ref-based debounce to avoid closure issues with activeTabPath
  const {
    trigger: triggerDebouncedSave,
    cancel: cancelDebouncedSave,
    flush: flushDebouncedSave,
  } = useDebouncedSave(editorSettings.autoSaveDelay);

  // Auto save: Handle blur listener for onFocusChange mode
  // This effect ensures listener is properly registered/unregistered when autoSave mode changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Cleanup previous listener
    if (blurDisposableRef.current) {
      blurDisposableRef.current.dispose();
      blurDisposableRef.current = null;
    }

    // Register new listener if onFocusChange mode
    if (editorSettings.autoSave === 'onFocusChange') {
      const handleBlur = () => {
        const path = activeTabPathRef.current;
        if (path && hasPendingAutoSaveRef.current) {
          handleSaveWithBlameRefresh(path);
          hasPendingAutoSaveRef.current = false;
        }
      };
      blurDisposableRef.current = editor.onDidBlurEditorText(handleBlur);
    }

    return () => {
      if (blurDisposableRef.current) {
        blurDisposableRef.current.dispose();
        blurDisposableRef.current = null;
      }
    };
  }, [editorSettings.autoSave, handleSaveWithBlameRefresh]);

  // Auto save: Save on window focus change
  useEffect(() => {
    const handleWindowBlur = () => {
      if (
        activeTabPath &&
        editorSettings.autoSave === 'onWindowChange' &&
        hasPendingAutoSaveRef.current
      ) {
        handleSaveWithBlameRefresh(activeTabPath);
        hasPendingAutoSaveRef.current = false;
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [activeTabPath, editorSettings.autoSave, handleSaveWithBlameRefresh]);

  // Listen for external file changes and update open tabs
  useEffect(() => {
    // Debounce timers keyed by file path to prevent concurrent reloads of the same file.
    // Needed because Claude CLI atomic writes (tmp + rename) can fire multiple rapid events.
    const reloadTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const scheduleReload = (tab: EditorTab) => {
      // Capture only the stable path to avoid stale closure over the full tab object.
      const tabPath = tab.path;
      const existing = reloadTimers.get(tabPath);
      if (existing) clearTimeout(existing);
      reloadTimers.set(
        tabPath,
        setTimeout(async () => {
          reloadTimers.delete(tabPath);
          try {
            const { content: latestContent, isBinary } =
              await window.electronAPI.file.read(tabPath);
            if (isBinary) return;

            // Re-fetch latest tab state from store to avoid using stale closure values
            // (e.g. isDirty or activeTabPath may have changed during the 100ms debounce window).
            const { tabs: currentTabs, activeTabPath: currentActiveTabPath } =
              useEditorStore.getState();
            const currentTab = currentTabs.find((t) => t.path === tabPath);
            // Tab was closed during the debounce window — nothing to do.
            if (!currentTab) return;

            if (currentTab.isDirty) {
              // User has unsaved edits: avoid overwriting — mark as conflict for user to decide.
              // Compare against externalContent (not user's content) so consecutive external
              // modifications always update externalContent to the latest value.
              if (latestContent !== currentTab.externalContent) {
                markExternalChange(tabPath, latestContent);
              }
            } else {
              // No unsaved edits: silent auto-reload
              onContentChange(tabPath, latestContent, false);

              // Sync Monaco editor content if this is the active tab
              if (tabPath === currentActiveTabPath && editorRef.current) {
                const editor = editorRef.current;
                if (editor.getValue() !== latestContent) {
                  setEditorValueProgrammatically(editor, latestContent);
                }
              }
            }
          } catch (error) {
            console.warn(`Failed to reload file ${tabPath}:`, error);
          }
        }, 100)
      );
    };

    const unsubscribe = window.electronAPI.file.onChange(async (event) => {
      // Skip delete events; handle both 'update' and 'create'.
      // Claude CLI uses atomic writes (write to .tmp + rename), which @parcel/watcher
      // reports as 'create' for the destination file rather than 'update'.
      if (event.type === 'delete') return;

      // Bulk mode: agent modified too many files at once, reload all open tabs
      if (event.path.endsWith('/.enso-bulk')) {
        for (const tab of tabsRef.current) scheduleReload(tab);
        return;
      }

      // Check if the changed file is open in any tab
      const changedTab = tabsRef.current.find((tab) => tab.path === event.path);
      if (!changedTab) return;
      scheduleReload(changedTab);
    });

    return () => {
      unsubscribe();
      // Clear any pending debounce timers on cleanup
      for (const timer of reloadTimers.values()) clearTimeout(timer);
      reloadTimers.clear();
    };
  }, [onContentChange, markExternalChange, setEditorValueProgrammatically]);

  // Sync Monaco editor when store content is updated by background refresh (tab switch reload)
  useEffect(() => {
    if (!activeTab || !editorRef.current || activeTab.isDirty) return;
    const editor = editorRef.current;
    const currentValue = editor.getValue();
    if (currentValue !== activeTab.content) {
      setEditorValueProgrammatically(editor, activeTab.content);
    }
  }, [activeTab, setEditorValueProgrammatically]);

  // Define custom theme on mount and when terminal theme / background image settings change
  useEffect(() => {
    defineMonacoTheme(terminalTheme, {
      backgroundImageEnabled,
      backgroundOpacity,
    });
    themeDefinedRef.current = true;
  }, [terminalTheme, backgroundImageEnabled, backgroundOpacity]);

  // Handle pending cursor navigation (jump to line and select match)
  // Only handles same-file search; new file search is handled by handleEditorMount
  useEffect(() => {
    if (
      !pendingCursor ||
      !editorRef.current ||
      pendingCursor.path !== activeTabPath ||
      editorForPathRef.current !== activeTabPath
    ) {
      return;
    }

    const editor = editorRef.current;
    const { line, column, matchLength } = pendingCursor;
    const startColumn = (column ?? 0) + 1;

    if (matchLength && matchLength > 0) {
      const selection = {
        startLineNumber: line,
        startColumn,
        endLineNumber: line,
        endColumn: startColumn + matchLength,
      };
      editor.setSelection(selection);
      editor.revealRangeInCenter(selection);
    } else {
      editor.setPosition({ lineNumber: line, column: startColumn });
      editor.revealLineInCenter(line);
    }
    editor.focus();

    onClearPendingCursor();
  }, [pendingCursor, activeTabPath, onClearPendingCursor]);

  const handleEditorMount: OnMount = useCallback(
    (editor, m) => {
      editorRef.current = editor;
      monacoRef.current = m;
      setEditorInstance(editor);
      setMonacoInstance(m);
      editorForPathRef.current = activeTabPath;
      setEditorReady(true);

      // Cmd/Ctrl+S shortcut is registered via useEffect + onKeyDown below
      // to avoid addCommand's closure stale issue and registry leak problem

      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyF, () => {
        const selection = editor.getSelection();
        const selectedText =
          !selection || selection.isEmpty()
            ? ''
            : (editor.getModel()?.getValueInRange(selection) ?? '');
        onGlobalSearch?.(selectedText);
      });

      // Add context menu action: Send to session
      editor.addAction({
        id: 'send-to-session',
        label: t('Send to session'),
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        precondition: 'editorHasSelection',
        run: (ed) => {
          const selection = ed.getSelection();
          const currentPath = activeTabPathRef.current;
          if (!selection || selection.isEmpty() || !currentPath) return;

          const currentSessionId = sessionIdRef.current;
          if (!currentSessionId) return;

          // Convert to relative path
          const displayPath = getRelativePath(currentPath);

          // Format line reference
          const lineRef = formatLineRef(selection);

          // Send to terminal with @ prefix and line reference
          const message = `@${displayPath}#${lineRef} `;
          const terminalWrite = useTerminalWriteStore.getState().write;
          const terminalFocus = useTerminalWriteStore.getState().focus;

          terminalWrite(currentSessionId, message);
          terminalFocus(currentSessionId);

          // Show success toast
          addToast({
            type: 'success',
            title: t('Sent to session'),
            description: `@${displayPath}#${lineRef}`,
            timeout: 2000,
          });
        },
      });

      // Double-click: select innermost scope (brackets, quotes, indentation)
      setupDoubleClickScope(editor);

      // Cmd/Ctrl+Click and F12: go-to-definition via ripgrep declaration search.
      // Dispose the previous instance first to avoid accumulating listeners across
      // file switches (editor is remounted with a new instance on every key change).
      definitionNavDisposableRef.current?.dispose();
      definitionNavDisposableRef.current = setupDefinitionNavigation(
        editor,
        m,
        () => rootPathRef.current
      );

      // Restore view state if available
      if (activeTab?.viewState) {
        editor.restoreViewState(activeTab.viewState as monaco.editor.ICodeEditorViewState);
      }

      // Handle pending cursor navigation on mount (for search result navigation)
      // Use ref to get latest value since onMount may be called after state update
      const cursor = pendingCursorRef.current;
      if (cursor && cursor.path === activeTabPath) {
        const { line, column, matchLength } = cursor;
        const startColumn = (column ?? 0) + 1;

        setTimeout(() => {
          if (matchLength && matchLength > 0) {
            const selection = {
              startLineNumber: line,
              startColumn,
              endLineNumber: line,
              endColumn: startColumn + matchLength,
            };
            editor.setSelection(selection);
            editor.revealRangeInCenter(selection);
          } else {
            editor.setPosition({ lineNumber: line, column: startColumn });
            editor.revealLineInCenter(line);
          }
          editor.focus();
        }, 100);
        onClearPendingCursor();
      }

      // Enable foldingImportsByDefault only for Java — avoids auto-collapsing TS/JS imports
      const syncFoldingImports = () => {
        const lang = editor.getModel()?.getLanguageId();
        editor.updateOptions({ foldingImportsByDefault: lang === 'java' });
      };
      syncFoldingImports();
      const foldingImportsDisposable = editor.onDidChangeModel(() => syncFoldingImports());
      editor.onDidDispose(() => foldingImportsDisposable.dispose());

      // Sync scroll from editor to preview (for markdown files)
      editor.onDidScrollChange((e) => {
        if (!previewRef.current || isSyncingScrollRef.current) return;
        const scrollTop = e.scrollTop;
        const scrollHeight = e.scrollHeight;
        const clientHeight = editor.getLayoutInfo().height;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 0) return;

        const scrollRatio = scrollTop / maxScroll;
        const previewMaxScroll = previewRef.current.scrollHeight - previewRef.current.clientHeight;

        isSyncingScrollRef.current = true;
        previewRef.current.scrollTop = scrollRatio * previewMaxScroll;
        requestAnimationFrame(() => {
          isSyncingScrollRef.current = false;
        });
      });
    },
    [
      activeTab?.viewState,
      activeTabPath,
      onGlobalSearch,
      onClearPendingCursor,
      getRelativePath,
      formatLineRef,
      t,
    ]
  );

  // Re-register goto-symbol keybinding whenever the user changes it in Settings.
  // Uses onKeyDown instead of addCommand: addCommand leaks into the shared Monaco
  // command registry and cannot be disposed, causing stale handlers from previous
  // editor instances to fire on every keypress even after the editor is unmounted.
  useEffect(() => {
    if (!editorInstance || !monacoInstance || !editorReady) return;

    const chord = bindingToMonacoChord(editorKeybindings.gotoSymbol, monacoInstance);
    if (chord === 0) return;

    // Extract individual key parts from the chord number
    const keyCode = chord & 0xff;
    const needsMeta = (chord & monacoInstance.KeyMod.CtrlCmd) !== 0;
    const needsCtrl = (chord & monacoInstance.KeyMod.WinCtrl) !== 0;
    const needsShift = (chord & monacoInstance.KeyMod.Shift) !== 0;
    const needsAlt = (chord & monacoInstance.KeyMod.Alt) !== 0;

    const disposable = editorInstance.onKeyDown((e) => {
      if (e.keyCode !== keyCode) return;
      if (needsMeta && !e.metaKey && !e.ctrlKey) return;
      if (needsCtrl && !e.ctrlKey) return;
      if (needsShift && !e.shiftKey) return;
      if (needsAlt && !e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      editorInstance.getAction('editor.action.quickOutline')?.run();
    });

    return () => disposable.dispose();
  }, [editorInstance, monacoInstance, editorReady, editorKeybindings.gotoSymbol]);

  // Register Cmd/Ctrl+S save shortcut via onKeyDown instead of addCommand.
  // addCommand captures stale closure values and leaks into Monaco's shared command registry.
  // Using onKeyDown with ref ensures we always get the current activeTabPath.
  useEffect(() => {
    if (!editorInstance || !monacoInstance || !editorReady) return;

    const disposable = editorInstance.onKeyDown((e) => {
      // Check for Cmd+S (macOS) or Ctrl+S (Windows/Linux)
      const isSaveShortcut =
        e.keyCode === monacoInstance.KeyCode.KeyS &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey;

      if (!isSaveShortcut) return;

      const currentPath = activeTabPathRef.current;
      if (!currentPath) return;

      e.preventDefault();
      e.stopPropagation();
      handleSaveWithBlameRefresh(currentPath);
    });

    return () => disposable.dispose();
  }, [editorInstance, monacoInstance, editorReady, handleSaveWithBlameRefresh]);

  // Register Alt+Left/Right navigation keybindings via onKeyDown instead of addCommand.
  // addCommand leaks into Monaco's shared command registry and cannot be disposed;
  // onKeyDown is properly cleaned up when the editor instance changes.
  useEffect(() => {
    if (!editorInstance || !monacoInstance || !editorReady) return;

    const disposable = editorInstance.onKeyDown((e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const isLeft = e.keyCode === monacoInstance.KeyCode.LeftArrow;
      const isRight = e.keyCode === monacoInstance.KeyCode.RightArrow;
      if (!isLeft && !isRight) return;

      const currentPath = activeTabPathRef.current;
      if (!currentPath) return;
      const pos = editorRef.current?.getPosition();
      const current: NavEntry = {
        path: currentPath,
        line: pos?.lineNumber ?? 1,
        column: pos?.column ?? 1,
      };

      e.preventDefault();
      e.stopPropagation();

      const target = isLeft
        ? useEditorStore.getState().navBack(current)
        : useEditorStore.getState().navForward(current);
      if (target) navigateToEntry(target);
    });

    return () => disposable.dispose();
  }, [editorInstance, monacoInstance, editorReady, navigateToEntry]);

  // Selection comment widget and cursor tracking
  useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    const m = monacoRef.current;
    if (!editor || !m) return;

    // Always track cursor line for "Open in editor" functionality
    const cursorDisposable = editor.onDidChangeCursorSelection((e) => {
      setCurrentCursorLine(e.selection.startLineNumber);
    });

    // Clean up any stale widget from previous effect run
    if (selectionWidgetRef.current) {
      try {
        editor.removeContentWidget(selectionWidgetRef.current);
      } catch {
        // Ignore if already removed
      }
      selectionWidgetRef.current = null;
      widgetPositionRef.current = null;
    }

    // Create selection action widget (button)
    const widgetDomNode = document.createElement('div');
    widgetDomNode.className = 'monaco-selection-widget';
    widgetDomNode.style.zIndex = '100';

    // Create comment form widget
    const commentWidgetDomNode = document.createElement('div');
    commentWidgetDomNode.className = 'monaco-selection-comment-widget';
    commentWidgetDomNode.style.cssText = 'z-index: 100; width: 320px;';

    let commentWidgetRoot: Root | null = null;
    let commentWidgetInstance: monaco.editor.IContentWidget | null = null;

    const showCommentForm = () => {
      const selection = editor.getSelection();
      const currentPath = activeTabPathRef.current;
      if (!selection || selection.isEmpty() || !currentPath) return;

      // Hide button widget
      if (selectionWidgetRef.current) {
        editor.removeContentWidget(selectionWidgetRef.current);
        selectionWidgetRef.current = null;
      }

      // Convert to relative path
      const displayPath = getRelativePath(currentPath);

      // Create comment widget
      const commentWidget: monaco.editor.IContentWidget = {
        getId: () => 'selection.comment.widget',
        getDomNode: () => commentWidgetDomNode,
        getPosition: () => ({
          position: {
            // Use actual cursor position (not selection end)
            lineNumber: selection.positionLineNumber,
            column: selection.positionColumn,
          },
          preference: [m.editor.ContentWidgetPositionPreference.BELOW],
        }),
      };

      commentWidgetInstance = commentWidget;

      // Render comment form
      if (commentWidgetRoot) {
        commentWidgetRoot.unmount();
      }
      commentWidgetRoot = createRoot(commentWidgetDomNode);
      commentWidgetRoot.render(
        <CommentForm
          lineNumber={selection.startLineNumber}
          endLineNumber={selection.endLineNumber}
          filePath={displayPath}
          onSubmit={(text) => {
            const currentSessionId = sessionIdRef.current;
            if (!currentSessionId) return;

            // Verify terminal writer exists
            const writer = useTerminalWriteStore.getState().writers.get(currentSessionId);
            if (!writer) {
              console.warn('Terminal writer not found for session:', currentSessionId);
              return;
            }

            // Format: path#L1-L10 or path#L5
            const lineRef = formatLineRef(selection);
            const message = text
              ? `${displayPath}#${lineRef}\nUser comment: "${text}"`
              : `${displayPath}#${lineRef}`;
            write(currentSessionId, `${message}\r`);

            // Close comment widget
            if (commentWidgetInstance) {
              editor.removeContentWidget(commentWidgetInstance);
              commentWidgetInstance = null;
            }

            // Focus terminal after short delay
            setTimeout(() => {
              focus(currentSessionId);
            }, 100);
          }}
          onCancel={() => {
            if (commentWidgetInstance) {
              editor.removeContentWidget(commentWidgetInstance);
              commentWidgetInstance = null;
            }
          }}
        />
      );

      editor.addContentWidget(commentWidget);
    };

    // Render the button
    if (widgetRootRef.current) {
      widgetRootRef.current.unmount();
    }
    widgetRootRef.current = createRoot(widgetDomNode);
    widgetRootRef.current.render(
      <button
        type="button"
        className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
        onClick={showCommentForm}
        onMouseDown={(e) => e.preventDefault()}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {t('Add comment')}
      </button>
    );

    const selectionWidget: monaco.editor.IContentWidget = {
      getId: () => 'selection.action.widget',
      getDomNode: () => widgetDomNode,
      getPosition: () =>
        widgetPositionRef.current
          ? {
              position: widgetPositionRef.current,
              preference: [
                m.editor.ContentWidgetPositionPreference.BELOW,
                m.editor.ContentWidgetPositionPreference.ABOVE,
              ],
            }
          : null,
    };

    const selectionDisposable = editor.onDidChangeCursorSelection((e) => {
      // Use ref to get current value, not stale closure value
      const currentTabPath = activeTabPathRef.current;
      if (!currentTabPath) return;

      const selection = e.selection;
      const model = editor.getModel();
      if (!model) return;

      const selectedText = model.getValueInRange(selection);
      latestSelectionText = selectedText;

      // Hide comment widget if selection changes
      if (commentWidgetInstance) {
        editor.removeContentWidget(commentWidgetInstance);
        commentWidgetInstance = null;
      }

      // Show/hide selection button widget
      if (!selection.isEmpty() && selectedText.trim().length > 0) {
        widgetPositionRef.current = {
          lineNumber: selection.positionLineNumber,
          column: selection.positionColumn,
        };
        if (!selectionWidgetRef.current) {
          selectionWidgetRef.current = selectionWidget;
          editor.addContentWidget(selectionWidget);
        } else {
          editor.layoutContentWidget(selectionWidgetRef.current);
        }
      } else {
        if (selectionWidgetRef.current) {
          editor.removeContentWidget(selectionWidgetRef.current);
          selectionWidgetRef.current = null;
          widgetPositionRef.current = null;
        }
      }

      // Send selection_changed notification to Claude Code (debounced)
      if (claudeCodeIntegration.enabled) {
        if (selectionDebounceRef.current) {
          clearTimeout(selectionDebounceRef.current);
        }
        selectionDebounceRef.current = setTimeout(() => {
          window.electronAPI.mcp.sendSelectionChanged({
            text: selectedText,
            filePath: currentTabPath,
            fileUrl: toMonacoFileUri(currentTabPath),
            selection: {
              start: {
                line: selection.startLineNumber,
                character: selection.startColumn,
              },
              end: {
                line: selection.endLineNumber,
                character: selection.endColumn,
              },
              isEmpty: selection.isEmpty(),
            },
          });
        }, claudeCodeIntegration.selectionChangedDebounce);
      }
    });

    return () => {
      cursorDisposable.dispose();
      selectionDisposable.dispose();
      if (selectionDebounceRef.current) {
        clearTimeout(selectionDebounceRef.current);
        selectionDebounceRef.current = null;
      }
      const currentEditor = editorRef.current;
      if (selectionWidgetRef.current && currentEditor) {
        try {
          currentEditor.removeContentWidget(selectionWidgetRef.current);
        } catch {
          // Editor may have been disposed, ignore
        }
        selectionWidgetRef.current = null;
        widgetPositionRef.current = null;
      }
      if (commentWidgetInstance && currentEditor) {
        try {
          currentEditor.removeContentWidget(commentWidgetInstance);
        } catch {
          // Ignore
        }
      }
      if (widgetRootRef.current) {
        widgetRootRef.current.unmount();
        widgetRootRef.current = null;
      }
      if (commentWidgetRoot) {
        commentWidgetRoot.unmount();
      }
    };
  }, [
    editorReady,
    // activeTabPath, // Not needed - we use activeTabPathRef.current instead
    getRelativePath,
    formatLineRef,
    t,
    setCurrentCursorLine,
    write,
    focus,
    claudeCodeIntegration.enabled,
    claudeCodeIntegration.selectionChangedDebounce,
  ]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      // Ignore onChange events fired by programmatic setValue (not actual user input)
      if (isProgrammaticUpdateRef.current) return;

      if (activeTabPath && value !== undefined) {
        const autoSaveEnabled = editorSettings.autoSave !== 'off';
        // Show dirty indicator when auto save is off or when it triggers on focus/window change
        const shouldShowDirty =
          !autoSaveEnabled ||
          editorSettings.autoSave === 'onFocusChange' ||
          editorSettings.autoSave === 'onWindowChange';
        onContentChange(activeTabPath, value, shouldShowDirty);

        // Mark as pending for focus/window change modes
        if (autoSaveEnabled) {
          hasPendingAutoSaveRef.current = true;
        }

        // Trigger auto save based on mode
        if (editorSettings.autoSave === 'afterDelay') {
          triggerDebouncedSave(activeTabPath, (path) => {
            handleSaveWithBlameRefresh(path);
            hasPendingAutoSaveRef.current = false;
          });
        }

        // Debounced: record edit position into navigation history (500ms after last keystroke)
        // Capture both path and cursor position now to avoid tab-switch race conditions:
        // reading them inside the callback would reflect the new tab's state, not the edited file.
        if (editNavTimerRef.current) clearTimeout(editNavTimerRef.current);
        const capturedPath = activeTabPath;
        const capturedPos = editorRef.current?.getPosition();
        editNavTimerRef.current = setTimeout(() => {
          if (!capturedPath || !capturedPos) return;
          useEditorStore.getState().pushNavHistory({
            path: capturedPath,
            line: capturedPos.lineNumber,
            column: capturedPos.column,
          });
        }, 500);
      }
    },
    [
      activeTabPath,
      onContentChange,
      editorSettings.autoSave,
      triggerDebouncedSave,
      handleSaveWithBlameRefresh,
    ]
  );

  const handleTabClose = useCallback(
    async (path: string, e?: React.MouseEvent) => {
      e?.stopPropagation();

      // Auto-save before closing based on mode (VS Code behavior):
      // - afterDelay: save (debounced save may still be pending)
      // - onFocusChange: save (closing tab should trigger save like focus change)
      // - onWindowChange: don't save (user needs to manually save)
      // - off: don't save (manual save only)
      const shouldAutoSaveOnClose =
        editorSettings.autoSave === 'afterDelay' || editorSettings.autoSave === 'onFocusChange';

      // Sync save before closing (await to ensure file is written before tab is removed)
      // We need to save directly because saveFile.mutate reads from tabs which will be removed
      if (
        path === activeTabPath &&
        editorRef.current &&
        hasPendingAutoSaveRef.current &&
        shouldAutoSaveOnClose
      ) {
        const currentContent = editorRef.current.getValue();
        const tab = tabs.find((t) => t.path === path);
        onContentChange(path, currentContent, false);
        await window.electronAPI.file.write(path, currentContent, tab?.encoding);
        hasPendingAutoSaveRef.current = false;
      }

      // Cancel pending debounced save
      cancelDebouncedSave();

      // Save view state before closing
      if (editorRef.current && path === activeTabPath) {
        const viewState = editorRef.current.saveViewState();
        if (viewState) {
          onViewStateChange(path, viewState);
        }
      }

      onTabClose(path);
    },
    [
      activeTabPath,
      onTabClose,
      onViewStateChange,
      cancelDebouncedSave,
      editorSettings.autoSave,
      onContentChange,
      tabs,
    ]
  );

  useImperativeHandle(
    ref,
    () => ({
      getSelectedText: () => {
        const editor = editorRef.current;
        if (!editor) return '';
        const selection = editor.getSelection();
        if (!selection || selection.isEmpty()) return '';
        return editor.getModel()?.getValueInRange(selection) ?? '';
      },
      requestCloseTab: (path: string) => {
        void handleTabClose(path);
      },
    }),
    [handleTabClose]
  );

  // Save view state when switching tabs
  const handleTabClick = useCallback(
    (path: string) => {
      // Flush pending debounced save when switching tabs (save immediately)
      flushDebouncedSave();

      if (editorRef.current && activeTabPath && activeTabPath !== path) {
        const viewState = editorRef.current.saveViewState();
        if (viewState) {
          onViewStateChange(activeTabPath, viewState);
        }
      }
      onTabClick(path);
    },
    [activeTabPath, onTabClick, onViewStateChange, flushDebouncedSave]
  );

  // Determine Monaco theme - use custom theme synced with terminal
  const monacoTheme = themeDefinedRef.current ? CUSTOM_THEME_NAME : 'vs-dark';

  // Handle resize divider for markdown preview
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newPreviewWidth = ((rect.right - moveEvent.clientX) / rect.width) * 100;
      // Clamp between 20% and 80%
      setPreviewWidth(Math.min(80, Math.max(20, newPreviewWidth)));
    };

    const handleMouseUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Sync scroll from preview to editor
  const handlePreviewScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!editorRef.current || isSyncingScrollRef.current) return;
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const maxScroll = target.scrollHeight - target.clientHeight;
    if (maxScroll <= 0) return;

    const scrollRatio = scrollTop / maxScroll;
    const editor = editorRef.current;
    const editorScrollHeight = editor.getScrollHeight();
    const editorClientHeight = editor.getLayoutInfo().height;
    const editorMaxScroll = editorScrollHeight - editorClientHeight;

    isSyncingScrollRef.current = true;
    editor.setScrollTop(scrollRatio * editorMaxScroll);
    requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  }, []);

  // Cycle through preview modes: off -> split -> fullscreen -> off
  const cyclePreviewMode = useCallback(() => {
    setPreviewMode((current) => {
      if (current === 'off') return 'split';
      if (current === 'split') return 'fullscreen';
      return 'off';
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex h-10 items-center border-b">
        {isFileTreeCollapsed && onToggleFileTree && (
          <button
            type="button"
            onClick={onToggleFileTree}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            title={t('Show file tree')}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <EditorTabs
            tabs={tabs}
            activeTabPath={activeTabPath}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onClose={onTabClose}
            onCloseOthers={onCloseOthers}
            onCloseAll={onCloseAll}
            onCloseSaved={onCloseSaved}
            onCloseLeft={onCloseLeft}
            onCloseRight={onCloseRight}
            onTabReorder={onTabReorder}
            onSendToSession={sessionId ? handleSendToSession : undefined}
            sessionId={sessionId}
          />
        </div>
        {tabs.length > 0 && (onCloseSaved || onCloseAll) && (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 shrink-0 rounded-none p-0 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  title={t('Tab actions')}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
            />
            <MenuPopup align="end" side="bottom" sideOffset={4}>
              <MenuItem
                disabled={!onCloseSaved || !tabs.some((tab) => !tab.isDirty)}
                onClick={async () => {
                  if (onCloseSaved) await onCloseSaved();
                }}
              >
                {t('Close Saved Tabs')}
              </MenuItem>
              <MenuItem
                disabled={!onCloseAll}
                onClick={async () => {
                  if (!onCloseAll) return;
                  await onCloseAll();
                }}
              >
                {t('Close All Tabs')}
              </MenuItem>
            </MenuPopup>
          </Menu>
        )}
        {/* Markdown Preview Toggle */}
        {isMarkdown && (
          <button
            type="button"
            onClick={cyclePreviewMode}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            title={
              previewMode === 'off'
                ? t('Show split preview')
                : previewMode === 'split'
                  ? t('Switch to fullscreen preview')
                  : t('Close preview')
            }
          >
            {previewMode === 'off' ? (
              <EyeOff className="h-4 w-4" />
            ) : previewMode === 'split' ? (
              <Eye className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      {activeTab && breadcrumbSegments.length > 0 && rootPath && (
        <div className="shrink-0 border-b px-3 py-1">
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap text-xs">
              {breadcrumbSegments.map((segment, index) => (
                <span key={segment.path} className="contents">
                  {index > 0 && <BreadcrumbSeparator className="[&>svg]:size-3" />}
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbTreeMenu
                      dirPath={segment.path}
                      rootPath={rootPath}
                      onFileClick={onTabClick}
                      onNavigateToFile={onNavigateToFile}
                      activeTabPath={activeTabPath}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm hover:bg-accent/50 px-1 py-0.5 -mx-1 transition-colors text-foreground truncate"
                      >
                        {segment.name}
                      </button>
                    </BreadcrumbTreeMenu>
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      )}

      {/* External modification conflict banner */}
      {activeTab?.hasExternalChange && (
        <ExternalModificationBanner
          onReload={() => {
            const externalContent = activeTab.externalContent;
            applyExternalChange(activeTab.path);
            // Sync Monaco editor immediately after applying external content
            if (editorRef.current && externalContent !== undefined) {
              setEditorValueProgrammatically(editorRef.current, externalContent);
            }
          }}
          onDismiss={() => dismissExternalChange(activeTab.path)}
        />
      )}

      {/* Editor */}
      <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1 flex">
        {activeTab ? (
          <>
            {/* Editor Panel */}
            <div
              className="relative h-full overflow-hidden"
              style={{
                width:
                  !isMarkdown || previewMode === 'off'
                    ? '100%'
                    : previewMode === 'split'
                      ? `${100 - previewWidth}%`
                      : 0,
              }}
            >
              {activeTab.isUnsupported ? (
                <Empty className="flex-1">
                  <EmptyMedia variant="icon">
                    <FileX className="h-4.5 w-4.5" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>{t('No preview available')}</EmptyTitle>
                    <EmptyDescription>
                      {t('This file type is not supported for preview')}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : isImage ? (
                <ImagePreview path={activeTab.path} />
              ) : isPdf ? (
                <PdfPreview path={activeTab.path} />
              ) : (
                <Editor
                  width="100%"
                  height="100%"
                  path={toMonacoFileUri(activeTab.path)}
                  value={activeTab.content}
                  theme={monacoTheme}
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  options={{
                    // Display
                    minimap: {
                      enabled:
                        isMarkdown && previewMode !== 'off' ? false : editorSettings.minimapEnabled,
                      side: 'right',
                      showSlider: 'mouseover',
                      renderCharacters: false,
                      maxColumn: 80,
                    },
                    lineNumbers: editorSettings.lineNumbers,
                    wordWrap: editorSettings.wordWrap,
                    renderWhitespace: editorSettings.renderWhitespace,
                    renderLineHighlight: editorSettings.renderLineHighlight,
                    folding: editorSettings.folding,
                    links: editorSettings.links,
                    smoothScrolling: editorSettings.smoothScrolling,
                    // Font
                    fontSize: editorSettings.fontSize,
                    fontFamily: editorSettings.fontFamily,
                    fontLigatures: editorSettings.fontLigatures,
                    lineHeight: editorSettings.lineHeight,
                    // Indentation
                    tabSize: editorSettings.tabSize,
                    insertSpaces: editorSettings.insertSpaces,
                    // Cursor
                    cursorStyle: editorSettings.cursorStyle,
                    cursorBlinking: editorSettings.cursorBlinking,
                    // Brackets
                    bracketPairColorization: {
                      enabled: editorSettings.bracketPairColorization,
                    },
                    matchBrackets: editorSettings.matchBrackets,
                    guides: {
                      bracketPairs: editorSettings.bracketPairGuides,
                      indentation: editorSettings.indentationGuides,
                    },
                    // Editing
                    autoClosingBrackets: editorSettings.autoClosingBrackets,
                    autoClosingQuotes: editorSettings.autoClosingQuotes,
                    // Fixed options
                    padding: {
                      top: editorSettings.paddingTop,
                      bottom: editorSettings.paddingBottom,
                    },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    fixedOverflowWidgets: true,
                  }}
                />
              )}
            </div>

            {/* Resize Divider (only for split mode) */}
            {isMarkdown && previewMode === 'split' && (
              <div
                className="group relative w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 transition-colors"
                onMouseDown={handleResizeMouseDown}
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
            )}

            {/* Preview Panel (for split and fullscreen modes) */}
            {isMarkdown && previewMode !== 'off' && (
              <div
                ref={previewRef}
                className="min-h-0 overflow-auto border-l bg-background"
                style={{
                  width: previewMode === 'split' ? `${previewWidth}%` : '100%',
                }}
                onScroll={handlePreviewScroll}
              >
                <MarkdownPreview
                  content={activeTab.content}
                  filePath={activeTab.path}
                  rootPath={rootPath}
                />
              </div>
            )}
          </>
        ) : (
          <Empty className="flex-1">
            <EmptyMedia variant="icon">
              <FileCode className="h-4.5 w-4.5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{t('Start editing')}</EmptyTitle>
              <EmptyDescription>
                {t('Select a file from the file tree to begin editing')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
});
