import { Terminal } from 'lucide-react';
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

  const { position, isDragging, dragHandlers } = useDraggable({
    initialPosition: buttonPosition || {
      x: window.innerWidth - BUTTON_SIZE - 16,
      y: window.innerHeight - BUTTON_SIZE - 16,
    },
    bounds: { width: BUTTON_SIZE, height: BUTTON_SIZE },
    onPositionChange: setButtonPosition,
  });

  const handleClick = (e: React.MouseEvent) => {
    // 如果刚拖动过，不触发点击
    if (isDragging) {
      e.stopPropagation();
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
        'fixed z-30 flex items-center justify-center rounded-full shadow-lg transition-all',
        'bg-primary/90 text-primary-foreground hover:bg-primary hover:scale-105 active:scale-95',
        isDragging && 'cursor-grabbing opacity-70',
        !isDragging && 'cursor-grab',
        isOpen && 'opacity-50'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${BUTTON_SIZE}px`,
        height: `${BUTTON_SIZE}px`,
      }}
      title="Quick Terminal (Ctrl+`)"
    >
      <Terminal className="h-5 w-5" />

      {hasRunningProcess && (
        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </button>
  );
}
