import Editor, { loader, type OnMount } from '@monaco-editor/react';
import { FileCode } from 'lucide-react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { useCallback, useEffect, useRef } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
  onTabClose: (path: string) => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onContentChange: (path: string, content: string) => void;
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
  const { terminalTheme, editorSettings } = useSettingsStore();
  const themeDefinedRef = useRef(false);

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

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Add Cmd/Ctrl+S shortcut
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (activeTabPath) {
          onSave(activeTabPath);
        }
      });

      // Restore view state if available
      if (activeTab?.viewState) {
        editor.restoreViewState(activeTab.viewState as monaco.editor.ICodeEditorViewState);
      }
    },
    [activeTab?.viewState, activeTabPath, onSave]
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (activeTabPath && value !== undefined) {
        onContentChange(activeTabPath, value);
      }
    },
    [activeTabPath, onContentChange]
  );

  const handleTabClose = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();

      // Save view state before closing
      if (editorRef.current && path === activeTabPath) {
        const viewState = editorRef.current.saveViewState();
        if (viewState) {
          onViewStateChange(path, viewState);
        }
      }

      onTabClose(path);
    },
    [activeTabPath, onTabClose, onViewStateChange]
  );

  // Save view state when switching tabs
  const handleTabClick = useCallback(
    (path: string) => {
      if (editorRef.current && activeTabPath && activeTabPath !== path) {
        const viewState = editorRef.current.saveViewState();
        if (viewState) {
          onViewStateChange(activeTabPath, viewState);
        }
      }
      onTabClick(path);
    },
    [activeTabPath, onTabClick, onViewStateChange]
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
