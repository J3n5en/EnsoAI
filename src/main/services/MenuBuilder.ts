import { type BrowserWindow, Menu, app, shell } from 'electron';

export type MenuAction = 'open-settings' | 'close-window' | 'toggle-devtools';

export function buildAppMenu(mainWindow: BrowserWindow): Menu {
  const isMac = process.platform === 'darwin';

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
                label: '设置...',
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
      label: '文件',
      submenu: [
        ...(!isMac
          ? [
              {
                label: '设置...',
                accelerator: 'CommandOrControl+,',
                click: () => sendAction('open-settings'),
              },
              { type: 'separator' as const },
            ]
          : []),
        {
          label: '关闭窗口',
          accelerator: 'CommandOrControl+W',
          click: () => sendAction('close-window'),
        },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }]),
      ],
    },

    // Edit menu
    {
      label: '编辑',
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
      label: '视图',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        {
          label: '开发者工具',
          accelerator: 'CommandOrControl+Option+I',
          click: () => mainWindow.webContents.toggleDevTools(),
        },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },

    // Window menu
    {
      label: '窗口',
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
      label: '帮助',
      submenu: [
        {
          label: '了解更多',
          click: () => shell.openExternal('https://github.com/anthropics/claude-code'),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
