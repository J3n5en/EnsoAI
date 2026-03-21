import { IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';

function getTargetWindow(sender: Electron.WebContents): BrowserWindow {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) {
    throw new Error('Window is not available');
  }
  return window;
}

export function registerWindowHandlers(): () => void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    getTargetWindow(event.sender).minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, (event) => {
    const window = getTargetWindow(event.sender);
    if (window.isMaximized()) {
      window.restore();
    } else {
      window.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    getTargetWindow(event.sender).close();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, (event) => {
    return getTargetWindow(event.sender).isMaximized();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_DEVTOOLS, (event) => {
    getTargetWindow(event.sender).webContents.openDevTools();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS_VISIBLE, (event, visible: unknown) => {
    if (typeof visible !== 'boolean' || process.platform !== 'darwin') {
      return;
    }
    getTargetWindow(event.sender).setWindowButtonVisibility(visible);
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_FULLSCREEN, (event) => {
    return getTargetWindow(event.sender).isFullScreen();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_REPOSITORY_RUNTIME_CONTEXT, (_, repoPath?: string) => {
    return resolveRepositoryRuntimeContext(repoPath);
  });

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_MINIMIZE);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_MAXIMIZE);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_CLOSE);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_IS_MAXIMIZED);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_OPEN_DEVTOOLS);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS_VISIBLE);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_IS_FULLSCREEN);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_GET_REPOSITORY_RUNTIME_CONTEXT);
  };
}
