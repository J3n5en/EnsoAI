import { Minimize2, Terminal as TerminalIcon, X } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { ShellTerminal } from '@/components/terminal/ShellTerminal';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { useDraggable } from '@/hooks/useDraggable';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

interface QuickTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string;
  sessionId?: string; // 保留供阶段 3 使用
  onSessionInit: (sessionId: string) => void;
}

export function QuickTerminalModal({
  open,
  onOpenChange,
  cwd,
  sessionId: _sessionId, // 前缀 _ 标记为有意未使用
  onSessionInit,
}: QuickTerminalModalProps) {
  const modalPosition = useSettingsStore((s) => s.quickTerminal.modalPosition);
  const setModalPosition = useSettingsStore((s) => s.setQuickTerminalModalPosition);

  // 终端初始化回调
  const handleTerminalInit = useCallback(
    (ptyId: string) => {
      onSessionInit?.(ptyId);
    },
    [onSessionInit]
  );

  // 计算默认尺寸
  const modalSize = useMemo(() => {
    const width = Math.min(Math.max(window.innerWidth * 0.6, 600), 1200);
    const height = Math.min(Math.max(window.innerHeight * 0.35, 300), 600);
    return { width, height };
  }, []);

  // 使用 useRef 缓存默认位置，防止 Modal 关闭再打开时重置
  const defaultPositionRef = useRef<{ x: number; y: number } | null>(null);

  if (!defaultPositionRef.current) {
    const left = (window.innerWidth - modalSize.width) / 2;
    const top = window.innerHeight - modalSize.height - 40;
    defaultPositionRef.current = { x: left, y: top };
  }

  const { position, isDragging, dragHandlers } = useDraggable({
    initialPosition: modalPosition || defaultPositionRef.current,
    bounds: modalSize,
    minVisibleArea: { x: 50, y: 32 }, // 确保标题栏至少 50% 可见
    onPositionChange: setModalPosition,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className={cn(
          '!max-w-none !rounded-lg transition-opacity',
          !open && 'opacity-0 pointer-events-none'
        )}
        showCloseButton={false}
        showBackdrop={false}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${modalSize.width}px`,
          height: `${modalSize.height}px`,
          transform: 'none',
        }}
      >
        {/* 标题栏 - 可拖动 */}
        <div
          {...dragHandlers}
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
              onClick={() => onOpenChange(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 终端内容区 - 始终渲染 */}
        <div className="flex-1 min-h-0">
          <ShellTerminal cwd={cwd} isActive={open} onInit={handleTerminalInit} />
        </div>
      </DialogPopup>
    </Dialog>
  );
}
