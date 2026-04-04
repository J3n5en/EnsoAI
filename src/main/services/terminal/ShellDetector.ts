import { exec, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import type { ShellConfig, ShellInfo } from '@shared/types';

const execAsync = promisify(exec);
const isWindows = process.platform === 'win32';

interface ShellDefinition {
  id: string;
  name: string;
  paths: string[];
  args: string[];
  execArgs: string[]; // Args for executing a command (e.g., ['-c'] for bash, ['/c'] for cmd)
  isWsl?: boolean;
}

const WINDOWS_SHELLS: ShellDefinition[] = [
  {
    id: 'powershell7',
    name: 'PowerShell 7',
    paths: [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe',
      'pwsh.exe',
    ],
    args: ['-NoLogo'],
    // -Login loads user profile (for version managers like vfox, nvm-windows, etc.)
    // -ExecutionPolicy Bypass allows running .ps1 scripts (npm global packages use them)
    execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Login', '-Command'],
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    paths: [
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',
      'powershell.exe',
    ],
    args: ['-NoLogo'],
    // -ExecutionPolicy Bypass allows running .ps1 scripts (npm global packages use them)
    execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    paths: ['C:\\Windows\\System32\\cmd.exe', 'C:\\Windows\\SysWOW64\\cmd.exe', 'cmd.exe'],
    args: [],
    execArgs: ['/c'],
  },
  {
    id: 'gitbash',
    name: 'Git Bash',
    paths: ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'],
    args: ['-i', '-l'],
    execArgs: ['-i', '-l', '-c'],
  },
  {
    id: 'nushell',
    name: 'Nushell',
    paths: [
      'C:\\Program Files\\nu\\bin\\nu.exe',
      `${process.env.USERPROFILE}\\.cargo\\bin\\nu.exe`,
      `${process.env.USERPROFILE}\\scoop\\shims\\nu.exe`,
    ],
    args: ['-l', '-i'],
    execArgs: ['-l', '-c'],
  },
  {
    id: 'wsl',
    name: 'WSL',
    paths: ['C:\\Windows\\System32\\wsl.exe', 'wsl.exe'],
    args: [],
    execArgs: ['--', 'bash', '-ilc'],
    isWsl: true,
  },
];

const UNIX_SHELLS: ShellDefinition[] = [
  {
    id: 'zsh',
    name: 'Zsh',
    paths: ['/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh', '/opt/homebrew/bin/zsh'],
    args: ['-i', '-l'],
    execArgs: ['-i', '-l', '-c'],
  },
  {
    id: 'bash',
    name: 'Bash',
    paths: ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash'],
    args: ['-i', '-l'],
    execArgs: ['-i', '-l', '-c'],
  },
  {
    id: 'fish',
    name: 'Fish',
    paths: ['/usr/bin/fish', '/usr/local/bin/fish', '/opt/homebrew/bin/fish'],
    args: ['-i', '-l'],
    execArgs: ['-l', '-c'],
  },
  {
    id: 'nushell',
    name: 'Nushell',
    paths: ['/usr/local/bin/nu', '/opt/homebrew/bin/nu', `${process.env.HOME}/.cargo/bin/nu`],
    args: ['-l', '-i'],
    execArgs: ['-l', '-c'],
  },
  {
    id: 'sh',
    name: 'Sh',
    paths: ['/bin/sh'],
    args: [],
    execArgs: ['-c'],
  },
];

class ShellDetector {
  private cachedShells: ShellInfo[] | null = null;
  private wslAvailable: boolean | null = null;
  private windowsPathCache: string | null = null;

  private getWindowsPath(): string {
    if (!isWindows) {
      return process.env.PATH || '';
    }
    if (this.windowsPathCache !== null) {
      return this.windowsPathCache;
    }

    const parseRegistryValue = (output: string): string => {
      const match = output.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      return match ? match[1].trim() : '';
    };

    const expandEnvVars = (value: string): string =>
      value.replace(/%([^%]+)%/g, (match, varName) => process.env[varName] || match);

    try {
      let userPath = '';
      let systemPath = '';

      try {
        userPath = parseRegistryValue(
          execSync('reg query "HKCU\\Environment" /v Path 2>nul', {
            encoding: 'utf8',
            timeout: 3000,
          })
        );
      } catch {
        // Ignore missing user PATH
      }

      try {
        systemPath = parseRegistryValue(
          execSync(
            'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path 2>nul',
            {
              encoding: 'utf8',
              timeout: 3000,
            }
          )
        );
      } catch {
        // Ignore missing system PATH
      }

      const combined = [systemPath, userPath, process.env.Path, process.env.PATH]
        .filter(Boolean)
        .join(delimiter);
      this.windowsPathCache = expandEnvVars(combined);
      return this.windowsPathCache;
    } catch {
      this.windowsPathCache = process.env.Path || process.env.PATH || '';
      return this.windowsPathCache;
    }
  }

  private resolveCommandOnPath(command: string): string | null {
    const pathValue = isWindows ? this.getWindowsPath() : process.env.PATH || '';
    const directories = pathValue.split(delimiter).filter(Boolean);

    if (isWindows) {
      const hasKnownExtension = /\.(exe|cmd|bat|com)$/i.test(command);
      const extensions = hasKnownExtension
        ? ['']
        : (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
            .split(';')
            .filter(Boolean)
            .map((ext) => ext.toLowerCase());

      for (const directory of directories) {
        for (const extension of extensions) {
          const candidate = join(directory, hasKnownExtension ? command : `${command}${extension}`);
          if (existsSync(candidate)) {
            return candidate;
          }
        }
      }
      return null;
    }

    for (const directory of directories) {
      const candidate = join(directory, command);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async isWslAvailable(): Promise<boolean> {
    if (this.wslAvailable !== null) {
      return this.wslAvailable;
    }
    if (!isWindows) {
      this.wslAvailable = false;
      return false;
    }

    const wslPath = this.findAvailablePath(['C:\\Windows\\System32\\wsl.exe', 'wsl.exe']);
    if (!wslPath) {
      this.wslAvailable = false;
      return false;
    }

    try {
      await execAsync(`"${wslPath}" --status`, { timeout: 3000 });
      this.wslAvailable = true;
      return true;
    } catch {
      this.wslAvailable = false;
      return false;
    }
  }

  private findAvailablePath(paths: string[]): string | null {
    for (const p of paths) {
      if (p.includes('\\') || p.startsWith('/')) {
        if (existsSync(p)) {
          return p;
        }
      } else {
        const resolved = this.resolveCommandOnPath(p);
        if (resolved) {
          return resolved;
        }
      }
    }
    return null;
  }

  private async detectWindowsShells(): Promise<ShellInfo[]> {
    const shells: ShellInfo[] = [];

    for (const def of WINDOWS_SHELLS) {
      if (def.isWsl) {
        if (await this.isWslAvailable()) {
          const resolvedPath = this.findAvailablePath(def.paths) || def.paths[0];
          shells.push({
            id: def.id,
            name: def.name,
            path: resolvedPath,
            args: def.args,
            available: true,
            isWsl: true,
          });
        }
        continue;
      }

      const path = this.findAvailablePath(def.paths);
      shells.push({
        id: def.id,
        name: def.name,
        path: path || def.paths[0],
        args: def.args,
        available: path !== null,
      });
    }

    return shells;
  }

  private detectUnixShells(): ShellInfo[] {
    const shells: ShellInfo[] = [];
    const systemShell = process.env.SHELL;

    if (systemShell) {
      const systemShellName = systemShell.split('/').pop() || 'shell';
      shells.push({
        id: 'system',
        name: `System Default (${systemShellName})`,
        path: systemShell,
        args: ['-i', '-l'],
        available: existsSync(systemShell),
      });
    }

    for (const def of UNIX_SHELLS) {
      const path = this.findAvailablePath(def.paths);
      shells.push({
        id: def.id,
        name: def.name,
        path: path || def.paths[0],
        args: def.args,
        available: path !== null,
      });
    }

    return shells;
  }

  async detectShells(): Promise<ShellInfo[]> {
    if (this.cachedShells) {
      return this.cachedShells;
    }

    const shells = isWindows ? await this.detectWindowsShells() : this.detectUnixShells();

    this.cachedShells = shells;
    return shells;
  }

  resolveShellConfig(config: ShellConfig): { shell: string; args: string[] } {
    if (config.shellType === 'custom') {
      const customPath = config.customShellPath?.trim();
      const customArgs = config.customShellArgs || [];
      if (customPath) {
        if (customPath.includes('\\') || customPath.startsWith('/')) {
          if (existsSync(customPath)) {
            return { shell: customPath, args: customArgs };
          }
        } else {
          return { shell: customPath, args: customArgs };
        }
      }
      return {
        shell: isWindows ? 'powershell.exe' : '/bin/sh',
        args: isWindows ? ['-NoLogo'] : [],
      };
    }

    const definitions = isWindows ? WINDOWS_SHELLS : UNIX_SHELLS;

    if (config.shellType === 'system' && !isWindows) {
      const systemShell = process.env.SHELL;
      if (systemShell && existsSync(systemShell)) {
        return { shell: systemShell, args: ['-i', '-l'] };
      }
    }

    const def = definitions.find((d) => d.id === config.shellType);
    if (def) {
      const path = this.findAvailablePath(def.paths);
      if (path) {
        return { shell: path, args: def.args };
      }

      // Shell not available, try fallback for PowerShell variants
      if (isWindows && config.shellType === 'powershell7') {
        // PowerShell 7 (pwsh.exe) not available, fallback to PowerShell 5.x (powershell.exe)
        const fallbackDef = definitions.find((d) => d.id === 'powershell');
        if (fallbackDef) {
          const fallbackPath = this.findAvailablePath(fallbackDef.paths);
          if (fallbackPath) {
            return { shell: fallbackPath, args: fallbackDef.args };
          }
        }
      }
    }

    return isWindows
      ? { shell: 'powershell.exe', args: ['-NoLogo'] }
      : { shell: '/bin/sh', args: [] };
  }

  /**
   * Resolve shell config for executing a command.
   * Returns shell path and execArgs (args needed to execute a command string).
   */
  resolveShellForCommand(config: ShellConfig): { shell: string; execArgs: string[] } {
    if (config.shellType === 'custom') {
      const customPath = config.customShellPath?.trim();
      const customArgs = config.customShellArgs || [];
      if (customPath) {
        if (customPath.includes('\\') || customPath.startsWith('/')) {
          if (existsSync(customPath)) {
            const execArgs = this.inferExecArgs(customPath, customArgs);
            return { shell: customPath, execArgs };
          }
        } else {
          const execArgs = this.inferExecArgs(customPath, customArgs);
          return { shell: customPath, execArgs };
        }
      }
      const fallbackShell = isWindows ? 'powershell.exe' : '/bin/sh';
      const execArgs = this.inferExecArgs(fallbackShell, customArgs);
      return { shell: fallbackShell, execArgs };
    }

    const definitions = isWindows ? WINDOWS_SHELLS : UNIX_SHELLS;

    if (config.shellType === 'system' && !isWindows) {
      const systemShell = process.env.SHELL;
      if (systemShell && existsSync(systemShell)) {
        const execArgs = this.inferExecArgs(systemShell);
        return { shell: systemShell, execArgs };
      }
    }

    const def = definitions.find((d) => d.id === config.shellType);
    if (def) {
      const path = this.findAvailablePath(def.paths);
      if (path) {
        return { shell: path, execArgs: def.execArgs };
      }

      // Shell not available, try fallback for PowerShell variants
      if (isWindows && config.shellType === 'powershell7') {
        // PowerShell 7 (pwsh.exe) not available, fallback to PowerShell 5.x (powershell.exe)
        const fallbackDef = definitions.find((d) => d.id === 'powershell');
        if (fallbackDef) {
          const fallbackPath = this.findAvailablePath(fallbackDef.paths);
          if (fallbackPath) {
            return { shell: fallbackPath, execArgs: fallbackDef.execArgs };
          }
        }
      }
    }

    return isWindows
      ? { shell: 'powershell.exe', execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'] }
      : { shell: '/bin/sh', execArgs: ['-c'] };
  }

  /**
   * Infer execArgs based on shell path/name.
   */
  private inferExecArgs(shellPath: string, customArgs?: string[]): string[] {
    const shellName = shellPath.split(/[/\\]/).pop()?.toLowerCase() || '';

    // Check all definitions for matching shell
    const allDefs = [...WINDOWS_SHELLS, ...UNIX_SHELLS];
    for (const def of allDefs) {
      if (def.paths.some((p) => p.toLowerCase().includes(shellName))) {
        return def.execArgs;
      }
    }

    // Fallback based on common shell names
    if (shellName.includes('pwsh') || shellName.includes('powershell')) {
      return ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'];
    }
    if (shellName.includes('cmd')) {
      return ['/c'];
    }
    if (shellName.includes('bash') || shellName.includes('zsh')) {
      return ['-i', '-l', '-c'];
    }
    if (shellName.includes('fish') || shellName.includes('nu')) {
      return ['-l', '-c'];
    }

    // If custom args provided, append -c for Unix-like shells
    if (customArgs?.length) {
      return [...customArgs, '-c'];
    }

    return isWindows ? ['/c'] : ['-c'];
  }

  getDefaultShell(): string {
    if (isWindows) {
      const pwshPath = this.findAvailablePath(['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'pwsh.exe']);
      if (pwshPath) {
        return pwshPath;
      }

      const powershellPath = this.findAvailablePath([
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        'powershell.exe',
      ]);
      if (powershellPath) {
        return powershellPath;
      }

      return 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    }

    const shell = process.env.SHELL;
    if (shell) {
      // Ignore invalid absolute $SHELL values (common when launched from GUI or misconfigured)
      if (!shell.startsWith('/') || existsSync(shell)) {
        return shell;
      }
    }

    const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
    for (const s of shells) {
      if (existsSync(s)) {
        return s;
      }
    }

    return '/bin/sh';
  }

  clearCache(): void {
    this.cachedShells = null;
    this.wslAvailable = null;
  }
}

export const shellDetector = new ShellDetector();

export function detectShell(): string {
  return shellDetector.getDefaultShell();
}
