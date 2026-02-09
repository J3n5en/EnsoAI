import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { type Locale, normalizeLocale } from '@shared/i18n';
import { IPC_CHANNELS } from '@shared/types';
import { app, BrowserWindow, ipcMain, Menu, net, protocol } from 'electron';

// Register custom protocol privileges
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

// Fix environment for packaged app (macOS GUI apps don't inherit shell env)
if (process.platform === 'darwin') {
  const { shellEnvSync } = await import('shell-env');
  try {
    Object.assign(process.env, shellEnvSync());
  } catch {
    // Ignore errors - will use default env
  }
}

import {
  autoStartHapi,
  cleanupAllResources,
  cleanupAllResourcesSync,
  registerIpcHandlers,
} from './ipc';
import { initClaudeProviderWatcher } from './ipc/claudeProvider';
import { registerWindowHandlers } from './ipc/window';
import { registerClaudeBridgeIpcHandlers } from './services/claude/ClaudeIdeBridge';
import { unwatchClaudeSettings } from './services/claude/ClaudeProviderManager';
import { isAllowedLocalFilePath } from './services/files/LocalFileAccess';
import { checkGitInstalled } from './services/git/checkGit';
import { gitAutoFetchService } from './services/git/GitAutoFetchService';
import { setCurrentLocale } from './services/i18n';
import { buildAppMenu } from './services/MenuBuilder';
import { webInspectorServer } from './services/webInspector';
import { createMainWindow } from './windows/MainWindow';

let mainWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;
let cleanupWindowHandlers: (() => void) | null = null;

const isDev = !app.isPackaged;

function sanitizeProfileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

// In dev mode, use an isolated userData dir to avoid clashing with the packaged app.
// This prevents Chromium/Electron profile locking from causing an "empty" localStorage in later instances.
if (isDev) {
  const profile = sanitizeProfileName(process.env.ENSOAI_PROFILE || '') || 'dev';
  app.setPath('userData', join(app.getPath('appData'), `${app.getName()}-${profile}`));
}

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

// Handle second instance (single-instance per userData profile).
// In dev mode, set `ENSOAI_PROFILE` to run multiple isolated instances.
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

async function initAutoUpdater(window: BrowserWindow): Promise<void> {
  // Linux deb/rpm: avoid loading electron-updater (it can trigger GTK crashes on some systems).
  // AppImage uses APPIMAGE env var, where auto-update is expected to work.
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return;
  }

  const { readSettings } = await import('./ipc/settings');
  const settings = readSettings();
  const ensoSettings = settings?.['enso-settings'] as
    | { state?: { autoUpdateEnabled?: boolean } }
    | undefined;
  const autoUpdateEnabled = ensoSettings?.state?.autoUpdateEnabled ?? true;

  const { autoUpdaterService } = await import('./services/updater/AutoUpdater');
  autoUpdaterService.init(window, autoUpdateEnabled);
}

