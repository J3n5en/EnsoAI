import { MessageSquare, Plus, Send } from 'lucide-react';
import type * as monaco from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useTerminalWriteStore } from '@/stores/terminalWrite';

type Monaco = typeof monaco;

interface CommentFormProps {
  lineNumber: number;
  endLineNumber?: number;
  filePath: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  submitLabel?: 'send' | 'add';
}

export function CommentForm({
  lineNumber,
  endLineNumber,
  filePath,
  onSubmit,
  onCancel,
  submitLabel = 'send',
}: CommentFormProps) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Delay focus to ensure it happens after Monaco editor
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = () => {
    onSubmit(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const fileName = filePath.split('/').pop() || filePath;
  const lineDisplay =
    endLineNumber && endLineNumber !== lineNumber
      ? `${lineNumber}-${endLineNumber}`
      : `${lineNumber}`;

  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 w-[320px]">
      <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {fileName}:{lineDisplay}
        </span>
      </div>
      <textarea
        ref={inputRef}
        className="w-full h-20 rounded border bg-muted/50 p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder={t('Leave a comment...')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex items-center justify-end mt-2 gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button size="sm" onClick={handleSubmit}>
          {submitLabel === 'add' ? (
            <>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t('Add')}
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {t('Send')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface UseEditorLineCommentOptions {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  monacoInstance: Monaco | null;
  filePath: string | null;
  rootPath: string | null;
  sessionId: string | null;
  enabled?: boolean;
}

export function useEditorLineComment({
  editor,
  monacoInstance,
  filePath,
  rootPath,
  sessionId,
  enabled = true,
}: UseEditorLineCommentOptions) {
  const { t } = useI18n();
  const write = useTerminalWriteStore((state) => state.write);
  const focus = useTerminalWriteStore((state) => state.focus);

  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const isHoveringButtonRef = useRef(false);

  const addButtonWidgetRef = useRef<monaco.editor.IOverlayWidget | null>(null);
  const addButtonDomRef = useRef<HTMLDivElement | null>(null);
  const addButtonRootRef = useRef<Root | null>(null);

  const commentWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const commentDomRef = useRef<HTMLDivElement | null>(null);
  const commentRootRef = useRef<Root | null>(null);
  const commentPositionRef = useRef<monaco.IPosition | null>(null);

  // Handle submit comment
  const handleSubmitComment = useCallback(
    (lineNumber: number, text: string) => {
      if (!sessionId || !filePath) return;

      // Verify terminal writer exists
      const writer = useTerminalWriteStore.getState().writers.get(sessionId);
      if (!writer) {
        console.warn('Terminal writer not found for session:', sessionId);
        return;
      }

      // Convert to relative path if within project
      let displayPath = filePath;
      if (rootPath && filePath.startsWith(rootPath)) {
        displayPath = filePath.slice(rootPath.length).replace(/^\//, '');
      }

      // Send comment to terminal
      const message = text
        ? `@${displayPath}#L${lineNumber}\nUser comment: "${text}"`
        : `@${displayPath}#L${lineNumber}`;
      write(sessionId, `${message}\r`);

      // Close comment form
      setCommentingLine(null);

      // Focus terminal after short delay
      setTimeout(() => {
        focus(sessionId);
      }, 100);
    },
    [sessionId, filePath, rootPath, write, focus]
  );

  // Cleanup widgets on unmount or when disabled
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
    };
  }, []);

  // Create and manage add button overlay widget
  useEffect(() => {
    if (!editor || !monacoInstance || !enabled) return;

    // Create DOM node for add button
    if (!addButtonDomRef.current) {
      addButtonDomRef.current = document.createElement('div');
      addButtonDomRef.current.className = 'editor-line-comment-button';
      addButtonDomRef.current.style.cssText = `
        position: absolute;
        display: none;
        z-index: 100;
        cursor: pointer;
      `;
    }

    // Create overlay widget
    const widget: monaco.editor.IOverlayWidget = {
      getId: () => 'editor.line.comment.button',
      getDomNode: () => addButtonDomRef.current!,
      getPosition: () => null, // We'll position manually
    };

    addButtonWidgetRef.current = widget;
    editor.addOverlayWidget(widget);

    // Mouse move handler to track hovered line
    const handleMouseMove = (e: monaco.editor.IEditorMouseEvent) => {
      // Don't update if hovering over button
      if (isHoveringButtonRef.current) return;

      // Only show button when hovering over gutter (line numbers area)
      const target = e.target;
      const isGutter =
        target.type === monacoInstance.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
        target.type === monacoInstance.editor.MouseTargetType.GUTTER_LINE_DECORATIONS ||
        target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN;

      if (isGutter && target.position) {
        setHoveredLine(target.position.lineNumber);
      } else {
        setHoveredLine(null);
      }
    };

    // Mouse leave handler
    const handleMouseLeave = () => {
      // Don't hide if hovering over button
      if (isHoveringButtonRef.current) return;
      setHoveredLine(null);
    };

    const mouseMoveDisposable = editor.onMouseMove(handleMouseMove);
    const mouseLeaveDisposable = editor.onMouseLeave(handleMouseLeave);

    return () => {
      mouseMoveDisposable.dispose();
      mouseLeaveDisposable.dispose();
      if (addButtonWidgetRef.current) {
        editor.removeOverlayWidget(addButtonWidgetRef.current);
        addButtonWidgetRef.current = null;
      }
    };
  }, [editor, monacoInstance, enabled]);

  // Update add button position and visibility
  useEffect(() => {
    if (!editor || !addButtonDomRef.current || !enabled) return;

    const dom = addButtonDomRef.current;

    if (hoveredLine && !commentingLine) {
      // Position the button next to the line number
      const lineTop = editor.getTopForLineNumber(hoveredLine);
      const scrollTop = editor.getScrollTop();

      // Position at the left side of the gutter
      const left = 4;
      const top = lineTop - scrollTop;

      dom.style.display = 'block';
      dom.style.left = `${left}px`;
      dom.style.top = `${top}px`;

      // Render the button
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
  }, [editor, hoveredLine, commentingLine, enabled, t]);

  // Create and manage comment form content widget
  useEffect(() => {
    if (!editor || !monacoInstance || !enabled || !filePath) return;

    // Remove existing widget if any
    if (commentWidgetRef.current) {
      editor.removeContentWidget(commentWidgetRef.current);
      commentWidgetRef.current = null;
    }

    if (!commentingLine) {
      commentPositionRef.current = null;
      return;
    }

    // Create DOM node for comment form
    if (!commentDomRef.current) {
      commentDomRef.current = document.createElement('div');
      commentDomRef.current.className = 'editor-line-comment-form';
    }

    // Update position
    commentPositionRef.current = {
      lineNumber: commentingLine,
      column: 1,
    };

    // Create content widget
    const widget: monaco.editor.IContentWidget = {
      getId: () => 'editor.line.comment.form',
      getDomNode: () => commentDomRef.current!,
      getPosition: () =>
        commentPositionRef.current
          ? {
              position: commentPositionRef.current,
              preference: [monacoInstance.editor.ContentWidgetPositionPreference.BELOW],
            }
          : null,
    };

    commentWidgetRef.current = widget;
    editor.addContentWidget(widget);

    // Render the form
    if (!commentRootRef.current) {
      commentRootRef.current = createRoot(commentDomRef.current);
    }

    commentRootRef.current.render(
      <CommentForm
        lineNumber={commentingLine}
        filePath={filePath}
        onSubmit={(text) => handleSubmitComment(commentingLine, text)}
        onCancel={() => setCommentingLine(null)}
      />
    );

    return () => {
      if (commentWidgetRef.current) {
        editor.removeContentWidget(commentWidgetRef.current);
        commentWidgetRef.current = null;
      }
    };
  }, [editor, monacoInstance, commentingLine, filePath, enabled, handleSubmitComment]);

  // Cleanup when file changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally trigger cleanup when file changes
  useEffect(() => {
    setCommentingLine(null);
    setHoveredLine(null);
  }, [filePath]);

  return {
    hoveredLine,
    commentingLine,
    setCommentingLine,
  };
}
