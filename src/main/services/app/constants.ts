import { homedir } from 'node:os';
import { join } from 'node:path';
import { AppCategory } from '@shared/types';

export interface KnownApp {
  name: string;
  bundleId: string;
  category: AppCategory;
}

// Windows app detection info
export interface WindowsApp {
  name: string;
  id: string; // Used as bundleId equivalent
  category: AppCategory;
  exePaths: string[]; // Possible executable paths
}

// Linux app detection info
export interface LinuxApp {
  name: string;
  id: string; // Used as bundleId equivalent
  category: AppCategory;
  commands: string[]; // Possible command names (checked via 'which')
  desktopFile?: string; // Optional .desktop file name for icon
}

// macOS known apps
export const MAC_APPS: KnownApp[] = [
  // Terminals
  { name: 'Terminal', bundleId: 'com.apple.Terminal', category: AppCategory.Terminal },
  { name: 'iTerm', bundleId: 'com.googlecode.iterm2', category: AppCategory.Terminal },
  { name: 'Warp', bundleId: 'dev.warp.Warp-Stable', category: AppCategory.Terminal },
  { name: 'Alacritty', bundleId: 'org.alacritty', category: AppCategory.Terminal },
  { name: 'Kitty', bundleId: 'net.kovidgoyal.kitty', category: AppCategory.Terminal },
  { name: 'Hyper', bundleId: 'co.zeit.hyper', category: AppCategory.Terminal },
  { name: 'Ghostty', bundleId: 'com.mitchellh.ghostty', category: AppCategory.Terminal },
  { name: 'Rio', bundleId: 'com.raphamorim.rio', category: AppCategory.Terminal },

  // Editors - Mainstream
  { name: 'Xcode', bundleId: 'com.apple.dt.Xcode', category: AppCategory.Editor },
  { name: 'VS Code', bundleId: 'com.microsoft.VSCode', category: AppCategory.Editor },
  { name: 'VSCodium', bundleId: 'com.visualstudio.code.oss', category: AppCategory.Editor },
  { name: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92', category: AppCategory.Editor },
  { name: 'Windsurf', bundleId: 'com.exafunction.windsurf', category: AppCategory.Editor },
  { name: 'Sublime', bundleId: 'com.sublimetext.4', category: AppCategory.Editor },
  { name: 'Nova', bundleId: 'com.panic.Nova', category: AppCategory.Editor },
  { name: 'TextMate', bundleId: 'com.macromates.TextMate', category: AppCategory.Editor },
  { name: 'Zed', bundleId: 'dev.zed.Zed', category: AppCategory.Editor },

  // Editors - JetBrains
  { name: 'Android Studio', bundleId: 'com.google.android.studio', category: AppCategory.Editor },
  { name: 'IntelliJ IDEA', bundleId: 'com.jetbrains.intellij', category: AppCategory.Editor },
  { name: 'IntelliJ IDEA CE', bundleId: 'com.jetbrains.intellij.ce', category: AppCategory.Editor },
  { name: 'WebStorm', bundleId: 'com.jetbrains.WebStorm', category: AppCategory.Editor },
  { name: 'PyCharm', bundleId: 'com.jetbrains.pycharm', category: AppCategory.Editor },
  { name: 'PyCharm CE', bundleId: 'com.jetbrains.pycharm.ce', category: AppCategory.Editor },
  { name: 'CLion', bundleId: 'com.jetbrains.CLion', category: AppCategory.Editor },
  { name: 'GoLand', bundleId: 'com.jetbrains.goland', category: AppCategory.Editor },
  { name: 'PhpStorm', bundleId: 'com.jetbrains.PhpStorm', category: AppCategory.Editor },
  { name: 'Rider', bundleId: 'com.jetbrains.rider', category: AppCategory.Editor },
  { name: 'AppCode', bundleId: 'com.jetbrains.AppCode', category: AppCategory.Editor },
  { name: 'DataGrip', bundleId: 'com.jetbrains.datagrip', category: AppCategory.Editor },
  { name: 'RustRover', bundleId: 'com.jetbrains.rustrover', category: AppCategory.Editor },
  { name: 'Fleet', bundleId: 'com.jetbrains.fleet', category: AppCategory.Editor },

  // Editors - Others
  { name: 'Atom', bundleId: 'com.github.atom', category: AppCategory.Editor },
  { name: 'BBEdit', bundleId: 'com.barebones.bbedit', category: AppCategory.Editor },
  { name: 'CotEditor', bundleId: 'com.coteditor.CotEditor', category: AppCategory.Editor },
  { name: 'MacVim', bundleId: 'org.vim.MacVim', category: AppCategory.Editor },
  { name: 'Emacs', bundleId: 'org.gnu.Emacs', category: AppCategory.Editor },
  { name: 'Brackets', bundleId: 'io.brackets.appshell', category: AppCategory.Editor },
  { name: 'TextEdit', bundleId: 'com.apple.TextEdit', category: AppCategory.Editor },

  // Git
  { name: 'GitHub Desktop', bundleId: 'com.github.GitHubClient', category: AppCategory.Editor },

  // System
  { name: 'Finder', bundleId: 'com.apple.finder', category: AppCategory.Finder },
  { name: 'QSpace Pro', bundleId: 'com.jinghaoshe.qspace.pro', category: AppCategory.Finder },
  { name: 'Antigravity', bundleId: 'com.google.antigravity', category: AppCategory.Editor },
];

// Windows known apps
export const WINDOWS_APPS: WindowsApp[] = (() => {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');

  return [
    // Terminals - Only those without registry detection or system apps
    {
      name: 'Windows Terminal',
      id: 'windows.terminal',
      category: AppCategory.Terminal,
      exePaths: [
        join(localAppData, 'Microsoft', 'WindowsApps', 'wt.exe'),
        join(localAppData, 'Microsoft', 'WindowsApps', 'wtd.exe'),
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
      name: 'Kitty',
      id: 'net.kovidgoyal.kitty',
      category: AppCategory.Terminal,
      exePaths: [join(programFiles, 'kitty', 'kitty.exe'), 'kitty.exe'],
    },
    {
      name: 'Cmder',
      id: 'cmder',
      category: AppCategory.Terminal,
      exePaths: ['cmder.exe'],
    },

    // Editors - Only those without registry detection (portable versions)
    {
      name: 'Vim',
      id: 'org.vim.vim',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Vim', 'vim91', 'gvim.exe'),
        join(programFiles, 'Vim', 'vim90', 'gvim.exe'),
        join(programFilesX86, 'Vim', 'vim91', 'gvim.exe'),
        'gvim.exe',
        'vim.exe',
      ],
    },
    {
      name: 'Neovim',
      id: 'io.neovim.nvim',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Neovim', 'bin', 'nvim.exe'),
        join(localAppData, 'Programs', 'Neovim', 'bin', 'nvim.exe'),
        'nvim.exe',
      ],
    },
    {
      name: 'Emacs',
      id: 'org.gnu.emacs',
      category: AppCategory.Editor,
      exePaths: [
        join(programFiles, 'Emacs', 'emacs-29.1', 'bin', 'runemacs.exe'),
        join(programFiles, 'Emacs', 'bin', 'runemacs.exe'),
        'emacs.exe',
      ],
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
export const LINUX_APPS: LinuxApp[] = [
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
    name: 'GVim',
    id: 'org.vim.gvim',
    category: AppCategory.Editor,
    commands: ['gvim'],
    desktopFile: 'gvim.desktop',
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
