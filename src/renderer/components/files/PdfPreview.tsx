import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toLocalFileUrl } from '@/lib/localFileUrl';
import { cn } from '@/lib/utils';
import { getPDFJS, type PDFDocumentProxy } from './pdfSetup';

interface PdfPreviewProps {
  path: string;
}

type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

export function PdfPreview({ path }: PdfPreviewProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Convert file path to local-file:// URL (Electron custom protocol)
  const pdfUrl = useMemo(() => {
    return toLocalFileUrl(path);
  }, [path]);

  // 加载 PDF 文档
  useEffect(() => {
    let cancelled = false;
    let currentDoc: PDFDocumentProxy | null = null;

    async function loadPDF() {
      setLoading(true);
      setError(null);

      try {
        const pdfjs = await getPDFJS();

        // 使用 local-file:// 协议加载 PDF
        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
        });

        const doc = await loadingTask.promise;
        currentDoc = doc;

        if (!cancelled) {
          setPdfDoc(doc);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'PDF 加载失败');
          setLoading(false);
        }
      }
    }

    loadPDF();

    return () => {
      cancelled = true;
      // 清理旧的 PDF 文档
      if (currentDoc) {
        currentDoc.destroy();
      }
    };
  }, [pdfUrl]);

  // 渲染当前页
  const renderPage = useCallback(
    async (pageNum: number, targetScale?: number) => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      // 取消上一次渲染
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      setRendering(true);

      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        // 计算缩放比例
        let finalScale = targetScale ?? scale;
        const viewport = page.getViewport({ scale: 1 });

        if (zoomMode === 'fit-width') {
          const containerWidth = containerRef.current.clientWidth - 32; // 减去 padding
          finalScale = containerWidth / viewport.width;
        } else if (zoomMode === 'fit-page') {
          const containerWidth = containerRef.current.clientWidth - 32;
          const containerHeight = containerRef.current.clientHeight - 100; // 减去工具栏和 padding
          const widthScale = containerWidth / viewport.width;
          const heightScale = containerHeight / viewport.height;
          finalScale = Math.min(widthScale, heightScale);
        }

        const scaledViewport = page.getViewport({ scale: finalScale });

        // 设置 canvas 尺寸
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // 渲染
        const renderTask = page.render({
          canvasContext: context,
          viewport: scaledViewport,
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (targetScale !== undefined) {
          setScale(finalScale);
        }

        setRendering(false);
      } catch (err) {
        if (err instanceof Error && err.message.includes('cancel')) {
          // 渲染被取消，忽略错误
          return;
        }
        setError(err instanceof Error ? err.message : '页面渲染失败');
        setRendering(false);
      }
    },
    [pdfDoc, scale, zoomMode]
  );

  // 当页码或缩放模式变化时重新渲染
  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPage(currentPage);
    }
  }, [currentPage, pdfDoc, renderPage]);

  // 容器尺寸变化时重新渲染（适应宽度模式）
  useEffect(() => {
    if (!containerRef.current || zoomMode === 'custom') return;

    const observer = new ResizeObserver(() => {
      if (pdfDoc && currentPage) {
        renderPage(currentPage);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pdfDoc, currentPage, zoomMode, renderPage]);

  // 页面导航
  const goToPage = (page: number) => {
    if (!pdfDoc) return;
    const targetPage = Math.max(1, Math.min(page, pdfDoc.numPages));
    setCurrentPage(targetPage);
  };

  // 缩放控制
  const handleZoomIn = () => {
    setZoomMode('custom');
    setScale((prev) => Math.min(prev * 1.2, 5));
    if (pdfDoc) renderPage(currentPage, scale * 1.2);
  };

  const handleZoomOut = () => {
    setZoomMode('custom');
    setScale((prev) => Math.max(prev / 1.2, 0.1));
    if (pdfDoc) renderPage(currentPage, scale / 1.2);
  };

  const handleFitWidth = () => {
    setZoomMode('fit-width');
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div className="text-sm text-muted-foreground">加载 PDF...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted/30">
        <div className="text-sm text-destructive">{error}</div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          重试
        </Button>
      </div>
    );
  }

  if (!pdfDoc) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col items-center bg-muted/30 overflow-hidden"
    >
      {/* 工具栏 */}
      <div className="flex h-12 w-full shrink-0 items-center justify-between border-b bg-background px-4">
        {/* 页码导航 */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || rendering}
            className="h-7"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm text-muted-foreground">
            {currentPage} / {pdfDoc.numPages}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= pdfDoc.numPages || rendering}
            className="h-7"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 缩放控制 */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={rendering}
            className="h-7"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant={zoomMode === 'fit-width' ? 'default' : 'ghost'}
            size="sm"
            onClick={handleFitWidth}
            disabled={rendering}
            className="h-7 text-xs"
          >
            适应宽度
          </Button>
          <div className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={rendering}
            className="h-7"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF 画布 */}
      <div className="relative flex-1 overflow-auto p-4">
        <canvas
          ref={canvasRef}
          className={cn(
            'mx-auto shadow-lg',
            rendering && 'opacity-50 transition-opacity duration-200'
          )}
        />
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
