import { Minimize2, Terminal as TerminalIcon, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShellTerminal } from '@/components/terminal/ShellTerminal';
import { useResizable } from '@/hooks/useResizable';
import { matchesKeybinding } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

interface QuickTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void; // 真正关闭并销毁 PTY
  cwd: string;
  sessionId?: string; // 保留供阶段 3 使用
  onSessionInit: (sessionId: string) => void;
}

export function QuickTerminalModal({
  open,
  onOpenChange,
  onClose,
  cwd,
  sessionId,
  onSessionInit,
}: QuickTerminalModalProps) {
  const modalPosition = useSettingsStore((s) => s.quickTerminal.modalPosition);
  const savedModalSize = useSettingsStore((s) => s.quickTerminal.modalSize);
  const setModalPosition = useSettingsStore((s) => s.setQuickTerminalModalPosition);
  const setModalSize = useSettingsStore((s) => s.setQuickTerminalModalSize);
  const xtermKeybindings = useSettingsStore((s) => s.xtermKeybindings);

  // 终端初始化回调
  const handleTerminalInit = useCallback(
    (ptyId: string) => {
      onSessionInit?.(ptyId);
    },
    [onSessionInit]
  );

  // 计算默认尺寸
  const defaultSize = useMemo(() => {
    const width = Math.min(Math.max(window.innerWidth * 0.6, 600), 1200);
    const height = Math.min(Math.max(window.innerHeight * 0.35, 300), 600);
    return { width, height };
  }, []);

  // 计算默认位置
  const defaultPositionRef = useRef<{ x: number; y: number } | null>(null);
  if (!defaultPositionRef.current) {
    const size = savedModalSize || defaultSize;
    const left = (window.innerWidth - size.width) / 2;
    const top = window.innerHeight - size.height - 40;
    defaultPositionRef.current = { x: left, y: top };
  }

  const { size, position, setPosition, isResizing, getResizeHandleProps } = useResizable({
    initialSize: savedModalSize || defaultSize,
    initialPosition: modalPosition || defaultPositionRef.current,
    minSize: { width: 400, height: 250 },
    maxSize: { width: window.innerWidth - 40, height: window.innerHeight - 80 },
    onSizeChange: setModalSize,
    onPositionChange: setModalPosition,
  });

  // 拖动标题栏
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      // 忽略 resize 时的拖动
      if (isResizing) return;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [isResizing, position]
  );

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || isResizing) return;
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    },
    [isDragging, isResizing, setPosition]
  );

  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setModalPosition(position);
    }
  }, [isDragging, position, setModalPosition]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // ESC 键和关闭 Tab 快捷键
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 键最小化
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        return;
      }

      // Cmd+W / Ctrl+W 最小化（与关闭 Tab 行为一致）
      if (matchesKeybinding(e, xtermKeybindings.closeTab)) {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange, xtermKeybindings.closeTab]);

  // 点击背景关闭
  const modalRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = (e: React.MouseEvent) => {
    // 点击背景层关闭
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  };

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: ESC 键已在 useEffect 中处理
    <div
      onClick={handleBackdropClick}
      className={cn(
        'fixed inset-0 z-50 transition-all',
        // 打开时显示半透明背景
        open ? 'bg-black/20 backdrop-blur-[2px]' : 'opacity-0 pointer-events-none'
      )}
    >
      {/* Modal 窗口 */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation 不是交互行为 */}
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()} // 阻止事件冒泡到背景层
        className={cn(
          'fixed flex flex-col rounded-lg border bg-popover shadow-2xl transition-opacity',
          !open && 'opacity-0'
        )}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
      >
        {/* Resize Handles */}
        {/* 边 - 使用较大的点击区域但视觉上保持细线 */}
        <div
          {...getResizeHandleProps('n')}
          className="absolute top-0 left-0 right-0 h-1 cursor-n-resize z-10 hover:bg-primary/30 active:bg-primary/50"
        />
        <div
          {...getResizeHandleProps('s')}
          className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize z-10 hover:bg-primary/30 active:bg-primary/50"
        />
        <div
          {...getResizeHandleProps('w')}
          className="absolute top-0 bottom-0 left-0 w-1 cursor-w-resize z-10 hover:bg-primary/30 active:bg-primary/50"
        />
        <div
          {...getResizeHandleProps('e')}
          className="absolute top-0 bottom-0 right-0 w-1 cursor-e-resize z-10 hover:bg-primary/30 active:bg-primary/50"
        />
        {/* 角 - 更大的点击区域 */}
        <div
          {...getResizeHandleProps('nw')}
          className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-20"
        />
        <div
          {...getResizeHandleProps('ne')}
          className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-20"
        />
        <div
          {...getResizeHandleProps('sw')}
          className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-20"
        />
        <div
          {...getResizeHandleProps('se')}
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-20"
        />

        {/* 标题栏 - 可拖动 */}
        <div
          onMouseDown={handleDragStart}
          className={cn(
            'flex items-center justify-between h-9 px-3 border-b bg-muted/30 rounded-t-lg select-none',
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium pointer-events-none">
            <TerminalIcon className="h-4 w-4" />
            <span>Quick Terminal</span>
          </div>
          <div className="flex items-center gap-1 pointer-events-auto">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              title="最小化 (Esc)"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 终端内容区 - 始终渲染 */}
        <div className="flex-1 min-h-0">
          <ShellTerminal
            key={sessionId || 'new'}
            cwd={cwd}
            isActive={open}
            onInit={handleTerminalInit}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
