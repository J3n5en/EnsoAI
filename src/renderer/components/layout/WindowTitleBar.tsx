import { ExternalLink, MoreHorizontal, RefreshCw, Settings, Terminal, X } from 'lucide-react';
import { useCallback } from 'react';
import logoImage from '@/assets/logo.png';
import {
  Menu,
  MenuItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
  TitleBarMenuPopup,
} from '@/components/ui/menu';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { WindowControls } from './WindowControls';

// 平台检查在模块级别进行，避免在组件内部违反 Hooks 规则
const isMac = typeof window !== 'undefined' && window.electronAPI?.env?.platform === 'darwin';

interface WindowTitleBarProps {
  onOpenSettings?: () => void;
}

/**
 * Custom title bar for frameless windows (Windows/Linux)
 * Modern minimal design with settings button and more menu
 */
export function WindowTitleBar({ onOpenSettings }: WindowTitleBarProps) {
  const { t } = useI18n();

  // 所有 hooks 必须在条件返回之前调用，遵循 React Hooks 规则
  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  const handleOpenDevTools = useCallback(() => {
    window.electronAPI.window.openDevTools();
  }, []);

  const handleOpenExternal = useCallback((url: string) => {
    window.electronAPI.shell.openExternal(url);
  }, []);

  // On macOS, we don't need the custom title bar (uses native hiddenInset)
  if (isMac) {
    return null;
  }

  // 更多按钮样式
  const iconButtonClass = cn(
    'flex h-7 w-7 items-center justify-center rounded-sm',
    'text-muted-foreground hover:text-foreground hover:bg-muted/80',
    'transition-colors duration-150'
  );

  return (
    <div className="relative z-50 flex h-8 shrink-0 items-center justify-between border-b bg-background drag-region select-none">
      {/* Left: App icon and name (clickable to open settings) */}
      <button
        type="button"
        onClick={onOpenSettings}
        className={cn(
          'flex h-8 items-center gap-1.5 px-2 no-drag',
          'transition-opacity duration-200 hover:opacity-80 active:opacity-60'
        )}
        title={`${t('Settings')} (Ctrl+,)`}
      >
        <img src={logoImage} alt="Enso AI" className="h-5 w-5" />
        <span className="text-xs font-medium text-muted-foreground">Enso AI</span>
      </button>

      {/* Right: Actions and window controls */}
      <div className="flex items-center no-drag">
        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className={iconButtonClass}
          aria-label={t('Settings')}
          title={`${t('Settings')} (Ctrl+,)`}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        {/* More Menu */}
        <Menu>
          <MenuTrigger
            render={
              <button type="button" className={iconButtonClass} aria-label={t('More')}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            }
          />
          <TitleBarMenuPopup align="end" sideOffset={6} className="min-w-[180px]">
            <MenuItem onClick={handleReload}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('Reload')}
              <MenuShortcut>Ctrl+R</MenuShortcut>
            </MenuItem>
            <MenuItem onClick={handleOpenDevTools}>
              <Terminal className="h-3.5 w-3.5" />
              {t('Developer Tools')}
              <MenuShortcut>F12</MenuShortcut>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => handleOpenExternal('https://github.com/J3n5en/EnsoAI')}>
              <ExternalLink className="h-3.5 w-3.5" />
              {t('GitHub')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => window.electronAPI.window.close()}>
              <X className="h-3.5 w-3.5" />
              {t('Exit')}
              <MenuShortcut>Alt+F4</MenuShortcut>
            </MenuItem>
          </TitleBarMenuPopup>
        </Menu>

        {/* Separator */}
        <div className="h-4 w-px bg-border mx-1" />

        {/* Window controls */}
        <WindowControls />
      </div>
    </div>
  );
}
