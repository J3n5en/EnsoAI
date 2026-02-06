import { exec, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
    paths: ['pwsh.exe'],
    args: ['-NoLogo'],
    // -Login loads user profile (for version managers like vfox, nvm-windows, etc.)
    // -ExecutionPolicy Bypass allows running .ps1 scripts (npm global packages use them)
    execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Login', '-Command'],
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    paths: ['powershell.exe'],
    args: ['-NoLogo'],
    // -ExecutionPolicy Bypass allows running .ps1 scripts (npm global packages use them)
    execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    paths: ['cmd.exe'],
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
    paths: ['wsl.exe'],
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

  private resolveWindowsCommandPath(command: string): string | null {
    if (!isWindows) return null;

    try {
      const output = execSync(`where.exe ${command}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      });
      const firstMatch = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      return firstMatch || null;
    } catch {
      return null;
    }
  }

  private async isWslAvailable(): Promise<boolean> {
    if (this.wslAvailable !== null) {
      return this.wslAvailable;
    }
    if (!isWindows) {
      this.wslAvailable = false;
      return false;
    }
    try {
      await execAsync('wsl --status', { timeout: 3000 });
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
      } else if (isWindows) {
        const resolved = this.resolveWindowsCommandPath(p);
        if (resolved) {
          return resolved;
        }
      } else {
        return p;
      }
    }
    return null;
  }

  private resolveCustomShellPath(shellPath: string): string {
    if (!isWindows) return shellPath;

    const looksLikeAbsolutePath =
      shellPath.includes('\\') || shellPath.includes('/') || /^[a-zA-Z]:/.test(shellPath);
    if (looksLikeAbsolutePath) {
      if (existsSync(shellPath)) return shellPath;
    } else {
      const resolved = this.resolveWindowsCommandPath(shellPath);
      if (resolved) return resolved;
    }

    return this.findAvailablePath(['powershell.exe']) || 'powershell.exe';
  }

  private async detectWindowsShells(): Promise<ShellInfo[]> {
    const shells: ShellInfo[] = [];

    for (const def of WINDOWS_SHELLS) {
      if (def.isWsl) {
        if (await this.isWslAvailable()) {
          shells.push({
            id: def.id,
            name: def.name,
            path: 'wsl.exe',
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
      const configuredShell = config.customShellPath || (isWindows ? 'powershell.exe' : '/bin/sh');
      return {
        shell: this.resolveCustomShellPath(configuredShell),
        args: config.customShellArgs || [],
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
      ? { shell: this.findAvailablePath(['powershell.exe']) || 'powershell.exe', args: ['-NoLogo'] }
      : { shell: '/bin/sh', args: [] };
  }

  /**
   * Resolve shell config for executing a command.
   * Returns shell path and execArgs (args needed to execute a command string).
   */
  resolveShellForCommand(config: ShellConfig): { shell: string; execArgs: string[] } {
    if (config.shellType === 'custom') {
      const configuredShell = config.customShellPath || (isWindows ? 'powershell.exe' : '/bin/sh');
      const shell = this.resolveCustomShellPath(configuredShell);
      // For custom shell, try to infer execArgs based on shell name
      const execArgs = this.inferExecArgs(shell, config.customShellArgs);
      return { shell, execArgs };
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
      ? {
          shell: this.findAvailablePath(['powershell.exe']) || 'powershell.exe',
          execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
        }
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
      // Try pwsh.exe (PowerShell 7) from PATH first
      return 'pwsh.exe';
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
