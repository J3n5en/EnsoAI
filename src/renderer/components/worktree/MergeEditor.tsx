import Editor, { loader } from '@monaco-editor/react';
import type { MergeConflict, MergeConflictContent } from '@shared/types';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { getXtermTheme, isTerminalThemeDark } from '@/lib/ghosttyTheme';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

loader.config({ monaco });

type EditorInstance = monaco.editor.IStandaloneCodeEditor;

const MERGE_THEME_NAME = 'enso-merge-theme';

// Diff region types
interface DiffRegion {
  startLine: number;
  endLine: number;
  type: 'added' | 'removed' | 'modified';
}

// Conflict chunk representing a mergeable section
interface ConflictChunk {
  id: number;
  theirsLines: { start: number; end: number };
  oursLines: { start: number; end: number };
  baseLines: { start: number; end: number };
  theirsContent: string;
  oursContent: string;
  baseContent: string;
}

function defineMergeTheme(terminalThemeName: string) {
  const xtermTheme = getXtermTheme(terminalThemeName);
  if (!xtermTheme) return;

  const isDark = isTerminalThemeDark(terminalThemeName);

  monaco.editor.defineTheme(MERGE_THEME_NAME, {
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
      'editor.selectionBackground': xtermTheme.selectionBackground,
      'editor.lineHighlightBackground': isDark
        ? `${xtermTheme.brightBlack}30`
        : `${xtermTheme.black}10`,
      'editorCursor.foreground': xtermTheme.cursor,
      'editorLineNumber.foreground': xtermTheme.brightBlack,
      'editorLineNumber.activeForeground': xtermTheme.foreground,
      // Diff colors
      'diffEditor.insertedTextBackground': isDark ? '#2ea04326' : '#2ea04320',
      'diffEditor.removedTextBackground': isDark ? '#f8514926' : '#f8514920',
    },
  });
}

// Simple LCS-based diff algorithm
function computeDiff(baseLines: string[], targetLines: string[]): DiffRegion[] {
  const regions: DiffRegion[] = [];

  // Build a set of line content for quick lookup
  const baseSet = new Set(baseLines);

  let baseIdx = 0;
  let targetIdx = 0;

  while (baseIdx < baseLines.length || targetIdx < targetLines.length) {
    if (baseIdx >= baseLines.length) {
      // Remaining lines in target are additions
      const start = targetIdx;
      while (targetIdx < targetLines.length) {
        targetIdx++;
      }
      regions.push({ startLine: start + 1, endLine: targetIdx, type: 'added' });
    } else if (targetIdx >= targetLines.length) {
      // Remaining lines in base are removals (not shown in target)
      baseIdx++;
    } else if (baseLines[baseIdx] === targetLines[targetIdx]) {
      // Lines match
      baseIdx++;
      targetIdx++;
    } else {
      // Lines differ - find the extent of the difference
      // Look ahead to find where they sync up again
      let foundSync = false;
      let lookAhead = 1;
      const maxLookAhead = 50;

      while (!foundSync && lookAhead < maxLookAhead) {
        // Check if base[baseIdx] appears later in target
        for (let t = targetIdx; t < Math.min(targetIdx + lookAhead, targetLines.length); t++) {
          if (baseLines[baseIdx] === targetLines[t]) {
            // Found sync - lines from targetIdx to t-1 are additions/modifications
            if (t > targetIdx) {
              regions.push({ startLine: targetIdx + 1, endLine: t, type: 'added' });
            }
            targetIdx = t;
            foundSync = true;
            break;
          }
        }

        // Check if target[targetIdx] appears later in base
        if (!foundSync) {
          for (let b = baseIdx; b < Math.min(baseIdx + lookAhead, baseLines.length); b++) {
            if (targetLines[targetIdx] === baseLines[b]) {
              // Lines from baseIdx to b-1 were removed
              baseIdx = b;
              foundSync = true;
              break;
            }
          }
        }

        lookAhead++;
      }

      if (!foundSync) {
        // Treat current lines as modified
        if (!baseSet.has(targetLines[targetIdx])) {
          regions.push({ startLine: targetIdx + 1, endLine: targetIdx + 1, type: 'modified' });
        }
        baseIdx++;
        targetIdx++;
      }
    }
  }

  return regions;
}

