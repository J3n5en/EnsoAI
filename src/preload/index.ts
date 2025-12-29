import { Buffer } from 'node:buffer';
import type { Locale } from '@shared/i18n';
import type {
  AgentCliInfo,
  AgentCliStatus,
  AgentMetadata,
  CommitFileChange,
  ConflictResolution,
  ContentSearchParams,
  ContentSearchResult,
  CustomAgent,
  DetectedApp,
  FileChange,
  FileChangeEvent,
  FileDiff,
  FileEntry,
  FileSearchParams,
  FileSearchResult,
  GitBranch,
  GitLogEntry,
  GitStatus,
  GitWorktree,
  MergeConflict,
  MergeConflictContent,
  MergeState,
  ShellConfig,
  ShellInfo,
  TerminalCreateOptions,
  TerminalResizeOptions,
  WorktreeCreateOptions,
  WorktreeMergeCleanupOptions,
  WorktreeMergeOptions,
  WorktreeMergeResult,
  WorktreeRemoveOptions,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { contextBridge, ipcRenderer, shell } from 'electron';
import pkg from '../../package.json';

const electronAPI = {
  // Git
  git: {
    getStatus: (workdir: string): Promise<GitStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS, workdir),
    getLog: (workdir: string, maxCount?: number, skip?: number): Promise<GitLogEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, workdir, maxCount, skip),
    getBranches: (workdir: string): Promise<GitBranch[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_LIST, workdir),
    createBranch: (workdir: string, name: string, startPoint?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_CREATE, workdir, name, startPoint),
    checkout: (workdir: string, branch: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_CHECKOUT, workdir, branch),
    commit: (workdir: string, message: string, files?: string[]): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, workdir, message, files),
    push: (workdir: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, workdir, remote, branch),
    pull: (workdir: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, workdir, remote, branch),
    getDiff: (workdir: string, options?: { staged?: boolean }): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF, workdir, options),
    init: (workdir: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.GIT_INIT, workdir),
    getFileChanges: (workdir: string): Promise<FileChange[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_CHANGES, workdir),
    getFileDiff: (workdir: string, filePath: string, staged: boolean): Promise<FileDiff> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_DIFF, workdir, filePath, staged),
    stage: (workdir: string, paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE, workdir, paths),
    unstage: (workdir: string, paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE, workdir, paths),
    discard: (workdir: string, filePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DISCARD, workdir, filePath),
    showCommit: (workdir: string, hash: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_SHOW, workdir, hash),
    getCommitFiles: (workdir: string, hash: string): Promise<CommitFileChange[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_FILES, workdir, hash),
    getCommitDiff: (
      workdir: string,
      hash: string,
      filePath: string,
      status?: import('@shared/types').FileChangeStatus
    ): Promise<FileDiff> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_DIFF, workdir, hash, filePath, status),
    getDiffStats: (workdir: string): Promise<{ insertions: number; deletions: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF_STATS, workdir),
    generateCommitMessage: (
      workdir: string,
      options: { maxDiffLines: number; timeout: number; model: string }
    ): Promise<{ success: boolean; message?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG, workdir, options),
    startCodeReview: (
      workdir: string,
      options: { model: string; reviewId: string }
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CODE_REVIEW_START, workdir, options),
    stopCodeReview: (reviewId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CODE_REVIEW_STOP, reviewId),
    onCodeReviewData: (
      callback: (event: {
        reviewId: string;
        type: 'data' | 'error' | 'exit';
        data?: string;
        exitCode?: number;
      }) => void
    ): (() => void) => {
      const handler = (
        _: unknown,
        event: {
          reviewId: string;
          type: 'data' | 'error' | 'exit';
          data?: string;
          exitCode?: number;
        }
      ) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, handler);
    },
  },

  // Worktree
  worktree: {
    list: (workdir: string): Promise<GitWorktree[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_LIST, workdir),
    add: (workdir: string, options: WorktreeCreateOptions): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_ADD, workdir, options),
    remove: (workdir: string, options: WorktreeRemoveOptions): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_REMOVE, workdir, options),
    activate: (worktreePaths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_ACTIVATE, worktreePaths),
    // Merge operations
    merge: (workdir: string, options: WorktreeMergeOptions): Promise<WorktreeMergeResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_MERGE, workdir, options),
    getMergeState: (workdir: string): Promise<MergeState> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_MERGE_STATE, workdir),
    getConflicts: (workdir: string): Promise<MergeConflict[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_MERGE_CONFLICTS, workdir),
    getConflictContent: (workdir: string, filePath: string): Promise<MergeConflictContent> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_MERGE_CONFLICT_CONTENT, workdir, filePath),
    resolveConflict: (workdir: string, resolution: ConflictResolution): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_MERGE_RESOLVE, workdir, resolution),
    abortMerge: (workdir: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_MERGE_ABORT, workdir),
    continueMerge: (
      workdir: string,
      message?: string,
      cleanupOptions?: WorktreeMergeCleanupOptions
    ): Promise<WorktreeMergeResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_MERGE_CONTINUE, workdir, message, cleanupOptions),
  },

  // Files
  file: {
    read: (filePath: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),
    write: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, filePath, content),
    createFile: (
      filePath: string,
      content = '',
      options?: { overwrite?: boolean }
    ): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.FILE_CREATE, filePath, content, options),
    createDirectory: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_CREATE_DIR, dirPath),
    rename: (fromPath: string, toPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_RENAME, fromPath, toPath),
    move: (fromPath: string, toPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_MOVE, fromPath, toPath),
    delete: (targetPath: string, options?: { recursive?: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, targetPath, options),
    list: (dirPath: string, gitRoot?: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST, dirPath, gitRoot),
    watchStart: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_WATCH_START, dirPath),
    watchStop: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_WATCH_STOP, dirPath),
    onChange: (callback: (event: FileChangeEvent) => void): (() => void) => {
      const handler = (_: unknown, event: FileChangeEvent) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.FILE_CHANGE, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.FILE_CHANGE, handler);
    },
  },

  // Terminal
  terminal: {
    create: (options?: TerminalCreateOptions): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, options),
    write: (id: string, data: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_WRITE, id, data),
    resize: (id: string, size: TerminalResizeOptions): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESIZE, id, size),
    destroy: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_DESTROY, id),
    onData: (callback: (event: { id: string; data: string }) => void): (() => void) => {
      const handler = (_: unknown, event: { id: string; data: string }) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.TERMINAL_DATA, handler);
    },
    onExit: (
      callback: (event: { id: string; exitCode: number; signal?: number }) => void
    ): (() => void) => {
      const handler = (_: unknown, event: { id: string; exitCode: number; signal?: number }) =>
        callback(event);
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.TERMINAL_EXIT, handler);
    },
  },

  // Agent
  agent: {
    list: (): Promise<AgentMetadata[]> => ipcRenderer.invoke(IPC_CHANNELS.AGENT_LIST),
  },

  // App
  app: {
    getPath: (name: string): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PATH, name),
    onUpdateAvailable: (callback: (info: unknown) => void): (() => void) => {
      const handler = (_: unknown, info: unknown) => callback(info);
      ipcRenderer.on(IPC_CHANNELS.APP_UPDATE_AVAILABLE, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.APP_UPDATE_AVAILABLE, handler);
    },
    onCloseRequest: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.APP_CLOSE_REQUEST, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.APP_CLOSE_REQUEST, handler);
    },
    confirmClose: (confirmed: boolean): void => {
      ipcRenderer.send(IPC_CHANNELS.APP_CLOSE_CONFIRM, confirmed);
    },
    onOpenPath: (callback: (path: string) => void): (() => void) => {
      const handler = (_: unknown, path: string) => callback(path);
      ipcRenderer.on(IPC_CHANNELS.APP_OPEN_PATH, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.APP_OPEN_PATH, handler);
    },
    setLanguage: (language: Locale): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_LANGUAGE, language),
  },

  // Dialog
  dialog: {
    openDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY),
    openFile: (options?: {
      filters?: Array<{ name: string; extensions: string[] }>;
    }): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, options),
  },

  // Context Menu
  contextMenu: {
    show: (
      items: Array<{
        label: string;
        id: string;
        type?: 'normal' | 'separator';
        disabled?: boolean;
      }>
    ): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_MENU_SHOW, items),
  },

  // App Detector
  appDetector: {
    detectApps: (): Promise<DetectedApp[]> => ipcRenderer.invoke(IPC_CHANNELS.APP_DETECT),
    openWith: (
      path: string,
      bundleId: string,
      options?: {
        line?: number;
        workspacePath?: string;
        openFiles?: string[];
        activeFile?: string;
      }
    ): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_WITH, path, bundleId, options),
    getIcon: (bundleId: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_ICON, bundleId),
  },

  // CLI Detector
  cli: {
    detect: (
      customAgents?: CustomAgent[],
      options?: { includeWsl?: boolean; forceRefresh?: boolean; shellConfig?: ShellConfig }
    ): Promise<AgentCliStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLI_DETECT, customAgents, options),
    detectOne: (
      agentId: string,
      customAgent?: CustomAgent,
      options?: { shellConfig?: ShellConfig }
    ): Promise<AgentCliInfo> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLI_DETECT_ONE, agentId, customAgent, options),
    // CLI Installer
    getInstallStatus: (): Promise<{ installed: boolean; path: string | null; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLI_INSTALL_STATUS),
    install: (): Promise<{ installed: boolean; path: string | null; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLI_INSTALL),
    uninstall: (): Promise<{ installed: boolean; path: string | null; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLI_UNINSTALL),
  },

  // Settings
  settings: {
    read: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_READ),
    write: (data: unknown): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_WRITE, data),
  },

  // Environment
  env: {
    HOME: process.env.HOME || process.env.USERPROFILE || '',
    platform: process.platform as 'darwin' | 'win32' | 'linux',
    appVersion: pkg.version,
  },

  // Shell
  shell: {
    detect: (): Promise<ShellInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.SHELL_DETECT),
    resolveForCommand: (config: ShellConfig): Promise<{ shell: string; execArgs: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_RESOLVE_FOR_COMMAND, config),
    openExternal: (url: string): Promise<void> => shell.openExternal(url),
  },

  // Menu actions from main process
  menu: {
    onAction: (callback: (action: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
      ipcRenderer.on('menu-action', handler);
      return () => ipcRenderer.removeListener('menu-action', handler);
    },
  },

  // Notification
  notification: {
    show: (options: {
      title: string;
      body?: string;
      silent?: boolean;
      sessionId?: string;
    }): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SHOW, options),
    onClick: (callback: (sessionId: string) => void): (() => void) => {
      const handler = (_: unknown, sessionId: string) => callback(sessionId);
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_CLICK, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.NOTIFICATION_CLICK, handler);
    },
  },

  // Updater
  updater: {
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL),
    setAllowPrerelease: (allow: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATER_SET_ALLOW_PRERELEASE, allow),
    onStatus: (
      callback: (status: {
        status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
        info?: unknown;
        progress?: { percent: number; bytesPerSecond: number; total: number; transferred: number };
        error?: string;
      }) => void
    ): (() => void) => {
      const handler = (
        _: unknown,
        status: {
          status:
            | 'checking'
            | 'available'
            | 'not-available'
            | 'downloading'
            | 'downloaded'
            | 'error';
          info?: unknown;
          progress?: {
            percent: number;
            bytesPerSecond: number;
            total: number;
            transferred: number;
          };
          error?: string;
        }
      ) => callback(status);
      ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.UPDATER_STATUS, handler);
    },
  },

  // MCP (Claude IDE Bridge)
  mcp: {
    setEnabled: (enabled: boolean, workspaceFolders?: string[]): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_BRIDGE_SET_ENABLED, enabled, workspaceFolders),
    getStatus: (): Promise<{ enabled: boolean; port: number | null }> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_BRIDGE_GET_STATUS),
    sendSelectionChanged: (params: {
      text: string;
      filePath: string;
      fileUrl: string;
      selection: {
        start: { line: number; character: number };
        end: { line: number; character: number };
        isEmpty: boolean;
      };
    }): void => {
      ipcRenderer.send(IPC_CHANNELS.MCP_SELECTION_CHANGED, params);
    },
    sendAtMentioned: (params: { filePath: string; lineStart: number; lineEnd: number }): void => {
      ipcRenderer.send(IPC_CHANNELS.MCP_AT_MENTIONED, params);
    },
  },

  // Search
  search: {
    files: (params: FileSearchParams): Promise<FileSearchResult[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SEARCH_FILES, params),
    content: (params: ContentSearchParams): Promise<ContentSearchResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.SEARCH_CONTENT, params),
    checkRipgrep: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_CHECK_RG),
  },

  // Hapi Remote Sharing
  hapi: {
    checkGlobal: (
      forceRefresh?: boolean,
      shellConfig?: ShellConfig
    ): Promise<{ installed: boolean; version?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HAPI_CHECK_GLOBAL, forceRefresh, shellConfig),
    start: (config: {
      webappPort: number;
      cliApiToken: string;
      telegramBotToken: string;
      webappUrl: string;
      allowedChatIds: string;
    }): Promise<{
      running: boolean;
      ready?: boolean;
      pid?: number;
      port?: number;
      error?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.HAPI_START, config),
    stop: (): Promise<{ running: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HAPI_STOP),
    restart: (config: {
      webappPort: number;
      cliApiToken: string;
      telegramBotToken: string;
      webappUrl: string;
      allowedChatIds: string;
    }): Promise<{
      running: boolean;
      ready?: boolean;
      pid?: number;
      port?: number;
      error?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.HAPI_RESTART, config),
    getStatus: (): Promise<{
      running: boolean;
      ready?: boolean;
      pid?: number;
      port?: number;
      error?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.HAPI_GET_STATUS),
    onStatusChanged: (
      callback: (status: {
        running: boolean;
        ready?: boolean;
        pid?: number;
        port?: number;
        error?: string;
      }) => void
    ): (() => void) => {
      const handler = (
        _: unknown,
        status: { running: boolean; ready?: boolean; pid?: number; port?: number; error?: string }
      ) => callback(status);
      ipcRenderer.on(IPC_CHANNELS.HAPI_STATUS_CHANGED, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.HAPI_STATUS_CHANGED, handler);
    },
  },

  // Happy
  happy: {
    checkGlobal: (
      forceRefresh?: boolean,
      shellConfig?: ShellConfig
    ): Promise<{ installed: boolean; version?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HAPPY_CHECK_GLOBAL, forceRefresh, shellConfig),
  },

  // Cloudflared Tunnel
  cloudflared: {
    check: (): Promise<{ installed: boolean; version?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUDFLARED_CHECK),
    install: (): Promise<{ installed: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUDFLARED_INSTALL),
    start: (config: {
      mode: 'quick' | 'auth';
      port: number;
      token?: string;
    }): Promise<{
      installed: boolean;
      version?: string;
      running: boolean;
      url?: string;
      error?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.CLOUDFLARED_START, config),
    stop: (): Promise<{
      installed: boolean;
      version?: string;
      running: boolean;
      error?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.CLOUDFLARED_STOP),
    getStatus: (): Promise<{
      installed: boolean;
      version?: string;
      running: boolean;
      url?: string;
      error?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.CLOUDFLARED_GET_STATUS),
    onStatusChanged: (
      callback: (status: {
        installed: boolean;
        version?: string;
        running: boolean;
        url?: string;
        error?: string;
      }) => void
    ): (() => void) => {
      const handler = (
        _: unknown,
        status: {
          installed: boolean;
          version?: string;
          running: boolean;
          url?: string;
          error?: string;
        }
      ) => callback(status);
      ipcRenderer.on(IPC_CHANNELS.CLOUDFLARED_STATUS_CHANGED, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.CLOUDFLARED_STATUS_CHANGED, handler);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('Buffer', Buffer);

export type ElectronAPI = typeof electronAPI;
