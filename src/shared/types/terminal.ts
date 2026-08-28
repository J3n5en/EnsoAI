export interface TerminalSession {
  id: string;
  title: string;
  cwd: string;
}

export type WindowsPtyBackend = 'conpty' | 'winpty';
export type WindowsConptySource = 'bundled' | 'system';

export interface TerminalCreateResult {
  id: string;
  windowsPtyBackend?: WindowsPtyBackend;
  windowsConptySource?: WindowsConptySource;
}

export interface TerminalCreateOptions {
  cwd?: string;
  shell?: string;
  args?: string[];
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  /** Enable ANSI colors even when the host process exports color-disabled variables. */
  forceColorOutput?: boolean;
  shellConfig?: import('./shell').ShellConfig;
  /** Windows 滚屏补丁：使用随包新版 ConPTY/OpenConsole 改善旧系统滚动异常。 */
  windowsConptyCompatibilityFixEnabled?: boolean;
  /** Command to execute after shell is ready */
  initialCommand?: string;
}

export interface TerminalResizeOptions {
  cols: number;
  rows: number;
}
