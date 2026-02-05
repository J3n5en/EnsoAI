import { Buffer } from 'node:buffer';
import type { Locale } from '@shared/i18n';
import type {
  AgentCliInfo,
  AgentMetadata,
  CloneProgress,
  CloneResult,
  CommitFileChange,
  ConflictResolution,
  ContentSearchParams,
  ContentSearchResult,
  CustomAgent,
  DetectedApp,
  FileChange,
  FileChangeEvent,
  FileChangesResult,
  FileDiff,
  FileEntry,
  FileReadResult,
  FileSearchParams,
  FileSearchResult,
  GhCliStatus,
  GitBranch,
  GitLogEntry,
  GitStatus,
  GitSubmodule,
  GitWorktree,
  McpServer,
  McpServerConfig,
  MergeConflict,
  MergeConflictContent,
  MergeState,
  ProxySettings,
  PullRequest,
  RecentEditorProject,
  ShellConfig,
  ShellInfo,
  TempWorkspaceCheckResult,
  TempWorkspaceCreateResult,
  TempWorkspaceRemoveResult,
  TerminalCreateOptions,
  TerminalResizeOptions,
  ValidateLocalPathResult,
  ValidateUrlResult,
  WorktreeCreateOptions,
  WorktreeMergeCleanupOptions,
  WorktreeMergeOptions,
  WorktreeMergeResult,
  WorktreeRemoveOptions,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import type { InspectPayload, WebInspectorStatus } from '@shared/types/webInspector';
import { contextBridge, ipcRenderer, shell, webUtils } from 'electron';
import pkg from '../../package.json';

const electronAPI = {
  // Git
  git: {
    getStatus: (workdir: string): Promise<GitStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS, workdir),
    getLog: (
      workdir: string,
      maxCount?: number,
      skip?: number,
      submodulePath?: string
    ): Promise<GitLogEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, workdir, maxCount, skip, submodulePath),
    getBranches: (workdir: string): Promise<GitBranch[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_LIST, workdir),
    createBranch: (workdir: string, name: string, startPoint?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_CREATE, workdir, name, startPoint),
    checkout: (workdir: string, branch: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_CHECKOUT, workdir, branch),
    commit: (workdir: string, message: string, files?: string[]): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, workdir, message, files),
    push: (
      workdir: string,
      remote?: string,
      branch?: string,
      setUpstream?: boolean
    ): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, workdir, remote, branch, setUpstream),
    pull: (workdir: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, workdir, remote, branch),
    fetch: (workdir: string, remote?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_FETCH, workdir, remote),
    getDiff: (workdir: string, options?: { staged?: boolean }): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF, workdir, options),
    init: (workdir: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.GIT_INIT, workdir),
    getFileChanges: (workdir: string): Promise<FileChangesResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_CHANGES, workdir),
    getFileDiff: (workdir: string, filePath: string, staged: boolean): Promise<FileDiff> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_DIFF, workdir, filePath, staged),
    stage: (workdir: string, paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STAGE, workdir, paths),
    unstage: (workdir: string, paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_UNSTAGE, workdir, paths),
    discard: (workdir: string, paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DISCARD, workdir, paths),
    showCommit: (workdir: string, hash: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_SHOW, workdir, hash),
    getCommitFiles: (
      workdir: string,
      hash: string,
      submodulePath?: string
    ): Promise<CommitFileChange[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_FILES, workdir, hash, submodulePath),
    getCommitDiff: (
      workdir: string,
      hash: string,
      filePath: string,
      status?: import('@shared/types').FileChangeStatus,
      submodulePath?: string
    ): Promise<FileDiff> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.GIT_COMMIT_DIFF,
        workdir,
        hash,
        filePath,
        status,
        submodulePath
      ),
    getDiffStats: (workdir: string): Promise<{ insertions: number; deletions: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF_STATS, workdir),
    generateCommitMessage: (
      workdir: string,
      options: {
        maxDiffLines: number;
        timeout: number;
        provider: string;
        model: string;
        reasoningEffort?: string;
        prompt?: string;
      }
    ): Promise<{ success: boolean; message?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG, workdir, options),
    generateBranchName: (
      workdir: string,
      options: { prompt: string; provider: string; model: string; reasoningEffort?: string }
    ): Promise<{ success: boolean; branchName?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_GENERATE_BRANCH_NAME, workdir, options),
    startCodeReview: (
      workdir: string,
      options: {
        provider: string;
        model: string;
        reasoningEffort?: string;
        reviewId: string;
        language?: string;
        sessionId?: string; // Restore this parameter for "Continue Conversation"
      }
    ): Promise<{ success: boolean; error?: string; sessionId?: string }> =>
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
    // GitHub CLI
    getGhStatus: (workdir: string): Promise<GhCliStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_GH_STATUS, workdir),
    listPullRequests: (workdir: string): Promise<PullRequest[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PR_LIST, workdir),
    fetchPullRequest: (workdir: string, prNumber: number, localBranch: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PR_FETCH, workdir, prNumber, localBranch),
    // Git Clone
    validateUrl: (url: string): Promise<ValidateUrlResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_VALIDATE_URL, url),
    validateLocalPath: (path: string): Promise<ValidateLocalPathResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_VALIDATE_LOCAL_PATH, path),
    clone: (remoteUrl: string, targetPath: string): Promise<CloneResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CLONE, remoteUrl, targetPath),
    onCloneProgress: (callback: (progress: CloneProgress) => void): (() => void) => {
      const handler = (_: unknown, progress: CloneProgress) => callback(progress);
      ipcRenderer.on(IPC_CHANNELS.GIT_CLONE_PROGRESS, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.GIT_CLONE_PROGRESS, handler);
    },
    // Git Auto Fetch
    setAutoFetchEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_AUTO_FETCH_SET_ENABLED, enabled),
    onAutoFetchCompleted: (callback: (data: { timestamp: number }) => void): (() => void) => {
      const handler = (_: unknown, data: { timestamp: number }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.GIT_AUTO_FETCH_COMPLETED, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.GIT_AUTO_FETCH_COMPLETED, handler);
    },
    // Git Submodule
    listSubmodules: (workdir: string): Promise<GitSubmodule[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_LIST, workdir),
    initSubmodules: (workdir: string, recursive?: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_INIT, workdir, recursive),
    updateSubmodules: (workdir: string, recursive?: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_UPDATE, workdir, recursive),
    syncSubmodules: (workdir: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_SYNC, workdir),
    fetchSubmodule: (workdir: string, submodulePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_FETCH, workdir, submodulePath),
    pullSubmodule: (workdir: string, submodulePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_PULL, workdir, submodulePath),
    pushSubmodule: (workdir: string, submodulePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_PUSH, workdir, submodulePath),
    commitSubmodule: (workdir: string, submodulePath: string, message: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_COMMIT, workdir, submodulePath, message),
    stageSubmodule: (workdir: string, submodulePath: string, paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_STAGE, workdir, submodulePath, paths),
    unstageSubmodule: (workdir: string, submodulePath: string, paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_UNSTAGE, workdir, submodulePath, paths),
    discardSubmodule: (workdir: string, submodulePath: string, paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_DISCARD, workdir, submodulePath, paths),
    getSubmoduleChanges: (workdir: string, submodulePath: string): Promise<FileChange[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_CHANGES, workdir, submodulePath),
    getSubmoduleFileDiff: (
      workdir: string,
      submodulePath: string,
      filePath: string,
      staged: boolean
    ): Promise<FileDiff> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.GIT_SUBMODULE_FILE_DIFF,
        workdir,
        submodulePath,
        filePath,
        staged
      ),
    getSubmoduleBranches: (workdir: string, submodulePath: string): Promise<GitBranch[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_BRANCHES, workdir, submodulePath),
    checkoutSubmoduleBranch: (
      workdir: string,
      submodulePath: string,
      branch: string
    ): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SUBMODULE_CHECKOUT, workdir, submodulePath, branch),
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

  // Temporary Workspace
  tempWorkspace: {
    create: (basePath?: string): Promise<TempWorkspaceCreateResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEMP_WORKSPACE_CREATE, basePath),
    remove: (dirPath: string, basePath?: string): Promise<TempWorkspaceRemoveResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEMP_WORKSPACE_REMOVE, dirPath, basePath),
    checkPath: (dirPath: string): Promise<TempWorkspaceCheckResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEMP_WORKSPACE_CHECK_PATH, dirPath),
  },

  // Files
  file: {
    read: (filePath: string): Promise<FileReadResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),
    write: (filePath: string, content: string, encoding?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, filePath, content, encoding),
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
    copy: (sourcePath: string, targetPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_COPY, sourcePath, targetPath),
    checkConflicts: (
      sources: string[],
      targetDir: string
    ): Promise<
      Array<{
        path: string;
        name: string;
        sourceSize: number;
        targetSize: number;
        sourceModified: number;
        targetModified: number;
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.FILE_CHECK_CONFLICTS, sources, targetDir),
    batchCopy: (
      sources: string[],
      targetDir: string,
      conflicts: Array<{ path: string; action: 'replace' | 'skip' | 'rename'; newName?: string }>
    ): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_BATCH_COPY, sources, targetDir, conflicts),
    batchMove: (
      sources: string[],
      targetDir: string,
      conflicts: Array<{ path: string; action: 'replace' | 'skip' | 'rename'; newName?: string }>
    ): Promise<{ success: string[]; failed: Array<{ path: string; error: string }> }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_BATCH_MOVE, sources, targetDir, conflicts),
    delete: (targetPath: string, options?: { recursive?: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, targetPath, options),
    list: (dirPath: string, gitRoot?: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST, dirPath, gitRoot),
    exists: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXISTS, filePath),
    revealInFileManager: (filePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_REVEAL_IN_FILE_MANAGER, filePath),
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
    getActivity: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_GET_ACTIVITY, id),
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
    onCloseRequest: (callback: (requestId: string) => void): (() => void) => {
      const handler = (_: unknown, requestId: string) => callback(requestId);
      ipcRenderer.on(IPC_CHANNELS.APP_CLOSE_REQUEST, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.APP_CLOSE_REQUEST, handler);
    },
    confirmClose: (confirmed: boolean): void => {
      ipcRenderer.send(IPC_CHANNELS.APP_CLOSE_CONFIRM, confirmed);
    },
    respondCloseRequest: (requestId: string, payload: { dirtyPaths: string[] }): void => {
      ipcRenderer.send(IPC_CHANNELS.APP_CLOSE_RESPONSE, requestId, payload);
    },
    onCloseSaveRequest: (
      callback: (requestId: string, path: string) => void | Promise<void>
    ): (() => void) => {
      const handler = (_: unknown, requestId: string, path: string) => callback(requestId, path);
      ipcRenderer.on(IPC_CHANNELS.APP_CLOSE_SAVE_REQUEST, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.APP_CLOSE_SAVE_REQUEST, handler);
    },
    respondCloseSaveRequest: (
      requestId: string,
      payload: { ok: boolean; error?: string }
    ): void => {
      ipcRenderer.send(IPC_CHANNELS.APP_CLOSE_SAVE_RESPONSE, requestId, payload);
    },
    onOpenPath: (callback: (path: string) => void): (() => void) => {
      const handler = (_: unknown, path: string) => callback(path);
      ipcRenderer.on(IPC_CHANNELS.APP_OPEN_PATH, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.APP_OPEN_PATH, handler);
    },
    setLanguage: (language: Locale): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_LANGUAGE, language),
    setProxy: (settings: ProxySettings): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_PROXY, settings),
    testProxy: (
      proxyUrl: string
    ): Promise<{ success: boolean; latency?: number; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_TEST_PROXY, proxyUrl),
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
    getRecentProjects: (): Promise<RecentEditorProject[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_RECENT_PROJECTS),
  },

  // CLI Detector
  cli: {
    detectOne: (
      agentId: string,
      customAgent?: CustomAgent,
      customPath?: string
    ): Promise<AgentCliInfo> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLI_DETECT_ONE, agentId, customAgent, customPath),
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
    openPath: (path: string): Promise<string> => shell.openPath(path),
  },

  // Menu actions from main process
  menu: {
    onAction: (callback: (action: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
      ipcRenderer.on('menu-action', handler);
      return () => ipcRenderer.removeListener('menu-action', handler);
    },
  },

  // Window controls (for frameless window on Windows/Linux)
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
    openDevTools: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_DEVTOOLS),
    onMaximizedChange: (callback: (isMaximized: boolean) => void): (() => void) => {
      const handler = (_: unknown, isMaximized: boolean) => callback(isMaximized);
      ipcRenderer.on(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, handler);
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
    onAgentStop: (callback: (data: { sessionId: string }) => void): (() => void) => {
      const handler = (_: unknown, data: { sessionId: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.AGENT_STOP_NOTIFICATION, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.AGENT_STOP_NOTIFICATION, handler);
    },
    onAskUserQuestion: (
      callback: (data: { sessionId: string; toolInput: unknown }) => void
    ): (() => void) => {
      const handler = (_: unknown, data: { sessionId: string; toolInput: unknown }) =>
        callback(data);
      ipcRenderer.on(IPC_CHANNELS.AGENT_ASK_USER_QUESTION_NOTIFICATION, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.AGENT_ASK_USER_QUESTION_NOTIFICATION, handler);
    },
    onAgentStatusUpdate: (
      callback: (data: {
        sessionId: string;
        model?: { id: string; display_name: string };
        contextWindow?: {
          total_input_tokens: number;
          total_output_tokens: number;
          context_window_size: number;
          current_usage?: {
            input_tokens: number;
            output_tokens: number;
            cache_creation_input_tokens: number;
            cache_read_input_tokens: number;
          };
        };
        cost?: {
          total_cost_usd: number;
          total_duration_ms: number;
          total_api_duration_ms?: number;
          total_lines_added: number;
          total_lines_removed: number;
        };
        workspace?: {
          current_dir: string;
          project_dir: string;
        };
        version?: string;
      }) => void
    ): (() => void) => {
      const handler = (_: unknown, data: Parameters<typeof callback>[0]) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.AGENT_STATUS_UPDATE, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.AGENT_STATUS_UPDATE, handler);
    },
  },

  // Updater
  updater: {
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL),
    downloadUpdate: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_DOWNLOAD_UPDATE),
    setAutoUpdateEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATER_SET_AUTO_UPDATE_ENABLED, enabled),
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
    setStopHookEnabled: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_STOP_HOOK_SET, enabled),
    setStatusLineHookEnabled: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_STATUSLINE_HOOK_SET, enabled),
    getStatusLineHookStatus: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_STATUSLINE_HOOK_STATUS),
  },

  // Claude Provider
  claudeProvider: {
    readSettings: (): Promise<{
      settings: import('@shared/types').ClaudeSettings | null;
      extracted: Partial<import('@shared/types').ClaudeProvider> | null;
    }> => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROVIDER_READ_SETTINGS),
    apply: (provider: import('@shared/types').ClaudeProvider): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROVIDER_APPLY, provider),
    onSettingsChanged: (
      callback: (data: {
        settings: import('@shared/types').ClaudeSettings | null;
        extracted: Partial<import('@shared/types').ClaudeProvider> | null;
      }) => void
    ): (() => void) => {
      const handler = (_: unknown, data: Parameters<typeof callback>[0]) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_PROVIDER_SETTINGS_CHANGED, handler);
      return () => ipcRenderer.off(IPC_CHANNELS.CLAUDE_PROVIDER_SETTINGS_CHANGED, handler);
    },
  },

  // Claude Config (MCP, Prompts, Plugins)
  claudeConfig: {
    // MCP Management
    mcp: {
      read: (): Promise<Record<string, McpServerConfig>> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MCP_READ),
      sync: (servers: McpServer[]): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MCP_SYNC, servers),
      upsert: (server: McpServer): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MCP_UPSERT, server),
      delete: (serverId: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MCP_DELETE, serverId),
    },
    // Prompts Management
    prompts: {
      read: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROMPTS_READ),
      write: (content: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROMPTS_WRITE, content),
      backup: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROMPTS_BACKUP),
    },
    // Plugins Management
    plugins: {
      list: (): Promise<import('@shared/types').Plugin[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_LIST),
      setEnabled: (pluginId: string, enabled: boolean): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_SET_ENABLED, pluginId, enabled),
      available: (marketplace?: string): Promise<import('@shared/types').AvailablePlugin[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_AVAILABLE, marketplace),
      install: (pluginName: string, marketplace?: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_INSTALL, pluginName, marketplace),
      uninstall: (pluginId: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_UNINSTALL, pluginId),
      marketplaces: {
        list: (): Promise<import('@shared/types').PluginMarketplace[]> =>
          ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_LIST),
        add: (repo: string): Promise<boolean> =>
          ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_ADD, repo),
        remove: (name: string): Promise<boolean> =>
          ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REMOVE, name),
        refresh: (name?: string): Promise<boolean> =>
          ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REFRESH, name),
      },
    },
  },

  // Search
  search: {
    files: (params: FileSearchParams): Promise<FileSearchResult[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SEARCH_FILES, params),
    content: (params: ContentSearchParams): Promise<ContentSearchResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.SEARCH_CONTENT, params),
  },

  // Hapi Remote Sharing
  hapi: {
    checkGlobal: (forceRefresh?: boolean): Promise<{ installed: boolean; version?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HAPI_CHECK_GLOBAL, forceRefresh),
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
    checkGlobal: (forceRefresh?: boolean): Promise<{ installed: boolean; version?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HAPPY_CHECK_GLOBAL, forceRefresh),
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

  // Web Inspector
  webInspector: {
    start: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('web-inspector:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('web-inspector:stop'),
    status: (): Promise<WebInspectorStatus> => ipcRenderer.invoke('web-inspector:status'),
    onStatusChange: (callback: (status: WebInspectorStatus) => void): (() => void) => {
      const handler = (_: unknown, status: WebInspectorStatus) => callback(status);
      ipcRenderer.on('web-inspector:status-change', handler);
      return () => ipcRenderer.off('web-inspector:status-change', handler);
    },
    onData: (callback: (data: InspectPayload) => void): (() => void) => {
      const handler = (_: unknown, data: InspectPayload) => callback(data);
      ipcRenderer.on('web-inspector:data', handler);
      return () => ipcRenderer.off('web-inspector:data', handler);
    },
  },

  // Utilities
  utils: {
    getPathForFile: (file: File): string => {
      return webUtils.getPathForFile(file);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('Buffer', Buffer);

export type ElectronAPI = typeof electronAPI;
