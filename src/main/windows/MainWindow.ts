import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { translate } from '@shared/i18n';
import type { AppCloseRequestPayload, AppCloseRequestReason } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { getCurrentLocale } from '../services/i18n';
import { sessionManager } from '../services/session/SessionManager';
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

interface CreateMainWindowOptions {
  initializeWindow?: (window: BrowserWindow) => Promise<void> | void;
  partition?: string;
  replaceWindow?: BrowserWindow | null;
}

interface WindowReplacementController {
  confirmWindowReplace: () => Promise<boolean>;
  forceReplaceClose: () => void;
}

const windowReplacementControllers = new WeakMap<BrowserWindow, WindowReplacementController>();

function t(key: string, params?: Record<string, string | number>): string {
  return translate(getCurrentLocale(), key, params);
}

export async function confirmWindowReplace(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) {
    return false;
  }
  return (await windowReplacementControllers.get(win)?.confirmWindowReplace()) ?? true;
}

export function forceReplaceClose(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }
  windowReplacementControllers.get(win)?.forceReplaceClose() ?? win.close();
}

export function createMainWindow(options: CreateMainWindowOptions = {}): BrowserWindow {
  const replacementState =
    options.replaceWindow && !options.replaceWindow.isDestroyed()
      ? {
          ...options.replaceWindow.getBounds(),
          isMaximized: options.replaceWindow.isMaximized(),
        }
      : null;

  const state = replacementState ?? loadWindowState();

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
      partition: options.partition,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });

  void options.initializeWindow?.(win);

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
    if (options.replaceWindow) {
      forceReplaceClose(options.replaceWindow);
    }
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

  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, true);
    }
  });

  win.on('unmaximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, false);
    }
  });

  win.on('enter-full-screen', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, true);
    }
  });

  win.on('leave-full-screen', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, false);
    }
  });

  // Confirm before close (skip in dev mode)
  let forceClose = false;
  let closeFlowInProgress = false;
  const CLOSE_RESPONSE_IPC_TIMEOUT_MS = 30000;
  const CLOSE_SAVE_IPC_TIMEOUT_MS = 30000;

  const waitForWindowIpc = <T>(
    channel: string,
    predicate: (event: Electron.IpcMainEvent, ...args: any[]) => T | null,
    timeoutMs: number
  ) =>
    new Promise<T | null>((resolve) => {
      const webContents = win.webContents;
      let settled = false;
      let handler: (event: Electron.IpcMainEvent, ...args: any[]) => void;
      let timeout: NodeJS.Timeout | null = null;

      const finalize = (value: T | null) => {
        if (settled) return;
        settled = true;

        if (timeout) {
          clearTimeout(timeout);
        }

        ipcMain.removeListener(channel, handler);
        if (!win.isDestroyed()) {
          win.removeListener('closed', handleWindowGone);
        }
        try {
          webContents.removeListener('destroyed', handleWindowGone);
        } catch {
          // webContents may already be destroyed while close flow is settling.
        }
        resolve(value);
      };

      const handleWindowGone = () => finalize(null);

      handler = (event: Electron.IpcMainEvent, ...args: any[]) => {
        const match = predicate(event, ...args);
        if (match === null) return;
        finalize(match);
      };

      timeout = setTimeout(() => finalize(null), timeoutMs);

      ipcMain.on(channel, handler);
      win.once('closed', handleWindowGone);
      webContents.once('destroyed', handleWindowGone);
    });

  const forceReplaceCloseCurrentWindow = () => {
    if (win.isDestroyed()) {
      return;
    }
    saveWindowState(win);
    forceClose = true;
    win.hide();
    win.close();
  };

  const confirmCloseWithReason = async (reason: AppCloseRequestReason): Promise<boolean> => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      return false;
    }

    if (forceClose || autoUpdaterService.isQuittingForUpdate()) {
      return true;
    }

    if (closeFlowInProgress) {
      return false;
    }

    closeFlowInProgress = true;
    try {
      const requestId = randomUUID();
      const payload: AppCloseRequestPayload = { requestId, reason };
      win.webContents.send(IPC_CHANNELS.APP_CLOSE_REQUEST, payload);

      const response = await waitForWindowIpc<{ confirmed: boolean; dirtyPaths: string[] }>(
        IPC_CHANNELS.APP_CLOSE_RESPONSE,
        (
          event,
          respRequestId: string,
          responsePayload: { confirmed: boolean; dirtyPaths: string[] }
        ) => {
          if (event.sender !== win.webContents) return null;
          if (respRequestId !== requestId) return null;
          return responsePayload;
        },
        CLOSE_RESPONSE_IPC_TIMEOUT_MS
      );

      if (!response?.confirmed) {
        return false;
      }

      const dirtyPaths = response.dirtyPaths ?? [];
      for (const filePath of dirtyPaths) {
        const fileName = filePath.split(/[/\\\\]/).pop() || filePath;
        const { response: buttonIndex } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: [t('Save'), t("Don't Save"), t('Cancel')],
          defaultId: 0,
          cancelId: 2,
          message: t('Do you want to save the changes you made to {{file}}?', {
            file: fileName,
          }),
          detail: t("Your changes will be lost if you don't save them."),
        });

        if (buttonIndex === 2) {
          return false;
        }

        if (buttonIndex === 0) {
          const saveRequestId = `${requestId}:${filePath}`;
          win.webContents.send(IPC_CHANNELS.APP_CLOSE_SAVE_REQUEST, saveRequestId, filePath);

          const saveResult = await waitForWindowIpc<{ ok: boolean; error?: string }>(
            IPC_CHANNELS.APP_CLOSE_SAVE_RESPONSE,
            (
              event,
              respSaveRequestId: string,
              responsePayload: { ok: boolean; error?: string }
            ) => {
              if (event.sender !== win.webContents) return null;
              if (respSaveRequestId !== saveRequestId) return null;
              return responsePayload;
            },
            CLOSE_SAVE_IPC_TIMEOUT_MS
          );

          if (!saveResult?.ok) {
            await dialog.showMessageBox(win, {
              type: 'error',
              buttons: [t('Close')],
              defaultId: 0,
              message: t('Save failed'),
              detail: saveResult?.error || t('Unknown error'),
            });
            return false;
          }
        }
      }

      return true;
    } finally {
      closeFlowInProgress = false;
    }
  };

  windowReplacementControllers.set(win, {
    confirmWindowReplace: () => confirmCloseWithReason('replace-window'),
    forceReplaceClose: forceReplaceCloseCurrentWindow,
  });

  win.on('close', (e) => {
    if (forceClose) {
      return;
    }
    if (autoUpdaterService.isQuittingForUpdate()) {
      saveWindowState(win);
      return;
    }

    e.preventDefault();
    void confirmCloseWithReason('quit-app').then((confirmed) => {
      if (confirmed) {
        forceReplaceCloseCurrentWindow();
      }
    });
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

  win.on('closed', () => {
    void sessionManager.detachWindowSessions(win.id);
  });

  return win;
}
