import { IPC_CHANNELS } from '@shared/types';
import { type BrowserWindow, ipcMain } from 'electron';

export function registerWindowHandlers(mainWindow: BrowserWindow): () => void {
  /**
   * 安全地执行窗口操作，检查窗口是否已销毁
   * 防止在窗口关闭过程中的竞态条件导致异常
   */
  const safeWindowOperation = <T>(operation: () => T): T | undefined => {
    if (mainWindow.isDestroyed()) {
      return undefined;
    }
    return operation();
  };

  // Minimize window
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    safeWindowOperation(() => mainWindow.minimize());
  });

  // Maximize/restore window
  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    safeWindowOperation(() => {
      if (mainWindow.isMaximized()) {
        mainWindow.restore();
      } else {
        mainWindow.maximize();
      }
    });
  });

  // Close window
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    safeWindowOperation(() => mainWindow.close());
  });

  // Check if maximized
  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    return safeWindowOperation(() => mainWindow.isMaximized()) ?? false;
  });

  // Open DevTools
  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_DEVTOOLS, () => {
    safeWindowOperation(() => mainWindow.webContents.openDevTools());
  });

  // macOS: show/hide traffic lights (window control buttons)
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS_VISIBLE, (_event, visible: unknown) => {
    if (typeof visible !== 'boolean') return;
    return safeWindowOperation(() => {
      if (process.platform === 'darwin') {
        mainWindow.setWindowButtonVisibility(visible);
      }
    });
  });

  // Check if fullscreen
  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_FULLSCREEN, () => {
    return safeWindowOperation(() => mainWindow.isFullScreen()) ?? false;
  });

  // Maximize/unmaximize event handlers
  const handleMaximize = () => {
    safeWindowOperation(() => {
      mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, true);
    });
  };

  const handleUnmaximize = () => {
    safeWindowOperation(() => {
      mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, false);
    });
  };

  // Fullscreen event handlers
  const handleEnterFullScreen = () => {
    safeWindowOperation(() => {
      mainWindow.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, true);
    });
  };

  const handleLeaveFullScreen = () => {
    safeWindowOperation(() => {
      mainWindow.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, false);
    });
  };

  // Listen for maximize/unmaximize events and notify renderer
  mainWindow.on('maximize', handleMaximize);
  mainWindow.on('unmaximize', handleUnmaximize);

  // Listen for fullscreen events and notify renderer
  mainWindow.on('enter-full-screen', handleEnterFullScreen);
  mainWindow.on('leave-full-screen', handleLeaveFullScreen);

  // Return cleanup function to remove handlers when window is closed
  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_MINIMIZE);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_MAXIMIZE);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_CLOSE);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_IS_MAXIMIZED);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_OPEN_DEVTOOLS);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS_VISIBLE);
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_IS_FULLSCREEN);
    // 只有在窗口未销毁时才移除事件监听器
    if (!mainWindow.isDestroyed()) {
      mainWindow.off('maximize', handleMaximize);
      mainWindow.off('unmaximize', handleUnmaximize);
      mainWindow.off('enter-full-screen', handleEnterFullScreen);
      mainWindow.off('leave-full-screen', handleLeaveFullScreen);
    }
  };
}