// Find conflict chunks by comparing theirs, ours, and base
function findConflictChunks(base: string, theirs: string, ours: string): ConflictChunk[] {
  const baseLines = base.split('\n');
  const theirsLines = theirs.split('\n');
  const oursLines = ours.split('\n');

  const chunks: ConflictChunk[] = [];
  let chunkId = 0;

  // Find regions where theirs or ours differ from base
  const theirsDiff = computeDiff(baseLines, theirsLines);
  const oursDiff = computeDiff(baseLines, oursLines);

  // Merge overlapping regions
  const allRegions = [...theirsDiff, ...oursDiff].sort((a, b) => a.startLine - b.startLine);

  // Group nearby regions into chunks
  let currentChunk: { start: number; end: number } | null = null;

  for (const region of allRegions) {
    if (!currentChunk) {
      currentChunk = { start: region.startLine, end: region.endLine };
    } else if (region.startLine <= currentChunk.end + 3) {
      // Merge if within 3 lines
      currentChunk.end = Math.max(currentChunk.end, region.endLine);
    } else {
      // Start new chunk
      const contextBefore = Math.max(1, currentChunk.start - 2);
      const contextAfter = Math.min(
        Math.max(theirsLines.length, oursLines.length, baseLines.length),
        currentChunk.end + 2
      );

      chunks.push({
        id: chunkId++,
        theirsLines: { start: contextBefore, end: contextAfter },
        oursLines: { start: contextBefore, end: contextAfter },
        baseLines: { start: contextBefore, end: contextAfter },
        theirsContent: theirsLines.slice(contextBefore - 1, contextAfter).join('\n'),
        oursContent: oursLines.slice(contextBefore - 1, contextAfter).join('\n'),
        baseContent: baseLines.slice(contextBefore - 1, contextAfter).join('\n'),
      });

      currentChunk = { start: region.startLine, end: region.endLine };
    }
  }

  // Don't forget the last chunk
  if (currentChunk) {
    const contextBefore = Math.max(1, currentChunk.start - 2);
    const contextAfter = Math.min(
      Math.max(theirsLines.length, oursLines.length, baseLines.length),
      currentChunk.end + 2
    );

    chunks.push({
      id: chunkId++,
      theirsLines: { start: contextBefore, end: contextAfter },
      oursLines: { start: contextBefore, end: contextAfter },
      baseLines: { start: contextBefore, end: contextAfter },
      theirsContent: theirsLines.slice(contextBefore - 1, contextAfter).join('\n'),
      oursContent: oursLines.slice(contextBefore - 1, contextAfter).join('\n'),
      baseContent: baseLines.slice(contextBefore - 1, contextAfter).join('\n'),
    });
  }

  return chunks;
}

interface MergeEditorProps {
  conflicts: MergeConflict[];
  workdir: string;
  sourceBranch?: string;
  targetBranch?: string;
  onResolve: (file: string, content: string) => Promise<void>;
  onComplete: (message: string) => void;
  onAbort: () => void;
  getConflictContent: (file: string) => Promise<MergeConflictContent>;
}

