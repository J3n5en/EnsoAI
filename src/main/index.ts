import { electronApp, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, Menu } from 'electron';
import { cleanupAllResources, registerIpcHandlers } from './ipc';
import { checkGitInstalled } from './services/git/checkGit';
import { buildAppMenu } from './services/MenuBuilder';
import { autoUpdaterService } from './services/updater/AutoUpdater';
import { createMainWindow } from './windows/MainWindow';

let mainWindow: BrowserWindow | null = null;

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

  mainWindow = createMainWindow();

  // Initialize auto-updater
  autoUpdaterService.init(mainWindow);

  // Build and set application menu
  const menu = buildAppMenu(mainWindow, {
    onNewWindow: () => {
      createMainWindow();
    },
  });
  Menu.setApplicationMenu(menu);

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
