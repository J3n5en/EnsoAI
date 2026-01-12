import { DiffEditor } from '@monaco-editor/react';
import type { FileChange } from '@shared/types';
import { FileCode, Loader2, MessageSquare, Plus, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CommentForm } from '@/components/files/EditorLineComment';
import { monaco } from '@/components/files/monacoSetup';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFileChanges, useFileDiff } from '@/hooks/useSourceControl';
import { useI18n } from '@/i18n';
import { getXtermTheme, isTerminalThemeDark } from '@/lib/ghosttyTheme';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';

type DiffEditorInstance = ReturnType<typeof monaco.editor.createDiffEditor>;

interface DiffReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootPath: string | undefined;
  sessionId: string | null;
  onSend?: () => void;
}

interface CommentData {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
  timestamp: Date;
}

function getStatusColor(status: FileChange['status']): string {
  switch (status) {
    case 'A':
      return 'text-green-500';
    case 'D':
      return 'text-red-500';
    case 'M':
      return 'text-yellow-500';
    case 'R':
      return 'text-blue-500';
    default:
      return 'text-muted-foreground';
  }
}

function getStatusLabel(status: FileChange['status']): string {
  switch (status) {
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case 'M':
      return 'Modified';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    case 'U':
      return 'Unmerged';
    default:
      return 'Unknown';
  }
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
  };
  return languageMap[ext] || 'plaintext';
}

const CUSTOM_THEME_NAME = 'enso-review-diff-theme';

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
      'editor.lineHighlightBackground': isDark ? '#ffffff10' : '#00000008',
    },
  });
}

// Comment Display Component
function CommentItem({ comment, onDelete }: { comment: CommentData; onDelete: () => void }) {
  const { t } = useI18n();
  const lineDisplay =
    comment.startLine === comment.endLine
      ? `L${comment.startLine}`
      : `L${comment.startLine}-L${comment.endLine}`;

  return (
    <div className="flex gap-3 group/item p-2 rounded hover:bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-muted-foreground">{lineDisplay}</span>
          <span className="text-xs text-muted-foreground">
            {comment.timestamp.toLocaleTimeString()}
          </span>
          <button
            type="button"
            className="ml-auto p-1 rounded hover:bg-muted opacity-0 group-hover/item:opacity-100 transition-opacity"
            onClick={onDelete}
            title={t('Delete')}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
      </div>
    </div>
  );
}

