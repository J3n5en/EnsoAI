import type { FileSearchResult } from '@shared/types/search';
import { Paperclip, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { toLocalFileUrl } from '@/lib/localFileUrl';
import { cn } from '@/lib/utils';

function getFileName(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/';
  return filePath.slice(filePath.lastIndexOf(sep) + 1);
}

interface EnhancedInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (content: string, imagePaths: string[]) => void;
  sessionId?: string;
  /** Current content for the textarea (store-controlled) */
  content: string;
  /** Current image paths (store-controlled) */
  imagePaths: string[];
  /** Callback when content changes (store-controlled) */
  onContentChange: (content: string) => void;
  /** Callback when image paths change (store-controlled) */
  onImagesChange: (imagePaths: string[]) => void;
  /** Keep panel open after sending (for 'always' mode) */
  keepOpenAfterSend?: boolean;
  /** Whether the parent panel is active (used to trigger focus on tab switch) */
  isActive?: boolean;
  /** Working directory for file mention search */
  cwd?: string;
}

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MIN_H = 32;

export function EnhancedInput({
  open,
  onOpenChange,
  onSend,
  sessionId: _sessionId,
  content,
  imagePaths,
  onContentChange,
  onImagesChange,
  keepOpenAfterSend = false,
  isActive = false,
  cwd,
}: EnhancedInputProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualMinH, setManualMinH] = useState<number | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  // IME composition state
  const composingRef = useRef(false);

  // @ mention file search state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<FileSearchResult[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionListRef = useRef<HTMLDivElement>(null);

  // Extract mention query from text before cursor
  const extractMentionQuery = useCallback((text: string, cursorPos: number): string | null => {
    for (let i = cursorPos - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '@') return text.slice(i + 1, cursorPos);
      if (ch === ' ' || ch === '\n' || ch === '\r') return null;
    }
    return null;
  }, []);

  // Detect @ mention on content change
  const handleContentChange = useCallback(
    (value: string) => {
      onContentChange(value);
      // Skip mention detection during IME composition
      if (composingRef.current || !cwd) {
        if (!cwd) setMentionQuery(null);
        return;
      }
      const ta = textareaRef.current;
      if (!ta) return;
      // Use setTimeout to read selectionStart after React updates the value
      setTimeout(() => {
        const cursor = ta.selectionStart;
        setMentionQuery(extractMentionQuery(value, cursor));
        setMentionIndex(0);
      }, 0);
    },
    [cwd, onContentChange, extractMentionQuery]
  );

  // Debounced file search
  useEffect(() => {
    if (mentionQuery === null || !cwd) {
      setMentionResults([]);
      return;
    }
    const timer = setTimeout(() => {
      window.electronAPI.search
        .files({ rootPath: cwd, query: mentionQuery, maxResults: 10 })
        .then(setMentionResults)
        .catch(() => setMentionResults([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [mentionQuery, cwd]);

  // Insert selected mention into textarea
  const insertMention = useCallback(
    (item: FileSearchResult) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const cursor = ta.selectionStart;
      const text = content;
      // Find the @ position before cursor
      let atPos = -1;
      for (let i = cursor - 1; i >= 0; i--) {
        if (text[i] === '@') {
          atPos = i;
          break;
        }
        if (text[i] === ' ' || text[i] === '\n') break;
      }
      if (atPos === -1) return;
      const replacement = `@${item.relativePath} `;
      const newContent = text.slice(0, atPos) + replacement + text.slice(cursor);
      onContentChange(newContent);
      setMentionQuery(null);
      setMentionResults([]);
      // Restore cursor after React re-render
      const newCursor = atPos + replacement.length;
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      }, 0);
    },
    [content, onContentChange]
  );

  // Scroll highlighted mention into view
  useEffect(() => {
    const list = mentionListRef.current;
    if (!list) return;
    const item = list.children[mentionIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [mentionIndex]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;
    const startY = e.clientY;
    const startH = textarea.offsetHeight;

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setManualMinH(Math.max(DEFAULT_MIN_H, startH + delta));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const removeImagePath = useCallback(
    (index: number) => {
      onImagesChange(imagePaths.filter((_, i) => i !== index));
    },
    [imagePaths, onImagesChange]
  );

  // Auto-resize textarea, respecting manual min height from drag
  // biome-ignore lint/correctness/useExhaustiveDependencies: content triggers height recalculation
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const scrollH = ta.scrollHeight;
    const minH = manualMinH ?? DEFAULT_MIN_H;
    ta.style.height = `${Math.max(scrollH, minH)}px`;
  }, [content, manualMinH]);

  // Focus textarea when opened, session changes, or panel becomes active
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId triggers focus on session switch
  useEffect(() => {
    if (open && isActive && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open, _sessionId, isActive]);

  // Focus trap: only refocus textarea when focus leaves this panel.
  // This avoids breaking keyboard navigation to Upload/Close/Send buttons.
  const handleBlur = useCallback(() => {
    // Delay check because blur fires before the next focused element is set.
    requestAnimationFrame(() => {
      if (!open) return;

      const container = containerRef.current;
      const textarea = textareaRef.current;
      if (!container || !textarea) return;

      const active = document.activeElement;
      if (active && container.contains(active)) {
        return;
      }

      textarea.focus();
    });
  }, [open]);

  // Draft is now preserved in store - no reset on close

  const handleSend = useCallback(async () => {
    if (!content.trim() && imagePaths.length === 0) return;
    try {
      onSend(content.trim(), imagePaths);
      // Only close panel if not in 'always open' mode
      if (!keepOpenAfterSend) {
        onOpenChange(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toastManager.add({
        type: 'error',
        title: t('Failed to send message'),
        description: message,
      });
    }
  }, [content, imagePaths, onSend, keepOpenAfterSend, onOpenChange, t]);

  const getImageExtension = useCallback((file: File): string => {
    const mime = file.type.toLowerCase();
    const mimeMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/svg+xml': 'svg',
    };
    const mapped = mimeMap[mime];
    if (mapped) return mapped;

    const name = file.name;
    const lastDot = name.lastIndexOf('.');
    if (lastDot > 0 && lastDot < name.length - 1) {
      const ext = name.slice(lastDot + 1).toLowerCase();
      if (/^[a-z0-9]{1,10}$/.test(ext)) {
        return ext;
      }
    }

    return 'png';
  }, []);

  const handlePanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // If mention popup is open, let handleKeyDown close it first
      if (mentionQuery !== null) return;

      // Keep ESC behavior identical to clicking the close (X) button.
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    },
    [onOpenChange, mentionQuery]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ignore key events during IME composition
      if (e.nativeEvent.isComposing || e.key === 'Process') return;
      // When mention popup is active, intercept navigation keys
      if (mentionQuery !== null && mentionResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((prev) => (prev + 1) % mentionResults.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((prev) => (prev - 1 + mentionResults.length) % mentionResults.length);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          insertMention(mentionResults[mentionIndex]);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          insertMention(mentionResults[mentionIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionQuery(null);
          return;
        }
      }
      // Send with Enter (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Esc close is handled at the panel level so it works for buttons too.
    },
    [handleSend, mentionQuery, mentionResults, mentionIndex, insertMention]
  );

  const saveImageToTemp = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        // Check file size
        if (file.size > MAX_IMAGE_SIZE) {
          toastManager.add({
            type: 'warning',
            title: t('Image too large'),
            description: t('Max image size is {{size}}MB', { size: 10 }),
          });
          return null;
        }

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        // Generate unique filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = getImageExtension(file);
        const filename = `ensoai-input-${timestamp}-${random}.${extension}`;

        // Save to temp directory via electron API
        const result = await window.electronAPI.file.saveToTemp(filename, buffer);

        if (result.success && result.path) {
          return result.path;
        }

        toastManager.add({
          type: 'error',
          title: t('Failed to save image'),
          description: result.error || t('Unknown error'),
        });

        return null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toastManager.add({
          type: 'error',
          title: t('Failed to save image'),
          description: message,
        });
        return null;
      }
    },
    [t, getImageExtension]
  );

  const addImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      // Check limit
      if (imagePaths.length + imageFiles.length > MAX_IMAGES) {
        toastManager.add({
          type: 'warning',
          title: t('Too many images'),
          description: t('Max images is {{count}}', { count: MAX_IMAGES }),
        });
        return;
      }

      // Save to temp (keep order)
      const nextPaths = [...imagePaths];
      const results = await Promise.all(imageFiles.map((file) => saveImageToTemp(file)));
      for (const path of results) {
        if (path) {
          nextPaths.push(path);
        }
      }

      if (nextPaths.length !== imagePaths.length) {
        onImagesChange(nextPaths);
      }
    },
    [imagePaths, saveImageToTemp, t, onImagesChange]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        await addImageFiles(imageFiles);
      }
    },
    [addImageFiles]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);

      await addImageFiles(files);
    },
    [addImageFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      await addImageFiles(Array.from(files));

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [addImageFiles]
  );

  const handleSelectFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (!open) return null;

  return (
    <div className="relative">
      {/* @ mention file search popup — outside overflow-hidden container */}
      {mentionQuery !== null && mentionResults.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-72 rounded-lg border bg-popover shadow-lg z-10 overflow-hidden">
          <div ref={mentionListRef} className="max-h-[240px] overflow-y-auto py-1">
            {mentionResults.map((item, i) => {
              const lastSep = item.relativePath.lastIndexOf('/');
              const dirPart = lastSep > 0 ? item.relativePath.slice(0, lastSep) : '';
              const fileName =
                lastSep > 0 ? item.relativePath.slice(lastSep + 1) : item.relativePath;
              return (
                <button
                  type="button"
                  key={item.path}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(item);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-sm truncate transition-colors',
                    i === mentionIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-accent/50'
                  )}
                >
                  <span>{fileName}</span>
                  {dirPart && (
                    <span className="text-muted-foreground ml-1.5 text-xs">{dirPart}</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Keyboard shortcut hints */}
          <div className="flex items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none">
                Enter
              </kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none">
                Esc
              </kbd>
              Close
            </span>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="pointer-events-auto bg-background overflow-hidden border-t"
        onKeyDown={handlePanelKeyDown}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="relative mx-3 my-2 rounded-lg border border-border bg-muted/30">
          {/* Close button (top-right) */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10"
            aria-label={t('Close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {/* Resize handle */}
          <div
            className="h-2 cursor-ns-resize group flex items-center justify-center"
            onMouseDown={handleResizeStart}
          >
            <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-muted-foreground transition-colors" />
          </div>

          {/* Textarea */}
          <div onDrop={handleDrop} onDragOver={handleDragOver} className="flex">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onPaste={handlePaste}
              onBlur={handleBlur}
              placeholder={t('Type your message... (Shift+Enter for newline)')}
              className="w-full min-h-[32px] px-3 resize-none bg-transparent text-sm leading-normal focus:outline-none placeholder:text-muted-foreground/60"
              rows={1}
            />
          </div>

          {/* Bottom bar: file chips (scrollable) + action buttons */}
          <div className="flex items-center gap-1 px-2 pb-1.5">
            {/* File chips - scrollable */}
            {imagePaths.length > 0 && (
              <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-1 scrollbar-none">
                {imagePaths.map((path, index) => (
                  <span
                    key={path}
                    className="inline-flex items-center shrink-0 max-w-[160px] h-5 rounded border border-border bg-muted/50 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewPath(path)}
                      className="truncate px-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {getFileName(path)}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImagePath(index)}
                      className="shrink-0 h-full px-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-r"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Action buttons - always right-aligned */}
            <div className="flex items-center gap-0.5 shrink-0 ml-auto">
              <button
                type="button"
                onClick={handleSelectFiles}
                disabled={imagePaths.length >= MAX_IMAGES}
                className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:pointer-events-none disabled:opacity-40"
                aria-label={t('Select Image')}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSend();
                }}
                disabled={!content.trim() && imagePaths.length === 0}
                className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:pointer-events-none disabled:opacity-40"
                aria-label={t('Send')}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Image preview modal */}
        <Dialog open={previewPath != null} onOpenChange={(o) => !o && setPreviewPath(null)}>
          <DialogPopup className="max-w-[80vw] max-h-[80vh] p-2">
            {previewPath && (
              <img
                src={toLocalFileUrl(previewPath)}
                alt={getFileName(previewPath)}
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
            )}
          </DialogPopup>
        </Dialog>
      </div>
    </div>
  );
}
