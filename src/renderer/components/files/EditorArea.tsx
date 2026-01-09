import Editor, { type OnMount } from '@monaco-editor/react';
import { Eye, EyeOff, FileCode, Sparkles } from 'lucide-react';
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { toastManager } from '@/components/ui/toast';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useI18n } from '@/i18n';
import type { EditorTab, PendingCursor } from '@/stores/editor';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { EditorTabs } from './EditorTabs';
import { buildMonacoKeybinding } from './keyBindings';
import { MarkdownPreview } from './MarkdownPreview';
import { CUSTOM_THEME_NAME, defineMonacoTheme } from './monacoTheme';
// Import for side effects (Monaco setup)
import './monacoSetup';

type Monaco = typeof monaco;

export interface EditorAreaRef {
  getSelectedText: () => string;
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
  onCloseLeft?: (path: string) => void | Promise<void>;
  onCloseRight?: (path: string) => void | Promise<void>;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onContentChange: (path: string, content: string, isDirty?: boolean) => void;
  onViewStateChange: (path: string, viewState: unknown) => void;
  onSave: (path: string) => void;
  onClearPendingCursor: () => void;
  onBreadcrumbClick?: (path: string) => void;
  onGlobalSearch?: (selectedText: string) => void;
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
    onCloseLeft,
    onCloseRight,
    onTabReorder,
    onContentChange,
    onViewStateChange,
    onSave,
    onClearPendingCursor,
    onBreadcrumbClick,
    onGlobalSearch,
  }: EditorAreaProps,
  ref: React.Ref<EditorAreaRef>
) {
  const { t } = useI18n();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const { terminalTheme, editorSettings, claudeCodeIntegration } = useSettingsStore();

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
    }),
    []
  );

  // Markdown preview state
  const isMarkdown = isMarkdownFile(activeTabPath);
  const [showPreview, setShowPreview] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(50); // percentage
  const resizingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false); // Prevent scroll loop
  const setCurrentCursorLine = useEditorStore((state) => state.setCurrentCursorLine);
  const themeDefinedRef = useRef(false);
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const widgetRootRef = useRef<Root | null>(null);
  const widgetPositionRef = useRef<monaco.IPosition | null>(null);
  const hasPendingAutoSaveRef = useRef(false);
  const blurDisposableRef = useRef<monaco.IDisposable | null>(null);
  const activeTabPathRef = useRef<string | null>(null);
  const pendingCursorRef = useRef<PendingCursor | null>(null);
  const editorForPathRef = useRef<string | null>(null);

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
          onSave(path);
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
  }, [editorSettings.autoSave, onSave]);

  // Auto save: Save on window focus change
  useEffect(() => {
    const handleWindowBlur = () => {
      if (
        activeTabPath &&
        editorSettings.autoSave === 'onWindowChange' &&
        hasPendingAutoSaveRef.current
      ) {
        onSave(activeTabPath);
        hasPendingAutoSaveRef.current = false;
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [activeTabPath, editorSettings.autoSave, onSave]);

  // Listen for external file changes and update open tabs
  useEffect(() => {
    const unsubscribe = window.electronAPI.file.onChange(async (event) => {
      // Only handle update events (create/delete don't need tab updates)
      if (event.type !== 'update') return;

      // Check if the changed file is open in any tab
      const changedTab = tabs.find((tab) => tab.path === event.path);
      if (!changedTab) return;

      try {
        const { content: latestContent } = await window.electronAPI.file.read(event.path);
        onContentChange(event.path, latestContent, changedTab.isDirty);

        if (event.path === activeTabPath && editorRef.current) {
          const editor = editorRef.current;
          const currentValue = editor.getValue();
          if (currentValue !== latestContent) {
            const position = editor.getPosition();
            editor.setValue(latestContent);
            if (position) {
              editor.setPosition(position);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to reload file ${event.path}:`, error);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [tabs, activeTabPath, onContentChange]);

  // Define custom theme on mount and when terminal theme changes
  useEffect(() => {
    defineMonacoTheme(terminalTheme);
    themeDefinedRef.current = true;
  }, [terminalTheme]);

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
      editorForPathRef.current = activeTabPath;
      setEditorReady(true);

      // Add Cmd/Ctrl+S shortcut
      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
        if (activeTabPath) {
          onSave(activeTabPath);
        }
      });

      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyF, () => {
        const selection = editor.getSelection();
        const selectedText =
          !selection || selection.isEmpty()
            ? ''
            : (editor.getModel()?.getValueInRange(selection) ?? '');
        onGlobalSearch?.(selectedText);
      });

      // Add configurable shortcut to mention selection in Claude
      if (claudeCodeIntegration.enabled) {
        const keybinding = buildMonacoKeybinding(m, claudeCodeIntegration.atMentionedKeybinding);
        editor.addCommand(keybinding, () => {
          if (!activeTabPath) return;
          const selection = editor.getSelection();
          if (!selection) return;

          const lineCount = selection.endLineNumber - selection.startLineNumber + 1;
          const fileName = activeTabPath.split('/').pop() || activeTabPath;

          window.electronAPI.mcp.sendAtMentioned({
            filePath: activeTabPath,
            lineStart: selection.startLineNumber,
            lineEnd: selection.endLineNumber,
          });

          toastManager.add({
            type: 'success',
            timeout: 1200,
            title: t('Sent to Claude Code'),
            description: `${fileName}:${selection.startLineNumber}-${selection.endLineNumber} (${lineCount} ${t('lines')})`,
          });
        });
      }

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
      onSave,
      onGlobalSearch,
      claudeCodeIntegration.enabled,
      claudeCodeIntegration.atMentionedKeybinding,
      t,
      onClearPendingCursor,
    ]
  );

  // Claude Code Integration: Selection widget and notifications (dynamic based on settings)
  useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    const m = monacoRef.current;
    if (!editor || !m) return;

    // Always track cursor line for "Open in editor" functionality
    const cursorDisposable = editor.onDidChangeCursorSelection((e) => {
      setCurrentCursorLine(e.selection.startLineNumber);
    });

    if (!claudeCodeIntegration.enabled) {
      // Clean up any existing widget when disabled
      if (selectionWidgetRef.current) {
        editor.removeContentWidget(selectionWidgetRef.current);
        selectionWidgetRef.current = null;
      }
      return () => {
        cursorDisposable.dispose();
      };
    }

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

    // Create selection action widget
    const widgetDomNode = document.createElement('div');
    widgetDomNode.className = 'monaco-selection-widget';
    // Ensure widget is visible above other Monaco overlays
    widgetDomNode.style.zIndex = '100';

    const sendToClaudeHandler = () => {
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty() || !activeTabPath) return;

      const lineCount = selection.endLineNumber - selection.startLineNumber + 1;
      const fileName = activeTabPath.split('/').pop() || activeTabPath;

      window.electronAPI.mcp.sendAtMentioned({
        filePath: activeTabPath,
        lineStart: selection.startLineNumber,
        lineEnd: selection.endLineNumber,
      });

      toastManager.add({
        type: 'success',
        timeout: 1200,
        title: t('Sent to Claude Code'),
        description: `${fileName}:${selection.startLineNumber}-${selection.endLineNumber} (${lineCount} ${t('lines')})`,
      });

      // Hide widget after sending
      if (selectionWidgetRef.current) {
        editor.removeContentWidget(selectionWidgetRef.current);
        selectionWidgetRef.current = null;
        widgetPositionRef.current = null;
      }
    };

    // Render React button into widget
    if (widgetRootRef.current) {
      widgetRootRef.current.unmount();
    }
    widgetRootRef.current = createRoot(widgetDomNode);
    widgetRootRef.current.render(
      <button
        type="button"
        className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
        onClick={sendToClaudeHandler}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Sparkles className="h-3 w-3" />
        {t('Send to Claude')}
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
      if (!activeTabPath) return;

      const selection = e.selection;
      const model = editor.getModel();
      if (!model) return;

      const selectedText = model.getValueInRange(selection);

      // Show/hide selection widget
      if (!selection.isEmpty() && selectedText.trim().length > 0) {
        // Use positionLineNumber/positionColumn for actual cursor position
        widgetPositionRef.current = {
          lineNumber: selection.positionLineNumber,
          column: selection.positionColumn,
        };
        if (!selectionWidgetRef.current) {
          selectionWidgetRef.current = selectionWidget;
          editor.addContentWidget(selectionWidget);
        } else {
          // Widget already exists, just update layout
          editor.layoutContentWidget(selectionWidgetRef.current);
        }
      } else {
        if (selectionWidgetRef.current) {
          editor.removeContentWidget(selectionWidgetRef.current);
          selectionWidgetRef.current = null;
          widgetPositionRef.current = null;
        }
      }

      // Clear previous debounce timer
      if (selectionDebounceRef.current) {
        clearTimeout(selectionDebounceRef.current);
      }

      // Debounce selection notifications using settings value
      selectionDebounceRef.current = setTimeout(() => {
        window.electronAPI.mcp.sendSelectionChanged({
          text: selectedText,
          filePath: activeTabPath,
          fileUrl: `file://${activeTabPath}`,
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
    });

    return () => {
      cursorDisposable.dispose();
      selectionDisposable.dispose();
      // Use ref to get current editor instance, as the closure's editor may be stale
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
      if (widgetRootRef.current) {
        widgetRootRef.current.unmount();
        widgetRootRef.current = null;
      }
      if (selectionDebounceRef.current) {
        clearTimeout(selectionDebounceRef.current);
      }
    };
  }, [
    editorReady,
    claudeCodeIntegration.enabled,
    claudeCodeIntegration.selectionChangedDebounce,
    activeTabPath,
    t,
    setCurrentCursorLine,
  ]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
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
            onSave(path);
            hasPendingAutoSaveRef.current = false;
          });
        }
      }
    },
    [activeTabPath, onContentChange, editorSettings.autoSave, triggerDebouncedSave, onSave]
  );

  const handleTabClose = useCallback(
    async (path: string, e: React.MouseEvent) => {
      e.stopPropagation();

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

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          <EditorTabs
            tabs={tabs}
            activeTabPath={activeTabPath}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onClose={onTabClose}
            onCloseOthers={onCloseOthers}
            onCloseAll={onCloseAll}
            onCloseLeft={onCloseLeft}
            onCloseRight={onCloseRight}
            onTabReorder={onTabReorder}
          />
        </div>
        {/* Markdown Preview Toggle */}
        {isMarkdown && (
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex h-10 w-10 shrink-0 items-center justify-center border-b text-muted-foreground hover:text-foreground transition-colors"
            title={showPreview ? t('Hide preview') : t('Show preview')}
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      {activeTab && breadcrumbSegments.length > 0 && (
        <div className="shrink-0 border-b bg-background px-3 py-1">
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap text-xs">
              {breadcrumbSegments.map((segment, index) => (
                <span key={segment.path} className="contents">
                  {index > 0 && <BreadcrumbSeparator className="[&>svg]:size-3" />}
                  <BreadcrumbItem className="min-w-0">
                    {segment.isLast ? (
                      <BreadcrumbPage className="truncate">{segment.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        render={<button type="button" />}
                        className="truncate"
                        onClick={() => onBreadcrumbClick?.(segment.path)}
                      >
                        {segment.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      )}

      {/* Editor */}
      <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1 flex">
        {activeTab ? (
          <>
            {/* Editor Panel */}
            <div
              className="relative h-full overflow-hidden"
              style={{ width: isMarkdown && showPreview ? `${100 - previewWidth}%` : '100%' }}
            >
              <Editor
                key={activeTab.path}
                width="100%"
                height="100%"
                path={activeTab.path}
                value={activeTab.content}
                theme={monacoTheme}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                options={{
                  // Display
                  minimap: {
                    enabled: isMarkdown && showPreview ? false : editorSettings.minimapEnabled,
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
                  fontLigatures: true,
                  lineHeight: 20,
                  // Indentation
                  tabSize: editorSettings.tabSize,
                  insertSpaces: editorSettings.insertSpaces,
                  // Cursor
                  cursorStyle: editorSettings.cursorStyle,
                  cursorBlinking: editorSettings.cursorBlinking,
                  // Brackets
                  bracketPairColorization: { enabled: editorSettings.bracketPairColorization },
                  matchBrackets: editorSettings.matchBrackets,
                  guides: {
                    bracketPairs: editorSettings.bracketPairGuides,
                    indentation: editorSettings.indentationGuides,
                  },
                  // Editing
                  autoClosingBrackets: editorSettings.autoClosingBrackets,
                  autoClosingQuotes: editorSettings.autoClosingQuotes,
                  // Fixed options
                  padding: { top: 12, bottom: 12 },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  fixedOverflowWidgets: true,
                }}
              />
            </div>

            {/* Resize Divider & Preview Panel (only for markdown with preview enabled) */}
            {isMarkdown && showPreview && (
              <>
                {/* Resize Divider */}
                <div
                  className="group relative w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 transition-colors"
                  onMouseDown={handleResizeMouseDown}
                >
                  <div className="absolute inset-y-0 -left-1 -right-1" />
                </div>

                {/* Preview Panel */}
                <div
                  ref={previewRef}
                  className="min-h-0 overflow-auto border-l bg-background"
                  style={{ width: `${previewWidth}%` }}
                  onScroll={handlePreviewScroll}
                >
                  <MarkdownPreview
                    content={activeTab.content}
                    basePath={activeTab.path.substring(0, activeTab.path.lastIndexOf('/'))}
                  />
                </div>
              </>
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
