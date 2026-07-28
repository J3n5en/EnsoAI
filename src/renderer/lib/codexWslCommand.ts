import type { CodexRuntime } from '@shared/types';

export const CODEX_ORIGINATOR_ENV = 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE';

export interface CodexNativeShell {
  shell: string;
  execArgs: string[];
}

interface BuildAgentCommandForShellOptions {
  command: string;
  platform: string;
  shell: string;
  execArgs: string[];
  codexOriginator?: string;
  codexWslDistro?: string;
}

interface ResolveCodexCommandShellOptions {
  platform: string;
  shell: string;
  execArgs: string[];
  runtime?: CodexRuntime;
  nativeShell?: CodexNativeShell;
}

export function detectCodexRuntime(platform: string, shell: string): CodexRuntime {
  return platform === 'win32' && shell.toLowerCase().includes('wsl') ? 'wsl' : 'native';
}

export function resolveCodexCommandShell({
  platform,
  shell,
  execArgs,
  runtime,
  nativeShell,
}: ResolveCodexCommandShellOptions): { shell: string; execArgs: string[] } {
  if (platform !== 'win32' || !runtime) return { shell, execArgs };
  if (runtime === 'wsl') return { shell: 'wsl.exe', execArgs: [] };
  if (nativeShell) return { shell: nativeShell.shell, execArgs: [...nativeShell.execArgs] };
  if (detectCodexRuntime(platform, shell) !== 'wsl') return { shell, execArgs };

  // 原生 Codex 会话不能跟随新的 WSL 全局设置，否则 resume 会进入错误的历史目录。
  return {
    shell: 'powershell.exe',
    execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
  };
}

export function quoteInitialPromptForShell(
  prompt: string,
  platform: string,
  shell: string,
  execArgs: string[] = []
): string {
  const shellName = shell
    .replace(/\\/g, '/')
    .split('/')
    .at(-1)
    ?.replace(/\.exe$/i, '')
    .toLowerCase();
  const normalizedExecArgs = execArgs.map((arg) => arg.toLowerCase());
  const isPowerShell =
    shellName === 'powershell' || shellName === 'pwsh' || normalizedExecArgs.includes('-command');
  const isCmd = shellName === 'cmd' || normalizedExecArgs.includes('/c');
  const isNushell = shellName === 'nu';
  const isPosixShell =
    detectCodexRuntime(platform, shell) === 'wsl' ||
    ['bash', 'zsh', 'sh', 'dash', 'ksh', 'ash'].includes(shellName ?? '') ||
    (!isPowerShell && !isCmd && !isNushell && normalizedExecArgs.includes('-c'));

  if (isPosixShell || (platform !== 'win32' && !isPowerShell && !isNushell)) {
    // POSIX shell 的单引号不会展开变量；内部单引号用结束、转义、重新开始的方式表示。
    return `'${prompt.replace(/'/g, "'\\''")}'`;
  }

  if (isPowerShell) {
    // PowerShell 单引号字符串不会展开变量，反斜杠和反引号也会保持原样。
    return `'${prompt.replace(/'/g, "''")}'`;
  }

  if (isCmd) {
    const escaped = prompt
      .replace(/(\\*)"/g, '$1$1\\"')
      .replace(/(\\+)$/g, '$1$1')
      .replace(/%/g, '"^%"')
      .replace(/\r?\n/g, ' ');
    return `"${escaped}"`;
  }

  if (isNushell) {
    const escaped = prompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
    return `"${escaped}"`;
  }

  // 自定义 shell 无法可靠推断语法时，只保护双引号和换行，不改写提示词的其他内容。
  return `"${prompt.replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

export function buildAgentCommandForShell({
  command,
  platform,
  shell,
  execArgs,
  codexOriginator,
  codexWslDistro,
}: BuildAgentCommandForShellOptions): { shell: string; args: string[] } {
  if (detectCodexRuntime(platform, shell) !== 'wsl') {
    return { shell, args: [...execArgs, command] };
  }

  // Windows 环境变量不会自动进入 WSL，因此新建 Codex 会话时要写进 Linux 命令。
  const wslCommand = codexOriginator
    ? `env ${CODEX_ORIGINATOR_ENV}=${codexOriginator} ${command}`
    : command;
  return {
    shell: 'wsl.exe',
    // 命令放在 $1 中传递，避免提示词里的引号、美元符号被中间的 sh 提前解释。
    args: [
      ...(codexWslDistro ? ['-d', codexWslDistro] : []),
      '-e',
      'sh',
      '-lc',
      'exec "$SHELL" -ilc "$1"',
      'sh',
      wslCommand,
    ],
  };
}