export function MergeEditor({
  conflicts,
  workdir: _workdir,
  sourceBranch,
  targetBranch,
  onResolve,
  onComplete,
  onAbort,
  getConflictContent,
}: MergeEditorProps) {
  const { t } = useI18n();
  const { terminalTheme, editorSettings } = useSettingsStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [content, setContent] = useState<MergeConflictContent | null>(null);
  const [result, setResult] = useState('');
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [previewSource, setPreviewSource] = useState<'theirs' | 'ours' | null>(null);
  const [commitMessage, setCommitMessage] = useState(`Merge branch '${sourceBranch || 'unknown'}'`);

  const theirsEditorRef = useRef<EditorInstance | null>(null);
  const resultEditorRef = useRef<EditorInstance | null>(null);
  const oursEditorRef = useRef<EditorInstance | null>(null);
  const syncScrollRef = useRef(false);
  const decorationsRef = useRef<{
    theirs: string[];
    ours: string[];
    result: string[];
  }>({ theirs: [], ours: [], result: [] });
  const chunkHighlightRef = useRef<{
    theirs: string[];
    ours: string[];
    result: string[];
  }>({ theirs: [], ours: [], result: [] });
  const previewDecorationsRef = useRef<string[]>([]);
  const originalResultRef = useRef<string>('');
  const acceptedRef = useRef(false);

  const currentConflict = conflicts[currentIndex];

  // Compute conflict chunks
  const conflictChunks = useMemo(() => {
    if (!content) return [];
    return findConflictChunks(content.base || '', content.theirs, content.ours);
  }, [content]);

  // Define theme on mount
  useEffect(() => {
    defineMergeTheme(terminalTheme);
  }, [terminalTheme]);

  // Load conflict content when file changes
  useEffect(() => {
    if (!currentConflict) return;

    setIsLoading(true);
    setCurrentChunkIndex(0);
    getConflictContent(currentConflict.file)
      .then((data) => {
        setContent(data);
        // Initialize result with base content or ours if no base
        setResult(data.base || data.ours || '');
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [currentConflict, getConflictContent]);

  // Apply diff decorations
  const applyDecorations = useCallback(() => {
    if (!content) return;

    const baseLines = (content.base || '').split('\n');
    const theirsLines = content.theirs.split('\n');
    const oursLines = content.ours.split('\n');

    // Compute diffs
    const theirsDiff = computeDiff(baseLines, theirsLines);
    const oursDiff = computeDiff(baseLines, oursLines);

    // Apply to theirs editor
    if (theirsEditorRef.current) {
      const theirsDecorations: monaco.editor.IModelDeltaDecoration[] = theirsDiff.map((region) => ({
        range: new monaco.Range(region.startLine, 1, region.endLine, 1),
        options: {
          isWholeLine: true,
          className: region.type === 'added' ? 'diff-added-line' : 'diff-modified-line',
          glyphMarginClassName:
            region.type === 'added' ? 'diff-added-glyph' : 'diff-modified-glyph',
        },
      }));
      decorationsRef.current.theirs = theirsEditorRef.current.deltaDecorations(
        decorationsRef.current.theirs,
        theirsDecorations
      );
    }

    // Apply to ours editor
    if (oursEditorRef.current) {
      const oursDecorations: monaco.editor.IModelDeltaDecoration[] = oursDiff.map((region) => ({
        range: new monaco.Range(region.startLine, 1, region.endLine, 1),
        options: {
          isWholeLine: true,
          className: region.type === 'added' ? 'diff-added-line' : 'diff-modified-line',
          glyphMarginClassName:
            region.type === 'added' ? 'diff-added-glyph' : 'diff-modified-glyph',
        },
      }));
      decorationsRef.current.ours = oursEditorRef.current.deltaDecorations(
        decorationsRef.current.ours,
        oursDecorations
      );
    }
  }, [content]);

  // Apply decorations when content changes
  useEffect(() => {
    if (!isLoading && content) {
      // Small delay to ensure editors are mounted
      const timer = setTimeout(applyDecorations, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, content, applyDecorations]);

  // Highlight current chunk
  const highlightCurrentChunk = useCallback(() => {
    if (conflictChunks.length === 0) return;

    const chunk = conflictChunks[currentChunkIndex];
    if (!chunk) return;

    const createChunkDecoration = (
      startLine: number,
      endLine: number
    ): monaco.editor.IModelDeltaDecoration => ({
      range: new monaco.Range(startLine, 1, endLine, 1),
      options: {
        isWholeLine: true,
        className: 'current-chunk-highlight',
        overviewRuler: {
          color: '#007acc',
          position: monaco.editor.OverviewRulerLane.Full,
        },
      },
    });

    // Apply to theirs editor
    if (theirsEditorRef.current) {
      chunkHighlightRef.current.theirs = theirsEditorRef.current.deltaDecorations(
        chunkHighlightRef.current.theirs,
        [createChunkDecoration(chunk.theirsLines.start, chunk.theirsLines.end)]
      );
    }

    // Apply to result editor
    if (resultEditorRef.current) {
      chunkHighlightRef.current.result = resultEditorRef.current.deltaDecorations(
        chunkHighlightRef.current.result,
        [createChunkDecoration(chunk.theirsLines.start, chunk.theirsLines.end)]
      );
    }

    // Apply to ours editor
    if (oursEditorRef.current) {
      chunkHighlightRef.current.ours = oursEditorRef.current.deltaDecorations(
        chunkHighlightRef.current.ours,
        [createChunkDecoration(chunk.oursLines.start, chunk.oursLines.end)]
      );
    }
  }, [conflictChunks, currentChunkIndex]);

  // Update chunk highlight when chunk index changes
  useEffect(() => {
    if (!isLoading && conflictChunks.length > 0) {
      const timer = setTimeout(highlightCurrentChunk, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading, conflictChunks, highlightCurrentChunk]);

  // Synchronized scrolling
  const handleScroll = useCallback((sourceEditor: EditorInstance) => {
    if (syncScrollRef.current) return;
    syncScrollRef.current = true;

    const scrollTop = sourceEditor.getScrollTop();
    const scrollLeft = sourceEditor.getScrollLeft();

    const editors = [theirsEditorRef.current, resultEditorRef.current, oursEditorRef.current];
    for (const editor of editors) {
      if (editor && editor !== sourceEditor) {
        editor.setScrollTop(scrollTop);
        editor.setScrollLeft(scrollLeft);
      }
    }

    requestAnimationFrame(() => {
      syncScrollRef.current = false;
    });
  }, []);

  const scrollSyncDisposablesRef = useRef(new Map<EditorInstance, { dispose: () => void }>());

  const setupScrollSync = useCallback(
    (editor: EditorInstance) => {
      // Dispose a previous registration for this editor (guards double setup)
      scrollSyncDisposablesRef.current.get(editor)?.dispose();
      const disposable = editor.onDidScrollChange(() => handleScroll(editor));
      scrollSyncDisposablesRef.current.set(editor, disposable);
    },
    [handleScroll]
  );

  // Dispose scroll-sync listeners on unmount
  useEffect(() => {
    const disposables = scrollSyncDisposablesRef.current;
    return () => {
      for (const disposable of disposables.values()) {
        disposable.dispose();
      }
      disposables.clear();
    };
  }, []);

  // Navigate to chunk
  const navigateToChunk = useCallback(
    (chunkIndex: number) => {
      if (chunkIndex < 0 || chunkIndex >= conflictChunks.length) return;

      setCurrentChunkIndex(chunkIndex);
      const chunk = conflictChunks[chunkIndex];

      // Scroll all editors to the chunk
      const lineNumber = chunk.theirsLines.start;
      const editors = [theirsEditorRef.current, resultEditorRef.current, oursEditorRef.current];
      for (const editor of editors) {
        if (editor) {
          editor.revealLineInCenter(lineNumber);
        }
      }
    },
    [conflictChunks]
  );

  // Accept theirs for current chunk
  const acceptTheirsChunk = useCallback(() => {
    if (!content || conflictChunks.length === 0) return;

    const chunk = conflictChunks[currentChunkIndex];
    if (!chunk) return;

    // Mark as accepted to prevent endPreview from restoring
    acceptedRef.current = true;

    // Clear preview decorations
    if (resultEditorRef.current) {
      previewDecorationsRef.current = resultEditorRef.current.deltaDecorations(
        previewDecorationsRef.current,
        []
      );
    }
    setPreviewSource(null);

    // Use original result if we were previewing, otherwise use current result
    const baseResult = originalResultRef.current || result;
    const resultLines = baseResult.split('\n');
    const theirsLines = content.theirs.split('\n');

    // Replace lines in result with theirs
    const before = resultLines.slice(0, chunk.theirsLines.start - 1);
    const replacement = theirsLines.slice(chunk.theirsLines.start - 1, chunk.theirsLines.end);
    const after = resultLines.slice(chunk.theirsLines.end);

    const newResult = [...before, ...replacement, ...after].join('\n');
    setResult(newResult);
    originalResultRef.current = '';

    // Move to next chunk if available
    if (currentChunkIndex < conflictChunks.length - 1) {
      navigateToChunk(currentChunkIndex + 1);
    }
  }, [content, conflictChunks, currentChunkIndex, result, navigateToChunk]);

  // Accept ours for current chunk
  const acceptOursChunk = useCallback(() => {
    if (!content || conflictChunks.length === 0) return;

    const chunk = conflictChunks[currentChunkIndex];
    if (!chunk) return;

    // Mark as accepted to prevent endPreview from restoring
    acceptedRef.current = true;

    // Clear preview decorations
    if (resultEditorRef.current) {
      previewDecorationsRef.current = resultEditorRef.current.deltaDecorations(
        previewDecorationsRef.current,
        []
      );
    }
    setPreviewSource(null);

    // Use original result if we were previewing, otherwise use current result
    const baseResult = originalResultRef.current || result;
    const resultLines = baseResult.split('\n');
    const oursLines = content.ours.split('\n');

    // Replace lines in result with ours
    const before = resultLines.slice(0, chunk.oursLines.start - 1);
    const replacement = oursLines.slice(chunk.oursLines.start - 1, chunk.oursLines.end);
    const after = resultLines.slice(chunk.oursLines.end);

    const newResult = [...before, ...replacement, ...after].join('\n');
    setResult(newResult);
    originalResultRef.current = '';

    // Move to next chunk if available
    if (currentChunkIndex < conflictChunks.length - 1) {
      navigateToChunk(currentChunkIndex + 1);
    }
  }, [content, conflictChunks, currentChunkIndex, result, navigateToChunk]);

  // Accept all theirs
  const acceptAllTheirs = useCallback(() => {
    if (content) {
      setResult(content.theirs);
    }
  }, [content]);

  // Accept all ours
  const acceptAllOurs = useCallback(() => {
    if (content) {
      setResult(content.ours);
    }
  }, [content]);

  // Preview handlers for hover
  const startPreview = useCallback(
    (source: 'theirs' | 'ours') => {
      if (!content || conflictChunks.length === 0 || !resultEditorRef.current) return;

      const chunk = conflictChunks[currentChunkIndex];
      if (!chunk) return;

      // Save original result
      originalResultRef.current = result;
      setPreviewSource(source);

      // Calculate preview content
      const resultLines = result.split('\n');
      const sourceLines =
        source === 'theirs' ? content.theirs.split('\n') : content.ours.split('\n');
      const lineRange = source === 'theirs' ? chunk.theirsLines : chunk.oursLines;

      const before = resultLines.slice(0, lineRange.start - 1);
      const replacement = sourceLines.slice(lineRange.start - 1, lineRange.end);
      const after = resultLines.slice(lineRange.end);

      const previewContent = [...before, ...replacement, ...after].join('\n');

      // Update editor with preview content
      const model = resultEditorRef.current.getModel();
      if (model) {
        model.setValue(previewContent);

        // Add preview decorations
        const decorations: monaco.editor.IModelDeltaDecoration[] = [
          {
            range: new monaco.Range(lineRange.start, 1, lineRange.end, 1),
            options: {
              isWholeLine: true,
              className: 'preview-highlight',
            },
          },
        ];
        previewDecorationsRef.current = resultEditorRef.current.deltaDecorations(
          previewDecorationsRef.current,
          decorations
        );
      }
    },
    [content, conflictChunks, currentChunkIndex, result]
  );

  const endPreview = useCallback(() => {
    // Skip if accept was just called (uses ref to avoid closure issues)
    if (acceptedRef.current) {
      acceptedRef.current = false;
      originalResultRef.current = '';
      return;
    }

    if (!resultEditorRef.current || !previewSource) return;

    // Restore original result
    const model = resultEditorRef.current.getModel();
    if (model && originalResultRef.current) {
      model.setValue(originalResultRef.current);
      originalResultRef.current = '';
    }

    // Clear preview decorations
    previewDecorationsRef.current = resultEditorRef.current.deltaDecorations(
      previewDecorationsRef.current,
      []
    );

    setPreviewSource(null);
  }, [previewSource]);

  // Mark current file as resolved
  const markResolved = useCallback(async () => {
    if (!currentConflict) return;

    setIsSaving(true);
    try {
      await onResolve(currentConflict.file, result);
      setResolvedFiles((prev) => new Set([...prev, currentConflict.file]));

      // Move to next conflict if available
      if (currentIndex < conflicts.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    } finally {
      setIsSaving(false);
    }
  }, [currentConflict, result, currentIndex, conflicts.length, onResolve]);

  // Check if all conflicts are resolved
  const allResolved = resolvedFiles.size === conflicts.length;

  // Get language from file path
  const getLanguage = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
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
      vue: 'vue',
      py: 'python',
      rs: 'rust',
      go: 'go',
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: editorSettings.fontSize,
    fontFamily: editorSettings.fontFamily,
    wordWrap: editorSettings.wordWrap,
    padding: { top: 8, bottom: 8 },
    glyphMargin: true,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg bg-background">
      {/* CSS for diff highlighting */}
      <style>{`
        .diff-added-line {
          background-color: rgba(46, 160, 67, 0.15) !important;
        }
        .diff-modified-line {
          background-color: rgba(210, 153, 34, 0.15) !important;
        }
        .diff-added-glyph {
          background-color: #2ea043;
          width: 4px !important;
          margin-left: 3px;
        }
        .diff-modified-glyph {
          background-color: #d29922;
          width: 4px !important;
          margin-left: 3px;
        }
        .current-chunk-highlight {
          background-color: rgba(0, 122, 204, 0.12) !important;
          border-left: 2px solid #007acc !important;
        }
        .preview-highlight {
          background-color: rgba(59, 130, 246, 0.15) !important;
          border-left: 2px solid rgb(59, 130, 246) !important;
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">{t('Resolve Conflicts')}</h2>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} / {conflicts.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={t('Commit message...')}
            className="w-64"
            size="sm"
          />
          <Button variant="outline" size="xs" onClick={onAbort}>
            <X className="h-3.5 w-3.5" />
            {t('Abort Merge')}
          </Button>
          <Button
            size="xs"
            onClick={() => onComplete(commitMessage)}
            disabled={!allResolved || !commitMessage.trim()}
          >
            <Check className="h-3.5 w-3.5" />
            {t('Complete Merge')}
          </Button>
        </div>
      </div>

      {/* File Navigation */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-1">
            {conflicts.map((conflict, index) => (
              <Button
                key={conflict.file}
                variant={index === currentIndex ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  'shrink-0',
                  resolvedFiles.has(conflict.file) && 'text-green-600 dark:text-green-400'
                )}
              >
                {resolvedFiles.has(conflict.file) && <Check className="h-3 w-3" />}
                {conflict.file.split('/').pop()}
              </Button>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setCurrentIndex((prev) => Math.min(conflicts.length - 1, prev + 1))}
          disabled={currentIndex === conflicts.length - 1}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Chunk Navigation Bar */}
      {!isLoading && conflictChunks.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-1.5">
          <span className="text-xs text-muted-foreground">
            {t('Conflict')} {currentChunkIndex + 1} / {conflictChunks.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => navigateToChunk(currentChunkIndex - 1)}
              disabled={currentChunkIndex === 0}
              title={t('Previous conflict')}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => navigateToChunk(currentChunkIndex + 1)}
              disabled={currentChunkIndex >= conflictChunks.length - 1}
              title={t('Next conflict')}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mx-2 h-4 w-px bg-border" />
          <Button
            variant="outline"
            size="xs"
            onClick={acceptAllTheirs}
            title={t('Accept all theirs')}
          >
            ← {t('Accept All Theirs')}
          </Button>
          <Button variant="outline" size="xs" onClick={acceptAllOurs} title={t('Accept all ours')}>
            {t('Accept All Ours')} →
          </Button>
        </div>
      )}

      {/* Three-panel Editor */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-muted-foreground">{t('Loading...')}</span>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* THEIRS (Left - Source Branch) */}
          <div className="flex flex-1 flex-col border-r">
            <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                THEIRS ({sourceBranch || 'source'})
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={acceptTheirsChunk}
                onMouseEnter={() => startPreview('theirs')}
                onMouseLeave={endPreview}
                disabled={conflictChunks.length === 0}
              >
                {t('Accept')} →
              </Button>
            </div>
            <div className="flex-1">
              <Editor
                value={content?.theirs || ''}
                language={getLanguage(currentConflict?.file || '')}
                theme={MERGE_THEME_NAME}
                options={{ ...editorOptions, readOnly: true }}
                onMount={(editor) => {
                  theirsEditorRef.current = editor;
                  setupScrollSync(editor);
                  applyDecorations();
                }}
              />
            </div>
          </div>

          {/* RESULT (Center - Editable) */}
          <div className="flex flex-[1.5] flex-col border-r">
            <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
              <span className="text-xs font-medium">RESULT</span>
              <Button
                size="xs"
                onClick={markResolved}
                disabled={isSaving || resolvedFiles.has(currentConflict?.file || '')}
              >
                {isSaving
                  ? t('Saving...')
                  : resolvedFiles.has(currentConflict?.file || '')
                    ? t('Resolved')
                    : t('Mark Resolved')}
              </Button>
            </div>
            <div className="flex-1">
              <Editor
                value={result}
                language={getLanguage(currentConflict?.file || '')}
                theme={MERGE_THEME_NAME}
                options={editorOptions}
                onChange={(value) => setResult(value || '')}
                onMount={(editor) => {
                  resultEditorRef.current = editor;
                  setupScrollSync(editor);
                }}
              />
            </div>
          </div>

          {/* OURS (Right - Target Branch) */}
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={acceptOursChunk}
                onMouseEnter={() => startPreview('ours')}
                onMouseLeave={endPreview}
                disabled={conflictChunks.length === 0}
              >
                ← {t('Accept')}
              </Button>
              <span className="text-xs font-medium text-muted-foreground">
                OURS ({targetBranch || 'target'})
              </span>
            </div>
            <div className="flex-1">
              <Editor
                value={content?.ours || ''}
                language={getLanguage(currentConflict?.file || '')}
                theme={MERGE_THEME_NAME}
                options={{ ...editorOptions, readOnly: true }}
                onMount={(editor) => {
                  oursEditorRef.current = editor;
                  setupScrollSync(editor);
                  applyDecorations();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
        <span>{currentConflict?.file}</span>
        <span>
          {resolvedFiles.size} / {conflicts.length} {t('resolved')}
        </span>
      </div>
    </div>
  );
}