async function init(): Promise<void> {
  // Check Git installation
  const gitInstalled = await checkGitInstalled();
  if (!gitInstalled) {
    console.warn('Git is not installed. Some features may not work.');
  }

  // Register IPC handlers
  registerIpcHandlers();

  // Register Claude IDE Bridge IPC handlers (bridge starts when enabled in settings)
  registerClaudeBridgeIpcHandlers();
}

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.ensoai.app');

  // Register protocol to handle local file:// URLs for markdown images
  protocol.handle('local-file', (request) => {
    try {
      const fileUrl = new URL(request.url.replace(/^local-file:/, 'file:'));
      const filePath = fileURLToPath(fileUrl);

      if (!isAllowedLocalFilePath(filePath)) {
        return new Response('Forbidden', { status: 403 });
      }

      return net.fetch(fileUrl.toString());
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });

  // Register protocol to handle local background images (no root check, but extension check)
  protocol.handle('local-image', async (request) => {
    try {
      const urlObj = new URL(request.url);

      // Remote image proxy: local-image://remote-fetch?url=<encoded-remote-url>
      // Uses net.fetch() from the main process to bypass renderer CORS/redirect issues
      // Use raw URL string check as primary detection (custom protocol hostname parsing can be unreliable)
      const isRemoteFetch =
        request.url.startsWith('local-image://remote-fetch') ||
        urlObj.hostname === 'remote-fetch';

      if (isRemoteFetch) {
        // Extract remote URL: try searchParams first, then manual regex as fallback
        let fetchUrl = urlObj.searchParams.get('url');
        if (!fetchUrl) {
          const match = request.url.match(/[?&]url=([^&]+)/);
          fetchUrl = match ? decodeURIComponent(match[1]) : null;
        }
        if (!fetchUrl) {
          console.error('[local-image] Remote fetch: missing url parameter');
          return new Response('Missing url parameter', { status: 400 });
        }

        // Do NOT forward _t cache-busting param to the remote server —
        // some APIs reject unknown query params (400). The _t on the
        // local-image:// URL is enough for renderer-side cache invalidation.
        console.log('[local-image] Proxying remote image:', fetchUrl);

        try {
          const response = await net.fetch(fetchUrl, { redirect: 'follow' });

          if (!response.ok) {
            console.error(`[local-image] Remote fetch failed: HTTP ${response.status} for ${fetchUrl}`);
            return new Response(`Remote fetch failed: ${response.status}`, { status: response.status });
          }

          const contentType = response.headers.get('content-type') || 'image/jpeg';
          console.log(`[local-image] Remote image OK: ${fetchUrl} (${contentType})`);

          return new Response(response.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache',
            },
          });
        } catch (fetchErr) {
          console.error('[local-image] Remote fetch error:', fetchUrl, fetchErr);
          return new Response('Remote fetch error', { status: 502 });
        }
      }

      // Manual path parsing to handle Windows drive letters robustly
      // Standard fileURLToPath can be flaky with custom protocols if hostname is interpreted as drive letter
      let filePath = '';

      if (urlObj.hostname && /^[a-zA-Z]$/.test(urlObj.hostname) && process.platform === 'win32') {
        // Case: local-image://c/Users/... (hostname='c')
        filePath = `${urlObj.hostname}:${decodeURIComponent(urlObj.pathname)}`;
      } else {
        // Case: local-image:///C:/Users/... (pathname='/C:/Users/...')
        let pathname = decodeURIComponent(urlObj.pathname);
        if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(pathname)) {
          pathname = pathname.slice(1);
        }
        filePath = pathname;
      }
      
      // Normalize slashes for Windows
      if (process.platform === 'win32') {
        filePath = filePath.replace(/\//g, '\\');
      }

      console.log(`[local-image] Request URL: ${request.url}`);
      console.log(`[local-image] Parsed Path: ${filePath}`);

      // Security check: only allow image/video extensions
      const ext = extname(filePath).toLowerCase();
      const allowedExts = [
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg',
        '.mp4', '.webm', '.ogg', '.mov',
        '',
      ];
      
      if (!allowedExts.includes(ext) && ext !== '') {
        console.warn(`[local-image] Blocked extension: ${ext} for path: ${filePath}`);
        return new Response('Forbidden', { status: 403 });
      }

      // Reject directory paths (e.g. folder source type before random file is resolved)
      try {
        if (statSync(filePath).isDirectory()) {
          return new Response('Not a file', { status: 400 });
        }
      } catch {
        // stat failed → file doesn't exist, will be caught below
      }

      // Video files: stream with Range request support for <video> element
      const videoExts = new Set(['.mp4', '.webm', '.ogg', '.mov']);
      const videoMimeTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.mov': 'video/quicktime',
      };
      if (videoExts.has(ext)) {
        try {
          const fileStat = statSync(filePath);
          const fileSize = fileStat.size;
          const mimeType = videoMimeTypes[ext] || 'application/octet-stream';
          const rangeHeader = request.headers.get('Range');

          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (match) {
              const start = parseInt(match[1], 10);
              const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
              const chunkSize = end - start + 1;

              const fsStream = createReadStream(filePath, { start, end });
              let closed = false;
              const readable = new ReadableStream({
                start(controller) {
                  fsStream.on('data', (chunk: Buffer) => {
                    if (!closed) {
                      try { controller.enqueue(chunk); } catch { closed = true; }
                    }
                  });
                  fsStream.on('end', () => {
                    if (!closed) {
                      closed = true;
                      try { controller.close(); } catch { /* already closed */ }
                    }
                  });
                  fsStream.on('error', (err) => {
                    if (!closed) {
                      closed = true;
                      try { controller.error(err); } catch { /* already closed */ }
                    }
                  });
                },
                cancel() {
                  closed = true;
                  fsStream.destroy();
                },
              });

              return new Response(readable as unknown as BodyInit, {
                status: 206,
                headers: {
                  'Content-Type': mimeType,
                  'Content-Length': String(chunkSize),
                  'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                  'Accept-Ranges': 'bytes',
                  'Access-Control-Allow-Origin': '*',
                },
              });
            }
          }

          // No Range header: serve full file
          const buffer = readFileSync(filePath);
          return new Response(buffer, {
            headers: {
              'Content-Type': mimeType,
              'Content-Length': String(fileSize),
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (e) {
          console.error(`[local-image] Video serve error for ${filePath}:`, e);
          return new Response('Not Found', { status: 404 });
        }
      }

      // Image files: use readFileSync (simpler, avoids net.fetch quirks with images)
      try {
        const buffer = readFileSync(filePath);
        
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.bmp': 'image/bmp',
          '.svg': 'image/svg+xml',
        };
        
        return new Response(buffer, {
          headers: {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        console.error(`[local-image] Read error for ${filePath}:`, e);
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('[local-image] Error handling request:', request.url, error);
      return new Response('Bad Request', { status: 400 });
    }
  });

  // Default open or close DevTools by F12 in development
  // Also intercept Cmd+- for all windows to bypass Monaco Editor interception
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);

    // Intercept Cmd+- before renderer process to bypass Monaco Editor interception
    window.webContents.on('before-input-event', (event, input) => {
      const isMac = process.platform === 'darwin';
      const modKey = isMac ? input.meta : input.control;
      if (modKey && input.key === '-') {
        event.preventDefault();
        const currentZoom = window.webContents.getZoomLevel();
        window.webContents.setZoomLevel(currentZoom - 0.5);
      }
    });
  });

  await init();

  // Auto-start Hapi server if enabled in settings
  await autoStartHapi();

  setCurrentLocale(readStoredLanguage());

  mainWindow = createMainWindow();

  // Set main window for Web Inspector server (for IPC communication)
  webInspectorServer.setMainWindow(mainWindow);

  // Register window control handlers (must be after mainWindow is created)
  cleanupWindowHandlers = registerWindowHandlers(mainWindow);

  // Clean up window handlers when window is closed
  mainWindow.on('closed', () => {
    if (cleanupWindowHandlers) {
      cleanupWindowHandlers();
      cleanupWindowHandlers = null;
    }
    webInspectorServer.setMainWindow(null);
    mainWindow = null;
  });
  // Initialize Claude Provider Watcher
  initClaudeProviderWatcher(mainWindow);

  // IMPORTANT: Set up did-finish-load handler BEFORE handling command line args
  // to avoid race condition where page loads before handler is registered
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingOpenPath) {
      mainWindow?.webContents.send(IPC_CHANNELS.APP_OPEN_PATH, pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  // Initialize auto-updater
  await initAutoUpdater(mainWindow);

  // Initialize git auto-fetch service
  gitAutoFetchService.init(mainWindow);

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
    const updatedMenu = buildAppMenu(mainWindow, {
      onNewWindow: handleNewWindow,
    });
    Menu.setApplicationMenu(updatedMenu);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// Cleanup before app quits (covers all quit methods: Cmd+Q, window close, etc.)
app.on('will-quit', (event) => {
  event.preventDefault();
  console.log('[app] Will quit, cleaning up...');
  unwatchClaudeSettings();
  gitAutoFetchService.cleanup();
  cleanupAllResources()
    .catch((err) => console.error('[app] Cleanup error:', err))
    .finally(() => {
      // Remove the listener to allow quit after cleanup
      app.removeAllListeners('will-quit');
      app.quit();
    });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

// Handle SIGINT (Ctrl+C) and SIGTERM
// In dev mode, electron-vite may exit before we finish cleanup.
// Use synchronous cleanup + immediate app.exit() to ensure clean shutdown.
function handleShutdownSignal(signal: string): void {
  console.log(`[app] Received ${signal}, exiting...`);
  // Sync cleanup: kill child processes immediately
  unwatchClaudeSettings();
  gitAutoFetchService.cleanup();
  cleanupAllResourcesSync();
  // Use app.exit() to bypass will-quit handler (already cleaned up)
  app.exit(0);
}

process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
process.on('SIGHUP', () => handleShutdownSignal('SIGHUP'));
