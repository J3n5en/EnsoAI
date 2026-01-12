import type { AnnotationSide, DiffLineAnnotation, FileDiffMetadata } from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs/react';
import type { FileChange } from '@shared/types';
import { CornerDownRight, FileCode, Loader2, MessageSquare, Plus, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';

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
  lineNumber: number;
  side: AnnotationSide;
  text: string;
  timestamp: Date;
}

// Thread key: filePath:lineNumber:side
type ThreadKey = string;

function makeThreadKey(filePath: string, lineNumber: number, side: AnnotationSide): ThreadKey {
  return `${filePath}:${lineNumber}:${side}`;
}

interface ThreadAnnotationData {
  threadKey: ThreadKey;
  filePath: string;
  lineNumber: number;
  side: AnnotationSide;
  comments: CommentData[];
  isReplying?: boolean;
}

interface PendingCommentData {
  lineNumber: number;
  side: AnnotationSide;
  isPending: true;
}

type AnnotationData = ThreadAnnotationData | PendingCommentData;

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

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
};

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANG_MAP[ext] || 'text';
}

// Comment Form Component
function CommentForm({
  onSubmit,
  onCancel,
  placeholder,
  autoFocus = true,
}: {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
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

  return (
    <div className="flex gap-3 p-3 bg-background border rounded-lg shadow-sm">
      <div className="flex-1 min-w-0">
        <textarea
          ref={inputRef}
          className="w-full h-16 rounded border bg-muted/50 p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={placeholder ?? t('Leave a comment...')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center justify-end mt-2 gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!text.trim()}>
            {t('Add')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Comment Display Component - single comment in thread
function CommentItem({ comment, onDelete }: { comment: CommentData; onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-3 group/item">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium">{t('You')}</span>
          <span className="text-xs text-muted-foreground">
            {comment.timestamp.toLocaleTimeString()}
          </span>
          <button
            type="button"
            className="ml-auto p-1 rounded hover:bg-muted opacity-0 group-hover/item:opacity-100 transition-opacity"
            onClick={onDelete}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
      </div>
    </div>
  );
}

// Comment Thread Component - displays all comments for a line with reply functionality
function CommentThread({
  comments,
  onDelete,
  onAddReply,
  isReplying,
  onStartReply,
  onCancelReply,
}: {
  comments: CommentData[];
  onDelete: (id: string) => void;
  onAddReply: (text: string) => void;
  isReplying: boolean;
  onStartReply: () => void;
  onCancelReply: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="bg-background border rounded-lg p-3 space-y-3 group">
      {comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} onDelete={() => onDelete(comment.id)} />
      ))}

      {isReplying ? (
        <div className="pt-2 border-t">
          <CommentForm onSubmit={onAddReply} onCancel={onCancelReply} placeholder={t('Reply...')} />
        </div>
      ) : (
        <div className="flex items-center gap-3 pt-2 border-t">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            onClick={onStartReply}
          >
            <CornerDownRight className="h-3.5 w-3.5" />
            {t('Add reply...')}
          </button>
        </div>
      )}
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
  const { terminalTheme } = useSettingsStore();
  const write = useTerminalWriteStore((state) => state.write);

  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  // All comments across all files
  const [allComments, setAllComments] = useState<CommentData[]>([]);
  // Pending new comment (clicking + on a line)
  const [pendingNewComment, setPendingNewComment] = useState<{
    lineNumber: number;
    side: AnnotationSide;
  } | null>(null);
  // Thread currently being replied to
  const [replyingThreadKey, setReplyingThreadKey] = useState<ThreadKey | null>(null);
  // Ref for focus timeout cleanup
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setPendingNewComment(null);
      setReplyingThreadKey(null);
      // Clear pending focus timeout
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }
    }
  }, [open]);

  // Convert diff to FileDiffMetadata for @pierre/diffs
  const fileDiffMetadata = useMemo<FileDiffMetadata | null>(() => {
    if (!diff || !selectedFile) return null;

    const lang = getLanguageFromPath(
      selectedFile.path
    ) as import('@pierre/diffs').SupportedLanguages;

    return parseDiffFromFile(
      { name: selectedFile.path, contents: diff.original, lang },
      { name: selectedFile.path, contents: diff.modified, lang }
    );
  }, [diff, selectedFile]);

  // Group comments by thread key for current file
  const threadsByKey = useMemo(() => {
    if (!selectedFile) return new Map<ThreadKey, CommentData[]>();

    const map = new Map<ThreadKey, CommentData[]>();
    for (const comment of allComments) {
      if (comment.filePath === selectedFile.path) {
        const key = makeThreadKey(comment.filePath, comment.lineNumber, comment.side);
        const existing = map.get(key) || [];
        map.set(key, [...existing, comment]);
      }
    }
    return map;
  }, [allComments, selectedFile]);

  // Build line annotations
  const lineAnnotations = useMemo<DiffLineAnnotation<AnnotationData>[]>(() => {
    if (!selectedFile) return [];

    const annotations: DiffLineAnnotation<AnnotationData>[] = [];

    // Add thread annotations
    for (const [threadKey, comments] of threadsByKey) {
      const first = comments[0];
      annotations.push({
        side: first.side,
        lineNumber: first.lineNumber,
        metadata: {
          threadKey,
          filePath: first.filePath,
          lineNumber: first.lineNumber,
          side: first.side,
          comments,
          isReplying: replyingThreadKey === threadKey,
        },
      });
    }

    // Add pending new comment annotation
    if (pendingNewComment) {
      const key = makeThreadKey(
        selectedFile.path,
        pendingNewComment.lineNumber,
        pendingNewComment.side
      );
      // Only show pending form if there's no existing thread at this location
      if (!threadsByKey.has(key)) {
        annotations.push({
          side: pendingNewComment.side,
          lineNumber: pendingNewComment.lineNumber,
          metadata: {
            lineNumber: pendingNewComment.lineNumber,
            side: pendingNewComment.side,
            isPending: true,
          },
        });
      }
    }

    return annotations;
  }, [selectedFile, threadsByKey, pendingNewComment, replyingThreadKey]);

  // Handle adding a new comment (first comment in thread)
  const handleAddNewComment = useCallback(
    (text: string) => {
      if (!pendingNewComment || !selectedFile) return;

      const newComment: CommentData = {
        id: crypto.randomUUID(),
        filePath: selectedFile.path,
        lineNumber: pendingNewComment.lineNumber,
        side: pendingNewComment.side,
        text,
        timestamp: new Date(),
      };

      setAllComments((prev) => [...prev, newComment]);
      setPendingNewComment(null);
    },
    [pendingNewComment, selectedFile]
  );

  // Handle adding a reply to existing thread
  const handleAddReply = useCallback(
    (threadKey: ThreadKey, text: string) => {
      const thread = threadsByKey.get(threadKey);
      if (!thread || thread.length === 0 || !selectedFile) return;

      const first = thread[0];
      const newComment: CommentData = {
        id: crypto.randomUUID(),
        filePath: first.filePath,
        lineNumber: first.lineNumber,
        side: first.side,
        text,
        timestamp: new Date(),
      };

      setAllComments((prev) => [...prev, newComment]);
      setReplyingThreadKey(null);
    },
    [threadsByKey, selectedFile]
  );

  // Handle deleting a comment
  const handleDeleteComment = useCallback((id: string) => {
    setAllComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Handle sending all comments to terminal
  const handleSendAllComments = useCallback(() => {
    if (!sessionId || allComments.length === 0) return;

    // Verify terminal writer exists before proceeding
    const writer = useTerminalWriteStore.getState().writers.get(sessionId);
    if (!writer) {
      console.warn('Terminal writer not found for session:', sessionId);
      return;
    }

    // Group comments by file and line
    const grouped = new Map<string, CommentData[]>();
    for (const comment of allComments) {
      const key = makeThreadKey(comment.filePath, comment.lineNumber, comment.side);
      const existing = grouped.get(key) || [];
      grouped.set(key, [...existing, comment]);
    }

    // Build message
    const lines: string[] = [];
    for (const [, comments] of grouped) {
      const first = comments[0];
      const lineRef = `@${first.filePath}#L${first.lineNumber}`;
      lines.push(lineRef);
      for (const c of comments) {
        lines.push(`User comment: "${c.text}"`);
      }
      lines.push('');
    }

    const message = lines.join('\n').trim();
    write(sessionId, message + '\r');

    // Clear comments and close modal
    setAllComments([]);
    onOpenChange(false);

    // Switch to chat tab and focus agent
    onSend?.();

    // Focus the terminal after a short delay to ensure tab switch is complete
    // Clear any existing timeout first
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    focusTimeoutRef.current = setTimeout(() => {
      useTerminalWriteStore.getState().focus(sessionId);
      focusTimeoutRef.current = null;
    }, 100);
  }, [sessionId, allComments, write, onOpenChange, onSend]);

  // Render annotation (thread or pending form)
  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationData>) => {
      const data = annotation.metadata;
      if (!data) return null;

      // Render pending new comment form
      if ('isPending' in data && data.isPending) {
        return (
          <div className="py-2 px-4">
            <CommentForm
              onSubmit={handleAddNewComment}
              onCancel={() => setPendingNewComment(null)}
            />
          </div>
        );
      }

      // Render thread with comments
      if ('threadKey' in data) {
        return (
          <div className="py-2 px-4">
            <CommentThread
              comments={data.comments}
              onDelete={handleDeleteComment}
              onAddReply={(text) => handleAddReply(data.threadKey, text)}
              isReplying={data.isReplying ?? false}
              onStartReply={() => setReplyingThreadKey(data.threadKey)}
              onCancelReply={() => setReplyingThreadKey(null)}
            />
          </div>
        );
      }

      return null;
    },
    [handleAddNewComment, handleDeleteComment, handleAddReply]
  );

  // Render hover utility (add comment button)
  const renderHoverUtility = useCallback(
    (getHoveredLine: () => { lineNumber: number; side: AnnotationSide } | undefined) => {
      const handleClick = () => {
        const line = getHoveredLine();
        if (line) {
          setPendingNewComment({
            lineNumber: line.lineNumber,
            side: line.side,
          });
        }
      };

      return (
        <button
          type="button"
          className="flex items-center justify-center w-5 h-5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={handleClick}
        >
          <Plus className="h-3 w-3" />
        </button>
      );
    },
    []
  );

  // Determine theme
  const isDark = terminalTheme?.toLowerCase().includes('dark') ?? true;

  const isEmpty = allChanges.length === 0;
  const hasComments = allComments.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-[90vw] w-[1200px] min-h-[500px] max-h-[85vh] flex flex-col">
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
                        onClick={() => {
                          setSelectedFile(file);
                          setPendingNewComment(null);
                          setReplyingThreadKey(null);
                        }}
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

            <div className="flex-1 min-h-0 overflow-auto">
              {isLoadingDiff ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !selectedFile ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('Select a file to view diff')}
                </div>
              ) : fileDiffMetadata ? (
                <FileDiff
                  fileDiff={fileDiffMetadata}
                  options={{
                    theme: isDark ? 'pierre-dark' : 'pierre-light',
                    diffStyle: 'unified',
                    disableFileHeader: true,
                    enableHoverUtility: true,
                  }}
                  lineAnnotations={lineAnnotations}
                  renderAnnotation={renderAnnotation}
                  renderHoverUtility={renderHoverUtility}
                />
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t">
          <div className="flex-1 text-sm text-muted-foreground">
            {t('Hover over line numbers and click + to add comments')}
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
