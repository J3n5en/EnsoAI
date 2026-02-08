import { Paperclip, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { toLocalFileUrl } from '@/lib/localFileUrl';

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
}

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MIN_H = 60;

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
}: EnhancedInputProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualMinH, setManualMinH] = useState<number | null>(null);

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

      // Keep ESC behavior identical to clicking the close (X) button.
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    },
    [onOpenChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Send with Enter (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Esc close is handled at the panel level so it works for buttons too.
    },
    [handleSend]
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
          className="h-3 cursor-ns-resize group flex items-center justify-center"
          onMouseDown={handleResizeStart}
        >
          <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-muted-foreground transition-colors" />
        </div>

        {/* Textarea */}
        <div onDrop={handleDrop} onDragOver={handleDragOver}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
            placeholder={t('Type your message... (Shift+Enter for newline)')}
            className="w-full min-h-[60px] px-3 resize-none bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60"
            rows={1}
          />
        </div>

        {/* Image previews */}
        {imagePaths.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {imagePaths.map((path, index) => (
              <div
                key={path}
                className="relative group h-10 w-10 rounded-md overflow-hidden border"
              >
                <img
                  src={toLocalFileUrl(path)}
                  alt={`Preview ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImagePath(index)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Bottom action bar */}
        <div className="flex items-center justify-end gap-0.5 px-2 pb-1.5">
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
  );
}
