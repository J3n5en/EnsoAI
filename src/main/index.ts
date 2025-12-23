import { electronApp, optimizer } from '@electron-toolkit/utils';
import { BrowserWindow, Menu, app } from 'electron';
import { registerIpcHandlers } from './ipc';
import { buildAppMenu } from './services/MenuBuilder';
import { checkGitInstalled } from './services/git/checkGit';
import { createMainWindow } from './windows/MainWindow';

let mainWindow: BrowserWindow | null = null;

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
  electronApp.setAppUserModelId('com.aizen.app');

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await init();

  mainWindow = createMainWindow();

  // Build and set application menu
  const menu = buildAppMenu(mainWindow);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
