import { exec, spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { app } from 'electron';

const execAsync = promisify(exec);

// Check if a command exists
async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

// Run command with admin privileges (macOS: osascript, Linux: multiple fallbacks)
async function runWithAdminPrivileges(shellCommand: string): Promise<void> {
  if (process.platform === 'darwin') {
    // macOS: use osascript
    return new Promise((resolve, reject) => {
      const appleScript = `do shell script "${shellCommand}" with administrator privileges`;
      const proc = spawn('osascript', ['-e', appleScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `osascript exited with code ${code}`));
      });

      proc.on('error', reject);

      setTimeout(() => {
        proc.kill();
        reject(new Error('Timeout waiting for admin privileges'));
      }, 60000);
    });
  }

  // Linux: try multiple methods
  // 1. Try zenity (GTK dialog, works on most DEs including XFCE)
  if (await commandExists('zenity')) {
    return new Promise((resolve, reject) => {
      const script = `
        PASSWORD=$(zenity --password --title="EnsoAI CLI 安装" 2>/dev/null)
        if [ -z "$PASSWORD" ]; then
          exit 1
        fi
        echo "$PASSWORD" | sudo -S sh -c '${shellCommand.replace(/'/g, "'\\''")}'
      `;
      const proc = spawn('sh', ['-c', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || 'Authentication failed or cancelled'));
      });

      proc.on('error', reject);

      setTimeout(() => {
        proc.kill();
        reject(new Error('Timeout waiting for admin privileges'));
      }, 60000);
    });
  }

  // 2. Try kdialog (KDE)
  if (await commandExists('kdialog')) {
    return new Promise((resolve, reject) => {
      const script = `
        PASSWORD=$(kdialog --password "EnsoAI CLI 安装需要管理员权限" 2>/dev/null)
        if [ -z "$PASSWORD" ]; then
          exit 1
        fi
        echo "$PASSWORD" | sudo -S sh -c '${shellCommand.replace(/'/g, "'\\''")}'
      `;
      const proc = spawn('sh', ['-c', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || 'Authentication failed or cancelled'));
      });

      proc.on('error', reject);

      setTimeout(() => {
        proc.kill();
        reject(new Error('Timeout waiting for admin privileges'));
      }, 60000);
    });
  }

  // 3. Fallback to pkexec (requires polkit agent running)
  return new Promise((resolve, reject) => {
    const proc = spawn('pkexec', ['sh', '-c', shellCommand], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `pkexec exited with code ${code}`));
    });

    proc.on('error', reject);

    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout waiting for admin privileges'));
    }, 60000);
  });
}

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

export interface CliInstallStatus {
  installed: boolean;
  path: string | null;
  error?: string;
}

class CliInstaller {
  private getCliPath(): string {
    if (isWindows) {
      // Windows: install to user's local bin
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
      return join(localAppData, 'Programs', 'enso', 'enso.cmd');
    }
    // macOS/Linux: install to /usr/local/bin
    return '/usr/local/bin/enso';
  }

  private getAppPath(): string {
    if (isMac) {
      // In production, app.getAppPath() returns the Resources/app.asar path
      // We need the actual .app bundle path
      const appPath = app.getAppPath();
      // Navigate from Resources/app.asar to the .app bundle
      const match = appPath.match(/^(.+\.app)/);
      if (match) {
        return match[1];
      }
      // Fallback for dev mode
      return '/Applications/EnsoAI.app';
    }
    if (isWindows) {
      return app.getPath('exe');
    }
    return app.getPath('exe');
  }

  private generateMacScript(): string {
    const appPath = this.getAppPath();
    return `#!/bin/bash
# EnsoAI CLI - Open directories in EnsoAI

# Get the target path
if [ -z "$1" ]; then
  TARGET_PATH="$(pwd)"
else
  # Resolve to absolute path
  if [[ "$1" = /* ]]; then
    TARGET_PATH="$1"
  else
    TARGET_PATH="$(cd "$(dirname "$1")" 2>/dev/null && pwd)/$(basename "$1")"
    # Handle the case where $1 is just a directory name
    if [ -d "$1" ]; then
      TARGET_PATH="$(cd "$1" && pwd)"
    fi
  fi
fi

# Check if EnsoAI is running (production or dev mode)
if pgrep -x "EnsoAI" > /dev/null 2>&1 || pgrep -f "electron.*EnsoAI" > /dev/null 2>&1; then
  # App is running, use AppleScript to send message directly
  osascript -e "
    tell application \\"System Events\\"
      set frontmost of (first process whose name contains \\"EnsoAI\\" or name is \\"Electron\\") to true
    end tell
  " 2>/dev/null

  # Use open with URL scheme
  open "enso://open?path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TARGET_PATH', safe=''))")"
else
  # App not running, launch it with the path
  if [ -d "${appPath}" ]; then
    open -a "${appPath}" --args "--open-path=$TARGET_PATH"
  else
    echo "EnsoAI not found at ${appPath}"
    exit 1
  fi
fi
`;
  }

