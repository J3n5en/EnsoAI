import Editor, { loader, type OnMount } from '@monaco-editor/react';
import { FileCode, Sparkles } from 'lucide-react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { useCallback, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
import { getXtermTheme, isTerminalThemeDark } from '@/lib/ghosttyTheme';
import type { EditorTab, PendingCursor } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { EditorTabs } from './EditorTabs';

// Configure Monaco workers for Electron environment
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Tell @monaco-editor/react to use our pre-configured monaco instance
loader.config({ monaco });

// Configure TypeScript compiler options to suppress module resolution errors
// Monaco's TS service can't resolve project-specific paths like @/* aliases
monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  jsx: monaco.typescript.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  // Suppress module not found errors since we can't provide full project context
  noResolve: true,
});

monaco.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  jsx: monaco.typescript.JsxEmit.ReactJSX,
  noResolve: true,
});

// Disable semantic validation to avoid module resolution errors
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

type Monaco = typeof monaco;

const CUSTOM_THEME_NAME = 'enso-theme';

// Define Monaco theme from terminal theme
function defineMonacoTheme(terminalThemeName: string) {
  const xtermTheme = getXtermTheme(terminalThemeName);
  if (!xtermTheme) return;

  const isDark = isTerminalThemeDark(terminalThemeName);

  monaco.editor.defineTheme(CUSTOM_THEME_NAME, {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: xtermTheme.brightBlack.replace('#', '') },
      { token: 'keyword', foreground: xtermTheme.magenta.replace('#', '') },
      { token: 'string', foreground: xtermTheme.green.replace('#', '') },
      { token: 'number', foreground: xtermTheme.yellow.replace('#', '') },
      { token: 'type', foreground: xtermTheme.cyan.replace('#', '') },
      { token: 'function', foreground: xtermTheme.blue.replace('#', '') },
      { token: 'variable', foreground: xtermTheme.red.replace('#', '') },
      { token: 'constant', foreground: xtermTheme.brightYellow.replace('#', '') },
    ],
    colors: {
      'editor.background': xtermTheme.background,
      'editor.foreground': xtermTheme.foreground,
      'editor.selectionBackground': xtermTheme.selectionBackground,
      'editor.lineHighlightBackground': isDark
        ? `${xtermTheme.brightBlack}30`
        : `${xtermTheme.black}10`,
      'editorCursor.foreground': xtermTheme.cursor,
      'editorLineNumber.foreground': xtermTheme.brightBlack,
      'editorLineNumber.activeForeground': xtermTheme.foreground,
      'editorIndentGuide.background': isDark
        ? `${xtermTheme.brightBlack}40`
        : `${xtermTheme.black}20`,
      'editorIndentGuide.activeBackground': isDark
        ? `${xtermTheme.brightBlack}80`
        : `${xtermTheme.black}40`,
    },
  });
}

interface EditorAreaProps {
  tabs: EditorTab[];
  activeTab: EditorTab | null;
  activeTabPath: string | null;
  pendingCursor: PendingCursor | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void | Promise<void>;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onContentChange: (path: string, content: string, isDirty?: boolean) => void;
  onViewStateChange: (path: string, viewState: unknown) => void;
  onSave: (path: string) => void;
  onClearPendingCursor: () => void;
}

