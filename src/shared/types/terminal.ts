export interface TerminalSession {
  id: string;
  title: string;
  cwd: string;
}

export interface TerminalCreateOptions {
  cwd?: string;
  shell?: string;
  args?: string[];
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
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