  private generateWindowsScript(): string {
    const exePath = this.getAppPath();
    // Use PowerShell for proper URL encoding
    return `@echo off
setlocal enabledelayedexpansion

:: EnsoAI CLI - Open directories in EnsoAI

:: Get the target path
if "%~1"=="" (
  set "TARGET_PATH=%CD%"
) else (
  set "TARGET_PATH=%~f1"
)

:: Check if EnsoAI is running
tasklist /FI "IMAGENAME eq EnsoAI.exe" 2>NUL | find /I /N "EnsoAI.exe">NUL
if %ERRORLEVEL%==0 (
  :: App is running, use URL scheme with PowerShell for proper URL encoding
  for /f "usebackq delims=" %%i in (\`powershell -NoProfile -Command "[uri]::EscapeDataString('%TARGET_PATH%')"\`) do set "ENCODED_PATH=%%i"
  start "" "enso://open?path=!ENCODED_PATH!"
) else (
  :: App not running, launch with path (use caret to escape special chars, no extra quotes)
  "${exePath}" --open-path=!TARGET_PATH!
)
`;
  }

  private generateLinuxScript(): string {
    const exePath = this.getAppPath();
    return `#!/bin/bash
# EnsoAI CLI - Open directories in EnsoAI

# Get the target path
if [ -z "$1" ]; then
  TARGET_PATH="$(pwd)"
else
  # Resolve to absolute path
  if [[ "$1" = /* ]]; then
    TARGET_PATH="$1"
  else
    TARGET_PATH="$(cd "$(dirname "$1")" 2>/dev/null && pwd)/$(basename "$1")"
    # Handle the case where $1 is just a directory name
    if [ -d "$1" ]; then
      TARGET_PATH="$(cd "$1" && pwd)"
    fi
  fi
fi

# Check if EnsoAI is running
if pgrep -x "ensoai" > /dev/null 2>&1 || pgrep -f "EnsoAI" > /dev/null 2>&1; then
  # App is running, use xdg-open with URL scheme
  ENCODED_PATH=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TARGET_PATH', safe=''))")
  xdg-open "enso://open?path=$ENCODED_PATH" 2>/dev/null || \\
    gio open "enso://open?path=$ENCODED_PATH" 2>/dev/null
else
  # App not running, launch it with the path
  if [ -x "${exePath}" ]; then
    "${exePath}" --open-path="$TARGET_PATH" &
  else
    echo "EnsoAI not found at ${exePath}"
    exit 1
  fi
fi
`;
  }

  async checkInstalled(): Promise<CliInstallStatus> {
    const cliPath = this.getCliPath();

    if (existsSync(cliPath)) {
      return { installed: true, path: cliPath };
    }

    return { installed: false, path: null };
  }

  async install(): Promise<CliInstallStatus> {
    const cliPath = this.getCliPath();

    try {
      if (isWindows) {
        // Windows: create directory and script
        const dir = join(cliPath, '..');
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(cliPath, this.generateWindowsScript(), { encoding: 'utf-8' });

        // Add to user PATH using PowerShell (avoids setx truncation issue)
        try {
          const { stdout } = await execAsync(
            `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('PATH', 'User')"`
          );
          if (!stdout.includes(dir)) {
            await execAsync(
              `powershell -NoProfile -Command "$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User'); [Environment]::SetEnvironmentVariable('PATH', \\"$currentPath;${dir}\\", 'User')"`
            );
          }
        } catch {
          // PATH modification failed, but script is installed
        }
      } else {
        // macOS/Linux: need admin privileges to write to /usr/local/bin
        const script = isLinux ? this.generateLinuxScript() : this.generateMacScript();
        const tempPath = join(app.getPath('temp'), 'enso-cli-script');
        writeFileSync(tempPath, script, { mode: 0o755 });

        const escapedTempPath = tempPath.replace(/"/g, '\\"');
        const escapedCliPath = cliPath.replace(/"/g, '\\"');
        const shellCmd = `cp '${escapedTempPath}' '${escapedCliPath}' && chmod 755 '${escapedCliPath}'`;

        await runWithAdminPrivileges(shellCmd);

        // Clean up temp file
        try {
          unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      return { installed: true, path: cliPath };
    } catch (error) {
      return {
        installed: false,
        path: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async uninstall(): Promise<CliInstallStatus> {
    const cliPath = this.getCliPath();

    try {
      if (!existsSync(cliPath)) {
        return { installed: false, path: null };
      }

      if (isWindows) {
        unlinkSync(cliPath);
        // Remove from user PATH using PowerShell
        const dir = join(cliPath, '..');
        try {
          await execAsync(
            `powershell -NoProfile -Command "$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User'); $newPath = ($currentPath -split ';' | Where-Object { $_ -ne '${dir.replace(/\\/g, '\\\\')}' }) -join ';'; [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')"`
          );
        } catch {
          // PATH modification failed, but script is uninstalled
        }
      } else {
        // macOS/Linux: need sudo
        const escapedCliPath = cliPath.replace(/"/g, '\\"');
        const shellCmd = `rm '${escapedCliPath}'`;
        await runWithAdminPrivileges(shellCmd);
      }

      return { installed: false, path: null };
    } catch (error) {
      return {
        installed: true,
        path: cliPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const cliInstaller = new CliInstaller();
