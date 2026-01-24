import { translate } from '@shared/i18n';
import { app, type BrowserWindow, globalShortcut, Menu, shell } from 'electron';
import { getCurrentLocale } from './i18n';

export type MenuAction = 'open-settings' | 'toggle-devtools' | 'open-action-panel';

interface MenuOptions {
  onNewWindow?: () => void;
}

export function buildAppMenu(mainWindow: BrowserWindow, options: MenuOptions = {}): Menu {
  const isMac = process.platform === 'darwin';
  const locale = getCurrentLocale();
  const t = (key: string) => translate(locale, key);

  const sendAction = (action: MenuAction) => {
    mainWindow.webContents.send('menu-action', action);
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: t('Settings...'),
                accelerator: 'CommandOrControl+,',
                click: () => sendAction('open-settings'),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    // File menu
    {
      label: t('File'),
      submenu: [
        {
          label: t('New Window'),
          accelerator: 'CommandOrControl+N',
          click: () => options.onNewWindow?.(),
        },
        { type: 'separator' as const },
        ...(!isMac
          ? [
              {
                label: t('Settings...'),
                accelerator: 'CommandOrControl+,',
                click: () => sendAction('open-settings'),
              },
              { type: 'separator' as const },
            ]
          : []),
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }]),
      ],
    },

    // Edit menu
    {
      label: t('Edit'),
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },

    // View menu
    {
      label: t('View'),
      submenu: [
        {
          label: t('Action Panel'),
          accelerator: 'CommandOrControl+Shift+P',
          click: () => sendAction('open-action-panel'),
        },
        { type: 'separator' as const },
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        {
          label: t('Developer Tools'),
          accelerator: 'CommandOrControl+Option+I',
          click: () => mainWindow.webContents.toggleDevTools(),
        },
        { type: 'separator' as const },
        {
          label: t('Reset Zoom'),
          accelerator: 'CommandOrControl+0',
          click: () => {
            console.log('[DEBUG] Reset Zoom clicked/triggered');
            mainWindow.webContents.setZoomLevel(0);
          },
        },
        {
          label: t('Zoom In'),
          accelerator: 'CommandOrControl+=',
          click: () => {
            console.log('[DEBUG] Zoom In clicked/triggered');
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom + 0.5);
          },
        },
        {
          label: t('Zoom Out'),
          accelerator: isMac ? 'Command+Minus' : 'Control+Minus',
          click: () => {
            console.log('[DEBUG] Zoom Out clicked/triggered');
            const currentZoom = mainWindow.webContents.getZoomLevel();
            console.log('[DEBUG] Current zoom level:', currentZoom);
            mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
            console.log('[DEBUG] New zoom level set to:', currentZoom - 0.5);
          },
        },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },

    // Window menu
    {
      label: t('Window'),
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },

    // Help menu
    {
      label: t('Help'),
      submenu: [
        {
          label: t('Learn More'),
          click: () => shell.openExternal('https://github.com/J3n5en/EnsoAI'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);

  // Register global shortcut for Zoom Out to bypass renderer process interception
  // Unregister first to avoid conflicts
  globalShortcut.unregister('CommandOrControl+-');
  globalShortcut.register('CommandOrControl+-', () => {
    console.log('[DEBUG] Global shortcut Zoom Out triggered');
    const currentZoom = mainWindow.webContents.getZoomLevel();
    console.log('[DEBUG] Current zoom level:', currentZoom);
    mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
    console.log('[DEBUG] New zoom level set to:', currentZoom - 0.5);
  });

  return menu;
}
