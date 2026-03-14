export type WorkspaceKind = 'local' | 'remote';

export type RemotePlatform = 'linux' | 'darwin' | 'win32';

export interface ConnectionProfile {
  id: string;
  name: string;
  sshTarget: string;
  helperInstallDir?: string;
  platformHint?: RemotePlatform;
  createdAt: number;
  updatedAt: number;
}

export interface RemoteConnectionStatus {
  connectionId: string;
  connected: boolean;
  helperVersion?: string;
  platform?: RemotePlatform;
  error?: string;
  lastCheckedAt?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  platform?: RemotePlatform;
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
