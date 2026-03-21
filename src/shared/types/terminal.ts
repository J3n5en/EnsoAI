export interface TerminalSession {
  id: string;
  title: string;
  cwd: string;
  backendSessionId?: string;
}

export interface TerminalCreateOptions {
  cwd?: string;
  /** Internal use: OS cwd for the spawned PTY process when logical cwd is virtual. */
  spawnCwd?: string;
  shell?: string;
  args?: string[];
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  shellConfig?: import('./shell').ShellConfig;
  /** Command to execute after shell is ready */
  initialCommand?: string;
}

export interface TerminalResizeOptions {
  cols: number;
  rows: number;
}
