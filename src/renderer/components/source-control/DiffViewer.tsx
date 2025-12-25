import { DiffEditor, loader } from '@monaco-editor/react';
import { ChevronDown, ChevronUp, FileCode } from 'lucide-react';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useFileDiff } from '@/hooks/useSourceControl';
import { useI18n } from '@/i18n';
import { getXtermTheme, isTerminalThemeDark } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useSourceControlStore } from '@/stores/sourceControl';

loader.config({ monaco });

type DiffEditorInstance = monaco.editor.IStandaloneDiffEditor;

const CUSTOM_THEME_NAME = 'enso-diff-theme';

function defineMonacoDiffTheme(terminalThemeName: string) {
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
    ],
    colors: {
      'editor.background': xtermTheme.background,
      'editor.foreground': xtermTheme.foreground,
      'diffEditor.insertedTextBackground': isDark ? '#2ea04326' : '#2ea04320',
      'diffEditor.removedTextBackground': isDark ? '#f8514926' : '#f8514920',
      'diffEditor.insertedLineBackground': isDark ? '#2ea04315' : '#2ea04310',
      'diffEditor.removedLineBackground': isDark ? '#f8514915' : '#f8514910',
      // Current diff highlight
      'editor.lineHighlightBackground': isDark ? '#ffffff10' : '#00000008',
    },
  });
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    java: 'java',
    kt: 'kotlin',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
  };
  return languageMap[ext] || 'plaintext';
}

interface DiffViewerProps {
  rootPath: string;
  file: { path: string; staged: boolean } | null;
  onPrevFile?: () => void;
  onNextFile?: () => void;
  hasPrevFile?: boolean;
  hasNextFile?: boolean;
  diff?: { path: string; original: string; modified: string };
  skipFetch?: boolean;
  isCommitView?: boolean; // Add flag to indicate commit history view
}

