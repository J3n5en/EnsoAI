import { useEffect, useMemo, useRef, useState } from 'react';
import { toLocalFileUrl } from '@/lib/localFileUrl';

interface ImagePreviewProps {
  path: string;
}

export function ImagePreview({ path }: ImagePreviewProps) {
  const [scale, setScale] = useState(1);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Convert file path to local-file:// URL (Electron custom protocol)
  const imageUrl = useMemo(() => {
    return toLocalFileUrl(path);
  }, [path]);

  // Reset scale when image changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: path change should reset scale
  useEffect(() => {
    setScale(1);
    setImageDimensions(null);
  }, [path]);

  // Handle wheel event for zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom when Ctrl/Cmd is pressed
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();

      // Cancel previous animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Use requestAnimationFrame to throttle updates
      rafId = requestAnimationFrame(() => {
        setScale((prevScale) => {
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          const newScale = prevScale * delta;
          // Limit scale between 10% and 500%
          return Math.min(Math.max(newScale, 0.1), 5);
        });
        rafId = null;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Handle double click to reset scale
  const handleDoubleClick = () => {
    setScale(1);
  };

  // Handle image load to get dimensions
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-auto bg-[length:20px_20px]"
      style={{
        backgroundImage: `
          linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%),
          linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%),
          linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)
        `,
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Image */}
      <img
        ref={imageRef}
        src={imageUrl}
        alt={path.split('/').pop() || 'Preview'}
        className="max-h-full max-w-full object-contain"
        style={{
          transform: `scale(${scale})`,
          willChange: 'transform',
          imageRendering: scale > 1 ? 'auto' : 'crisp-edges',
        }}
        onLoad={handleImageLoad}
        draggable={false}
      />

      {/* Info bar */}
      {imageDimensions && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          {imageDimensions.width}×{imageDimensions.height} • {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}
