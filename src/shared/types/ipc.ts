export const IPC_CHANNELS = {
  // Git
  GIT_STATUS: 'git:status',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_BRANCH_LIST: 'git:branch:list',
  GIT_BRANCH_CREATE: 'git:branch:create',
  GIT_BRANCH_CHECKOUT: 'git:branch:checkout',
  GIT_LOG: 'git:log',
  GIT_DIFF: 'git:diff',
  GIT_INIT: 'git:init',
  GIT_FILE_CHANGES: 'git:file-changes',
  GIT_FILE_DIFF: 'git:file-diff',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_DISCARD: 'git:discard',
  GIT_COMMIT_SHOW: 'git:commit:show',
  GIT_COMMIT_FILES: 'git:commit:files',
  GIT_COMMIT_DIFF: 'git:commit:diff',

  // Worktree
  WORKTREE_LIST: 'worktree:list',
  WORKTREE_ADD: 'worktree:add',
  WORKTREE_REMOVE: 'worktree:remove',

  // Files
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_CREATE: 'file:create',
  FILE_CREATE_DIR: 'file:createDir',
  FILE_RENAME: 'file:rename',
  FILE_MOVE: 'file:move',
  FILE_DELETE: 'file:delete',
  FILE_LIST: 'file:list',
  FILE_WATCH_START: 'file:watch:start',
  FILE_WATCH_STOP: 'file:watch:stop',
  FILE_CHANGE: 'file:change',

  // Terminal
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',

  // Agent
  AGENT_LIST: 'agent:list',
  AGENT_START: 'agent:start',
  AGENT_STOP: 'agent:stop',
  AGENT_SEND: 'agent:send',
  AGENT_MESSAGE: 'agent:message',

  // App
  APP_GET_PATH: 'app:getPath',
  APP_UPDATE_AVAILABLE: 'app:updateAvailable',
  APP_CLOSE_REQUEST: 'app:closeRequest',
  APP_CLOSE_CONFIRM: 'app:closeConfirm',

  // Dialog
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  DIALOG_OPEN_FILE: 'dialog:openFile',

  // Context Menu
  CONTEXT_MENU_SHOW: 'contextMenu:show',

  // App Detector
  APP_DETECT: 'app:detect',
  APP_OPEN_WITH: 'app:openWith',
  APP_GET_ICON: 'app:getIcon',

  // CLI Detector
  CLI_DETECT: 'cli:detect',
  CLI_DETECT_ONE: 'cli:detectOne',

  // Shell Detector
  SHELL_DETECT: 'shell:detect',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',

  // Notification
  NOTIFICATION_SHOW: 'notification:show',

  // Updater
  UPDATER_CHECK: 'updater:check',
  UPDATER_QUIT_AND_INSTALL: 'updater:quitAndInstall',
  UPDATER_STATUS: 'updater:status',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
