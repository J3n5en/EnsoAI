import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { IPC_CHANNELS } from '@shared/types';
import { app, BrowserWindow } from 'electron';

let agentTaskPanelWindow: BrowserWindow | null = null;
let mainWindowRef: BrowserWindow | null = null;

const BOUNDS_FILE = join(app.getPath('userData'), 'agent-task-panel-bounds.json');

const DEFAULT_BOUNDS = {
  width: 500,
  height: 800,
  minWidth: 320,
  minHeight: 400,
};

function loadBounds(): Partial<Electron.Rectangle> {
  try {
    const fs = require('node:fs');
    if (fs.existsSync(BOUNDS_FILE)) {
      return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function saveBounds(bounds: Partial<Electron.Rectangle>): void {
  try {
    const fs = require('node:fs');
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(bounds));
  } catch {
    // ignore
  }
}

export function createAgentTaskPanelWindow(): BrowserWindow {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    return agentTaskPanelWindow;
  }

  const savedBounds = loadBounds();

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds.width || DEFAULT_BOUNDS.width,
    height: savedBounds.height || DEFAULT_BOUNDS.height,
    minWidth: DEFAULT_BOUNDS.minWidth,
    minHeight: DEFAULT_BOUNDS.minHeight,
    x: savedBounds.x,
    y: savedBounds.y,
    show: false,
    title: 'Agent Tasks',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.frame = true;
  } else {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.frame = false;
  }

  agentTaskPanelWindow = new BrowserWindow(windowOptions);

  // Hide on close instead of destroying, and notify main window
  agentTaskPanelWindow.on('close', (e) => {
    e.preventDefault();
    agentTaskPanelWindow!.hide();
    // Notify main window that panel is no longer visible
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send(IPC_CHANNELS.AGENT_TASK_PANEL_VISIBILITY_CHANGED, false);
    }
  });

  // Persist bounds on move/resize
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedSaveBounds = (): void => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
        saveBounds(agentTaskPanelWindow.getBounds());
      }
    }, 500);
  };

  agentTaskPanelWindow.on('resize', debouncedSaveBounds);
  agentTaskPanelWindow.on('move', debouncedSaveBounds);

  // Load the agent task panel entry
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    url.pathname = '/agent-task-panel.html';
    agentTaskPanelWindow.loadURL(url.toString());
  } else {
    agentTaskPanelWindow.loadFile(join(__dirname, '../renderer/agent-task-panel.html'));
  }

  return agentTaskPanelWindow;
}

export function showAgentTaskPanelWindow(): BrowserWindow {
  const win = createAgentTaskPanelWindow();
  win.show();
  win.focus();
  return win;
}

export function hideAgentTaskPanelWindow(): void {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    agentTaskPanelWindow.hide();
  }
}

export function destroyAgentTaskPanelWindow(): void {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    agentTaskPanelWindow.removeAllListeners('close');
    agentTaskPanelWindow.close();
  }
  agentTaskPanelWindow = null;
}

export function getAgentTaskPanelWindow(): BrowserWindow | null {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    return agentTaskPanelWindow;
  }
  return null;
}

export function isAgentTaskPanelVisible(): boolean {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    return agentTaskPanelWindow.isVisible();
  }
  return false;
}

export function resetAgentTaskPanelBounds(): void {
  if (agentTaskPanelWindow && !agentTaskPanelWindow.isDestroyed()) {
    agentTaskPanelWindow.setSize(DEFAULT_BOUNDS.width, DEFAULT_BOUNDS.height);
    agentTaskPanelWindow.center();
  }
}

export function setMainWindowRef(ref: BrowserWindow): void {
  mainWindowRef = ref;
}
