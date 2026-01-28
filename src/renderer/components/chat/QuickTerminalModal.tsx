import { Minimize2, Terminal as TerminalIcon, X } from 'lucide-react';
import { ShellTerminal } from '@/components/terminal/ShellTerminal';
import { Dialog, DialogPopup } from '@/components/ui/dialog';

interface QuickTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string;
}

export function QuickTerminalModal({ open, onOpenChange, cwd }: QuickTerminalModalProps) {
  // 默认尺寸和位置（阶段 1 固定值）
  const modalWidth = Math.min(Math.max(window.innerWidth * 0.6, 600), 1200);
  const modalHeight = Math.min(Math.max(window.innerHeight * 0.35, 300), 600);
  const modalLeft = (window.innerWidth - modalWidth) / 2;
  const modalBottom = 40;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className="!max-w-none !rounded-lg"
        showCloseButton={false}
        showBackdrop={false}
        style={{
          position: 'fixed',
          left: `${modalLeft}px`,
          bottom: `${modalBottom}px`,
          width: `${modalWidth}px`,
          height: `${modalHeight}px`,
          top: 'auto',
          transform: 'none',
        }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between h-9 px-3 border-b bg-muted/30 rounded-t-lg select-none">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TerminalIcon className="h-4 w-4" />
            <span>Quick Terminal</span>
          </div>
          <div className="flex items-center gap-1">
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

        {/* 终端内容区 */}
        <div className="flex-1 min-h-0">{open && <ShellTerminal cwd={cwd} isActive={open} />}</div>
      </DialogPopup>
    </Dialog>
  );
}
