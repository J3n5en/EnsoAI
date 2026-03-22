import Editor from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { CUSTOM_THEME_NAME, defineMonacoTheme } from '@/components/files/monacoTheme';
import { useI18n } from '@/i18n';
import { toMonacoVirtualUri } from '@/lib/monacoModelPath';
import { useSettingsStore } from '@/stores/settings';

interface SearchPreviewPanelProps {
  path: string | null;
  line?: number;
  query?: string;
}

export function SearchPreviewPanel({ path, line, query }: SearchPreviewPanelProps) {
  const { t } = useI18n();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const { terminalTheme, editorSettings } = useSettingsStore(
    useShallow((s) => ({ terminalTheme: s.terminalTheme, editorSettings: s.editorSettings }))
  );

  // Define theme on mount
  useEffect(() => {
    defineMonacoTheme(terminalTheme);
    setThemeReady(true);
  }, [terminalTheme]);

  const monacoTheme = themeReady ? CUSTOM_THEME_NAME : 'vs-dark';

  // Load file content when path changes
  useEffect(() => {
    if (!path) {
      setContent(null);
      return;
    }

    setIsLoading(true);
    window.electronAPI.file
      .read(path)
      .then(({ content }) => {
        setContent(content);
      })
      .catch(() => {
        setContent(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [path]);

  // Apply highlights to editor
  const applyHighlights = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor, delay = false) => {
      if (!line) return;

      const apply = () => {
        const decorations: monaco.editor.IModelDeltaDecoration[] = [];

        // Line highlight
        decorations.push({
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: 'search-preview-highlight-line',
            glyphMarginClassName: 'search-preview-glyph',
          },
        });

        // Text match highlights
        if (query) {
          const model = editor.getModel();
          if (model) {
            const matches = model.findMatches(query, false, false, false, null, true);
            for (const match of matches) {
              decorations.push({
                range: match.range,
                options: {
                  inlineClassName: 'search-preview-highlight-text',
                },
              });
            }
          }
        }

        // Clear old decorations and apply new ones
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);

        // Scroll to line in center
        editor.revealLineInCenter(line, 0 /* Smooth scrolling */);
      };

      if (delay) {
        // Delay to ensure editor is fully rendered
        requestAnimationFrame(() => requestAnimationFrame(apply));
      } else {
        apply();
      }
    },
    [line, query]
  );

  // Scroll to line and highlight when line/content changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: content triggers re-highlight after Monaco loads new file
  useEffect(() => {
    if (!editorRef.current || !line) return;
    // Use delay when content changes to ensure Monaco has rendered
    applyHighlights(editorRef.current, true);
  }, [applyHighlights, content, line]);

  const handleEditorMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    // Apply highlights when editor mounts (with delay for rendering)
    applyHighlights(editor, true);
  };

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('Select a result to preview')}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('Loading...')}
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('Unable to load file')}
      </div>
    );
  }

  // Get file name and directory for header
  const fileName = path.split('/').pop() ?? path;
  const dirPath = path.substring(0, path.lastIndexOf('/'));

  return (
    <div className="flex h-full flex-col">
      {/* File Header */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-muted/30 px-3 text-xs">
        <span className="font-medium">{fileName}</span>
        <span className="text-muted-foreground truncate">{dirPath}</span>
      </div>

      {/* Monaco Editor */}
      <div className="min-h-0 flex-1">
        <Editor
          key={path}
          path={toMonacoVirtualUri('preview', path)}
          value={content}
          theme={monacoTheme}
          onMount={handleEditorMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
            folding: false,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            fontSize: editorSettings.fontSize,
            fontFamily: editorSettings.fontFamily,
            wordWrap: 'on',
            contextmenu: false,
            selectOnLineNumbers: false,
            glyphMargin: true,
          }}
        />
      </div>

      {/* CSS for highlighting */}
      <style>{`
        .search-preview-highlight-line {
          background-color: rgba(255, 255, 0, 0.15) !important;
        }
        .search-preview-highlight-text {
          background-color: rgba(255, 200, 0, 0.4) !important;
          border-radius: 2px;
        }
        .search-preview-glyph {
          background-color: #ffc800;
          width: 4px !important;
          margin-left: 3px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
