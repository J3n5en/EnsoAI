export type WorkspaceKind = 'local' | 'remote';

export type WorkspacePlatform = 'linux' | 'darwin' | 'win32';
export type RemotePlatform = 'linux';
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
  | 'reconnecting'
  | 'connected'
  | 'failed';

export type RemoteVerificationState = 'summary' | 'pending' | 'verified' | 'failed';

export type RemoteConnectionDiagnosticStep =
  | 'resolve-runtime'
  | 'verify-runtime'
  | 'install-runtime'
  | 'spawn-bridge'
  | 'bridge-handshake'
  | 'sync-settings'
  | 'sync-session-state';

export interface RemoteConnectionDiagnostics {
  attemptStartedAt?: number;
  totalDurationMs?: number;
  phaseStartedAt?: number;
  phaseDurationsMs?: Partial<Record<RemoteConnectionPhase, number>>;
  stepDurationsMs?: Partial<Record<RemoteConnectionDiagnosticStep, number>>;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  sshTarget: string;
  runtimeInstallDir?: string;
  helperInstallDir?: string;
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
  verificationState?: RemoteVerificationState;
  error?: string;
  recoverable?: boolean;
  reconnectAttempt?: number;
  nextRetryAt?: number;
  lastDisconnectReason?: string;
  lastCheckedAt?: number;
  diagnostics?: RemoteConnectionDiagnostics;
}

export interface RemoteConnectionStatusEvent {
  connectionId: string;
  status: RemoteConnectionStatus;
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
  verificationState?: RemoteVerificationState;
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
  libc?: 'glibc';
  runtimeVerified?: boolean;
  runtimeError?: string;
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
  platform: WorkspacePlatform;
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
