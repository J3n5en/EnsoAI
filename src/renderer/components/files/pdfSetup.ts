// PDF.js CDN URL (从 CDN 动态加载，不打包到应用中)
const PDFJS_CDN_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.min.mjs';
const PDFJS_WORKER_CDN_URL =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs';

// PDF.js 类型定义
export interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  destroy: () => Promise<void>;
}

export interface PDFPageProxy {
  getViewport: (params: { scale: number; rotation?: number }) => PDFPageViewport;
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PDFPageViewport;
  }) => RenderTask;
  destroy: () => Promise<void>;
}

export interface PDFPageViewport {
  width: number;
  height: number;
  scale: number;
  rotation: number;
}

export interface RenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

export interface PDFJS {
  getDocument: (params: {
    url?: string;
    data?: Uint8Array;
    cMapUrl?: string;
    cMapPacked?: boolean;
  }) => {
    promise: Promise<PDFDocumentProxy>;
  };
  GlobalWorkerOptions: {
    workerSrc: string;
  };
}

// 单例缓存
let pdfjsPromise: Promise<PDFJS> | null = null;
let pdfjsInstance: PDFJS | null = null;

/**
 * 从 CDN 动态加载 PDF.js
 * 使用缓存确保只加载一次
 */
export async function getPDFJS(): Promise<PDFJS> {
  if (pdfjsInstance) {
    return pdfjsInstance;
  }

  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS_CDN_URL)
      .then((mod) => {
        const pdfjs = mod as PDFJS;
        // 配置 worker
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN_URL;
        pdfjsInstance = pdfjs;
        return pdfjs;
      })
      .catch((error) => {
        // 加载失败时重置 promise，允许重试
        pdfjsPromise = null;
        throw new Error(`PDF.js 加载失败: ${error.message}`);
      });
  }

  return pdfjsPromise;
}
