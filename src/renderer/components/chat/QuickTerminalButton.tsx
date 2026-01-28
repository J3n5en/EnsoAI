import { Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all',
        'bg-primary/90 text-primary-foreground hover:bg-primary hover:scale-105 active:scale-95',
        isOpen && 'opacity-50'
      )}
      style={{
        right: '16px',
        bottom: '16px',
      }}
      title="Quick Terminal (Ctrl+`)"
    >
      <Terminal className="h-5 w-5" />

      {/* Status indicator - 暂时隐藏，阶段 3 实现 */}
      {hasRunningProcess && (
        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </button>
  );
}
