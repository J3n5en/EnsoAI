export const IPC_CHANNELS = {
  // Git
  GIT_STATUS: 'git:status',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_FETCH: 'git:fetch',
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
  GIT_DIFF_STATS: 'git:diff:stats',
  GIT_GENERATE_COMMIT_MSG: 'git:generate-commit-msg',
  GIT_GENERATE_BRANCH_NAME: 'git:generate-branch-name',
  GIT_CODE_REVIEW_START: 'git:code-review:start',
  GIT_CODE_REVIEW_STOP: 'git:code-review:stop',
  GIT_CODE_REVIEW_DATA: 'git:code-review:data',
  GIT_GH_STATUS: 'git:gh:status',
  GIT_PR_LIST: 'git:pr:list',
  GIT_PR_FETCH: 'git:pr:fetch',
  // Git Clone
  GIT_CLONE: 'git:clone',
  GIT_CLONE_PROGRESS: 'git:clone:progress',
  GIT_VALIDATE_URL: 'git:validate-url',
  // Git Auto Fetch
  GIT_AUTO_FETCH_SET_ENABLED: 'git:autoFetch:setEnabled',
  GIT_AUTO_FETCH_COMPLETED: 'git:autoFetch:completed',

  // Git Submodule
  GIT_SUBMODULE_LIST: 'git:submodule:list',
  GIT_SUBMODULE_INIT: 'git:submodule:init',
  GIT_SUBMODULE_UPDATE: 'git:submodule:update',
  GIT_SUBMODULE_SYNC: 'git:submodule:sync',
  GIT_SUBMODULE_FETCH: 'git:submodule:fetch',
  GIT_SUBMODULE_PULL: 'git:submodule:pull',
  GIT_SUBMODULE_PUSH: 'git:submodule:push',
  GIT_SUBMODULE_COMMIT: 'git:submodule:commit',
  GIT_SUBMODULE_STAGE: 'git:submodule:stage',
  GIT_SUBMODULE_UNSTAGE: 'git:submodule:unstage',
  GIT_SUBMODULE_DISCARD: 'git:submodule:discard',
  GIT_SUBMODULE_CHANGES: 'git:submodule:changes',
  GIT_SUBMODULE_FILE_DIFF: 'git:submodule:file-diff',
  GIT_SUBMODULE_BRANCHES: 'git:submodule:branches',
  GIT_SUBMODULE_CHECKOUT: 'git:submodule:checkout',

  // Worktree
  WORKTREE_LIST: 'worktree:list',
  WORKTREE_ADD: 'worktree:add',
  WORKTREE_REMOVE: 'worktree:remove',
  WORKTREE_ACTIVATE: 'worktree:activate',
  WORKTREE_MERGE: 'worktree:merge',
  WORKTREE_MERGE_STATE: 'worktree:merge:state',
  WORKTREE_MERGE_CONFLICTS: 'worktree:merge:conflicts',
  WORKTREE_MERGE_CONFLICT_CONTENT: 'worktree:merge:conflictContent',
  WORKTREE_MERGE_RESOLVE: 'worktree:merge:resolve',
  WORKTREE_MERGE_ABORT: 'worktree:merge:abort',
  WORKTREE_MERGE_CONTINUE: 'worktree:merge:continue',

  // Temporary Workspace
  TEMP_WORKSPACE_CREATE: 'temp:workspace:create',
  TEMP_WORKSPACE_REMOVE: 'temp:workspace:remove',
  TEMP_WORKSPACE_CHECK_PATH: 'temp:workspace:checkPath',

  // Files
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_SAVE_TO_TEMP: 'file:save-to-temp',
  FILE_CREATE: 'file:create',
  FILE_CREATE_DIR: 'file:createDir',
  FILE_RENAME: 'file:rename',
  FILE_MOVE: 'file:move',
  FILE_COPY: 'file:copy',
  FILE_BATCH_MOVE: 'file:batchMove',
  FILE_BATCH_COPY: 'file:batchCopy',
  FILE_CHECK_CONFLICTS: 'file:checkConflicts',
  FILE_DELETE: 'file:delete',
  FILE_LIST: 'file:list',
  FILE_EXISTS: 'file:exists',
  FILE_REVEAL_IN_FILE_MANAGER: 'file:revealInFileManager',
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
  TERMINAL_GET_ACTIVITY: 'terminal:getActivity',

  // Agent
  AGENT_LIST: 'agent:list',
  AGENT_STOP_NOTIFICATION: 'agent:stop:notification',
  AGENT_ASK_USER_QUESTION_NOTIFICATION: 'agent:askUserQuestion:notification',
  AGENT_PRE_TOOL_USE_NOTIFICATION: 'agent:preToolUse:notification',
  AGENT_STATUS_UPDATE: 'agent:status:update',

  // App
  APP_GET_PATH: 'app:getPath',
  APP_UPDATE_AVAILABLE: 'app:updateAvailable',
  APP_CLOSE_REQUEST: 'app:closeRequest',
  APP_CLOSE_CONFIRM: 'app:closeConfirm',
  APP_CLOSE_RESPONSE: 'app:closeResponse',
  APP_CLOSE_SAVE_REQUEST: 'app:closeSaveRequest',
  APP_CLOSE_SAVE_RESPONSE: 'app:closeSaveResponse',
  APP_OPEN_PATH: 'app:openPath',
  APP_SET_LANGUAGE: 'app:setLanguage',
  APP_SET_PROXY: 'app:setProxy',
  APP_TEST_PROXY: 'app:testProxy',

  // Window Controls (for frameless window)
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximizedChanged',
  WINDOW_OPEN_DEVTOOLS: 'window:openDevTools',
  WINDOW_DEVTOOLS_STATE_CHANGED: 'window:devtools:stateChanged',
  WINDOW_SET_TRAFFIC_LIGHTS_VISIBLE: 'window:setTrafficLightsVisible',
  WINDOW_IS_FULLSCREEN: 'window:isFullScreen',
  WINDOW_FULLSCREEN_CHANGED: 'window:fullScreenChanged',

  // Dialog
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  DIALOG_OPEN_FILE: 'dialog:openFile',

  // Context Menu
  CONTEXT_MENU_SHOW: 'contextMenu:show',

  // App Detector
  APP_DETECT: 'app:detect',
  APP_OPEN_WITH: 'app:openWith',
  APP_GET_ICON: 'app:getIcon',
  APP_RECENT_PROJECTS: 'app:recentProjects',

  // Git Validate Local Path
  GIT_VALIDATE_LOCAL_PATH: 'git:validate-local-path',

  // CLI Detector
  CLI_DETECT: 'cli:detect',
  CLI_DETECT_ONE: 'cli:detectOne',

  // Tmux
  TMUX_CHECK: 'tmux:check',
  TMUX_KILL_SESSION: 'tmux:killSession',

  // CLI Installer
  CLI_INSTALL_STATUS: 'cli:install:status',
  CLI_INSTALL: 'cli:install',
  CLI_UNINSTALL: 'cli:uninstall',

  // Shell Detector
  SHELL_DETECT: 'shell:detect',
  SHELL_RESOLVE_FOR_COMMAND: 'shell:resolveForCommand',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',

  // Notification
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_CLICK: 'notification:click',

  // Updater
  UPDATER_CHECK: 'updater:check',
  UPDATER_QUIT_AND_INSTALL: 'updater:quitAndInstall',
  UPDATER_STATUS: 'updater:status',
  UPDATER_SET_AUTO_UPDATE_ENABLED: 'updater:setAutoUpdateEnabled',
  UPDATER_DOWNLOAD_UPDATE: 'updater:downloadUpdate',

  // MCP (Claude IDE Bridge)
  MCP_BRIDGE_SET_ENABLED: 'mcp:bridge:setEnabled',
  MCP_BRIDGE_GET_STATUS: 'mcp:bridge:getStatus',
  MCP_SELECTION_CHANGED: 'mcp:selection:changed',
  MCP_AT_MENTIONED: 'mcp:at:mentioned',
  MCP_STOP_HOOK_SET: 'mcp:stopHook:set',
  MCP_STATUSLINE_HOOK_SET: 'mcp:statusLineHook:set',
  MCP_STATUSLINE_HOOK_STATUS: 'mcp:statusLineHook:status',
  MCP_PERMISSION_REQUEST_HOOK_SET: 'mcp:permissionRequestHook:set',
  MCP_PERMISSION_REQUEST_HOOK_STATUS: 'mcp:permissionRequestHook:status',

  // Claude Provider
  CLAUDE_PROVIDER_READ_SETTINGS: 'claude:provider:readSettings',
  CLAUDE_PROVIDER_APPLY: 'claude:provider:apply',
  CLAUDE_PROVIDER_SETTINGS_CHANGED: 'claude:provider:settingsChanged',

  // Claude MCP Management
  CLAUDE_MCP_READ: 'claude:mcp:read',
  CLAUDE_MCP_SYNC: 'claude:mcp:sync',
  CLAUDE_MCP_UPSERT: 'claude:mcp:upsert',
  CLAUDE_MCP_DELETE: 'claude:mcp:delete',

  // Claude Prompts Management
  CLAUDE_PROMPTS_READ: 'claude:prompts:read',
  CLAUDE_PROMPTS_WRITE: 'claude:prompts:write',
  CLAUDE_PROMPTS_BACKUP: 'claude:prompts:backup',

  // Claude Plugins Management
  CLAUDE_PLUGINS_LIST: 'claude:plugins:list',
  CLAUDE_PLUGINS_SET_ENABLED: 'claude:plugins:setEnabled',
  CLAUDE_PLUGINS_AVAILABLE: 'claude:plugins:available',
  CLAUDE_PLUGINS_INSTALL: 'claude:plugins:install',
  CLAUDE_PLUGINS_UNINSTALL: 'claude:plugins:uninstall',
  CLAUDE_PLUGINS_MARKETPLACES_LIST: 'claude:plugins:marketplaces:list',
  CLAUDE_PLUGINS_MARKETPLACES_ADD: 'claude:plugins:marketplaces:add',
  CLAUDE_PLUGINS_MARKETPLACES_REMOVE: 'claude:plugins:marketplaces:remove',
  CLAUDE_PLUGINS_MARKETPLACES_REFRESH: 'claude:plugins:marketplaces:refresh',

  // Search
  SEARCH_FILES: 'search:files',
  SEARCH_CONTENT: 'search:content',

  // Hapi Remote Sharing
  HAPI_CHECK_GLOBAL: 'hapi:checkGlobal',
  HAPPY_CHECK_GLOBAL: 'happy:checkGlobal',
  HAPI_START: 'hapi:start',
  HAPI_STOP: 'hapi:stop',
  HAPI_RESTART: 'hapi:restart',
  HAPI_GET_STATUS: 'hapi:getStatus',
  HAPI_STATUS_CHANGED: 'hapi:statusChanged',

  // Hapi Runner
  HAPI_RUNNER_START: 'hapiRunner:start',
  HAPI_RUNNER_STOP: 'hapiRunner:stop',
  HAPI_RUNNER_GET_STATUS: 'hapiRunner:getStatus',
  HAPI_RUNNER_STATUS_CHANGED: 'hapiRunner:statusChanged',

  // Cloudflared Tunnel
  CLOUDFLARED_CHECK: 'cloudflared:check',
  CLOUDFLARED_INSTALL: 'cloudflared:install',
  CLOUDFLARED_START: 'cloudflared:start',
  CLOUDFLARED_STOP: 'cloudflared:stop',
  CLOUDFLARED_GET_STATUS: 'cloudflared:getStatus',
  CLOUDFLARED_STATUS_CHANGED: 'cloudflared:statusChanged',

  // Logging
  LOG_UPDATE_CONFIG: 'log:update-config',
  LOG_OPEN_FOLDER: 'log:open-folder',
  LOG_GET_PATH: 'log:get-path',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
