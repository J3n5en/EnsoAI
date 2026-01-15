import { DiffEditor } from '@monaco-editor/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileCode,
  MessageSquare,
  Pencil,
  Plus,
  Save,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CommentForm } from '@/components/files/EditorLineComment';
import { monaco } from '@/components/files/monacoSetup';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { toastManager } from '@/components/ui/toast';
import { useFileDiff } from '@/hooks/useSourceControl';
import { useI18n } from '@/i18n';
import { getXtermTheme, isTerminalThemeDark } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { useNavigationStore } from '@/stores/navigation';
import { useSettingsStore } from '@/stores/settings';
import { useSourceControlStore } from '@/stores/sourceControl';
import { useTerminalWriteStore } from '@/stores/terminalWrite';

type DiffEditorInstance = ReturnType<typeof monaco.editor.createDiffEditor>;

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
  sessionId?: string | null;
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
  sessionId,
}: DiffViewerProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { terminalTheme, sourceControlKeybindings, editorSettings } = useSettingsStore();
  const { navigationDirection, setNavigationDirection } = useSourceControlStore();
  const navigateToFile = useNavigationStore((s) => s.navigateToFile);
  const write = useTerminalWriteStore((state) => state.write);
  const focus = useTerminalWriteStore((state) => state.focus);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = editedContent !== null;

  // Can edit: not commit view (history is readonly)
  const canEdit = !isCommitView;

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
    original: ReturnType<typeof monaco.editor.createModel> | null;
    modified: ReturnType<typeof monaco.editor.createModel> | null;
  }>({
    original: null,
    modified: null,
  });
  const editorFilePathRef = useRef<string | null>(null); // Track which file the current editor is displaying
  const [currentDiffIndex, setCurrentDiffIndex] = useState(-1);
  const [lineChanges, setLineChanges] = useState<ReturnType<DiffEditorInstance['getLineChanges']>>(
    []
  );
  // Use ref to store latest lineChanges to avoid closure issues
  const lineChangesRef = useRef<ReturnType<DiffEditorInstance['getLineChanges']>>([]);
  // Update ref when state changes
  useEffect(() => {
    lineChangesRef.current = lineChanges;
  }, [lineChanges]);

  const [boundaryHint, setBoundaryHint] = useState<'top' | 'bottom' | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const hasAutoNavigatedRef = useRef(false);
  const handleSaveRef = useRef<() => void>(() => {});
  const pendingNavigationDirectionRef = useRef<'next' | 'prev' | null>(null);
  const navigationIdRef = useRef(0); // Increment on each new file selection
  const [isThemeReady, setIsThemeReady] = useState(false);
  const diffContentRef = useRef<string>(''); // Track diff content changes

  // Line comment state
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const isHoveringButtonRef = useRef(false);
  const addButtonWidgetRef = useRef<HTMLDivElement | null>(null);
  const addButtonRootRef = useRef<Root | null>(null);
  const commentWidgetRef = useRef<HTMLDivElement | null>(null);
  const commentRootRef = useRef<Root | null>(null);

  // Selection comment state
  const selectionWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const selectionWidgetDomRef = useRef<HTMLDivElement | null>(null);
  const selectionWidgetRootRef = useRef<Root | null>(null);
  const selectionCommentWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const selectionCommentDomRef = useRef<HTMLDivElement | null>(null);
  const selectionCommentRootRef = useRef<Root | null>(null);

  // Define theme on mount and when terminal theme changes
  useEffect(() => {
    defineMonacoDiffTheme(terminalTheme);
    // Force re-render after theme is defined
    if (!isThemeReady) {
      setIsThemeReady(true);
    }
  }, [terminalTheme, isThemeReady]);

  // Handle submit comment
  const handleSubmitComment = useCallback(
    (lineNumber: number, text: string) => {
      if (!sessionId || !file) return;

      // Verify terminal writer exists
      const writer = useTerminalWriteStore.getState().writers.get(sessionId);
      if (!writer) {
        console.warn('Terminal writer not found for session:', sessionId);
        return;
      }

      // Send comment to terminal
      const message = text
        ? `@${file.path}#L${lineNumber}\nUser comment: "${text}"`
        : `@${file.path}#L${lineNumber}`;
      write(sessionId, `${message}\r`);

      // Close comment form
      setCommentingLine(null);

      // Focus terminal after short delay
      setTimeout(() => {
        focus(sessionId);
      }, 100);
    },
    [sessionId, file, write, focus]
  );

  // Line comment button widget - hover over gutter
  useEffect(() => {
    if (!editorReady || !sessionId) return;
    const editor = editorRef.current;
    if (!editor) return;

    const modifiedEditor = editor.getModifiedEditor();

    // Create DOM node for add button
    if (!addButtonWidgetRef.current) {
      addButtonWidgetRef.current = document.createElement('div');
      addButtonWidgetRef.current.className = 'diff-line-comment-button';
      addButtonWidgetRef.current.style.cssText = `
        position: absolute;
        display: none;
        z-index: 100;
        cursor: pointer;
      `;
      // Append to editor's DOM container
      modifiedEditor.getDomNode()?.appendChild(addButtonWidgetRef.current);
    }

    // Mouse move handler to track hovered line
    const handleMouseMove = (e: monaco.editor.IEditorMouseEvent) => {
      if (isHoveringButtonRef.current) return;

      const target = e.target;
      const isGutter =
        target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
        target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS ||
        target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN;

      if (isGutter && target.position) {
        setHoveredLine(target.position.lineNumber);
      } else {
        setHoveredLine(null);
      }
    };

    const handleMouseLeave = () => {
      if (isHoveringButtonRef.current) return;
      setHoveredLine(null);
    };

    const mouseMoveDisposable = modifiedEditor.onMouseMove(handleMouseMove);
    const mouseLeaveDisposable = modifiedEditor.onMouseLeave(handleMouseLeave);

    return () => {
      mouseMoveDisposable.dispose();
      mouseLeaveDisposable.dispose();
    };
  }, [editorReady, sessionId]);

  // Update add button position and visibility
  useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    const dom = addButtonWidgetRef.current;
    if (!editor || !dom || !sessionId) return;

    const modifiedEditor = editor.getModifiedEditor();

    if (hoveredLine && !commentingLine) {
      const lineTop = modifiedEditor.getTopForLineNumber(hoveredLine);
      const scrollTop = modifiedEditor.getScrollTop();

      const left = 4;
      const top = lineTop - scrollTop;

      dom.style.display = 'block';
      dom.style.left = `${left}px`;
      dom.style.top = `${top}px`;

      if (!addButtonRootRef.current) {
        addButtonRootRef.current = createRoot(dom);
      }

      addButtonRootRef.current.render(
        <button
          type="button"
          className="flex items-center justify-center w-5 h-5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={() => {
            setCommentingLine(hoveredLine);
            setHoveredLine(null);
            isHoveringButtonRef.current = false;
          }}
          onMouseEnter={() => {
            isHoveringButtonRef.current = true;
          }}
          onMouseLeave={() => {
            isHoveringButtonRef.current = false;
            setHoveredLine(null);
          }}
          title={t('Add comment')}
        >
          <Plus className="h-3 w-3" />
        </button>
      );
    } else {
      dom.style.display = 'none';
    }
  }, [editorReady, hoveredLine, commentingLine, sessionId, t]);

  // Comment form widget
  useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    if (!editor || !sessionId || !file) return;

    const modifiedEditor = editor.getModifiedEditor();

    if (!commentingLine) {
      // Hide comment form
      if (commentWidgetRef.current) {
        commentWidgetRef.current.style.display = 'none';
      }
      return;
    }

    // Create DOM node for comment form
    if (!commentWidgetRef.current) {
      commentWidgetRef.current = document.createElement('div');
      commentWidgetRef.current.className = 'diff-line-comment-form';
      commentWidgetRef.current.style.cssText = `
        position: absolute;
        z-index: 100;
      `;
      modifiedEditor.getDomNode()?.appendChild(commentWidgetRef.current);
    }

    // Position the form
    const lineTop = modifiedEditor.getTopForLineNumber(commentingLine);
    const scrollTop = modifiedEditor.getScrollTop();
    const lineHeight = modifiedEditor.getOption(monaco.editor.EditorOption.lineHeight);

    commentWidgetRef.current.style.display = 'block';
    commentWidgetRef.current.style.left = '40px';
    commentWidgetRef.current.style.top = `${lineTop - scrollTop + lineHeight}px`;

    // Render the form
    if (!commentRootRef.current) {
      commentRootRef.current = createRoot(commentWidgetRef.current);
    }

    commentRootRef.current.render(
      <CommentForm
        lineNumber={commentingLine}
        filePath={file.path}
        onSubmit={(text) => handleSubmitComment(commentingLine, text)}
        onCancel={() => setCommentingLine(null)}
      />
    );
  }, [editorReady, commentingLine, sessionId, file, handleSubmitComment]);

  // Cleanup comment state when file changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally trigger cleanup when file changes
  useEffect(() => {
    setCommentingLine(null);
    setHoveredLine(null);
    setEditorReady(false);
  }, [file?.path]);

  // Selection comment widget - show button when text is selected
  useEffect(() => {
    if (!editorReady || !sessionId || !file) return;
    const editor = editorRef.current;
    if (!editor) return;

    const modifiedEditor = editor.getModifiedEditor();

    // Create DOM nodes for selection widgets
    if (!selectionWidgetDomRef.current) {
      selectionWidgetDomRef.current = document.createElement('div');
      selectionWidgetDomRef.current.className = 'diff-selection-comment-button';
      selectionWidgetDomRef.current.style.zIndex = '100';
    }

    if (!selectionCommentDomRef.current) {
      selectionCommentDomRef.current = document.createElement('div');
      selectionCommentDomRef.current.className = 'diff-selection-comment-form';
      selectionCommentDomRef.current.style.cssText = 'z-index: 100; width: 320px;';
    }

    const showCommentForm = () => {
      const selection = modifiedEditor.getSelection();
      if (!selection || selection.isEmpty()) return;

      // Hide button widget
      if (selectionWidgetRef.current) {
        modifiedEditor.removeContentWidget(selectionWidgetRef.current);
        selectionWidgetRef.current = null;
      }

      // Create comment widget
      const commentWidget: monaco.editor.IContentWidget = {
        getId: () => 'diff.selection.comment.form',
        getDomNode: () => selectionCommentDomRef.current!,
        getPosition: () => ({
          position: {
            lineNumber: selection.positionLineNumber,
            column: selection.positionColumn,
          },
          preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
        }),
      };

      selectionCommentWidgetRef.current = commentWidget;

      // Render comment form - 重用已存在的 root 避免重复创建
      if (!selectionCommentRootRef.current) {
        selectionCommentRootRef.current = createRoot(selectionCommentDomRef.current!);
      }
      selectionCommentRootRef.current.render(
        <CommentForm
          lineNumber={selection.startLineNumber}
          endLineNumber={selection.endLineNumber}
          filePath={file.path}
          onSubmit={(text) => {
            // Verify terminal writer exists
            const writer = useTerminalWriteStore.getState().writers.get(sessionId);
            if (!writer) {
              console.warn('Terminal writer not found for session:', sessionId);
              return;
            }

            // Format: @path#L1-L10 or @path#L5
            const lineRef =
              selection.startLineNumber === selection.endLineNumber
                ? `L${selection.startLineNumber}`
                : `L${selection.startLineNumber}-L${selection.endLineNumber}`;
            const message = text
              ? `@${file.path}#${lineRef}\nUser comment: "${text}"`
              : `@${file.path}#${lineRef}`;
            write(sessionId, `${message}\r`);

            // Close comment widget
            if (selectionCommentWidgetRef.current) {
              modifiedEditor.removeContentWidget(selectionCommentWidgetRef.current);
              selectionCommentWidgetRef.current = null;
            }

            // Focus terminal after short delay
            setTimeout(() => {
              focus(sessionId);
            }, 100);
          }}
          onCancel={() => {
            if (selectionCommentWidgetRef.current) {
              modifiedEditor.removeContentWidget(selectionCommentWidgetRef.current);
              selectionCommentWidgetRef.current = null;
            }
          }}
        />
      );

      modifiedEditor.addContentWidget(commentWidget);
    };

    // Render the button - 重用已存在的 root 避免重复创建
    if (!selectionWidgetRootRef.current) {
      selectionWidgetRootRef.current = createRoot(selectionWidgetDomRef.current);
    }
    selectionWidgetRootRef.current.render(
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

    // Listen to selection changes
    const selectionWidget: monaco.editor.IContentWidget = {
      getId: () => 'diff.selection.comment.button',
      getDomNode: () => selectionWidgetDomRef.current!,
      getPosition: () => {
        const selection = modifiedEditor.getSelection();
        if (!selection || selection.isEmpty()) return null;
        return {
          position: {
            lineNumber: selection.positionLineNumber,
            column: selection.positionColumn,
          },
          preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
        };
      },
    };

    const handleSelectionChange = () => {
      const selection = modifiedEditor.getSelection();

      // Remove comment form if selection changes
      if (selectionCommentWidgetRef.current) {
        modifiedEditor.removeContentWidget(selectionCommentWidgetRef.current);
        selectionCommentWidgetRef.current = null;
      }

      if (selection && !selection.isEmpty()) {
        // Show button widget
        if (!selectionWidgetRef.current) {
          selectionWidgetRef.current = selectionWidget;
          modifiedEditor.addContentWidget(selectionWidget);
        }
        modifiedEditor.layoutContentWidget(selectionWidget);
      } else {
        // Hide button widget
        if (selectionWidgetRef.current) {
          modifiedEditor.removeContentWidget(selectionWidgetRef.current);
          selectionWidgetRef.current = null;
        }
      }
    };

    const disposable = modifiedEditor.onDidChangeCursorSelection(handleSelectionChange);

    return () => {
      disposable.dispose();
      if (selectionWidgetRef.current) {
        modifiedEditor.removeContentWidget(selectionWidgetRef.current);
        selectionWidgetRef.current = null;
      }
      if (selectionCommentWidgetRef.current) {
        modifiedEditor.removeContentWidget(selectionCommentWidgetRef.current);
        selectionCommentWidgetRef.current = null;
      }
    };
  }, [editorReady, sessionId, file, t, write, focus]);

  // Cleanup widgets on unmount
  useEffect(() => {
    return () => {
      if (addButtonRootRef.current) {
        addButtonRootRef.current.unmount();
        addButtonRootRef.current = null;
      }
      if (commentRootRef.current) {
        commentRootRef.current.unmount();
        commentRootRef.current = null;
      }
      if (addButtonWidgetRef.current) {
        addButtonWidgetRef.current.remove();
        addButtonWidgetRef.current = null;
      }
      if (commentWidgetRef.current) {
        commentWidgetRef.current.remove();
        commentWidgetRef.current = null;
      }
      if (selectionWidgetRootRef.current) {
        selectionWidgetRootRef.current.unmount();
        selectionWidgetRootRef.current = null;
      }
      if (selectionCommentRootRef.current) {
        selectionCommentRootRef.current.unmount();
        selectionCommentRootRef.current = null;
      }
    };
  }, []);

  // Highlight current diff range
  const highlightCurrentDiff = useCallback(
    (index: number, changes?: ReturnType<DiffEditorInstance['getLineChanges']>) => {
      const editor = editorRef.current;
      const effectiveChanges = changes || lineChanges;
      if (!editor || !effectiveChanges || effectiveChanges.length === 0 || index < 0) {
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

  // Function to perform auto-navigation when lineChanges are available
  // This is called from onDidUpdateDiff and from manual fetch
  const performAutoNavigation = useCallback(
    (editor: DiffEditorInstance, changes: ReturnType<DiffEditorInstance['getLineChanges']>) => {
      const pendingDirection = pendingNavigationDirectionRef.current;

      if (!pendingDirection || !changes || changes.length === 0 || hasAutoNavigatedRef.current) {
        // No pending navigation, no changes, or already navigated
        if (pendingDirection && changes !== null && changes.length === 0) {
          // No diffs found, clear navigation
          hasAutoNavigatedRef.current = true;
          pendingNavigationDirectionRef.current = null;
          setNavigationDirection(null);
        }
        return;
      }

      const targetIndex = pendingDirection === 'next' ? 0 : changes.length - 1;

      // Mark as navigated and clear pending direction
      hasAutoNavigatedRef.current = true;
      pendingNavigationDirectionRef.current = null;
      setCurrentDiffIndex(targetIndex);

      // Clear navigation direction in store
      setNavigationDirection(null);

      // Scroll to the diff
      const change = changes[targetIndex];
      const line =
        change.modifiedEndLineNumber > 0
          ? change.modifiedStartLineNumber
          : Math.max(1, change.modifiedStartLineNumber);

      setTimeout(() => {
        const modifiedEditor = editor.getModifiedEditor();
        modifiedEditor.revealLineInCenter(line, monaco.editor.ScrollType.Immediate);
      }, 50);

      // Highlight
      highlightCurrentDiff(targetIndex, changes);
    },
    [setNavigationDirection, highlightCurrentDiff]
  );

  const handleEditorMount = useCallback(
    (editor: DiffEditorInstance) => {
      editorRef.current = editor;
      editorFilePathRef.current = file?.path ?? null;
      setEditorReady(true);

      const currentModel = editor.getModel();
      if (currentModel) {
        modelsRef.current.original = currentModel.original;
        modelsRef.current.modified = currentModel.modified;
      }

      const disposables: { dispose: () => void }[] = [];

      disposables.push(
        editor.onDidUpdateDiff(() => {
          const changes = editor.getLineChanges();
          if (changes) {
            setLineChanges(changes);
            lineChangesRef.current = changes;
            performAutoNavigation(editor, changes);
          }
        })
      );

      const modifiedEditor = editor.getModifiedEditor();
      disposables.push(
        modifiedEditor.onDidChangeModelContent(() => {
          const newContent = modifiedEditor.getValue();
          setEditedContent(newContent);
        })
      );

      modifiedEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSaveRef.current();
      });

      setTimeout(() => {
        const pendingDirection = pendingNavigationDirectionRef.current;
        if (pendingDirection && !hasAutoNavigatedRef.current) {
          const changes = editor.getLineChanges();
          if (changes && changes.length > 0) {
            setLineChanges(changes);
            lineChangesRef.current = changes;
            performAutoNavigation(editor, changes);
          } else {
            let attempts = 0;
            const maxAttempts = 10;
            const pollTimer = setInterval(() => {
              attempts++;
              const pollChanges = editor.getLineChanges();
              if (pollChanges) {
                clearInterval(pollTimer);
                setLineChanges(pollChanges);
                lineChangesRef.current = pollChanges;
                performAutoNavigation(editor, pollChanges);
              } else if (attempts >= maxAttempts) {
                clearInterval(pollTimer);
              }
            }, 50);
          }
        }
      }, 0);

      return () => {
        for (const d of disposables) {
          d.dispose();
        }
      };
    },
    [file?.path, performAutoNavigation]
  );

  // Sync pendingNavigationDirectionRef with navigationDirection state
  useEffect(() => {
    if (navigationDirection) {
      // Increment navigation ID to trigger a new navigation cycle
      navigationIdRef.current += 1;
      hasAutoNavigatedRef.current = false;
      pendingNavigationDirectionRef.current = navigationDirection;
      // Don't try to get lineChanges here - editorRef might still point to old editor
      // The navigation will be triggered in handleEditorMount or onDidUpdateDiff
    }
  }, [navigationDirection]);

  // Manually fetch lineChanges when file changes or diff content changes
  // This is needed because onDidUpdateDiff doesn't fire when switching back to a previously-viewed file
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Check if the editor is displaying the correct file
    // If editorFilePathRef doesn't match current file, the editor hasn't remounted yet
    if (editorFilePathRef.current !== file?.path) {
      return;
    }

    // Check if diff content has actually changed
    const currentContent = diff ? `${diff.original}${diff.modified}` : '';
    if (currentContent === diffContentRef.current) {
      // Content hasn't changed, skip
      return;
    }

    diffContentRef.current = currentContent;

    // When models change, Monaco computes the diff asynchronously
    // We need to poll getLineChanges() until it returns a result (or times out)
    let attempts = 0;
    const maxAttempts = 20; // 20 * 50ms = 1 second max wait

    const checkLineChanges = () => {
      const changes = editor.getLineChanges();

      if (changes) {
        setLineChanges(changes);
        lineChangesRef.current = changes;
        // Perform auto-navigation with the fresh changes
        performAutoNavigation(editor, changes);
        return true; // Success
      }
      return false; // Not ready yet
    };

    // Try immediately first
    if (checkLineChanges()) {
      return;
    }

    // Poll until we get results or timeout
    const timer = setInterval(() => {
      attempts++;
      if (checkLineChanges() || attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [diff, file?.path, performAutoNavigation]);

  const navigateToDiff = useCallback(
    (direction: 'prev' | 'next') => {
      const editor = editorRef.current;
      if (!editor || !lineChanges || lineChanges.length === 0) {
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

  const handleSave = useCallback(async () => {
    if (!file || editedContent === null || isSaving) return;

    setIsSaving(true);
    try {
      const absolutePath = `${rootPath}/${file.path}`;
      const { encoding } = await window.electronAPI.file.read(absolutePath);
      await window.electronAPI.file.write(absolutePath, editedContent, encoding);

      await queryClient.invalidateQueries({
        queryKey: ['git', 'file-diff', rootPath, file.path],
      });
      await queryClient.invalidateQueries({
        queryKey: ['git', 'file-changes', rootPath],
      });

      setEditedContent(null);
      setIsEditing(false);

      toastManager.add({
        title: t('File saved'),
        type: 'success',
        timeout: 2000,
      });
    } catch (error) {
      toastManager.add({
        title: t('Failed to save file'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  }, [file, editedContent, isSaving, rootPath, queryClient, t]);

  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  const handleToggleEdit = useCallback(() => {
    if (isEditing && isDirty) {
      if (!window.confirm(t('You have unsaved changes. Discard them?'))) {
        return;
      }
      setEditedContent(null);
    }
    setIsEditing(!isEditing);
  }, [isEditing, isDirty, t]);

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

      if ((e.metaKey || e.ctrlKey) && e.key === 's' && isEditing && isDirty) {
        e.preventDefault();
        handleSave();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, navigateToDiff, sourceControlKeybindings, isEditing, isDirty, handleSave]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally trigger on file change
  useEffect(() => {
    setCurrentDiffIndex(-1);
    setBoundaryHint(null);
    hasAutoNavigatedRef.current = false;
    setIsEditing(false);
    setEditedContent(null);
  }, [file?.path, file?.staged]);

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
          {lineChanges && lineChanges.length > 0 && (
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

          {/* Open in editor */}
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => navigateToFile({ path: `${rootPath}/${file.path}` })}
            title={t('Open in editor')}
          >
            <ExternalLink className="h-4 w-4" />
          </button>

          {/* Edit / Save toggle */}
          {canEdit && (
            <>
              {isEditing && isDirty && (
                <button
                  type="button"
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    'text-green-500 hover:bg-green-500/20 hover:text-green-400'
                  )}
                  onClick={handleSave}
                  disabled={isSaving}
                  title={t('Save changes (Cmd+S)')}
                >
                  <Save className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  isEditing
                    ? 'text-primary bg-primary/10 hover:bg-primary/20'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
                onClick={handleToggleEdit}
                title={isEditing ? t('Exit edit mode') : t('Edit file')}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Diff Editor */}
      <div className="flex-1">
        {diff && diff.original != null && diff.modified != null && isThemeReady && (
          <DiffEditor
            key={`${rootPath}-${file.path}-${file.staged}-${isThemeReady}-${isEditing}`}
            original={diff.original}
            modified={isEditing && editedContent !== null ? editedContent : diff.modified}
            originalModelPath={`inmemory://original/${rootPath}/${file.path}`}
            modifiedModelPath={`inmemory://modified/${rootPath}/${file.path}`}
            language={getLanguageFromPath(file.path)}
            theme={CUSTOM_THEME_NAME}
            onMount={handleEditorMount}
            options={{
              readOnly: !isEditing,
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
