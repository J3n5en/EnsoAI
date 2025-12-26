import { translate } from '@shared/i18n';
import { IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, dialog, ipcMain, Menu, MenuItem } from 'electron';
import { getCurrentLocale } from '../services/i18n';

interface ContextMenuItem {
  label: string;
  id: string;
  type?: 'normal' | 'separator';
  disabled?: boolean;
}

export function registerDialogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, async () => {
    const window = BrowserWindow.getFocusedWindow();
    const t = (key: string) => translate(getCurrentLocale(), key);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openDirectory', 'createDirectory'],
      title: t('Select folder'),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_OPEN_FILE,
    async (_, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
      const window = BrowserWindow.getFocusedWindow();
      const t = (key: string) => translate(getCurrentLocale(), key);
      const result = await dialog.showOpenDialog(window!, {
        properties: ['openFile'],
        title: t('Select file'),
        filters: options?.filters,
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  );

  // Context Menu
  ipcMain.handle(IPC_CHANNELS.CONTEXT_MENU_SHOW, async (event, items: ContextMenuItem[]) => {
    return new Promise<string | null>((resolve) => {
      const menu = new Menu();

      for (const item of items) {
        if (item.type === 'separator') {
          menu.append(new MenuItem({ type: 'separator' }));
        } else {
          menu.append(
            new MenuItem({
              label: item.label,
              enabled: !item.disabled,
              click: () => resolve(item.id),
            })
          );
        }
      }

      menu.popup({
        window: BrowserWindow.fromWebContents(event.sender) ?? undefined,
        callback: () => resolve(null),
      });
    });
  });
}