export function DiffViewer({
  rootPath,
  file,
  onPrevFile,
  onNextFile,
  hasPrevFile = false,
  hasNextFile = false,
  diff: externalDiff,
  skipFetch = false,
  isCommitView = false,
}: DiffViewerProps) {
  const { t } = useI18n();
  const { terminalTheme, sourceControlKeybindings, editorSettings } = useSettingsStore();
  const { navigationDirection, setNavigationDirection } = useSourceControlStore();

  // In commit view, we don't fetch diff - we use the provided externalDiff
  const shouldFetch = !skipFetch && !isCommitView;

  const { data: fetchedDiff, isLoading } = useFileDiff(
    rootPath,
    file?.path ?? null,
    file?.staged ?? false,
    shouldFetch ? undefined : { enabled: false }
  );

  const diff = externalDiff ?? fetchedDiff;

  const editorRef = useRef<DiffEditorInstance | null>(null);
  const modelsRef = useRef<{
    original: monaco.editor.ITextModel | null;
    modified: monaco.editor.ITextModel | null;
  }>({
    original: null,
    modified: null,
  });
  const [currentDiffIndex, setCurrentDiffIndex] = useState(-1);
  const [lineChanges, setLineChanges] = useState<monaco.editor.ILineChange[]>([]);
  const [boundaryHint, setBoundaryHint] = useState<'top' | 'bottom' | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const hasAutoNavigatedRef = useRef(false);

  // Define theme
  defineMonacoDiffTheme(terminalTheme);

  // Reset internal state (don't dispose models - let @monaco-editor/react handle that)
  const resetEditorState = useCallback(() => {
    editorRef.current = null;
    modelsRef.current.original = null;
    modelsRef.current.modified = null;
    decorationsRef.current = [];
  }, []);

  // Highlight current diff range
  const highlightCurrentDiff = useCallback(
    (index: number, changes?: monaco.editor.ILineChange[]) => {
      const editor = editorRef.current;
      const effectiveChanges = changes || lineChanges;
      if (!editor || effectiveChanges.length === 0 || index < 0) {
        // Clear decorations
        if (editor) {
          const modifiedEditor = editor.getModifiedEditor();
          const originalEditor = editor.getOriginalEditor();
          decorationsRef.current = modifiedEditor.deltaDecorations(decorationsRef.current, []);
          originalEditor.deltaDecorations([], []);
        }
        return;
      }

      const change = effectiveChanges[index];
      const modifiedEditor = editor.getModifiedEditor();
      const originalEditor = editor.getOriginalEditor();

      // Highlight in modified editor
      const modifiedStartLine = change.modifiedStartLineNumber;
      const modifiedEndLine = change.modifiedEndLineNumber || modifiedStartLine;

      decorationsRef.current = modifiedEditor.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(modifiedStartLine, 1, modifiedEndLine, 1),
          options: {
            isWholeLine: true,
            className: 'current-diff-highlight',
            linesDecorationsClassName: 'current-diff-gutter',
          },
        },
      ]);

      // Highlight in original editor
      const originalStartLine = change.originalStartLineNumber;
      const originalEndLine = change.originalEndLineNumber || originalStartLine;

      originalEditor.deltaDecorations(
        [],
        [
          {
            range: new monaco.Range(originalStartLine, 1, originalEndLine, 1),
            options: {
              isWholeLine: true,
              className: 'current-diff-highlight',
              linesDecorationsClassName: 'current-diff-gutter',
            },
          },
        ]
      );
    },
    [lineChanges]
  );

  const handleEditorMount = useCallback(
    (editor: DiffEditorInstance) => {
      editorRef.current = editor;
      hasAutoNavigatedRef.current = false;

      // Track the current models for cleanup
      const currentModel = editor.getModel();
      if (currentModel) {
        modelsRef.current.original = currentModel.original;
        modelsRef.current.modified = currentModel.modified;
      }

      // Use onDidUpdateDiff to ensure diff is fully computed
      editor.onDidUpdateDiff(() => {
        const changes = editor.getLineChanges();
        if (changes && changes.length > 0) {
          setLineChanges(changes);

          // Auto-navigate based on direction (only once per file)
          if (navigationDirection && !hasAutoNavigatedRef.current) {
            hasAutoNavigatedRef.current = true;
            const targetIndex = navigationDirection === 'next' ? 0 : changes.length - 1;
            setCurrentDiffIndex(targetIndex);
            setNavigationDirection(null);

            // Scroll to the diff
            const change = changes[targetIndex];
            // Use modifiedStartLineNumber, fallback for deletions
            const line =
              change.modifiedEndLineNumber > 0
                ? change.modifiedStartLineNumber
                : Math.max(1, change.modifiedStartLineNumber);
            editor.getModifiedEditor().revealLineInCenter(line);

            // Highlight
            highlightCurrentDiff(targetIndex, changes);
          } else if (!hasAutoNavigatedRef.current) {
            setCurrentDiffIndex(-1);
          }
        } else if (changes) {
          setLineChanges(changes);
          setCurrentDiffIndex(-1);
          if (navigationDirection) {
            setNavigationDirection(null);
          }
        }
      });
    },
    [navigationDirection, setNavigationDirection, highlightCurrentDiff]
  );

  const navigateToDiff = useCallback(
    (direction: 'prev' | 'next') => {
      const editor = editorRef.current;
      if (!editor || lineChanges.length === 0) {
        // No diffs, try to switch file
        if (direction === 'prev' && onPrevFile) onPrevFile();
        if (direction === 'next' && onNextFile) onNextFile();
        return;
      }

      const modifiedEditor = editor.getModifiedEditor();
      let newIndex = currentDiffIndex;

      if (direction === 'next') {
        if (currentDiffIndex >= lineChanges.length - 1) {
          // At last diff
          if (boundaryHint === 'bottom') {
            // Already shown hint, switch to next file
            setBoundaryHint(null);
            if (onNextFile) onNextFile();
            return;
          }
          // Show hint
          setBoundaryHint('bottom');
          setTimeout(() => setBoundaryHint(null), 2000);
          return;
        }
        newIndex = currentDiffIndex + 1;
      } else {
        if (currentDiffIndex <= 0) {
          // At first diff (or before any)
          if (boundaryHint === 'top') {
            // Already shown hint, switch to prev file
            setBoundaryHint(null);
            if (onPrevFile) onPrevFile();
            return;
          }
          // Show hint
          setBoundaryHint('top');
          setTimeout(() => setBoundaryHint(null), 2000);
          return;
        }
        newIndex = currentDiffIndex - 1;
      }

      setBoundaryHint(null);
      setCurrentDiffIndex(newIndex);
      highlightCurrentDiff(newIndex);

      // Scroll to the diff
      const change = lineChanges[newIndex];
      const line = change.modifiedStartLineNumber || change.originalStartLineNumber;
      modifiedEditor.revealLineInCenter(line);
    },
    [lineChanges, currentDiffIndex, boundaryHint, onPrevFile, onNextFile, highlightCurrentDiff]
  );

  // Keyboard shortcuts for diff navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!file) return;

      if (matchesKeybinding(e, sourceControlKeybindings.prevDiff)) {
        e.preventDefault();
        navigateToDiff('prev');
        return;
      }

      if (matchesKeybinding(e, sourceControlKeybindings.nextDiff)) {
        e.preventDefault();
        navigateToDiff('next');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, navigateToDiff, sourceControlKeybindings]);

  // Reset state when file changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally trigger on file change
  useEffect(() => {
    // Reset state for new file (don't dispose models - key change will unmount/remount)
    setCurrentDiffIndex(-1);
    setLineChanges([]);
    setBoundaryHint(null);
    hasAutoNavigatedRef.current = false;
    resetEditorState();
  }, [file?.path, file?.staged, resetEditorState]);

  if (!file) {
    return (
      <Empty className="h-full">
        <EmptyMedia variant="icon">
          <FileCode className="h-4.5 w-4.5" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t('View diff')}</EmptyTitle>
          <EmptyDescription>{t('Select file to view diff')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('Loading...')}</p>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('Failed to load diff')}</p>
      </div>
    );
  }

  const getBoundaryTooltip = () => {
    if (boundaryHint === 'top') {
      return hasPrevFile ? t('Switch to previous file') : t('Already at the first change');
    }
    if (boundaryHint === 'bottom') {
      return hasNextFile ? t('Switch to next file') : t('Already at the last change');
    }
    return null;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center">
          <span className="text-sm font-medium">{file.path}</span>
          {isCommitView ? (
            <span className="ml-2 text-xs text-muted-foreground">{t('(commit history)')}</span>
          ) : (
            <span className="ml-2 text-xs text-muted-foreground">
              {file.staged ? t('(staged)') : t('(unstaged)')}
            </span>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          {/* Diff count */}
          {lineChanges.length > 0 && (
            <span className="mr-2 text-xs text-muted-foreground">
              {currentDiffIndex >= 0 ? currentDiffIndex + 1 : '-'}/{lineChanges.length}
            </span>
          )}

          {/* Boundary hint */}
          {boundaryHint && (
            <span className="mr-2 text-xs text-orange-500">{getBoundaryTooltip()}</span>
          )}

          {/* Previous diff */}
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => navigateToDiff('prev')}
            title={t('Previous change (F7, press again to switch file)')}
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          {/* Next diff */}
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => navigateToDiff('next')}
            title={t('Next change (F8, press again to switch file)')}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Diff Editor */}
      <div className="flex-1">
        {diff && diff.original != null && diff.modified != null && (
          <DiffEditor
            key={`${file.path}-${file.staged}`}
            original={diff.original}
            modified={diff.modified}
            language={getLanguageFromPath(file.path)}
            theme={CUSTOM_THEME_NAME}
            onMount={handleEditorMount}
            options={{
              readOnly: true,
              renderSideBySide: true,
              renderSideBySideInlineBreakpoint: 0, // Always use side-by-side
              ignoreTrimWhitespace: false,
              renderOverviewRuler: true,
              diffWordWrap: editorSettings.wordWrap === 'on' ? 'on' : 'off',
              // Display
              minimap: {
                enabled: editorSettings.minimapEnabled,
                side: 'right',
                showSlider: 'mouseover',
                renderCharacters: false,
                maxColumn: 80,
              },
              lineNumbers: editorSettings.lineNumbers,
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
              // Brackets
              bracketPairColorization: { enabled: editorSettings.bracketPairColorization },
              matchBrackets: editorSettings.matchBrackets,
              guides: {
                bracketPairs: editorSettings.bracketPairGuides,
                indentation: editorSettings.indentationGuides,
              },
              // Fixed options
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
            // Prevent library from disposing models before DiffEditorWidget resets
            keepCurrentOriginalModel
            keepCurrentModifiedModel
          />
        )}
      </div>
    </div>
  );
}
