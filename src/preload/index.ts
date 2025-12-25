import type {
  AgentCliInfo,
  AgentCliStatus,
  AgentMetadata,
  CommitFileChange,
  CustomAgent,
  DetectedApp,
  FileChange,
  FileChangeEvent,
  FileDiff,
  FileEntry,
  GitBranch,
  GitLogEntry,
  GitStatus,
  GitWorktree,
  ShellInfo,
  TerminalCreateOptions,
  TerminalResizeOptions,
  WorktreeCreateOptions,
  WorktreeRemoveOptions,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { contextBridge, ipcRenderer, shell } from 'electron';

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
  },

  // Worktree
  worktree: {
    list: (workdir: string): Promise<GitWorktree[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_LIST, workdir),
    add: (workdir: string, options: WorktreeCreateOptions): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_ADD, workdir, options),
    remove: (workdir: string, options: WorktreeRemoveOptions): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKTREE_REMOVE, workdir, options),
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
    list: (dirPath: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST, dirPath),
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
    start: (agentId: string, workdir: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_START, agentId, workdir),
    stop: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_STOP, sessionId),
    send: (sessionId: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_SEND, sessionId, content),
    onMessage: (callback: (message: unknown) => void): (() => void) => {
      const handler = (_: unknown, message: unknown) => callback(message);
      ipcRenderer.on(IPC_CHANNELS.AGENT_MESSAGE, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.AGENT_MESSAGE, handler);
    },
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
    openWith: (path: string, bundleId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_WITH, path, bundleId),
    getIcon: (bundleId: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_ICON, bundleId),
  },

  // CLI Detector
  cli: {
    detect: (
      customAgents?: CustomAgent[],
      options?: { includeWsl?: boolean }
    ): Promise<AgentCliStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLI_DETECT, customAgents, options),
    detectOne: (agentId: string, customAgent?: CustomAgent): Promise<AgentCliInfo> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLI_DETECT_ONE, agentId, customAgent),
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
  },

  // Shell
  shell: {
    detect: (): Promise<ShellInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.SHELL_DETECT),
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
    show: (options: { title: string; body?: string; silent?: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SHOW, options),
  },

  // Updater
  updater: {
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL),
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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
