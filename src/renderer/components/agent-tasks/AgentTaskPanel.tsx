import type { AgentTask } from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import { ListTodo, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useResizable } from '@/hooks/useResizable';
import { useI18n } from '@/i18n';
import { scaleInVariants, springFast } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Z_INDEX } from '@/lib/z-index';
import { useAgentTasksStore } from '@/stores/agentTasks';
import { AgentTaskList } from './AgentTaskList';

interface AgentTaskPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToSession: (task: AgentTask) => void;
}

const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;

const isMac = window.electronAPI.env.platform === 'darwin';
const MAC_SAFE_MARGIN_Y = 50;

export function AgentTaskPanel({ open, onOpenChange, onNavigateToSession }: AgentTaskPanelProps) {
  const { t } = useI18n();
  const activeTaskCount = useAgentTasksStore((s) => s._activeTaskCountCache);
  const savedPosition = useAgentTasksStore((s) => s.agentTaskPanelPosition);
  const savedSize = useAgentTasksStore((s) => s.agentTaskPanelSize);
  const setAgentTaskPanelPosition = useAgentTasksStore((s) => s.setAgentTaskPanelPosition);
  const resetAgentTaskPanel = useAgentTasksStore((s) => s.resetAgentTaskPanel);

  const defaultPositionRef = useRef<{ x: number; y: number } | null>(null);
  if (!defaultPositionRef.current) {
    const minY = isMac ? MAC_SAFE_MARGIN_Y : 0;
    const w = savedSize?.width || DEFAULT_WIDTH;
    const h = savedSize?.height || DEFAULT_HEIGHT;
    defaultPositionRef.current = {
      x: Math.max(0, window.innerWidth - w - 20),
      y: Math.max(minY, (window.innerHeight - h) / 2),
    };
  }

  const { size, position, setPosition, setSize, isResizing, getResizeHandleProps } = useResizable({
    initialSize: savedSize || { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
    initialPosition: savedPosition || defaultPositionRef.current,
    minSize: { width: MIN_WIDTH, height: MIN_HEIGHT },
    maxSize: { width: window.innerWidth, height: window.innerHeight },
    onSizeChange: useAgentTasksStore.getState().setAgentTaskPanelSize,
    onPositionChange: setAgentTaskPanelPosition,
  });

  // Drag logic - direct DOM manipulation for performance
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number; lastX?: number; lastY?: number }>({
    x: 0,
    y: 0,
  });

  // Position validation when panel opens
  useEffect(() => {
    if (!open) return;

    const minY = isMac ? MAC_SAFE_MARGIN_Y : 0;
    const w = size.width;
    const h = size.height;
    const defaultX = Math.max(0, window.innerWidth - w - 20);
    const defaultY = Math.max(minY, (window.innerHeight - h) / 2);

    if (!savedPosition) {
      setPosition({ x: defaultX, y: defaultY });
    } else {
      const isOutOfBounds =
        savedPosition.x < 0 ||
        savedPosition.y < minY ||
        savedPosition.x + w > window.innerWidth ||
        savedPosition.y + h > window.innerHeight;

      if (isOutOfBounds) {
        const defaultPos = { x: defaultX, y: defaultY };
        setPosition(defaultPos);
        setAgentTaskPanelPosition(defaultPos);
      } else {
        setPosition(savedPosition);
      }
    }
  }, [open, savedPosition, size.width, size.height, setPosition, setAgentTaskPanelPosition]);

  // ESC key to close
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isResizing) return;
      if ((e.target as HTMLElement).closest('.no-drag')) return;
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [isResizing, position]
  );

  useEffect(() => {
    if (!isDragging) return;

    const minY = isMac ? MAC_SAFE_MARGIN_Y : 0;

    const handleMouseMove = (e: MouseEvent) => {
      let newX = e.clientX - dragStartPos.current.x;
      let newY = e.clientY - dragStartPos.current.y;

      newX = Math.max(0, Math.min(newX, window.innerWidth - size.width));
      newY = Math.max(minY, Math.min(newY, window.innerHeight - size.height));

      if (panelRef.current) {
        panelRef.current.style.left = `${newX}px`;
        panelRef.current.style.top = `${newY}px`;
      }
      dragStartPos.current.lastX = newX;
      dragStartPos.current.lastY = newY;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      const finalX = dragStartPos.current.lastX ?? position.x;
      const finalY = dragStartPos.current.lastY ?? position.y;
      setPosition({ x: finalX, y: finalY });
      setAgentTaskPanelPosition({ x: finalX, y: finalY });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    position.x,
    position.y,
    size.width,
    size.height,
    setPosition,
    setAgentTaskPanelPosition,
  ]);

  const handleResetPanel = useCallback(() => {
    const minY = isMac ? MAC_SAFE_MARGIN_Y : 0;
    const defaultX = Math.max(0, window.innerWidth - DEFAULT_WIDTH - 20);
    const defaultY = Math.max(minY, (window.innerHeight - DEFAULT_HEIGHT) / 2);
    setPosition({ x: defaultX, y: defaultY });
    setSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    resetAgentTaskPanel();
  }, [setPosition, setSize, resetAgentTaskPanel]);

  const isInteracting = isDragging || isResizing;

  const RESIZE_HANDLES = [
    { dir: 'n' as const, cls: 'absolute top-0 left-0 right-0 h-1.5 cursor-n-resize' },
    { dir: 's' as const, cls: 'absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize' },
    { dir: 'e' as const, cls: 'absolute top-0 bottom-0 right-0 w-1.5 cursor-e-resize' },
    { dir: 'w' as const, cls: 'absolute top-0 bottom-0 left-0 w-1.5 cursor-w-resize' },
    { dir: 'nw' as const, cls: 'absolute top-0 left-0 w-3 h-3 cursor-nw-resize' },
    { dir: 'ne' as const, cls: 'absolute top-0 right-0 w-3 h-3 cursor-ne-resize' },
    { dir: 'sw' as const, cls: 'absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize' },
    { dir: 'se' as const, cls: 'absolute bottom-0 right-0 w-3 h-3 cursor-se-resize' },
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          variants={scaleInVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={isInteracting ? { duration: 0 } : springFast}
          className="fixed flex flex-col rounded-xl border bg-popover shadow-lg"
          style={
            {
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: `${size.width}px`,
              height: `${size.height}px`,
              zIndex: Z_INDEX.SETTINGS_WINDOW,
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties
          }
        >
          {/* Draggable header bar */}
          <div
            className={cn(
              'flex h-12 shrink-0 items-center justify-between border-b px-4 select-none rounded-t-xl',
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            )}
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-2">
              <ListTodo className="h-5 w-5" />
              <span className="font-medium">{t('Agent Tasks')}</span>
              {activeTaskCount > 0 && (
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-normal text-primary">
                  {activeTaskCount}
                </span>
              )}
            </div>
            <div className="no-drag flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleResetPanel}
                className="h-8 w-8"
                title={t('Reset Position & Size')}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content area */}
          <ScrollArea className="flex-1 no-drag">
            <div className="p-4">
              <AgentTaskList onTaskClick={onNavigateToSession} />
            </div>
          </ScrollArea>

          {/* Resize handles */}
          {RESIZE_HANDLES.map(({ dir, cls }) => (
            <div key={dir} {...getResizeHandleProps(dir)} className={cls} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