export function EditorArea({
  tabs,
  activeTab,
  activeTabPath,
  pendingCursor,
  onTabClick,
  onTabClose,
  onTabReorder,
  onContentChange,
  onViewStateChange,
  onSave,
  onClearPendingCursor,
}: EditorAreaProps) {
  const { t } = useI18n();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const { terminalTheme, editorSettings, claudeCodeIntegration } = useSettingsStore();
  const themeDefinedRef = useRef(false);
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const widgetRootRef = useRef<Root | null>(null);
  const hasPendingAutoSaveRef = useRef(false);
  const blurDisposableRef = useRef<monaco.IDisposable | null>(null);
  const activeTabPathRef = useRef<string | null>(null);

  // Keep ref in sync with activeTabPath
  useEffect(() => {
    activeTabPathRef.current = activeTabPath;
  }, [activeTabPath]);

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

      // Read the latest content from disk
      try {
        const latestContent = await window.electronAPI.file.read(event.path);
        // Update the tab content
        onContentChange(event.path, latestContent, changedTab.isDirty);

        // If this is the active tab, update the editor content
        if (event.path === activeTabPath && editorRef.current) {
          const editor = editorRef.current;
          const currentValue = editor.getValue();
          // Only update if content is different to avoid cursor jump
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

  // Handle pending cursor navigation (jump to line)
  useEffect(() => {
    if (!pendingCursor || !editorRef.current || pendingCursor.path !== activeTabPath) {
      return;
    }

    const editor = editorRef.current;
    const { line, column } = pendingCursor;

    // Set cursor position and reveal the line
    editor.setPosition({ lineNumber: line, column: column ?? 1 });
    editor.revealLineInCenter(line);
    editor.focus();

    // Clear the pending cursor
    onClearPendingCursor();
  }, [pendingCursor, activeTabPath, onClearPendingCursor]);

  // Build keybinding for Monaco from settings
  const buildAtMentionedKeybinding = useCallback(
    (m: typeof monaco) => {
      const kb = claudeCodeIntegration.atMentionedKeybinding;
      let keyCode = 0;

      // Convert key to Monaco KeyCode
      const keyMap: Record<string, number> = {
        a: m.KeyCode.KeyA,
        b: m.KeyCode.KeyB,
        c: m.KeyCode.KeyC,
        d: m.KeyCode.KeyD,
        e: m.KeyCode.KeyE,
        f: m.KeyCode.KeyF,
        g: m.KeyCode.KeyG,
        h: m.KeyCode.KeyH,
        i: m.KeyCode.KeyI,
        j: m.KeyCode.KeyJ,
        k: m.KeyCode.KeyK,
        l: m.KeyCode.KeyL,
        m: m.KeyCode.KeyM,
        n: m.KeyCode.KeyN,
        o: m.KeyCode.KeyO,
        p: m.KeyCode.KeyP,
        q: m.KeyCode.KeyQ,
        r: m.KeyCode.KeyR,
        s: m.KeyCode.KeyS,
        t: m.KeyCode.KeyT,
        u: m.KeyCode.KeyU,
        v: m.KeyCode.KeyV,
        w: m.KeyCode.KeyW,
        x: m.KeyCode.KeyX,
        y: m.KeyCode.KeyY,
        z: m.KeyCode.KeyZ,
      };
      keyCode = keyMap[kb.key.toLowerCase()] || m.KeyCode.KeyM;

      // Apply modifiers
      if (kb.ctrl) keyCode |= m.KeyMod.CtrlCmd;
      if (kb.meta) keyCode |= m.KeyMod.CtrlCmd;
      if (kb.shift) keyCode |= m.KeyMod.Shift;
      if (kb.alt) keyCode |= m.KeyMod.Alt;

      return keyCode;
    },
    [claudeCodeIntegration.atMentionedKeybinding]
  );

  const handleEditorMount: OnMount = useCallback(
    (editor, m) => {
      editorRef.current = editor;
      monacoRef.current = m;

      // Add Cmd/Ctrl+S shortcut
      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
        if (activeTabPath) {
          onSave(activeTabPath);
        }
      });

      // Add configurable shortcut to mention selection in Claude
      if (claudeCodeIntegration.enabled) {
        editor.addCommand(buildAtMentionedKeybinding(m), () => {
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

      // Selection change listener for Claude IDE Bridge (only when enabled)
      if (claudeCodeIntegration.enabled) {
        // Create selection action widget
        const widgetDomNode = document.createElement('div');
        widgetDomNode.className = 'monaco-selection-widget';

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
          }
        };

        // Render React button into widget
        if (!widgetRootRef.current) {
          widgetRootRef.current = createRoot(widgetDomNode);
        }
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

        let currentPosition: monaco.IPosition | null = null;

        const selectionWidget: monaco.editor.IContentWidget = {
          getId: () => 'selection.action.widget',
          getDomNode: () => widgetDomNode,
          getPosition: () =>
            currentPosition
              ? {
                  position: currentPosition,
                  preference: [
                    m.editor.ContentWidgetPositionPreference.ABOVE,
                    m.editor.ContentWidgetPositionPreference.BELOW,
                  ],
                }
              : null,
        };

        editor.onDidChangeCursorSelection((e) => {
          if (!activeTabPath) return;

          const selection = e.selection;
          const model = editor.getModel();
          if (!model) return;

          const selectedText = model.getValueInRange(selection);

          // Show/hide selection widget
          if (!selection.isEmpty() && selectedText.trim().length > 0) {
            currentPosition = selection.getEndPosition();
            if (!selectionWidgetRef.current) {
              selectionWidgetRef.current = selectionWidget;
              editor.addContentWidget(selectionWidget);
            } else {
              editor.layoutContentWidget(selectionWidget);
            }
          } else {
            if (selectionWidgetRef.current) {
              editor.removeContentWidget(selectionWidgetRef.current);
              selectionWidgetRef.current = null;
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
      }
    },
    [
      activeTab?.viewState,
      activeTabPath,
      onSave,
      claudeCodeIntegration.enabled,
      claudeCodeIntegration.selectionChangedDebounce,
      buildAtMentionedKeybinding,
      t,
    ]
  );

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
        // Sync content to store and mark as not dirty (isDirty: false)
        onContentChange(path, currentContent, false);
        // Save to disk directly (await to ensure it completes before closing)
        await window.electronAPI.file.write(path, currentContent);
        // Note: We don't call onSave here because we already wrote the file directly above.
        // Calling onSave would trigger saveFile.mutate which writes the file again.
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

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <EditorTabs
        tabs={tabs}
        activeTabPath={activeTabPath}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onTabReorder={onTabReorder}
      />

      {/* Editor */}
      <div className="relative min-w-0 flex-1">
        {activeTab ? (
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
                enabled: editorSettings.minimapEnabled,
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
        ) : (
          <Empty>
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
}