export function DiffReviewModal({
  open,
  onOpenChange,
  rootPath,
  sessionId,
  onSend,
}: DiffReviewModalProps) {
  const { t } = useI18n();
  const { terminalTheme, editorSettings } = useSettingsStore();
  const write = useTerminalWriteStore((state) => state.write);
  const focus = useTerminalWriteStore((state) => state.focus);

  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const [allComments, setAllComments] = useState<CommentData[]>([]);
  const [isThemeReady, setIsThemeReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  // Editor refs
  const editorRef = useRef<DiffEditorInstance | null>(null);

  // Line comment refs
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const isHoveringButtonRef = useRef(false);
  const addButtonWidgetRef = useRef<HTMLDivElement | null>(null);
  const addButtonRootRef = useRef<Root | null>(null);
  const commentWidgetRef = useRef<HTMLDivElement | null>(null);
  const commentRootRef = useRef<Root | null>(null);

  // Selection comment refs
  const selectionWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const selectionWidgetDomRef = useRef<HTMLDivElement | null>(null);
  const selectionWidgetRootRef = useRef<Root | null>(null);
  const selectionCommentWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const selectionCommentDomRef = useRef<HTMLDivElement | null>(null);
  const selectionCommentRootRef = useRef<Root | null>(null);

  // Fetch file changes
  const { data: changesData, isLoading: isLoadingChanges } = useFileChanges(
    open ? (rootPath ?? null) : null,
    open
  );

  // Fetch diff for selected file
  const { data: diff, isLoading: isLoadingDiff } = useFileDiff(
    rootPath ?? null,
    selectedFile?.path ?? null,
    selectedFile?.staged ?? false
  );

  // All changes (staged + unstaged)
  const allChanges = useMemo(() => {
    if (!changesData?.changes) return [];
    return changesData.changes;
  }, [changesData]);

  // Comments for current file
  const currentFileComments = useMemo(() => {
    if (!selectedFile) return [];
    return allComments.filter((c) => c.filePath === selectedFile.path);
  }, [allComments, selectedFile]);

  // Define theme on mount
  useEffect(() => {
    if (open) {
      defineMonacoDiffTheme(terminalTheme);
      setIsThemeReady(true);
    }
  }, [open, terminalTheme]);

  // Auto-select first file
  useEffect(() => {
    if (open && allChanges.length > 0 && !selectedFile) {
      setSelectedFile(allChanges[0]);
    }
  }, [open, allChanges, selectedFile]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setAllComments([]);
      setEditorReady(false);
      setHoveredLine(null);
      setCommentingLine(null);
    }
  }, [open]);

  // Reset editor state when file changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset when file changes
  useEffect(() => {
    setEditorReady(false);
    setHoveredLine(null);
    setCommentingLine(null);
    // Clear widget refs so they get recreated for new editor
    if (addButtonRootRef.current) {
      addButtonRootRef.current.unmount();
      addButtonRootRef.current = null;
    }
    addButtonWidgetRef.current = null;
    if (commentRootRef.current) {
      commentRootRef.current.unmount();
      commentRootRef.current = null;
    }
    commentWidgetRef.current = null;
    if (selectionWidgetRootRef.current) {
      selectionWidgetRootRef.current.unmount();
      selectionWidgetRootRef.current = null;
    }
    selectionWidgetDomRef.current = null;
    selectionWidgetRef.current = null;
    if (selectionCommentRootRef.current) {
      selectionCommentRootRef.current.unmount();
      selectionCommentRootRef.current = null;
    }
    selectionCommentDomRef.current = null;
    selectionCommentWidgetRef.current = null;
  }, [selectedFile]);

  // Handle editor mount
  const handleEditorMount = useCallback((editor: DiffEditorInstance) => {
    editorRef.current = editor;
    setEditorReady(true);
  }, []);

  // Handle add comment (store locally, not send immediately)
  const handleAddComment = useCallback(
    (startLine: number, endLine: number, text: string) => {
      if (!selectedFile) return;

      const newComment: CommentData = {
        id: crypto.randomUUID(),
        filePath: selectedFile.path,
        startLine,
        endLine,
        text,
        timestamp: new Date(),
      };

      setAllComments((prev) => [...prev, newComment]);
      setCommentingLine(null);
    },
    [selectedFile]
  );

  // Handle delete comment
  const handleDeleteComment = useCallback((id: string) => {
    setAllComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Line comment button widget - hover over gutter
  useEffect(() => {
    if (!editorReady || !open) return;
    const editor = editorRef.current;
    if (!editor) return;

    const modifiedEditor = editor.getModifiedEditor();

    // Create DOM node for add button
    if (!addButtonWidgetRef.current) {
      addButtonWidgetRef.current = document.createElement('div');
      addButtonWidgetRef.current.className = 'review-line-comment-button';
      addButtonWidgetRef.current.style.cssText = `
        position: absolute;
        display: none;
        z-index: 100;
        cursor: pointer;
      `;
      modifiedEditor.getDomNode()?.appendChild(addButtonWidgetRef.current);
    }

    // Mouse move handler
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
  }, [editorReady, open]);

  // Update add button position and visibility
  useEffect(() => {
    if (!editorReady || !open) return;
    const editor = editorRef.current;
    const dom = addButtonWidgetRef.current;
    if (!editor || !dom) return;

    const modifiedEditor = editor.getModifiedEditor();

    if (hoveredLine && !commentingLine) {
      const lineTop = modifiedEditor.getTopForLineNumber(hoveredLine);
      const scrollTop = modifiedEditor.getScrollTop();

      dom.style.display = 'block';
      dom.style.left = '4px';
      dom.style.top = `${lineTop - scrollTop}px`;

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
  }, [editorReady, open, hoveredLine, commentingLine, t]);

  // Comment form widget (single line)
  useEffect(() => {
    if (!editorReady || !open || !selectedFile) return;
    const editor = editorRef.current;
    if (!editor) return;

    const modifiedEditor = editor.getModifiedEditor();

    if (!commentingLine) {
      if (commentWidgetRef.current) {
        commentWidgetRef.current.style.display = 'none';
      }
      return;
    }

    if (!commentWidgetRef.current) {
      commentWidgetRef.current = document.createElement('div');
      commentWidgetRef.current.className = 'review-line-comment-form';
      commentWidgetRef.current.style.cssText = 'position: absolute; z-index: 100;';
      modifiedEditor.getDomNode()?.appendChild(commentWidgetRef.current);
    }

    const lineTop = modifiedEditor.getTopForLineNumber(commentingLine);
    const scrollTop = modifiedEditor.getScrollTop();
    const lineHeight = modifiedEditor.getOption(monaco.editor.EditorOption.lineHeight);

    commentWidgetRef.current.style.display = 'block';
    commentWidgetRef.current.style.left = '40px';
    commentWidgetRef.current.style.top = `${lineTop - scrollTop + lineHeight}px`;

    if (!commentRootRef.current) {
      commentRootRef.current = createRoot(commentWidgetRef.current);
    }

    commentRootRef.current.render(
      <CommentForm
        lineNumber={commentingLine}
        filePath={selectedFile.path}
        onSubmit={(text) => handleAddComment(commentingLine, commentingLine, text)}
        onCancel={() => setCommentingLine(null)}
      />
    );
  }, [editorReady, open, commentingLine, selectedFile, handleAddComment]);

  // Selection comment widget
  useEffect(() => {
    if (!editorReady || !open || !selectedFile) return;
    const editor = editorRef.current;
    if (!editor) return;

    const modifiedEditor = editor.getModifiedEditor();

    // Create DOM nodes
    if (!selectionWidgetDomRef.current) {
      selectionWidgetDomRef.current = document.createElement('div');
      selectionWidgetDomRef.current.className = 'review-selection-comment-button';
      selectionWidgetDomRef.current.style.zIndex = '100';
    }

    if (!selectionCommentDomRef.current) {
      selectionCommentDomRef.current = document.createElement('div');
      selectionCommentDomRef.current.className = 'review-selection-comment-form';
      selectionCommentDomRef.current.style.cssText = 'z-index: 100; width: 320px;';
    }

    const showCommentForm = () => {
      const selection = modifiedEditor.getSelection();
      if (!selection || selection.isEmpty()) return;

      if (selectionWidgetRef.current) {
        modifiedEditor.removeContentWidget(selectionWidgetRef.current);
        selectionWidgetRef.current = null;
      }

      const commentWidget: monaco.editor.IContentWidget = {
        getId: () => 'review.selection.comment.form',
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

      if (selectionCommentRootRef.current) {
        selectionCommentRootRef.current.unmount();
      }
      selectionCommentRootRef.current = createRoot(selectionCommentDomRef.current!);
      selectionCommentRootRef.current.render(
        <CommentForm
          lineNumber={selection.startLineNumber}
          endLineNumber={selection.endLineNumber}
          filePath={selectedFile.path}
          onSubmit={(text) => {
            handleAddComment(selection.startLineNumber, selection.endLineNumber, text);
            if (selectionCommentWidgetRef.current) {
              modifiedEditor.removeContentWidget(selectionCommentWidgetRef.current);
              selectionCommentWidgetRef.current = null;
            }
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

    // Render button
    if (selectionWidgetRootRef.current) {
      selectionWidgetRootRef.current.unmount();
    }
    selectionWidgetRootRef.current = createRoot(selectionWidgetDomRef.current);
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

    const selectionWidget: monaco.editor.IContentWidget = {
      getId: () => 'review.selection.comment.button',
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

      if (selectionCommentWidgetRef.current) {
        modifiedEditor.removeContentWidget(selectionCommentWidgetRef.current);
        selectionCommentWidgetRef.current = null;
      }

      if (selection && !selection.isEmpty()) {
        if (!selectionWidgetRef.current) {
          selectionWidgetRef.current = selectionWidget;
          modifiedEditor.addContentWidget(selectionWidget);
        }
        modifiedEditor.layoutContentWidget(selectionWidget);
      } else {
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
  }, [editorReady, open, selectedFile, t, handleAddComment]);

  // Cleanup on unmount
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

  // Send all comments
  const handleSendAllComments = useCallback(() => {
    if (!sessionId || allComments.length === 0) return;

    const writer = useTerminalWriteStore.getState().writers.get(sessionId);
    if (!writer) {
      console.warn('Terminal writer not found for session:', sessionId);
      return;
    }

    // Group comments by file
    const byFile = new Map<string, CommentData[]>();
    for (const comment of allComments) {
      const existing = byFile.get(comment.filePath) || [];
      byFile.set(comment.filePath, [...existing, comment]);
    }

    // Build message
    const lines: string[] = [];
    for (const [filePath, comments] of byFile) {
      for (const c of comments) {
        const lineRef =
          c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-L${c.endLine}`;
        lines.push(`@${filePath}#${lineRef}`);
        lines.push(`User comment: "${c.text}"`);
        lines.push('');
      }
    }

    const message = lines.join('\n').trim();
    write(sessionId, `${message}\r`);

    setAllComments([]);
    onOpenChange(false);
    onSend?.();

    setTimeout(() => {
      focus(sessionId);
    }, 100);
  }, [sessionId, allComments, write, onOpenChange, onSend, focus]);

  const isEmpty = allChanges.length === 0;
  const hasComments = allComments.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-[90vw] w-[1200px] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <span>{t('Diff Review')}</span>
            {allChanges.length > 0 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                {allChanges.length} {t('files')}
              </span>
            )}
            {hasComments && (
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-xs font-normal text-primary">
                {allComments.length} {t('comments')}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 border-t">
          {/* Left: File list */}
          <div className="w-64 shrink-0 border-r flex flex-col">
            <div className="h-9 flex items-center px-3 border-b text-sm font-medium text-muted-foreground">
              {t('Changed Files')}
            </div>
            <ScrollArea className="flex-1">
              {isLoadingChanges ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : isEmpty ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  {t('No changes')}
                </div>
              ) : (
                <div className="py-1">
                  {allChanges.map((file) => {
                    const fileCommentCount = allComments.filter(
                      (c) => c.filePath === file.path
                    ).length;
                    return (
                      <button
                        key={`${file.path}-${file.staged}`}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-left',
                          selectedFile?.path === file.path &&
                            selectedFile?.staged === file.staged &&
                            'bg-accent'
                        )}
                        onClick={() => setSelectedFile(file)}
                      >
                        <FileCode className={cn('h-4 w-4 shrink-0', getStatusColor(file.status))} />
                        <span className="flex-1 truncate">{file.path.split('/').pop()}</span>
                        {fileCommentCount > 0 && (
                          <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                            {fileCommentCount}
                          </span>
                        )}
                        <span
                          className={cn('text-xs shrink-0', getStatusColor(file.status))}
                          title={getStatusLabel(file.status)}
                        >
                          {file.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Comments list for current file */}
            {currentFileComments.length > 0 && (
              <div className="border-t">
                <div className="h-9 flex items-center px-3 border-b text-sm font-medium text-muted-foreground">
                  {t('Comments')} ({currentFileComments.length})
                </div>
                <ScrollArea className="max-h-48">
                  <div className="p-2 space-y-1">
                    {currentFileComments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        onDelete={() => handleDeleteComment(comment.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Right: Diff viewer */}
          <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
            {selectedFile && (
              <div className="h-9 flex items-center px-3 border-b text-sm shrink-0">
                <span className="text-muted-foreground truncate">{selectedFile.path}</span>
                {selectedFile.staged && (
                  <span className="ml-2 rounded bg-green-500/20 px-1.5 py-0.5 text-xs text-green-500">
                    {t('Staged')}
                  </span>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0">
              {isLoadingDiff ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !selectedFile ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('Select a file to view diff')}
                </div>
              ) : diff && isThemeReady ? (
                <DiffEditor
                  key={`${selectedFile.path}-${selectedFile.staged}`}
                  original={diff.original}
                  modified={diff.modified}
                  language={getLanguageFromPath(selectedFile.path)}
                  theme={CUSTOM_THEME_NAME}
                  onMount={handleEditorMount}
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    renderSideBySideInlineBreakpoint: 0,
                    ignoreTrimWhitespace: false,
                    renderOverviewRuler: true,
                    minimap: { enabled: false },
                    lineNumbers: editorSettings.lineNumbers,
                    fontSize: editorSettings.fontSize,
                    fontFamily: editorSettings.fontFamily,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t">
          <div className="flex-1 text-sm text-muted-foreground">
            {t('Hover over line numbers or select code to add comments')}
          </div>
          <DialogClose render={<Button variant="outline">{t('Close')}</Button>} />
          <Button onClick={handleSendAllComments} disabled={!hasComments || !sessionId}>
            <Send className="h-4 w-4 mr-1.5" />
            {t('Send')} {hasComments && `(${allComments.length})`}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
