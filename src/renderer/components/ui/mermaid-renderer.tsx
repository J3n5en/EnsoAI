import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Maximize2, Minus, Minimize2, Plus, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

const MERMAID_CDN_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

interface MermaidAPI {
  initialize: (config: {
    startOnLoad: boolean;
    theme: string;
    securityLevel: string;
    fontFamily: string;
    suppressErrorRendering: boolean;
  }) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
}

let mermaidPromise: Promise<MermaidAPI> | null = null;
let mermaidInstance: MermaidAPI | null = null;

async function getMermaid(): Promise<MermaidAPI> {
  if (mermaidInstance) {
    return mermaidInstance;
  }

  if (!mermaidPromise) {
    mermaidPromise = import(/* @vite-ignore */ MERMAID_CDN_URL).then((mod) => {
      mermaidInstance = mod.default as MermaidAPI;
      return mermaidInstance;
    });
  }

  return mermaidPromise;
}

interface MermaidRendererProps {
  code: string;
  className?: string;
}

const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.1;

export function MermaidRenderer({ code, className }: MermaidRendererProps) {
  const theme = useSettingsStore((s) => s.theme);
  const uniqueId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const svgContentRef = useRef<HTMLDivElement>(null);
  const hasDraggedRef = useRef(false);

  const resolvedTheme =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme === 'dark' || theme === 'sync-terminal'
        ? 'dark'
        : 'light';

  const mermaidTheme = resolvedTheme === 'dark' ? 'dark' : 'default';

  useEffect(() => {
    let cancelled = false;
    const elementId = `mermaid-${uniqueId.replace(/:/g, '-')}`;

    function cleanupMermaidElements() {
      const tempElement = document.getElementById(elementId);
      if (tempElement) {
        tempElement.remove();
      }
      const errorElements = document.querySelectorAll(`[id^="${elementId}"]`);
      errorElements.forEach((el) => {
        el.remove();
      });
    }

    async function renderDiagram() {
      if (!code.trim()) {
        setSvg(null);
        setError(null);
        return;
      }

      try {
        const mermaid = await getMermaid();

        mermaid.initialize({
          startOnLoad: false,
          theme: mermaidTheme,
          securityLevel: 'strict',
          fontFamily: 'inherit',
          suppressErrorRendering: true,
        });

        const { svg: renderedSvg } = await mermaid.render(elementId, code);

        cleanupMermaidElements();

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }
      } catch (err) {
        cleanupMermaidElements();

        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Mermaid render failed');
          setSvg(null);
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
      cleanupMermaidElements();
    };
  }, [code, mermaidTheme, uniqueId]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => prev + ZOOM_STEP);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleExitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Calculate fit view: scale SVG to fit viewport while keeping aspect ratio, centered
  const handleEnterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    requestAnimationFrame(() => {
      const svgEl = svgContentRef.current?.querySelector('svg');
      if (!svgEl) return;

      const contentArea = svgContentRef.current?.getBoundingClientRect();
      if (!contentArea || !contentArea.width || !contentArea.height) return;

      // Use getBBox to get the actual content bounding box
      const svgRect = svgEl.getBoundingClientRect();
      const padding = 24;
      const scaleX = (contentArea.width - padding * 2) / svgRect.width;
      const scaleY = (contentArea.height - padding * 2) / svgRect.height;
      const fitScale = Math.min(scaleX, scaleY);

      setZoom(Math.round(fitScale * 100) / 100);
      setPan({ x: 0, y: 0 });
    });
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isFullscreen) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => {
        const next = Math.max(prev + delta, MIN_ZOOM);
        return Math.round(next * 100) / 100;
      });
    },
    [isFullscreen]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isFullscreen || e.button !== 0) return;
      setIsDragging(true);
      hasDraggedRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...pan };
    },
    [isFullscreen, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        hasDraggedRef.current = true;
      }
      setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFullscreenContentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleFullscreenOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      // Only exit if the user didn't drag (just a click on the overlay background)
      if (!hasDraggedRef.current) {
        handleExitFullscreen();
      }
    },
    [handleExitFullscreen]
  );

  if (error) {
    return (
      <div className={cn('overflow-x-auto rounded-lg border border-destructive/50', className)}>
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>Mermaid 渲染错误</span>
        </div>
        <pre className="p-4 text-sm">
          <code className="block font-mono leading-relaxed text-muted-foreground">{code}</code>
        </pre>
        <div className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-border bg-muted/30 p-8',
          className
        )}
      >
        <div className="text-sm text-muted-foreground">加载 Mermaid 图表...</div>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-lg border border-border bg-muted/30', className)} style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div
        ref={containerRef}
        className={cn(
          'overflow-hidden',
          isFullscreen && (isDragging ? 'cursor-grabbing' : 'cursor-grab')
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={isFullscreen ? undefined : handleEnterFullscreen}
      >
        <div
          className="origin-center transition-transform duration-100 ease-out"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <div
            className="p-4"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid SVG output
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm">
        <button
          type="button"
          onClick={handleZoomIn}
          className="flex h-6 w-6 items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          title="放大"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="flex h-6 min-w-[2.5rem] items-center justify-center rounded text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          title="重置缩放"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
            zoom <= MIN_ZOOM && 'cursor-not-allowed opacity-50'
          )}
          title="缩小"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={handleReset}
            className="flex h-6 w-6 items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            title="适应初始大小"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="mx-0.5 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={handleEnterFullscreen}
          className="flex h-6 w-6 items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          title="全屏查看"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col select-none bg-background"
          onClick={handleFullscreenOverlayClick}
        >
          {/* Header bar */}
          <div
            className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-medium text-muted-foreground">Mermaid 预览</span>
            <button
              type="button"
              onClick={handleExitFullscreen}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/95 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              title="退出全屏"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Fullscreen content */}
          <div className="relative min-h-0 flex-1">
            <div
              ref={svgContentRef}
              className={cn(
                'absolute inset-0 flex select-none items-center justify-center overflow-hidden',
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              )}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleFullscreenContentClick}
            >
              <div
                className="origin-center transition-transform duration-100 ease-out"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                <div
                  className="p-4"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid SVG output
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
            </div>

            {/* Fullscreen zoom controls */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm">
              <button
                type="button"
                onClick={handleZoomIn}
                className="flex h-7 w-7 items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                title="放大"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex h-7 min-w-[3rem] items-center justify-center rounded text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                title="重置缩放"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  zoom <= MIN_ZOOM && 'cursor-not-allowed opacity-50'
                )}
                title="缩小"
              >
                <Minus className="h-4 w-4" />
              </button>
              {zoom !== 1 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex h-7 w-7 items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  title="适应初始大小"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <div className="mx-0.5 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={handleExitFullscreen}
                className="flex h-7 w-7 items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                title="退出全屏"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
