import { Minus, Square, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// 平台检查在模块级别进行，避免在组件内部违反 Hooks 规则
const isMac = typeof window !== 'undefined' && window.electronAPI?.env?.platform === 'darwin';

/**
 * Windows-style window control buttons (minimize, maximize/restore, close)
 * Only rendered on Windows/Linux where we use frameless windows
 */
export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<'min' | 'max' | 'close' | null>(null);

  // 所有 hooks 必须在条件返回之前调用，遵循 React Hooks 规则
  const handleMinimize = useCallback(() => {
    window.electronAPI.window.minimize();
  }, []);

  const handleMaximize = useCallback(() => {
    window.electronAPI.window.maximize();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI.window.close();
  }, []);

  // Check initial maximized state
  useEffect(() => {
    // macOS 使用原生 traffic lights，跳过
    if (isMac) return;

    window.electronAPI.window.isMaximized().then(setIsMaximized);

    // Listen for maximize/unmaximize events
    const unsubscribe = window.electronAPI.window.onMaximizedChange(setIsMaximized);
    return unsubscribe;
  }, []);

  // Don't render on macOS (uses native traffic lights)
  if (isMac) {
    return null;
  }

  return (
    <div className="flex items-center shrink-0 h-8">
      {/* Minimize */}
      <button
        type="button"
        onClick={handleMinimize}
        onMouseEnter={() => setHoveredButton('min')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          'relative flex h-8 w-11 items-center justify-center no-drag',
          'transition-colors duration-200 ease-out',
          'hover:bg-foreground/10 active:bg-foreground/15'
        )}
        aria-label="Minimize"
      >
        <Minus
          className={cn(
            'h-4 w-4 transition-all duration-200',
            hoveredButton === 'min' ? 'opacity-100' : 'opacity-60'
          )}
          strokeWidth={1.5}
        />
      </button>

      {/* Maximize/Restore */}
      <button
        type="button"
        onClick={handleMaximize}
        onMouseEnter={() => setHoveredButton('max')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          'relative flex h-8 w-11 items-center justify-center no-drag',
          'transition-colors duration-200 ease-out',
          'hover:bg-foreground/10 active:bg-foreground/15'
        )}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        <div
          className={cn(
            'transition-all duration-200',
            hoveredButton === 'max' ? 'opacity-100' : 'opacity-60'
          )}
        >
          {isMaximized ? (
            // Restore icon (two overlapping squares)
            <svg className="h-3.5 w-3.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M2 3h5v5H2z" />
              <path d="M3 3V2h5v5H7" />
            </svg>
          ) : (
            <Square className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </div>
      </button>

      {/* Close */}
      <button
        type="button"
        onClick={handleClose}
        onMouseEnter={() => setHoveredButton('close')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          'relative flex h-8 w-11 items-center justify-center no-drag',
          'transition-colors duration-200 ease-out',
          'hover:bg-red-500 active:bg-red-600'
        )}
        aria-label="Close"
      >
        <X
          className={cn(
            'h-4 w-4 transition-all duration-200',
            hoveredButton === 'close' ? 'opacity-100 text-white' : 'opacity-60'
          )}
          strokeWidth={1.5}
        />
      </button>
    </div>
  );
}
