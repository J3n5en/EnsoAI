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

  const BUTTON_SIZE = 44; // 稍微缩小，更精致

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
        'fixed z-30 flex items-center justify-center rounded-full',
        'border backdrop-blur-sm',
        // 阴影效果
        'shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.16)]',
        // 拖动时状态
        isDragging && 'cursor-grabbing opacity-70 scale-95',
        !isDragging && 'cursor-grab transition-all duration-200', // 只在非拖动时启用过渡
        // 根据状态设置背景和文字颜色
        isOpen
          ? 'bg-accent text-accent-foreground border-accent/50'
          : hasRunningProcess
            ? 'bg-accent/40 text-accent-foreground border-accent/30 hover:bg-accent/60'
            : 'bg-background/95 text-muted-foreground border-border/50 hover:bg-accent/30 hover:text-foreground hover:border-accent/30'
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
        <Terminal className="h-[18px] w-[18px]" />
        {/* 有活跃 PTY 时显示指示器 */}
        {hasRunningProcess && !isOpen && (
          <span className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-primary ring-1 ring-background" />
        )}
      </div>
    </button>
  );
}
