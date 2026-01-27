import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
import { scaleInVariants, springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Z_INDEX } from '@/lib/z-index';
import { useSettingsStore } from '@/stores/settings';
import type { SettingsCategory } from './constants';
import { SettingsContent } from './SettingsContent';

interface DraggableSettingsWindowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCategory?: SettingsCategory;
  onCategoryChange?: (category: SettingsCategory) => void;
  scrollToProvider?: boolean;
}

export function DraggableSettingsWindow({
  open,
  onOpenChange,
  activeCategory,
  onCategoryChange,
  scrollToProvider,
}: DraggableSettingsWindowProps) {
  const { t } = useI18n();
  const savedPosition = useSettingsStore((s) => s.settingsModalPosition);
  const setSettingsModalPosition = useSettingsStore((s) => s.setSettingsModalPosition);
  const setSettingsDisplayMode = useSettingsStore((s) => s.setSettingsDisplayMode);

  // 拖动状态
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(savedPosition || { x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // 窗口尺寸常量
  const WINDOW_WIDTH = 896; // max-w-4xl
  const WINDOW_HEIGHT = 600;

  // macOS traffic lights 安全边距（避免标题栏被遮挡）
  const isMac = window.electronAPI.env.platform === 'darwin';
  const MAC_SAFE_MARGIN_X = 0; // 左侧不限制
  const MAC_SAFE_MARGIN_Y = 50; // traffic lights 高度 + 缓冲

  // 居中计算和位置验证
  useEffect(() => {
    if (!open) return;

    const minX = isMac ? MAC_SAFE_MARGIN_X : 0;
    const minY = isMac ? MAC_SAFE_MARGIN_Y : 0;
    const centerX = Math.max(minX, (window.innerWidth - WINDOW_WIDTH) / 2);
    const centerY = Math.max(minY, (window.innerHeight - WINDOW_HEIGHT) / 2);

    if (!savedPosition) {
      // 首次打开：居中
      setPosition({ x: centerX, y: centerY });
    } else {
      // 验证保存的位置是否在安全区域内
      const isOutOfBounds =
        savedPosition.x < minX ||
        savedPosition.y < minY ||
        savedPosition.x + WINDOW_WIDTH > window.innerWidth ||
        savedPosition.y + WINDOW_HEIGHT > window.innerHeight;

      if (isOutOfBounds) {
        // 位置超出安全区域：重置为居中
        setPosition({ x: centerX, y: centerY });
        setSettingsModalPosition({ x: centerX, y: centerY });
      } else {
        setPosition(savedPosition);
      }
    }
  }, [open, savedPosition, setSettingsModalPosition, isMac]);

  // ESC 键关闭
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  // 拖动逻辑
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.no-drag')) return;
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      let newX = e.clientX - dragStartPos.current.x;
      let newY = e.clientY - dragStartPos.current.y;

      // 边界限制（防止拖出屏幕）
      // macOS: 避免与 traffic lights 重叠导致无法拖动
      const minX = isMac ? MAC_SAFE_MARGIN_X : 0;
      const minY = isMac ? MAC_SAFE_MARGIN_Y : 0;
      newX = Math.max(minX, Math.min(newX, window.innerWidth - WINDOW_WIDTH));
      newY = Math.max(minY, Math.min(newY, window.innerHeight - WINDOW_HEIGHT));

      setPosition({ x: newX, y: newY });
    },
    [isDragging, isMac]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setSettingsModalPosition(position);
    }
  }, [isDragging, position, setSettingsModalPosition]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* 可拖动窗口 */}
          <motion.div
            ref={windowRef}
            variants={scaleInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springFast}
            className="fixed flex flex-col rounded-2xl border bg-popover shadow-lg"
            style={
              {
                // 使用 left/top 而非 transform，避免与 framer-motion 动画冲突
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${WINDOW_WIDTH}px`,
                height: `${WINDOW_HEIGHT}px`,
                zIndex: Z_INDEX.SETTINGS_WINDOW,
                // 阻止主窗口 drag-region 穿透
                WebkitAppRegion: 'no-drag',
              } as React.CSSProperties
            }
          >
            {/* 可拖动标题栏 */}
            <div
              className={cn(
                'flex items-center justify-between border-b px-4 py-3 select-none rounded-t-2xl',
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              )}
              onMouseDown={handleMouseDown}
            >
              <h2 className="text-lg font-medium">{t('Settings')}</h2>
              <div className="no-drag flex items-center gap-2">
                {/* 切换按钮：切换到 Tab 模式 */}
                <button
                  type="button"
                  onClick={() => setSettingsDisplayMode('tab')}
                  className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                  title={t('Switch to TAB mode')}
                >
                  <LayoutGrid className="h-3 w-3" />
                  {t('Switch to TAB mode')}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 设置内容 */}
            <div className="flex flex-1 min-h-0">
              <SettingsContent
                activeCategory={activeCategory}
                onCategoryChange={onCategoryChange}
                scrollToProvider={scrollToProvider}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
