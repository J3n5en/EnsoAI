import { Send, Upload, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';

interface EnhancedInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (content: string, imagePaths: string[]) => void;
  sessionId?: string;
  statusLineHeight?: number; // StatusLine 高度，用于调整位置
  /**
   * Optional style override for the outer absolute-positioned container.
   * Used by AgentPanel top-level rendering to position the panel within the active group column.
   */
  containerStyle?: CSSProperties;
  /** Initial content for the textarea (used for draft preservation) */
  initialContent?: string;
  /** Initial image paths (used for draft preservation) */
  initialImagePaths?: string[];
  /** Callback when content changes (for draft preservation) */
  onContentChange?: (content: string) => void;
  /** Callback when image paths change (for draft preservation) */
  onImagesChange?: (imagePaths: string[]) => void;
  /** Keep panel open after sending (for 'always' mode) */
  keepOpenAfterSend?: boolean;
  /** Whether the parent panel is active (used to trigger focus on tab switch) */
  isActive?: boolean;
}

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
// When the panel uses rounded corners, leaving a tiny gap above the status line
// prevents the bottom radius from visually colliding with (or being clipped by) the
// status line background.
const STATUS_LINE_GAP_PX = 1;

export function EnhancedInput({
  open,
  onOpenChange,
  onSend,
  sessionId: _sessionId,
  statusLineHeight = 0,
  containerStyle,
  initialContent = '',
  initialImagePaths = [],
  onContentChange,
  onImagesChange,
  keepOpenAfterSend = false,
  isActive = false,
}: EnhancedInputProps) {
  const { t } = useI18n();
  const [content, setContent] = useState(initialContent);
  const [imagePaths, setImagePaths] = useState<string[]>(initialImagePaths);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync content with external initial value when it changes
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // Sync imagePaths with external initial value when it changes
  useEffect(() => {
    setImagePaths(initialImagePaths);
  }, [initialImagePaths]);

  // Notify parent when content changes
  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      onContentChange?.(newContent);
    },
    [onContentChange]
  );

  // Helper to add images and notify parent
  const addImagePath = useCallback(
    (path: string) => {
      setImagePaths((prev) => {
        const newPaths = [...prev, path];
        onImagesChange?.(newPaths);
        return newPaths;
      });
    },
    [onImagesChange]
  );

  // Helper to remove image and notify parent
  const removeImagePath = useCallback(
    (index: number) => {
      setImagePaths((prev) => {
        const newPaths = prev.filter((_, i) => i !== index);
        onImagesChange?.(newPaths);
        return newPaths;
      });
    },
    [onImagesChange]
  );

  // Helper to clear images and notify parent
  const clearImagePaths = useCallback(() => {
    setImagePaths([]);
    onImagesChange?.([]);
  }, [onImagesChange]);

  // Auto-resize textarea
  // biome-ignore lint/correctness/useExhaustiveDependencies: content triggers height recalculation
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  // Focus textarea when opened, session changes, or panel becomes active
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId triggers focus on session switch
  useEffect(() => {
    if (open && isActive && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open, _sessionId, isActive]);

  // Focus trap: keep focus on textarea while panel is open
  const handleBlur = useCallback(() => {
    // Delay check because blur fires before click on buttons
    requestAnimationFrame(() => {
      if (open && textareaRef.current) {
        textareaRef.current.focus();
      }
    });
  }, [open]);

  // Draft is now preserved in store - no reset on close

  const handleSend = useCallback(async () => {
    if (!content.trim() && imagePaths.length === 0) return;
    try {
      onSend(content.trim(), imagePaths);
      // Clear content after sending (notify parent)
      handleContentChange('');
      clearImagePaths();
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
  }, [
    content,
    imagePaths,
    onSend,
    onOpenChange,
    handleContentChange,
    clearImagePaths,
    keepOpenAfterSend,
    t,
  ]);

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
        const extension = file.name.split('.').pop() || 'png';
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
    [t]
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

        // Check limit
        if (imagePaths.length + imageFiles.length > MAX_IMAGES) {
          toastManager.add({
            type: 'warning',
            title: t('Too many images'),
            description: t('Max images is {{count}}', { count: MAX_IMAGES }),
          });
          return;
        }

        // Save to temp
        for (const file of imageFiles) {
          const path = await saveImageToTemp(file);
          if (path) {
            addImagePath(path);
          }
        }
      }
    },
    [imagePaths.length, saveImageToTemp, t, addImagePath]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));

      if (imageFiles.length > 0) {
        // Check limit
        if (imagePaths.length + imageFiles.length > MAX_IMAGES) {
          toastManager.add({
            type: 'warning',
            title: t('Too many images'),
            description: t('Max images is {{count}}', { count: MAX_IMAGES }),
          });
          return;
        }

        // Save to temp
        for (const file of imageFiles) {
          const path = await saveImageToTemp(file);
          if (path) {
            addImagePath(path);
          }
        }
      }
    },
    [imagePaths.length, saveImageToTemp, t, addImagePath]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));

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

      // Save to temp
      for (const file of imageFiles) {
        const path = await saveImageToTemp(file);
        if (path) {
          addImagePath(path);
        }
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [imagePaths.length, saveImageToTemp, t, addImagePath]
  );

  const removeImage = useCallback(
    (index: number) => {
      removeImagePath(index);
    },
    [removeImagePath]
  );

  const createImagePreviewFromPath = useCallback((path: string) => {
    // Use local-file:// protocol to preview saved temp images.
    // This avoids blob: URLs which are blocked by the app CSP.
    let normalized = path.replace(/\\/g, '/');

    // Windows drive path (C:/...) needs a leading slash in URL pathname (/C:/...)
    if (/^[a-zA-Z]:\//.test(normalized)) {
      normalized = `/${normalized}`;
    } else if (!normalized.startsWith('/')) {
      normalized = `/${normalized}`;
    }

    const url = new URL('local-file://');
    url.pathname = normalized;
    return url.toString();
  }, []);

  const handleSelectFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (!open) return null;

  const resolvedContainerStyle: CSSProperties = containerStyle ?? {
    left: 0,
    right: 5,
  };

  return (
    <div
      className="absolute z-50 pointer-events-auto bg-background rounded-lg overflow-hidden border-t shadow-[0_-10px_20px_-14px_rgba(0,0,0,0.35)]"
      style={{
        ...resolvedContainerStyle,
        bottom: Math.max(0, statusLineHeight + STATUS_LINE_GAP_PX),
      }}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="px-4 pt-1 pb-[5px]">
        {/* Header (actions) */}
        <div className="flex items-center justify-between gap-1 mb-0">
          <div className="ml-2 flex min-w-0 items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={handleSelectFiles}
              disabled={imagePaths.length >= MAX_IMAGES}
              className="h-4 w-4 p-0 rounded hover:bg-accent transition-colors disabled:pointer-events-none disabled:opacity-64"
              aria-label={t('Select Image')}
            >
              <Upload className="h-3 w-3" />
            </button>

            {/* Image previews (16x16) */}
            {imagePaths.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {imagePaths.map((path, index) => (
                  <div key={path} className="relative group h-4 w-4 rounded overflow-hidden border">
                    <img
                      src={createImagePreviewFromPath(path)}
                      alt={`Preview ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-4 w-4 p-0 rounded hover:bg-accent transition-colors"
            aria-label={t('Close')}
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-start gap-2">
          <div className="flex-1 relative" onDrop={handleDrop} onDragOver={handleDragOver}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={handleBlur}
              placeholder={t('Type your message... (Shift+Enter for newline)')}
              className="w-full min-h-[40px] max-h-40 p-3 pr-12 resize-none bg-muted rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              rows={1}
            />

            <button
              type="button"
              onClick={() => {
                void handleSend();
              }}
              disabled={!content.trim() && imagePaths.length === 0}
              className="absolute bottom-4 right-[9px] h-4 w-4 p-0 rounded hover:bg-accent transition-colors disabled:pointer-events-none disabled:opacity-64"
              aria-label={t('Send')}
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
