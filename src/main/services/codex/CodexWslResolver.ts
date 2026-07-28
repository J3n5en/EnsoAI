import { execFile } from 'node:child_process';

export interface WslCodexLocationOptions {
  cwd?: string;
  wslDistro?: string;
}

export interface WslCodexLocation {
  sessionsRoot: string;
  cwd: string;
  wslDistro: string;
}

export interface WslCommandRunOptions {
  timeoutMs: number;
}

export type WslCommandRunner = (
  args: string[],
  cwd?: string,
  options?: WslCommandRunOptions
) => Promise<string>;

const WSL_PROBE_TIMEOUT_MS = 5000;
const WSL_LOCATION_MARKER = 'ENSOAI_CODEX_LOCATION_V1';

const WSL_LOCATION_SCRIPT =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: 这里是 WSL shell 参数展开语法，不是 JavaScript 模板字符串。
  'printf \'ENSOAI_CODEX_LOCATION_V1\\0%s\\0%s\\0%s\\0\' "$WSL_DISTRO_NAME" "${CODEX_HOME:-$HOME/.codex}/sessions" "$PWD"';

function runWslCommand(
  args: string[],
  cwd?: string,
  options?: WslCommandRunOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'wsl.exe',
      args,
      {
        ...(cwd ? { cwd } : {}),
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: options?.timeoutMs ?? WSL_PROBE_TIMEOUT_MS,
        killSignal: 'SIGTERM',
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      }
    );
  });
}

function quoteShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function extractWslDistroFromCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const normalized = cwd.replace(/\\/g, '/');
  return normalized.match(/^\/\/wsl(?:\.localhost|\$)\/([^/]+)(?:\/|$)/i)?.[1];
}

function isValidDistro(value: string): boolean {
  return /^[a-z0-9._-]+$/i.test(value);
}

function isAbsoluteLinuxPath(value: string): boolean {
  return value.startsWith('/') && !value.includes('\0');
}

function linuxPathToWslUnc(distro: string, linuxPath: string): string {
  return `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, '\\')}`;
}

export async function resolveWslCodexLocation(
  options: WslCodexLocationOptions,
  run: WslCommandRunner = runWslCommand
): Promise<WslCodexLocation> {
  const requestedDistro = options.wslDistro ?? extractWslDistroFromCwd(options.cwd);
  const locationCommand = `sh -c ${quoteShellArgument(WSL_LOCATION_SCRIPT)}`;
  const args = [
    ...(requestedDistro ? ['-d', requestedDistro] : []),
    '-e',
    'sh',
    '-c',
    'exec "$SHELL" -ilc "$1"',
    'sh',
    locationCommand,
  ];
  const output = await run(args, options.cwd, { timeoutMs: WSL_PROBE_TIMEOUT_MS });
  // 登录 shell 可能输出欢迎语；只解析固定标记后的 NUL 分隔字段。
  const payloadMarker = `${WSL_LOCATION_MARKER}\0`;
  const markerIndex = output.lastIndexOf(payloadMarker);
  const payload = markerIndex >= 0 ? output.slice(markerIndex + payloadMarker.length) : '';
  const [wslDistro, sessionsRoot, cwd] = payload.split('\0');

  if (
    !wslDistro ||
    !isValidDistro(wslDistro) ||
    !sessionsRoot ||
    !isAbsoluteLinuxPath(sessionsRoot) ||
    !cwd ||
    !isAbsoluteLinuxPath(cwd)
  ) {
    throw new Error('WSL 返回了无效的 Codex 会话位置');
  }

  // 路径只能来自 WSL 进程输出，渲染进程不能借此读取任意 Windows 文件。
  return {
    sessionsRoot: linuxPathToWslUnc(wslDistro, sessionsRoot),
    cwd,
    wslDistro,
  };
}
