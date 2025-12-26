import { exec, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { AppCategory, type DetectedApp } from '@shared/types';

const execAsync = promisify(exec);
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

interface KnownApp {
  name: string;
  bundleId: string;
  category: AppCategory;
}

// Windows app detection info
interface WindowsApp {
  name: string;
  id: string; // Used as bundleId equivalent
  category: AppCategory;
  exePaths: string[]; // Possible executable paths
}

// Linux app detection info
interface LinuxApp {
  name: string;
  id: string; // Used as bundleId equivalent
  category: AppCategory;
  commands: string[]; // Possible command names (checked via 'which')
  desktopFile?: string; // Optional .desktop file name for icon
}

export class AppDetector {
  private static knownApps: KnownApp[] = [
    // Terminals
    {
      name: 'Terminal',
      bundleId: 'com.apple.Terminal',
      category: AppCategory.Terminal,
    },
    {
      name: 'iTerm',
      bundleId: 'com.googlecode.iterm2',
      category: AppCategory.Terminal,
    },
    {
      name: 'Warp',
      bundleId: 'dev.warp.Warp-Stable',
      category: AppCategory.Terminal,
    },
    {
      name: 'Alacritty',
      bundleId: 'org.alacritty',
      category: AppCategory.Terminal,
    },
    {
      name: 'Kitty',
      bundleId: 'net.kovidgoyal.kitty',
      category: AppCategory.Terminal,
    },
    {
      name: 'Hyper',
      bundleId: 'co.zeit.hyper',
      category: AppCategory.Terminal,
    },
    {
      name: 'Ghostty',
      bundleId: 'com.mitchellh.ghostty',
      category: AppCategory.Terminal,
    },
    {
      name: 'Rio',
      bundleId: 'com.raphamorim.rio',
      category: AppCategory.Terminal,
    },

    // Editors - Mainstream
    {
      name: 'Xcode',
      bundleId: 'com.apple.dt.Xcode',
      category: AppCategory.Editor,
    },
    {
      name: 'VS Code',
      bundleId: 'com.microsoft.VSCode',
      category: AppCategory.Editor,
    },
    {
      name: 'VSCodium',
      bundleId: 'com.visualstudio.code.oss',
      category: AppCategory.Editor,
    },
    {
      name: 'Cursor',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      category: AppCategory.Editor,
    },
    {
      name: 'Windsurf',
      bundleId: 'com.exafunction.windsurf',
      category: AppCategory.Editor,
    },
    {
      name: 'Sublime',
      bundleId: 'com.sublimetext.4',
      category: AppCategory.Editor,
    },
    { name: 'Nova', bundleId: 'com.panic.Nova', category: AppCategory.Editor },
    {
      name: 'TextMate',
      bundleId: 'com.macromates.TextMate',
      category: AppCategory.Editor,
    },
    { name: 'Zed', bundleId: 'dev.zed.Zed', category: AppCategory.Editor },

    // Editors - JetBrains
    {
      name: 'Android Studio',
      bundleId: 'com.google.android.studio',
      category: AppCategory.Editor,
    },
    {
      name: 'IntelliJ IDEA',
      bundleId: 'com.jetbrains.intellij',
      category: AppCategory.Editor,
    },
    {
      name: 'IntelliJ IDEA CE',
      bundleId: 'com.jetbrains.intellij.ce',
      category: AppCategory.Editor,
    },
    {
      name: 'WebStorm',
      bundleId: 'com.jetbrains.WebStorm',
      category: AppCategory.Editor,
    },
    {
      name: 'PyCharm',
      bundleId: 'com.jetbrains.pycharm',
      category: AppCategory.Editor,
    },
    {
      name: 'PyCharm CE',
      bundleId: 'com.jetbrains.pycharm.ce',
      category: AppCategory.Editor,
    },
    {
      name: 'CLion',
      bundleId: 'com.jetbrains.CLion',
      category: AppCategory.Editor,
    },
    {
      name: 'GoLand',
      bundleId: 'com.jetbrains.goland',
      category: AppCategory.Editor,
    },
    {
      name: 'PhpStorm',
      bundleId: 'com.jetbrains.PhpStorm',
      category: AppCategory.Editor,
    },
    {
      name: 'Rider',
      bundleId: 'com.jetbrains.rider',
      category: AppCategory.Editor,
    },
    {
      name: 'AppCode',
      bundleId: 'com.jetbrains.AppCode',
      category: AppCategory.Editor,
    },
    {
      name: 'DataGrip',
      bundleId: 'com.jetbrains.datagrip',
      category: AppCategory.Editor,
    },
    {
      name: 'RustRover',
      bundleId: 'com.jetbrains.rustrover',
      category: AppCategory.Editor,
    },
    {
      name: 'Fleet',
      bundleId: 'com.jetbrains.fleet',
      category: AppCategory.Editor,
    },

    // Editors - Others
    { name: 'Atom', bundleId: 'com.github.atom', category: AppCategory.Editor },
    {
      name: 'BBEdit',
      bundleId: 'com.barebones.bbedit',
      category: AppCategory.Editor,
    },
    {
      name: 'CotEditor',
      bundleId: 'com.coteditor.CotEditor',
      category: AppCategory.Editor,
    },
    {
      name: 'MacVim',
      bundleId: 'org.vim.MacVim',
      category: AppCategory.Editor,
    },
    { name: 'Emacs', bundleId: 'org.gnu.Emacs', category: AppCategory.Editor },
    {
      name: 'Brackets',
      bundleId: 'io.brackets.appshell',
      category: AppCategory.Editor,
    },
    {
      name: 'TextEdit',
      bundleId: 'com.apple.TextEdit',
      category: AppCategory.Editor,
    },

    // System
    {
      name: 'Finder',
      bundleId: 'com.apple.finder',
      category: AppCategory.Finder,
    },
  ];

  // Windows known apps
  private static windowsApps: WindowsApp[] = (() => {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');

    return [
      // Terminals
      {
        name: 'Windows Terminal',
        id: 'windows.terminal',
        category: AppCategory.Terminal,
        exePaths: [
          join(localAppData, 'Microsoft', 'WindowsApps', 'wt.exe'),
          // Preview version
          join(localAppData, 'Microsoft', 'WindowsApps', 'wtd.exe'),
          // Use command name as fallback (will be resolved via PATH)
          'wt.exe',
        ],
      },
      {
        name: 'PowerShell',
        id: 'windows.powershell',
        category: AppCategory.Terminal,
        exePaths: [
          join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        ],
      },
      {
        name: 'Alacritty',
        id: 'org.alacritty',
        category: AppCategory.Terminal,
        exePaths: [
          join(programFiles, 'Alacritty', 'alacritty.exe'),
          join(appData, 'alacritty', 'alacritty.exe'),
        ],
      },

      // Editors
      {
        name: 'VS Code',
        id: 'com.microsoft.VSCode',
        category: AppCategory.Editor,
        exePaths: [
          join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
          join(programFiles, 'Microsoft VS Code', 'Code.exe'),
        ],
      },
      {
        name: 'Cursor',
        id: 'com.todesktop.230313mzl4w4u92',
        category: AppCategory.Editor,
        exePaths: [join(localAppData, 'Programs', 'cursor', 'Cursor.exe')],
      },
      {
        name: 'Sublime Text',
        id: 'com.sublimetext.4',
        category: AppCategory.Editor,
        exePaths: [
          join(programFiles, 'Sublime Text', 'sublime_text.exe'),
          join(programFiles, 'Sublime Text 3', 'sublime_text.exe'),
        ],
      },
      {
        name: 'Notepad++',
        id: 'notepad++',
        category: AppCategory.Editor,
        exePaths: [
          join(programFiles, 'Notepad++', 'notepad++.exe'),
          join(programFilesX86, 'Notepad++', 'notepad++.exe'),
        ],
      },

      // JetBrains (Toolbox installs)
      {
        name: 'IntelliJ IDEA',
        id: 'com.jetbrains.intellij',
        category: AppCategory.Editor,
        exePaths: [join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'IDEA-U', 'ch-0')],
      },
      {
        name: 'WebStorm',
        id: 'com.jetbrains.WebStorm',
        category: AppCategory.Editor,
        exePaths: [join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'WebStorm', 'ch-0')],
      },

      // System
      {
        name: 'Explorer',
        id: 'windows.explorer',
        category: AppCategory.Finder,
        exePaths: ['C:\\Windows\\explorer.exe'],
      },
    ];
  })();

  // Linux known apps
  private static linuxApps: LinuxApp[] = [
    // Terminals
    {
      name: 'GNOME Terminal',
      id: 'org.gnome.Terminal',
      category: AppCategory.Terminal,
      commands: ['gnome-terminal'],
      desktopFile: 'org.gnome.Terminal.desktop',
    },
    {
      name: 'Konsole',
      id: 'org.kde.konsole',
      category: AppCategory.Terminal,
      commands: ['konsole'],
      desktopFile: 'org.kde.konsole.desktop',
    },
    {
      name: 'Alacritty',
      id: 'org.alacritty',
      category: AppCategory.Terminal,
      commands: ['alacritty'],
      desktopFile: 'Alacritty.desktop',
    },
    {
      name: 'Kitty',
      id: 'net.kovidgoyal.kitty',
      category: AppCategory.Terminal,
      commands: ['kitty'],
      desktopFile: 'kitty.desktop',
    },
    {
      name: 'Warp',
      id: 'dev.warp.Warp',
      category: AppCategory.Terminal,
      commands: ['warp-terminal', 'warp'],
      desktopFile: 'dev.warp.Warp.desktop',
    },
    {
      name: 'Ghostty',
      id: 'com.mitchellh.ghostty',
      category: AppCategory.Terminal,
      commands: ['ghostty'],
      desktopFile: 'com.mitchellh.ghostty.desktop',
    },
    {
      name: 'Tilix',
      id: 'com.gexperts.Tilix',
      category: AppCategory.Terminal,
      commands: ['tilix'],
      desktopFile: 'com.gexperts.Tilix.desktop',
    },
    {
      name: 'Terminator',
      id: 'terminator',
      category: AppCategory.Terminal,
      commands: ['terminator'],
      desktopFile: 'terminator.desktop',
    },
    {
      name: 'xterm',
      id: 'xterm',
      category: AppCategory.Terminal,
      commands: ['xterm'],
    },

    // Editors
    {
      name: 'VS Code',
      id: 'com.microsoft.VSCode',
      category: AppCategory.Editor,
      commands: ['code'],
      desktopFile: 'code.desktop',
    },
    {
      name: 'VSCodium',
      id: 'com.vscodium.codium',
      category: AppCategory.Editor,
      commands: ['codium'],
      desktopFile: 'codium.desktop',
    },
    {
      name: 'Cursor',
      id: 'com.todesktop.230313mzl4w4u92',
      category: AppCategory.Editor,
      commands: ['cursor'],
      desktopFile: 'cursor.desktop',
    },
    {
      name: 'Zed',
      id: 'dev.zed.Zed',
      category: AppCategory.Editor,
      commands: ['zed', 'zedit'],
      desktopFile: 'dev.zed.Zed.desktop',
    },
    {
      name: 'Sublime Text',
      id: 'com.sublimetext.4',
      category: AppCategory.Editor,
      commands: ['subl', 'sublime_text'],
      desktopFile: 'sublime_text.desktop',
    },
    {
      name: 'Atom',
      id: 'io.atom.Atom',
      category: AppCategory.Editor,
      commands: ['atom'],
      desktopFile: 'atom.desktop',
    },
    {
      name: 'Gedit',
      id: 'org.gnome.gedit',
      category: AppCategory.Editor,
      commands: ['gedit'],
      desktopFile: 'org.gnome.gedit.desktop',
    },
    {
      name: 'Kate',
      id: 'org.kde.kate',
      category: AppCategory.Editor,
      commands: ['kate'],
      desktopFile: 'org.kde.kate.desktop',
    },
    {
      name: 'Vim',
      id: 'vim',
      category: AppCategory.Editor,
      commands: ['gvim', 'vim'],
    },
    {
      name: 'Emacs',
      id: 'org.gnu.emacs',
      category: AppCategory.Editor,
      commands: ['emacs'],
      desktopFile: 'emacs.desktop',
    },

    // JetBrains IDEs
    {
      name: 'IntelliJ IDEA',
      id: 'com.jetbrains.intellij',
      category: AppCategory.Editor,
      commands: ['idea', 'intellij-idea-ultimate', 'intellij-idea-community'],
      desktopFile: 'jetbrains-idea.desktop',
    },
    {
      name: 'WebStorm',
      id: 'com.jetbrains.WebStorm',
      category: AppCategory.Editor,
      commands: ['webstorm'],
      desktopFile: 'jetbrains-webstorm.desktop',
    },
    {
      name: 'PyCharm',
      id: 'com.jetbrains.pycharm',
      category: AppCategory.Editor,
      commands: ['pycharm', 'pycharm-professional', 'pycharm-community'],
      desktopFile: 'jetbrains-pycharm.desktop',
    },
    {
      name: 'CLion',
      id: 'com.jetbrains.CLion',
      category: AppCategory.Editor,
      commands: ['clion'],
      desktopFile: 'jetbrains-clion.desktop',
    },
    {
      name: 'GoLand',
      id: 'com.jetbrains.goland',
      category: AppCategory.Editor,
      commands: ['goland'],
      desktopFile: 'jetbrains-goland.desktop',
    },
    {
      name: 'RustRover',
      id: 'com.jetbrains.rustrover',
      category: AppCategory.Editor,
      commands: ['rustrover'],
      desktopFile: 'jetbrains-rustrover.desktop',
    },

    // System - File Managers
    {
      name: 'Files',
      id: 'org.gnome.Nautilus',
      category: AppCategory.Finder,
      commands: ['nautilus'],
      desktopFile: 'org.gnome.Nautilus.desktop',
    },
    {
      name: 'Dolphin',
      id: 'org.kde.dolphin',
      category: AppCategory.Finder,
      commands: ['dolphin'],
      desktopFile: 'org.kde.dolphin.desktop',
    },
    {
      name: 'Thunar',
      id: 'thunar',
      category: AppCategory.Finder,
      commands: ['thunar'],
      desktopFile: 'thunar.desktop',
    },
    {
      name: 'Nemo',
      id: 'nemo',
      category: AppCategory.Finder,
      commands: ['nemo'],
      desktopFile: 'nemo.desktop',
    },
    {
      name: 'PCManFM',
      id: 'pcmanfm',
      category: AppCategory.Finder,
      commands: ['pcmanfm'],
      desktopFile: 'pcmanfm.desktop',
    },
  ];

  private detectedApps: DetectedApp[] = [];
  private initialized = false;

  async detectApps(): Promise<DetectedApp[]> {
    if (this.initialized) {
      return this.detectedApps;
    }

    if (isWindows) {
      return this.detectWindowsApps();
    }

    if (isMac) {
      return this.detectMacApps();
    }

    if (isLinux) {
      return this.detectLinuxApps();
    }

    // Unknown platform
    this.initialized = true;
    return [];
  }

  private async detectWindowsApps(): Promise<DetectedApp[]> {
    const detected: DetectedApp[] = [];

    for (const app of AppDetector.windowsApps) {
      for (const exePath of app.exePaths) {
        // Check if it's an absolute path or a command name
        const isAbsolutePath = exePath.includes('\\') || exePath.includes('/');

        if (isAbsolutePath) {
          if (existsSync(exePath)) {
            detected.push({
              name: app.name,
              bundleId: app.id,
              category: app.category,
              path: exePath,
            });
            break;
          }
        } else {
          // Use 'where' command to find executable in PATH
          try {
            const { stdout } = await execAsync(`where ${exePath}`, { timeout: 3000 });
            const resolvedPath = stdout.trim().split('\n')[0];
            if (resolvedPath) {
              detected.push({
                name: app.name,
                bundleId: app.id,
                category: app.category,
                path: resolvedPath,
              });
              break;
            }
          } catch {
            // Command not found, continue to next path
          }
        }
      }
    }

    this.detectedApps = detected;
    this.initialized = true;
    return detected;
  }

  private async detectMacApps(): Promise<DetectedApp[]> {
    const detected: DetectedApp[] = [];
    const bundleIdToApp = new Map(AppDetector.knownApps.map((app) => [app.bundleId, app]));

    // Scan common app locations
    const appDirs = [
      '/Applications',
      '/System/Applications',
      '/System/Library/CoreServices', // Finder.app
      join(homedir(), 'Applications'),
    ];

    for (const appDir of appDirs) {
      if (!existsSync(appDir)) continue;

      try {
        const entries = await readdir(appDir);
        for (const entry of entries) {
          if (!entry.endsWith('.app')) continue;

          const appPath = join(appDir, entry);
          const plistPath = join(appPath, 'Contents', 'Info.plist');

          if (!existsSync(plistPath)) continue;

          try {
            // Read bundle ID from Info.plist using PlistBuddy
            const { stdout } = await execAsync(
              `/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${plistPath}" 2>/dev/null`
            );
            const bundleId = stdout.trim();

            const knownApp = bundleIdToApp.get(bundleId);
            if (knownApp) {
              detected.push({
                name: knownApp.name,
                bundleId: knownApp.bundleId,
                category: knownApp.category,
                path: appPath,
              });
            }
          } catch {
            // Failed to read plist, skip
          }
        }
      } catch {
        // Failed to read directory, skip
      }
    }

    this.detectedApps = detected;
    this.initialized = true;
    return detected;
  }

  private async detectLinuxApps(): Promise<DetectedApp[]> {
    const detected: DetectedApp[] = [];

    for (const app of AppDetector.linuxApps) {
      for (const command of app.commands) {
        try {
          const { stdout } = await execAsync(`which ${command}`, { timeout: 3000 });
          const resolvedPath = stdout.trim();
          if (resolvedPath) {
            detected.push({
              name: app.name,
              bundleId: app.id,
              category: app.category,
              path: resolvedPath,
            });
            break; // Found this app, move to next
          }
        } catch {
          // Command not found, try next
        }
      }
    }

    this.detectedApps = detected;
    this.initialized = true;
    return detected;
  }

  async openPath(
    path: string,
    bundleId: string,
    options?: {
      line?: number;
      workspacePath?: string;
      openFiles?: string[];
      activeFile?: string;
    }
  ): Promise<void> {
    const detectedApp = this.detectedApps.find((a) => a.bundleId === bundleId);
    if (!detectedApp) {
      throw new Error(`App with bundle ID ${bundleId} not found`);
    }

    if (isWindows) {
      const escapedExe = detectedApp.path.replace(/'/g, "''");
      const escapedPath = path.replace(/'/g, "''");

      if (bundleId === 'windows.terminal') {
        await execAsync(
          `powershell -Command "Start-Process -FilePath '${escapedExe}' -ArgumentList '-d','${escapedPath}'"`
        );
      } else if (detectedApp.category === AppCategory.Terminal) {
        await execAsync(
          `powershell -Command "Start-Process -FilePath '${escapedExe}' -WorkingDirectory '${escapedPath}'"`
        );
      } else {
        const pathArg = options?.line ? `${escapedPath}:${options.line}` : escapedPath;
        await execAsync(
          `powershell -Command "Start-Process -FilePath '${escapedExe}' -ArgumentList '${pathArg}'"`
        );
      }
    } else if (isLinux) {
      // Linux: execute command directly with path as argument
      const escapedPath = path.replace(/"/g, '\\"');

      if (detectedApp.category === AppCategory.Terminal) {
        // Terminal apps: open in the specified directory
        // Different terminals have different ways to set working directory
        const command = detectedApp.path;
        if (command.includes('gnome-terminal')) {
          await execAsync(`"${command}" --working-directory="${escapedPath}"`);
        } else if (command.includes('konsole')) {
          await execAsync(`"${command}" --workdir "${escapedPath}"`);
        } else if (command.includes('alacritty')) {
          await execAsync(`"${command}" --working-directory "${escapedPath}"`);
        } else if (command.includes('kitty')) {
          await execAsync(`"${command}" --directory "${escapedPath}"`);
        } else if (command.includes('tilix')) {
          await execAsync(`"${command}" --working-directory="${escapedPath}"`);
        } else if (command.includes('terminator')) {
          await execAsync(`"${command}" --working-directory="${escapedPath}"`);
        } else {
          // Generic fallback: try to cd and open
          await execAsync(`cd "${escapedPath}" && "${command}"`);
        }
      } else if (detectedApp.category === AppCategory.Finder) {
        // File managers: open directory
        await execAsync(`"${detectedApp.path}" "${escapedPath}"`);
      } else {
        // Editors and other apps: pass path as argument
        await execAsync(`"${detectedApp.path}" "${escapedPath}"`);
      }
    } else {
      // macOS: use open command or direct CLI
      if (detectedApp.category === AppCategory.Editor && options?.workspacePath) {
        // For editors, use CLI to open workspace with files
        await this.openEditorWithFiles(bundleId, detectedApp.path, options);
      } else if (options?.line && detectedApp.category === AppCategory.Editor) {
        const lineArgs = this.getLineArgs(bundleId, path, options.line);
        await execAsync(`open -b "${bundleId}" ${lineArgs}`);
      } else {
        await execAsync(`open -b "${bundleId}" "${path}"`);
      }
    }
  }

  private async openEditorWithFiles(
    bundleId: string,
    appPath: string,
    options: {
      workspacePath: string;
      openFiles?: string[];
      activeFile?: string;
      line?: number;
    }
  ): Promise<void> {
    // Get CLI executable path based on editor type
    const cliPath = this.getEditorCliPath(bundleId, appPath);

    if (!cliPath) {
      // Fallback to simple open
      await execAsync(`open -b "${bundleId}" "${options.workspacePath}"`);
      return;
    }

    // Strategy: Open workspace and all files first, then use -g to navigate to specific line
    // This ensures the workspace is loaded before attempting to jump to the line
    const allFiles = options.openFiles || [];

    // Step 1: Open workspace with all files (including activeFile)
    let cmd1 = `"${cliPath}" "${options.workspacePath}"`;
    for (const file of allFiles) {
      cmd1 += ` "${file}"`;
    }

    try {
      await execAsync(cmd1);

      // Step 2: If we have an active file with a line number, use -g to navigate
      if (options.activeFile && options.line) {
        // Wait a bit for editor to load the workspace
        await new Promise((resolve) => setTimeout(resolve, 500));

        const cmd2 = `"${cliPath}" -g "${options.activeFile}:${options.line}"`;
        await execAsync(cmd2);
      }
    } catch {
      // CLI failed, fallback to open command
      await execAsync(`open -b "${bundleId}" "${options.workspacePath}"`);
    }
  }

  private getEditorCliPath(bundleId: string, appPath: string): string | null {
    // VSCode, Cursor, Codium
    if (
      bundleId.includes('com.microsoft.VSCode') ||
      bundleId.includes('com.todesktop.230313mzl4w4u92') || // Cursor
      bundleId.includes('com.visualstudio.code')
    ) {
      // Try to find CLI in common locations
      const possiblePaths = [
        '/usr/local/bin/cursor',
        '/opt/homebrew/bin/cursor',
        '/usr/local/bin/code',
        '/opt/homebrew/bin/code',
        `${appPath}/Contents/Resources/app/bin/cursor`,
        `${appPath}/Contents/Resources/app/bin/code`,
      ];

      for (const path of possiblePaths) {
        try {
          execSync(`test -f "${path}"`);
          return path;
        } catch {}
      }
    }

    // Zed
    if (bundleId.includes('dev.zed.Zed')) {
      const possiblePaths = ['/usr/local/bin/zed', '/opt/homebrew/bin/zed'];
      for (const path of possiblePaths) {
        try {
          execSync(`test -f "${path}"`);
          return path;
        } catch {}
      }
    }

    return null;
  }

  private getLineArgs(bundleId: string, path: string, line: number): string {
    // VSCode, Cursor, Codium (all use VSCode format)
    if (
      bundleId.includes('com.microsoft.VSCode') ||
      bundleId.includes('com.todesktop.230313mzl4w4u92') || // Cursor
      bundleId.includes('com.visualstudio.code')
    ) {
      return `--args "${path}" -g "${path}:${line}"`;
    }

    // Zed
    if (bundleId.includes('dev.zed.Zed')) {
      return `"${path}:${line}"`;
    }

    // Sublime Text
    if (bundleId.includes('com.sublimetext')) {
      return `"${path}:${line}"`;
    }

    // IntelliJ IDEA, WebStorm, PyCharm, etc.
    if (bundleId.includes('com.jetbrains')) {
      return `--args --line ${line} "${path}"`;
    }

    // Atom
    if (bundleId.includes('com.github.atom')) {
      return `"${path}:${line}"`;
    }

    // Default: try file:line format (works for many editors)
    return `"${path}:${line}"`;
  }

  async getAppIcon(bundleId: string): Promise<string | undefined> {
    const detectedApp = this.detectedApps.find((a) => a.bundleId === bundleId);
    if (!detectedApp) return undefined;

    if (isWindows) {
      // Windows icon extraction is complex, return undefined for now
      // Could use powershell or native module in future
      return undefined;
    }

    if (!isMac) {
      return undefined;
    }

    try {
      // Get icon file name from Info.plist
      const { stdout } = await execAsync(
        `/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "${detectedApp.path}/Contents/Info.plist" 2>/dev/null || ` +
          `/usr/libexec/PlistBuddy -c "Print :CFBundleIconName" "${detectedApp.path}/Contents/Info.plist" 2>/dev/null`
      );

      let iconName = stdout.trim();
      if (!iconName) return undefined;
      if (!iconName.endsWith('.icns')) {
        iconName += '.icns';
      }

      const icnsPath = join(detectedApp.path, 'Contents', 'Resources', iconName);
      if (!existsSync(icnsPath)) return undefined;

      // Convert icns to png using sips (required for ic13 format on macOS 26+)
      const tmpPng = join(tmpdir(), `enso-icon-${bundleId.replace(/\./g, '-')}.png`);
      await execAsync(`sips -s format png -z 128 128 "${icnsPath}" --out "${tmpPng}" 2>/dev/null`);

      const pngData = await readFile(tmpPng);
      return `data:image/png;base64,${pngData.toString('base64')}`;
    } catch {
      return undefined;
    }
  }
}

export const appDetector = new AppDetector();
