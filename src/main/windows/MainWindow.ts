import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { IPC_CHANNELS } from '@shared/types';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { autoUpdaterService } from '../services/updater/AutoUpdater';

/** Default macOS traffic lights position (matches BrowserWindow trafficLightPosition) */
const TRAFFIC_LIGHTS_DEFAULT_POSITION = { x: 16, y: 16 };

/**
 * Offset when DevTools is docked left — keeps buttons visible to the right of the panel.
 *
 * Assumes left-docked DevTools with a default width of ~240px. Electron does not
 * expose an API to query DevTools dock direction or panel width, so this is a
 * best-effort heuristic. If the user resizes or re-docks DevTools, the position
 * may not be perfectly aligned.
 */
const TRAFFIC_LIGHTS_DEVTOOLS_POSITION = { x: 240, y: 16 };

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1400,
  height: 900,
};

function getStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const statePath = getStatePath();
    if (existsSync(statePath)) {
      const data = readFileSync(statePath, 'utf-8');
      return { ...DEFAULT_STATE, ...JSON.parse(data) };
    }
  } catch {}
  return DEFAULT_STATE;
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: win.isMaximized(),
    };
    writeFileSync(getStatePath(), JSON.stringify(state));
  } catch {}
}

export function createMainWindow(): BrowserWindow {
  const state = loadWindowState();

  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 685,
    minHeight: 600,
    // macOS: hiddenInset 保留 traffic lights 按钮
    // Windows/Linux: hidden 隐藏标题栏，使用自定义 WindowTitleBar
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // macOS 需要 frame 来显示 traffic lights；Windows/Linux 使用无边框窗口
    frame: isMac,
    ...(isMac && { trafficLightPosition: TRAFFIC_LIGHTS_DEFAULT_POSITION }),
    // Windows 启用 thickFrame 以支持窗口边缘拖拽调整大小
    ...(isWindows && { thickFrame: true }),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });

  // Enable native context menu for editable fields (input/textarea/contenteditable)
  // so EnhancedInput and other text fields support Cut/Copy/Paste/SelectAll.
  win.webContents.on('context-menu', (event, params) => {
    if (!params.isEditable) return;
    event.preventDefault();

    const template: Electron.MenuItemConstructorOptions[] = [
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ];

    Menu.buildFromTemplate(template).popup({
      window: win,
      x: params.x,
      y: params.y,
    });
  });

  // Restore maximized state
  if (state.isMaximized) {
    win.maximize();
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  // DevTools state management for traffic lights adjustment.
  // When DevTools is docked on the left, move traffic lights to the right
  // so they are not obscured by the DevTools panel.
  if (isMac) {
    win.webContents.on('devtools-opened', () => {
      win.setWindowButtonPosition(TRAFFIC_LIGHTS_DEVTOOLS_POSITION);
      win.webContents.send(IPC_CHANNELS.WINDOW_DEVTOOLS_STATE_CHANGED, true);
    });

    win.webContents.on('devtools-closed', () => {
      win.setWindowButtonPosition(TRAFFIC_LIGHTS_DEFAULT_POSITION);
      win.webContents.send(IPC_CHANNELS.WINDOW_DEVTOOLS_STATE_CHANGED, false);
    });
  }

  // Confirm before close (skip in dev mode)
  let forceClose = false;

  // Listen for close confirmation from renderer
  ipcMain.on(IPC_CHANNELS.APP_CLOSE_CONFIRM, (event, confirmed: boolean) => {
    if (event.sender === win.webContents && confirmed) {
      forceClose = true;
      // Hide window first to avoid black screen during cleanup
      win.hide();
      win.close();
    }
  });

  win.on('close', (e) => {
    // Skip confirmation if force close, or quitting for update
    if (forceClose || autoUpdaterService.isQuittingForUpdate()) {
      saveWindowState(win);
      return;
    }

    e.preventDefault();

    const requestId = randomUUID();

    const waitFor = <T>(
      channel: string,
      predicate: (event: Electron.IpcMainEvent, ...args: any[]) => T | null
    ) =>
      new Promise<T | null>((resolve) => {
        const timeout = setTimeout(() => {
          ipcMain.removeListener(channel, handler);
          resolve(null);
        }, 2000);

        const handler = (event: Electron.IpcMainEvent, ...args: any[]) => {
          const match = predicate(event, ...args);
          if (match === null) return;
          clearTimeout(timeout);
          ipcMain.removeListener(channel, handler);
          resolve(match);
        };

        ipcMain.on(channel, handler);
      });

    const runCloseFlow = async () => {
      win.webContents.send(IPC_CHANNELS.APP_CLOSE_REQUEST, requestId);

      const response = await waitFor<{ dirtyPaths: string[] }>(
        IPC_CHANNELS.APP_CLOSE_RESPONSE,
        (event, respRequestId: string, payload: { dirtyPaths: string[] }) => {
          if (event.sender !== win.webContents) return null;
          if (respRequestId !== requestId) return null;
          return payload;
        }
      );

      // If renderer doesn't respond, fall back to a simple confirm dialog to avoid blocking close.
      if (!response) {
        const { response: buttonIndex } = await dialog.showMessageBox(win, {
          type: 'question',
          buttons: ['Exit', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          message: 'Are you sure you want to exit the app?',
        });
        if (buttonIndex !== 0) return;
        forceClose = true;
        win.hide();
        win.close();
        return;
      }

      const dirtyPaths = response.dirtyPaths ?? [];
      if (dirtyPaths.length === 0) {
        forceClose = true;
        win.hide();
        win.close();
        return;
      }

      for (const filePath of dirtyPaths) {
        const fileName = filePath.split(/[/\\\\]/).pop() || filePath;
        const { response: buttonIndex } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Save', "Don't Save", 'Cancel'],
          defaultId: 0,
          cancelId: 2,
          message: `Do you want to save the changes you made to ${fileName}?`,
          detail: "Your changes will be lost if you don't save them.",
        });

        if (buttonIndex === 2) {
          return;
        }

        if (buttonIndex === 0) {
          const saveRequestId = `${requestId}:${filePath}`;
          win.webContents.send(IPC_CHANNELS.APP_CLOSE_SAVE_REQUEST, saveRequestId, filePath);

          const saveResult = await waitFor<{ ok: boolean; error?: string }>(
            IPC_CHANNELS.APP_CLOSE_SAVE_RESPONSE,
            (event, respSaveRequestId: string, payload: { ok: boolean; error?: string }) => {
              if (event.sender !== win.webContents) return null;
              if (respSaveRequestId !== saveRequestId) return null;
              return payload;
            }
          );

          if (!saveResult?.ok) {
            await dialog.showMessageBox(win, {
              type: 'error',
              buttons: ['OK'],
              defaultId: 0,
              message: 'Save failed',
              detail: saveResult?.error || 'Unknown error',
            });
            return;
          }
        }
      }

      forceClose = true;
      win.hide();
      win.close();
    };

    void runCloseFlow();
  });

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Load renderer
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
