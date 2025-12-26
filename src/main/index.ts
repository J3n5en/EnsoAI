import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { type Locale, normalizeLocale } from '@shared/i18n';
import { IPC_CHANNELS } from '@shared/types';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { cleanupAllResources, registerIpcHandlers } from './ipc';
import { checkGitInstalled } from './services/git/checkGit';
import { setCurrentLocale } from './services/i18n';
import { buildAppMenu } from './services/MenuBuilder';
import { autoUpdaterService } from './services/updater/AutoUpdater';
import { createMainWindow } from './windows/MainWindow';

let mainWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;

// Register URL scheme handler (must be done before app is ready)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('enso', process.execPath, [process.argv[1]]);
  }
} else {
  app.setAsDefaultProtocolClient('enso');
}

// Parse URL and extract path
function parseEnsoUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'enso:') {
      const path = parsed.searchParams.get('path');
      if (path) {
        return decodeURIComponent(path);
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

// Send open path event to renderer
function sendOpenPath(path: string): void {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    const win = windows[0];
    win.focus();
    // Check if renderer is ready (not loading)
    if (win.webContents.isLoading()) {
      pendingOpenPath = path;
    } else {
      win.webContents.send(IPC_CHANNELS.APP_OPEN_PATH, path);
    }
  } else {
    pendingOpenPath = path;
  }
}

// Sanitize path: remove trailing slashes/backslashes and stray quotes (Windows CMD issue)
function sanitizePath(path: string): string {
  return path.replace(/[\\/]+$/, '').replace(/^["']|["']$/g, '');
}

// Handle command line arguments
function handleCommandLineArgs(argv: string[]): void {
  for (const arg of argv) {
    if (arg.startsWith('--open-path=')) {
      const rawPath = arg.slice('--open-path='.length);
      const path = sanitizePath(rawPath);
      if (path) {
        sendOpenPath(path);
      }
      return;
    }
    if (arg.startsWith('enso://')) {
      const rawPath = parseEnsoUrl(arg);
      const path = rawPath ? sanitizePath(rawPath) : null;
      if (path) {
        sendOpenPath(path);
      }
      return;
    }
  }
}

// macOS: Handle open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  const path = parseEnsoUrl(url);
  if (path) {
    if (app.isReady()) {
      sendOpenPath(path);
    } else {
      pendingOpenPath = path;
    }
  }
});

// Windows/Linux: Handle second instance (skip in dev mode to allow multiple instances)
const isDev = !app.isPackaged;
if (!isDev) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (_, commandLine) => {
      // Focus existing window
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
      // Handle command line from second instance
      handleCommandLineArgs(commandLine);
    });
  }
}

function readStoredLanguage(): Locale {
  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json');
    if (!existsSync(settingsPath)) return 'en';
    const data = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    const persisted = data['enso-settings'];
    if (persisted && typeof persisted === 'object') {
      const state = (persisted as { state?: Record<string, unknown> }).state;
      const language = state?.language;
      return normalizeLocale(typeof language === 'string' ? language : undefined);
    }
  } catch {
    // Fall back to English if settings are missing or invalid
  }
  return 'en';
}

// Linux: avoid GTK3/GTK4 mixed symbols crash by forcing GTK3 unless explicitly overridden.
if (process.platform === 'linux') {
  const gtkVersion = process.env.ENSOAI_GTK_VERSION || '3';
  app.commandLine.appendSwitch('gtk-version', gtkVersion);
}

async function init(): Promise<void> {
  // Check Git installation
  const gitInstalled = await checkGitInstalled();
  if (!gitInstalled) {
    console.warn('Git is not installed. Some features may not work.');
  }

  // Register IPC handlers
  registerIpcHandlers();
}

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.ensoai.app');

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await init();

  setCurrentLocale(readStoredLanguage());

  mainWindow = createMainWindow();

  // IMPORTANT: Set up did-finish-load handler BEFORE handling command line args
  // to avoid race condition where page loads before handler is registered
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingOpenPath) {
      mainWindow?.webContents.send(IPC_CHANNELS.APP_OPEN_PATH, pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  // Initialize auto-updater
  autoUpdaterService.init(mainWindow);

  const handleNewWindow = () => {
    createMainWindow();
  };

  // Build and set application menu
  const menu = buildAppMenu(mainWindow, {
    onNewWindow: handleNewWindow,
  });
  Menu.setApplicationMenu(menu);

  // Handle initial command line args (this may set pendingOpenPath)
  handleCommandLineArgs(process.argv);

  ipcMain.handle(IPC_CHANNELS.APP_SET_LANGUAGE, (_event, language: Locale) => {
    setCurrentLocale(language);
    if (!mainWindow) return;
    const updatedMenu = buildAppMenu(mainWindow, { onNewWindow: handleNewWindow });
    Menu.setApplicationMenu(updatedMenu);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Cleanup all resources before quitting
  await cleanupAllResources();
  app.quit();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
