import type { BrowserWindow } from 'electron';
import { createMainWindow } from './MainWindow';

export function openLocalWindow(options?: { replaceWindow?: BrowserWindow | null }): BrowserWindow {
  return createMainWindow({
    replaceWindow: options?.replaceWindow ?? null,
  });
}
