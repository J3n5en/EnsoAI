import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { AppCategory, DetectedApp } from '@shared/types';

const execAsync = promisify(exec);

interface KnownApp {
  name: string;
  bundleId: string;
  category: AppCategory;
}

export class AppDetector {
  private static knownApps: KnownApp[] = [
    // Terminals
    { name: 'Terminal', bundleId: 'com.apple.Terminal', category: 'terminal' },
    { name: 'iTerm', bundleId: 'com.googlecode.iterm2', category: 'terminal' },
    { name: 'Warp', bundleId: 'dev.warp.Warp-Stable', category: 'terminal' },
    { name: 'Alacritty', bundleId: 'org.alacritty', category: 'terminal' },
    { name: 'Kitty', bundleId: 'net.kovidgoyal.kitty', category: 'terminal' },
    { name: 'Hyper', bundleId: 'co.zeit.hyper', category: 'terminal' },
    { name: 'Ghostty', bundleId: 'com.mitchellh.ghostty', category: 'terminal' },
    { name: 'Rio', bundleId: 'com.raphamorim.rio', category: 'terminal' },

    // Editors - Mainstream
    { name: 'Xcode', bundleId: 'com.apple.dt.Xcode', category: 'editor' },
    { name: 'Visual Studio Code', bundleId: 'com.microsoft.VSCode', category: 'editor' },
    { name: 'VSCodium', bundleId: 'com.visualstudio.code.oss', category: 'editor' },
    { name: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92', category: 'editor' },
    { name: 'Windsurf', bundleId: 'com.codeium.windsurf', category: 'editor' },
    { name: 'Sublime Text', bundleId: 'com.sublimetext.4', category: 'editor' },
    { name: 'Nova', bundleId: 'com.panic.Nova', category: 'editor' },
    { name: 'TextMate', bundleId: 'com.macromates.TextMate', category: 'editor' },
    { name: 'Zed', bundleId: 'dev.zed.Zed', category: 'editor' },

    // Editors - JetBrains
    { name: 'Android Studio', bundleId: 'com.google.android.studio', category: 'editor' },
    { name: 'IntelliJ IDEA', bundleId: 'com.jetbrains.intellij', category: 'editor' },
    { name: 'IntelliJ IDEA CE', bundleId: 'com.jetbrains.intellij.ce', category: 'editor' },
    { name: 'WebStorm', bundleId: 'com.jetbrains.WebStorm', category: 'editor' },
    { name: 'PyCharm', bundleId: 'com.jetbrains.pycharm', category: 'editor' },
    { name: 'PyCharm CE', bundleId: 'com.jetbrains.pycharm.ce', category: 'editor' },
    { name: 'CLion', bundleId: 'com.jetbrains.CLion', category: 'editor' },
    { name: 'GoLand', bundleId: 'com.jetbrains.goland', category: 'editor' },
    { name: 'PhpStorm', bundleId: 'com.jetbrains.PhpStorm', category: 'editor' },
    { name: 'Rider', bundleId: 'com.jetbrains.rider', category: 'editor' },
    { name: 'AppCode', bundleId: 'com.jetbrains.AppCode', category: 'editor' },
    { name: 'DataGrip', bundleId: 'com.jetbrains.datagrip', category: 'editor' },
    { name: 'RustRover', bundleId: 'com.jetbrains.rustrover', category: 'editor' },
    { name: 'Fleet', bundleId: 'com.jetbrains.fleet', category: 'editor' },

    // Editors - Others
    { name: 'Atom', bundleId: 'com.github.atom', category: 'editor' },
    { name: 'BBEdit', bundleId: 'com.barebones.bbedit', category: 'editor' },
    { name: 'CotEditor', bundleId: 'com.coteditor.CotEditor', category: 'editor' },
    { name: 'MacVim', bundleId: 'org.vim.MacVim', category: 'editor' },
    { name: 'Emacs', bundleId: 'org.gnu.Emacs', category: 'editor' },
    { name: 'Brackets', bundleId: 'io.brackets.appshell', category: 'editor' },
    { name: 'TextEdit', bundleId: 'com.apple.TextEdit', category: 'editor' },

    // System
    { name: 'Finder', bundleId: 'com.apple.finder', category: 'finder' },
  ];

  private detectedApps: DetectedApp[] = [];
  private initialized = false;

  async detectApps(): Promise<DetectedApp[]> {
    if (this.initialized) {
      return this.detectedApps;
    }

    const detected: DetectedApp[] = [];

    for (const knownApp of AppDetector.knownApps) {
      try {
        const { stdout } = await execAsync(
          `mdfind "kMDItemCFBundleIdentifier == '${knownApp.bundleId}'"`
        );
        const appPath = stdout.trim().split('\n')[0];

        if (appPath) {
          detected.push({
            name: knownApp.name,
            bundleId: knownApp.bundleId,
            category: knownApp.category,
            path: appPath,
          });
        }
      } catch {
        // App not found, skip
      }
    }

    this.detectedApps = detected;
    this.initialized = true;
    return detected;
  }

  async openPath(path: string, bundleId: string): Promise<void> {
    const detectedApp = this.detectedApps.find((a) => a.bundleId === bundleId);
    if (!detectedApp) {
      throw new Error(`App with bundle ID ${bundleId} not found`);
    }

    await execAsync(`open -b "${bundleId}" "${path}"`);
  }

  async getAppIcon(bundleId: string): Promise<string | undefined> {
    const detectedApp = this.detectedApps.find((a) => a.bundleId === bundleId);
    if (!detectedApp) return undefined;

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

      const icnsPath = `${detectedApp.path}/Contents/Resources/${iconName}`;
      if (!existsSync(icnsPath)) return undefined;

      // Convert icns to png using sips (required for ic13 format on macOS 26+)
      const tmpPng = `/tmp/enso-icon-${bundleId.replace(/\./g, '-')}.png`;
      await execAsync(`sips -s format png -z 128 128 "${icnsPath}" --out "${tmpPng}" 2>/dev/null`);

      const pngData = await readFile(tmpPng);
      return `data:image/png;base64,${pngData.toString('base64')}`;
    } catch {
      return undefined;
    }
  }
}

export const appDetector = new AppDetector();
