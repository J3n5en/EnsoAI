import { Terminal } from 'lucide-react';
import { useRef } from 'react';
import { useDraggable } from '@/hooks/useDraggable';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

interface QuickTerminalButtonProps {
  isOpen: boolean;
  hasRunningProcess: boolean;
  onClick: () => void;
}

export function QuickTerminalButton({
  isOpen,
  hasRunningProcess,
  onClick,
}: QuickTerminalButtonProps) {
  const buttonPosition = useSettingsStore((s) => s.quickTerminal.buttonPosition);
  const setButtonPosition = useSettingsStore((s) => s.setQuickTerminalButtonPosition);

  const BUTTON_SIZE = 48;

  // 使用 useRef 缓存默认位置
  const defaultPositionRef = useRef<{ x: number; y: number } | null>(null);

  if (!defaultPositionRef.current) {
    defaultPositionRef.current = {
      x: window.innerWidth - BUTTON_SIZE - 16,
      y: window.innerHeight - BUTTON_SIZE - 16,
    };
  }

  const { position, isDragging, hasDragged, dragHandlers } = useDraggable({
    initialPosition: buttonPosition || defaultPositionRef.current,
    bounds: { width: BUTTON_SIZE, height: BUTTON_SIZE },
    onPositionChange: setButtonPosition,
  });

  const handleClick = (e: React.MouseEvent) => {
    // 如果发生了拖动，不触发点击
    if (hasDragged) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      {...dragHandlers}
      className={cn(
        'fixed z-30 flex items-center justify-center rounded-full border shadow-lg backdrop-blur-sm',
        // 拖动时禁用过渡和 hover 效果
        isDragging ? 'cursor-grabbing opacity-70' : 'cursor-grab transition-all',
        // 根据状态设置背景和文字颜色
        isOpen
          ? 'bg-accent text-accent-foreground'
          : hasRunningProcess
            ? 'bg-accent/50 text-accent-foreground hover:bg-accent'
            : 'bg-background/90 text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${BUTTON_SIZE}px`,
        height: `${BUTTON_SIZE}px`,
      }}
      title="Quick Terminal (Ctrl+`)"
    >
      <div className="relative flex items-center justify-center">
        <Terminal className="h-5 w-5" />
        {/* 有活跃 PTY 时显示指示器 */}
        {hasRunningProcess && !isOpen && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary border border-background/90" />
        )}
      </div>
    </button>
  );
}
