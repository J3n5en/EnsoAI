export type WorkspaceKind = 'local' | 'remote';
export type WindowMode = 'local' | 'remote-host';
export type RemoteWindowOpenTarget = 'current-window' | 'new-window';

export type RemotePlatform = 'linux' | 'darwin' | 'win32';
export type RemoteArchitecture = 'x64' | 'arm64';
export type RemoteConnectionPhase =
  | 'idle'
  | 'probing-host'
  | 'resolving-platform'
  | 'preparing-runtime'
  | 'uploading-runtime'
  | 'extracting-runtime'
  | 'syncing-server'
  | 'starting-server'
  | 'handshake'
  | 'connected'
  | 'failed';

export interface ConnectionProfile {
  id: string;
  name: string;
  sshTarget: string;
  runtimeInstallDir?: string;
  helperInstallDir?: string;
  platformHint?: RemotePlatform;
  createdAt: number;
  updatedAt: number;
}

export interface RemoteConnectionStatus {
  connectionId: string;
  connected: boolean;
  phase?: RemoteConnectionPhase;
  phaseLabel?: string;
  runtimeVersion?: string;
  serverVersion?: string;
  helperVersion?: string;
  platform?: RemotePlatform;
  arch?: RemoteArchitecture;
  ptySupported?: boolean;
  ptyError?: string;
  error?: string;
  lastCheckedAt?: number;
}

export interface RemoteRuntimeStatus {
  connectionId: string;
  installed: boolean;
  installDir: string;
  installedVersions: string[];
  currentVersion: string;
  runtimeVersion?: string;
  serverVersion?: string;
  connected: boolean;
  ptySupported?: boolean;
  ptyError?: string;
  error?: string;
  lastCheckedAt?: number;
}

export type RemoteHelperStatus = RemoteRuntimeStatus;

export interface ConnectionTestResult {
  success: boolean;
  platform?: RemotePlatform;
  arch?: RemoteArchitecture;
  homeDir?: string;
  nodeVersion?: string;
  gitVersion?: string;
  error?: string;
}

export type RemoteAuthPromptKind =
  | 'password'
  | 'passphrase'
  | 'keyboard-interactive'
  | 'host-verification';

export interface RemoteHostFingerprint {
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
  bits?: number;
}

export interface RemoteAuthPrompt {
  id: string;
  connectionId: string;
  sshTarget: string;
  profileName: string;
  kind: RemoteAuthPromptKind;
  title: string;
  message: string;
  promptText?: string;
  secretLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  host?: string;
  port?: number;
  fingerprints?: RemoteHostFingerprint[];
}

export interface RemoteAuthResponse {
  promptId: string;
  accepted: boolean;
  secret?: string;
}

export interface WorkspaceHandle {
  id: string;
  kind: WorkspaceKind;
  rootPath: string;
  platform: RemotePlatform;
  connectionId?: string;
}

export interface RepositoryDescriptor {
  id: string;
  name: string;
  path: string;
  kind: WorkspaceKind;
  connectionId?: string;
  groupId?: string;
}

export interface LocalShellSnapshot {
  settingsData: Record<string, unknown> | null;
  localStorage: Record<string, string>;
}

export interface SessionTodoTask {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionStorageDocument {
  version: 2;
  updatedAt: number;
  settingsData: Record<string, unknown>;
  localStorage: Record<string, string>;
  todos: Record<string, SessionTodoTask[]>;
}

export interface RemoteWindowSession {
  sessionId: string;
  connectionId: string;
  profileId: string;
  profileName: string;
  sshTarget: string;
  platform: RemotePlatform;
  remoteHomeDir: string;
  storagePath: string;
  hostKey: string;
}

export interface RemoteSessionState {
  session: RemoteWindowSession;
  storage: SessionStorageDocument;
}

export interface LocalWindowBootstrapContext {
  mode: 'local';
}

export interface RemoteHostWindowBootstrapContext {
  mode: 'remote-host';
  session: RemoteWindowSession;
}

export type WindowBootstrapContext = LocalWindowBootstrapContext | RemoteHostWindowBootstrapContext;
