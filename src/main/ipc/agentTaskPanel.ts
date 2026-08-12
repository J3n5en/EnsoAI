import { IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import {
  getAgentTaskPanelWindow,
  hideAgentTaskPanelWindow,
  isAgentTaskPanelVisible,
  resetAgentTaskPanelBounds,
  setMainWindowRef,
  showAgentTaskPanelWindow,
} from '../windows/AgentTaskPanelWindow';

// Current main window, resolved dynamically so IPC handlers never pin a
// destroyed BrowserWindow (and keep working after a new window is created).
let currentMainWindow: BrowserWindow | null = null;

export function setAgentTaskPanelMainWindow(window: BrowserWindow): void {
  currentMainWindow = window;
  setMainWindowRef(window);
  window.once('closed', () => {
    if (currentMainWindow === window) {
      currentMainWindow = null;
    }
  });
}

function getMainWindow(): BrowserWindow | null {
  if (currentMainWindow && !currentMainWindow.isDestroyed()) {
    return currentMainWindow;
  }
  return null;
}

export function registerAgentTaskPanelHandlers(mainWindow: BrowserWindow): void {
  setAgentTaskPanelMainWindow(mainWindow);
  // Toggle panel visibility
  ipcMain.handle(IPC_CHANNELS.AGENT_TASK_PANEL_TOGGLE, () => {
    if (isAgentTaskPanelVisible()) {
      hideAgentTaskPanelWindow();
    } else {
      showAgentTaskPanelWindow();
    }
    const visible = isAgentTaskPanelVisible();
    // Notify main window of visibility change
    getMainWindow()?.webContents.send(IPC_CHANNELS.AGENT_TASK_PANEL_VISIBILITY_CHANGED, visible);
    return visible;
  });

  // Navigate to session in main window
  ipcMain.on(
    IPC_CHANNELS.AGENT_TASK_NAVIGATE_TO_SESSION,
    (_event, params: { sessionId: string; repoPath: string; cwd: string }) => {
      const window = getMainWindow();
      if (window) {
        // Restore main window if minimized
        if (window.isMinimized()) {
          window.restore();
        }
        window.focus();
        window.webContents.send(IPC_CHANNELS.AGENT_TASK_NAVIGATE_TO_SESSION, params);
      }
    }
  );

  // Get snapshot from main window and forward to task panel
  ipcMain.handle(IPC_CHANNELS.AGENT_TASK_GET_SNAPSHOT, () => {
    const window = getMainWindow();
    if (!window) return null;
    // Request snapshot from main window renderer
    window.webContents.send(IPC_CHANNELS.AGENT_TASK_GET_SNAPSHOT);
    return true;
  });

  // Reset panel bounds
  ipcMain.handle(IPC_CHANNELS.AGENT_TASK_PANEL_RESET_BOUNDS, () => {
    resetAgentTaskPanelBounds();
  });

  // When main window sends snapshot response, forward to task panel
  ipcMain.on(
    IPC_CHANNELS.AGENT_TASK_SNAPSHOT_RESPONSE,
    (_event, snapshot: Record<string, unknown>) => {
      const panelWindow = getAgentTaskPanelWindow();
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send(IPC_CHANNELS.AGENT_TASK_SNAPSHOT_RESPONSE, snapshot);
      }
    }
  );

  // Forward task sync from main window to task panel
  ipcMain.on(IPC_CHANNELS.AGENT_TASK_SYNC, (_event, tasks: Record<string, unknown>) => {
    const panelWindow = getAgentTaskPanelWindow();
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send(IPC_CHANNELS.AGENT_TASK_SYNC, tasks);
    }
  });
}
