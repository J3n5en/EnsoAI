import { ipcMain } from 'electron';
import { webInspectorServer } from '../services/webInspector';

export function registerWebInspectorHandlers() {
  ipcMain.handle('web-inspector:start', async () => {
    return webInspectorServer.start();
  });

  ipcMain.handle('web-inspector:stop', async () => {
    await webInspectorServer.stop();
  });

  ipcMain.handle('web-inspector:status', () => {
    return webInspectorServer.getStatus();
  });
}
