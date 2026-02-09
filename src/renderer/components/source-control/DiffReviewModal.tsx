import { DiffEditor } from '@monaco-editor/react';
import type { FileChange, GitSubmodule } from '@shared/types';
import {
  ChevronDown,
  ChevronRight,
  Expand,
  FileCode,
  FolderGit2,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Shrink,
  X,
} from 'lucide-react';
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
import { useSubmoduleChanges, useSubmoduleFileDiff, useSubmodules } from '@/hooks/useSubmodules';
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
  submodulePath?: string; // 子模块路径，用于区分主仓库和子模块
  startLine: number;
  endLine: number;
  text: string;
  timestamp: Date;
}

// 扩展 FileChange 类型，支持子模块
interface ExtendedFileChange extends FileChange {
  submodulePath?: string; // 子模块路径
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

// Submodule Group Component
interface SubmoduleGroupProps {
  submodule: GitSubmodule;
  rootPath: string;
  expanded: boolean;
  onToggle: () => void;
  selectedFile: ExtendedFileChange | null;
  onSelectFile: (file: ExtendedFileChange) => void;
  allComments: CommentData[];
}

function SubmoduleGroup({
  submodule,
  rootPath,
  expanded,
  onToggle,
  selectedFile,
  onSelectFile,
  allComments,
}: SubmoduleGroupProps) {
  const { data: changes } = useSubmoduleChanges(rootPath, submodule.path);

  const submoduleCommentCount = allComments.filter(
    (c) => c.submodulePath === submodule.path
  ).length;

  return (
    <div className="mt-1">
      {/* 子模块标题 */}
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-accent/50 text-left"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <FolderGit2 className="h-4 w-4 shrink-0 text-yellow-500" />
        <span className="flex-1 truncate font-medium">{submodule.name}</span>
        {submoduleCommentCount > 0 && (
          <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
            {submoduleCommentCount}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {submodule.stagedCount + submodule.unstagedCount}
        </span>
      </button>

      {/* 子模块文件列表 */}
      {expanded && changes && changes.length > 0 && (
        <div className="pl-4">
          {changes.map((file) => {
            const fileCommentCount = allComments.filter(
              (c) => c.filePath === file.path && c.submodulePath === submodule.path
            ).length;
            const extendedFile: ExtendedFileChange = {
              ...file,
              submodulePath: submodule.path,
            };
            const isSelected =
              selectedFile?.path === file.path &&
              selectedFile?.staged === file.staged &&
              selectedFile?.submodulePath === submodule.path;

            return (
              <button
                key={`${submodule.path}-${file.path}-${file.staged}`}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-left',
                  isSelected && 'bg-accent'
                )}
                onClick={() => onSelectFile(extendedFile)}
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
    </div>
  );
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

  const [selectedFile, setSelectedFile] = useState<ExtendedFileChange | null>(null);
  const [allComments, setAllComments] = useState<CommentData[]>([]);
  const [isThemeReady, setIsThemeReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [expandedSubmodules, setExpandedSubmodules] = useState<Set<string>>(new Set());
  const [isMaximized, setIsMaximized] = useState(true);

  // Editor refs
  const editorRef = useRef<DiffEditorInstance | null>(null);
  // 保存 model 引用，用于切换文件或关闭 modal 时清理
  const modelRef = useRef<{
    original: ReturnType<typeof monaco.editor.createModel> | null;
    modified: ReturnType<typeof monaco.editor.createModel> | null;
  }>({ original: null, modified: null });

  // Line comment refs
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const isHoveringButtonRef = useRef(false);
  const addButtonWidgetRef = useRef<HTMLDivElement | null>(null);
  const addButtonRootRef = useRef<Root | null>(null);
  const commentWidgetRef = useRef<monaco.editor.IContentWidget | null>(null);
  const commentDomRef = useRef<HTMLDivElement | null>(null);
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

  // Fetch submodules
  const { data: submodules } = useSubmodules(open ? (rootPath ?? null) : null);

  // 获取有变更的子模块
  const submodulesWithChanges = useMemo(() => {
    if (!submodules) return [];
    return submodules.filter((s) => s.hasChanges);
  }, [submodules]);

  // Fetch diff for selected file (主仓库)
  const { data: mainDiff, isLoading: isLoadingMainDiff } = useFileDiff(
    rootPath ?? null,
    selectedFile && !selectedFile.submodulePath ? selectedFile.path : null,
    selectedFile?.staged ?? false
  );

  // Fetch diff for selected file (子模块)
  const { data: submoduleDiff, isLoading: isLoadingSubmoduleDiff } = useSubmoduleFileDiff(
    rootPath ?? null,
    selectedFile?.submodulePath ?? null,
    selectedFile?.submodulePath ? selectedFile.path : null,
    selectedFile?.staged ?? false
  );

  // 合并 diff 数据
  const diff = selectedFile?.submodulePath ? submoduleDiff : mainDiff;
  const isLoadingDiff = selectedFile?.submodulePath ? isLoadingSubmoduleDiff : isLoadingMainDiff;

  // All changes (staged + unstaged) - 主仓库
  const mainRepoChanges = useMemo(() => {
    if (!changesData?.changes) return [];
    return changesData.changes;
  }, [changesData]);

  // Comments for current file
  const currentFileComments = useMemo(() => {
    if (!selectedFile) return [];
    return allComments.filter(
      (c) => c.filePath === selectedFile.path && c.submodulePath === selectedFile.submodulePath
    );
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
    if (open && mainRepoChanges.length > 0 && !selectedFile) {
      setSelectedFile(mainRepoChanges[0]);
    }
  }, [open, mainRepoChanges, selectedFile]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      // 在组件卸载前，先安全地清理 editor 的 model 引用
      // 必须先 setModel(null) 让 DiffEditorWidget 释放引用，再 dispose model
      // 否则会出现 "TextModel got disposed before DiffEditorWidget model got reset" 错误
      const editor = editorRef.current;
      if (editor) {
        try {
          // 先让 DiffEditorWidget 安全释放对 model 的引用
          editor.setModel(null);
        } catch {
          // Ignore if editor already disposed
        }
        editorRef.current = null;
      }

      // 使用 modelRef 清理 model（更安全，因为 editor 可能已经 dispose）
      try {
        modelRef.current.original?.dispose();
        modelRef.current.modified?.dispose();
      } catch {
        // Model may already be disposed
      }
      modelRef.current = { original: null, modified: null };

      setSelectedFile(null);
      setAllComments([]);
      setEditorReady(false);
      setExpandedSubmodules(new Set());
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
    // Use queueMicrotask to avoid unmounting during React render
    const addButtonRoot = addButtonRootRef.current;
    const commentRoot = commentRootRef.current;
    const selectionWidgetRoot = selectionWidgetRootRef.current;
    const selectionCommentRoot = selectionCommentRootRef.current;

    addButtonRootRef.current = null;
    addButtonWidgetRef.current = null;
    commentRootRef.current = null;
    commentWidgetRef.current = null;
    commentDomRef.current = null;
    selectionWidgetRootRef.current = null;
    selectionWidgetDomRef.current = null;
    selectionWidgetRef.current = null;
    selectionCommentRootRef.current = null;
    selectionCommentDomRef.current = null;
    selectionCommentWidgetRef.current = null;

    queueMicrotask(() => {
      addButtonRoot?.unmount();
      commentRoot?.unmount();
      selectionWidgetRoot?.unmount();
      selectionCommentRoot?.unmount();
    });
  }, [selectedFile]);

  // Handle editor mount
  const handleEditorMount = useCallback((editor: DiffEditorInstance) => {
    // 清理之前的 model（切换文件时）
    try {
      modelRef.current.original?.dispose();
      modelRef.current.modified?.dispose();
    } catch {
      // Model may already be disposed
    }

    // 保存新的 model 引用
    const model = editor.getModel();
    modelRef.current = {
      original: model?.original ?? null,
      modified: model?.modified ?? null,
    };

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
        submodulePath: selectedFile.submodulePath,
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

  // Store delete handler in ref for event delegation
  const deleteHandlerRef = useRef(handleDeleteComment);
  deleteHandlerRef.current = handleDeleteComment;

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

  // Comment form widget (single line) - using IContentWidget for proper scroll handling
  useEffect(() => {
    if (!editorReady || !open || !selectedFile) return;
    const editor = editorRef.current;
    if (!editor) return;

    const modifiedEditor = editor.getModifiedEditor();

    // Remove existing widget if no commenting line
    if (!commentingLine) {
      if (commentWidgetRef.current) {
        modifiedEditor.removeContentWidget(commentWidgetRef.current);
        commentWidgetRef.current = null;
      }
      // 延迟 unmount 避免在 React 渲染期间同步卸载
      const prevRoot = commentRootRef.current;
      if (prevRoot) {
        commentRootRef.current = null;
        queueMicrotask(() => prevRoot.unmount());
      }
      return;
    }

    // Create DOM node if needed
    if (!commentDomRef.current) {
      commentDomRef.current = document.createElement('div');
      commentDomRef.current.className = 'review-line-comment-form';
      commentDomRef.current.style.cssText = 'z-index: 100; width: 320px;';
    }

    // Create content widget
    const widget: monaco.editor.IContentWidget = {
      getId: () => 'review.line.comment.form',
      getDomNode: () => commentDomRef.current!,
      getPosition: () => ({
        position: {
          lineNumber: commentingLine,
          column: 1,
        },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }),
    };

    // Render form - 重用已存在的 root 避免重复创建
    if (!commentRootRef.current) {
      commentRootRef.current = createRoot(commentDomRef.current);
    }
    commentRootRef.current.render(
      <CommentForm
        lineNumber={commentingLine}
        filePath={selectedFile.path}
        onSubmit={(text) => handleAddComment(commentingLine, commentingLine, text)}
        onCancel={() => setCommentingLine(null)}
        submitLabel="add"
      />
    );

    // Store widget ref and add to editor
    commentWidgetRef.current = widget;
    modifiedEditor.addContentWidget(widget);

    return () => {
      modifiedEditor.removeContentWidget(widget);
    };
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

      // 重用已存在的 root 避免重复创建
      if (!selectionCommentRootRef.current) {
        selectionCommentRootRef.current = createRoot(selectionCommentDomRef.current!);
      }
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
          submitLabel="add"
        />
      );

      modifiedEditor.addContentWidget(commentWidget);
    };

    // Render button - 重用已存在的 root 避免重复创建
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

  // Display inline comments using viewZones
  const viewZoneIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!editorReady || !open || !selectedFile) return;
    const editor = editorRef.current;
    if (!editor) return;

    const modifiedEditor = editor.getModifiedEditor();
    const commentsForFile = currentFileComments;

    // Clear existing view zones
    modifiedEditor.changeViewZones((accessor) => {
      for (const id of viewZoneIdsRef.current) {
        accessor.removeZone(id);
      }
      viewZoneIdsRef.current = [];
    });

    if (commentsForFile.length === 0) return;

    // Group comments by end line
    const commentsByLine = new Map<number, CommentData[]>();
    for (const comment of commentsForFile) {
      const line = comment.endLine;
      const existing = commentsByLine.get(line) || [];
      commentsByLine.set(line, [...existing, comment]);
    }

    // Add view zones for each line with comments
    modifiedEditor.changeViewZones((accessor) => {
      for (const [lineNumber, comments] of commentsByLine) {
        const domNode = document.createElement('div');
        domNode.className = 'inline-comment-zone';
        domNode.style.cssText = 'padding: 4px 8px; position: relative; z-index: 10;';

        const container = document.createElement('div');
        container.className = 'space-y-2';

        for (const comment of comments) {
          const commentDiv = document.createElement('div');
          commentDiv.className =
            'flex items-start gap-2 rounded-md border bg-muted/50 p-2 text-sm max-w-md';

          const lineRef =
            comment.startLine === comment.endLine
              ? `L${comment.startLine}`
              : `L${comment.startLine}-L${comment.endLine}`;

          commentDiv.innerHTML = `
            <svg class="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-xs font-medium text-primary">${lineRef}</span>
              </div>
              <p class="whitespace-pre-wrap text-foreground line-clamp-3">${comment.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
          `;

          // Create delete button
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'p-1 rounded hover:bg-destructive/20 transition-colors shrink-0';
          deleteBtn.title = t('Delete');
          deleteBtn.innerHTML = `<svg class="h-3 w-3 text-muted-foreground hover:text-destructive" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

          const commentId = comment.id;
          deleteBtn.onclick = () => deleteHandlerRef.current(commentId);

          commentDiv.appendChild(deleteBtn);
          container.appendChild(commentDiv);
        }

        domNode.appendChild(container);

        const heightInLines = Math.max(2, comments.length * 3);

        const zoneId = accessor.addZone({
          afterLineNumber: lineNumber,
          heightInLines,
          domNode,
        });

        viewZoneIdsRef.current.push(zoneId);
      }
    });

    return () => {
      const editor = editorRef.current;
      if (!editor) return;
      try {
        const modifiedEditor = editor.getModifiedEditor();
        modifiedEditor.changeViewZones((accessor) => {
          for (const id of viewZoneIdsRef.current) {
            accessor.removeZone(id);
          }
          viewZoneIdsRef.current = [];
        });
      } catch {
        // Editor may already be disposed
        viewZoneIdsRef.current = [];
      }
    };
  }, [editorReady, open, selectedFile, currentFileComments, t]);

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

    // Group comments by file (including submodule path)
    const byFile = new Map<string, CommentData[]>();
    for (const comment of allComments) {
      const key = comment.submodulePath
        ? `${comment.submodulePath}/${comment.filePath}`
        : comment.filePath;
      const existing = byFile.get(key) || [];
      byFile.set(key, [...existing, comment]);
    }

    // Build message
    const lines: string[] = [];
    for (const [filePath, comments] of byFile) {
      for (const c of comments) {
        const lineRef =
          c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-L${c.endLine}`;
        lines.push(`${filePath}#${lineRef}`);
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

  // 切换子模块展开/折叠
  const toggleSubmodule = useCallback((submodulePath: string) => {
    setExpandedSubmodules((prev) => {
      const next = new Set(prev);
      if (next.has(submodulePath)) {
        next.delete(submodulePath);
      } else {
        next.add(submodulePath);
      }
      return next;
    });
  }, []);

  const isEmpty = mainRepoChanges.length === 0 && submodulesWithChanges.length === 0;
  const hasComments = allComments.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogPopup
        className={
          isMaximized
            ? 'max-w-[98vw] w-[98vw] h-[95vh] flex flex-col'
            : 'max-w-[90vw] w-[1200px] h-[90vh] flex flex-col'
        }
      >
        {/* Maximize button in top right corner */}
        <button
          type="button"
          onClick={() => setIsMaximized(!isMaximized)}
          className="absolute end-12 top-2.5 z-50 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          title={isMaximized ? t('Restore') : t('Maximize')}
        >
          {isMaximized ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <span>{t('Diff Review')}</span>
            {(mainRepoChanges.length > 0 || submodulesWithChanges.length > 0) && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                {mainRepoChanges.length +
                  submodulesWithChanges.reduce(
                    (acc, s) => acc + s.stagedCount + s.unstagedCount,
                    0
                  )}{' '}
                {t('files')}
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
                  {/* 主仓库文件 */}
                  {mainRepoChanges.map((file) => {
                    const fileCommentCount = allComments.filter(
                      (c) => c.filePath === file.path && !c.submodulePath
                    ).length;
                    return (
                      <button
                        key={`${file.path}-${file.staged}`}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-left',
                          selectedFile?.path === file.path &&
                            selectedFile?.staged === file.staged &&
                            !selectedFile?.submodulePath &&
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

                  {/* 子模块分组 */}
                  {submodulesWithChanges.map((submodule) => (
                    <SubmoduleGroup
                      key={submodule.path}
                      submodule={submodule}
                      rootPath={rootPath ?? ''}
                      expanded={expandedSubmodules.has(submodule.path)}
                      onToggle={() => toggleSubmodule(submodule.path)}
                      selectedFile={selectedFile}
                      onSelectFile={setSelectedFile}
                      allComments={allComments}
                    />
                  ))}
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
                  keepCurrentOriginalModel={true}
                  keepCurrentModifiedModel={true}
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
