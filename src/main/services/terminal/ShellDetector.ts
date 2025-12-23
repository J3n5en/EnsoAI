import { existsSync } from 'node:fs';

export function detectShell(): string {
  const platform = process.platform;

  if (platform === 'win32') {
    // Windows: prefer PowerShell, fallback to cmd
    const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
    if (existsSync(pwsh)) {
      return pwsh;
    }
    return 'powershell.exe';
  }

  // Unix-like systems
  const shell = process.env.SHELL;
  if (shell) {
    return shell;
  }

  // Fallback checks
  const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
  for (const s of shells) {
    if (existsSync(s)) {
      return s;
    }
  }

  return '/bin/sh';
}
