import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type ConnectionProfile,
  type ConnectionTestResult,
  type FileEntry,
  IPC_CHANNELS,
  type RemoteArchitecture,
  type RemoteAuthResponse,
  type RemoteConnectionDiagnosticStep,
  type RemoteConnectionDiagnostics,
  type RemoteConnectionPhase,
  type RemoteConnectionStatus,
  type RemoteHelperStatus,
  type RemoteHostFingerprint,
  type RemotePlatform,
  type RemoteRuntimeStatus,
  type RemoteVerificationState,
} from '@shared/types';
import { app, BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import { killProcessTree } from '../../utils/processUtils';
import { getEnvForCommand } from '../../utils/shell';
import { readSharedSessionState, readSharedSettings } from '../SharedSessionState';
import { RemoteAuthBroker } from './RemoteAuthBroker';
import { getRemoteServerSource, REMOTE_SERVER_VERSION } from './RemoteHelperSource';
import { parseHostVerificationPrompt } from './RemoteHostVerification';
import { createRemoteError, getRemoteErrorDetail, translateRemote } from './RemoteI18n';
import {
  ensureRemoteRuntimeAsset,
  getRemoteRuntimeAsset,
  MANAGED_REMOTE_NODE_VERSION,
  MANAGED_REMOTE_RUNTIME_DIR,
  type RemoteRuntimeAsset,
} from './RemoteRuntimeAssets';

interface StoredConnectionProfile extends ConnectionProfile {
  platformHint?: 'linux' | 'darwin' | 'win32';
}

interface RemoteServerProcess {
  connectionId: string;
  profile: ConnectionProfile;
  proc: import('node:child_process').ChildProcessWithoutNullStreams;
  nextRequestId: number;
  pending: Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >;
  buffer: string;
  closed: boolean;
  status: RemoteConnectionStatus;
  stderrTail: string[];
  stdoutNoiseTail: string[];
}

interface ResolvedHostConfig {
  host: string;
  port: number;
  knownHost: string;
  userKnownHostsFiles: string[];
  globalKnownHostsFiles: string[];
}

interface ConnectionRuntime {
  platform: RemotePlatform;
  arch: RemoteArchitecture;
  homeDir: string;
  gitVersion?: string;
  libc?: 'glibc';
  resolvedHost: ResolvedHostConfig;
}

interface SshContext {
  env: Record<string, string>;
  optionArgs: string[];
}

interface LocalCommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

interface HostTrustProbeResult extends LocalCommandResult {
  promptShown: boolean;
}

interface RemoteDaemonPingResult {
  ok?: boolean;
  pid?: number;
  serverVersion?: string;
  platform?: string;
  arch?: string;
  nodeVersion?: string;
  homeDir?: string;
  gitVersion?: string | null;
  ptySupported?: boolean;
  ptyError?: string | null;
}

interface CachedRuntimeVerification {
  version: string;
  installDir: string;
  verifiedAt: number;
  result?: RemoteRuntimeVerificationResult;
  error?: string;
}

export interface RemoteConnectionRuntimeInfo {
  profile: ConnectionProfile;
  sshTarget: string;
  platform: RemotePlatform;
  homeDir: string;
  nodeVersion: string;
  gitVersion?: string;
  libc?: 'glibc';
  resolvedHost: {
    host: string;
    port: number;
  };
}

interface RuntimeInstallPaths {
  installDir: string;
  versionDir: string;
  incomingDir: string;
  archivePath: string;
  runtimeRootDir: string;
  nodeModulesPath: string;
  serverPath: string;
  manifestPath: string;
  nodePath: string;
}

interface RemoteRuntimeVerificationResult {
  platform: RemotePlatform;
  arch: RemoteArchitecture;
  nodeVersion: string;
  manifest: RemoteRuntimeManifest;
  helperSourceSha256: string;
  ptySupported?: boolean;
  ptyError?: string;
}

interface RemoteRuntimeSelfTestResult {
  ok: boolean;
  platform: RemotePlatform;
  arch?: RemoteArchitecture;
  homeDir: string;
  nodeVersion: string;
  libc?: 'glibc' | 'musl' | null;
  ptySupported?: boolean;
  ptyError?: string | null;
  helperSourceSha256?: string;
  serverVersion?: string;
  runtimeManifest?: RemoteRuntimeManifest | null;
}

interface RemoteRuntimeManifest {
  manifestVersion: 1;
  serverVersion: string;
  nodeVersion: string;
  platform: RemotePlatform;
  arch: RemoteArchitecture;
  linuxPtyRequired: boolean;
  helperSourceSha256: string;
  runtimeArchiveName: string;
}

interface RemoteDirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

type RemoteEventListener = (payload: unknown) => void;

const DEFAULT_RUNTIME_DIR = MANAGED_REMOTE_RUNTIME_DIR;
const SERVER_FILENAME = 'enso-remote-server.cjs';
const BOOTSTRAP_TIMEOUT_MS = 5_000;
const REMOTE_SETTINGS_PATH = 'remote-connections.json';
const REMOTE_KNOWN_HOSTS_PATH = 'remote-known_hosts';
const SSH_KEYSCAN_TIMEOUT_SECONDS = 5;
const SSH_HOST_VERIFICATION_PROMPT_TIMEOUT_MS = 15_000;
const MAX_REMOTE_DIAGNOSTIC_LINES = 40;
const MAX_REMOTE_DIAGNOSTIC_CHARS = 8_192;
const REMOTE_PTY_UNAVAILABLE_PREFIX = 'REMOTE_PTY_UNAVAILABLE:';
const RUNTIME_MANIFEST_FILENAME = 'enso-remote-runtime-manifest.json';
const LINUX_ONLY_REMOTE_ERROR = 'Only glibc-based Linux x64 and arm64 remote hosts are supported';
const REMOTE_SHARED_SETTINGS_FILENAME = 'settings.json';
const REMOTE_SHARED_SESSION_STATE_FILENAME = 'session-state.json';
const REMOTE_SHARED_STATE_SYNC_TIMEOUT_MS = 5_000;
const REMOTE_RPC_TIMEOUT_MS = 15_000;
const LOCAL_COMMAND_TIMEOUT_MS = 15_000;
const SSH_COMMAND_TIMEOUT_MS = 10 * 60_000;
const SERVER_SHUTDOWN_GRACE_MS = 5_000;
const REMOTE_SERVER_BUFFER_LIMIT_CHARS = 10 * 1024 * 1024;
const COMMAND_OUTPUT_LIMIT_CHARS = 2 * 1024 * 1024;
const REMOTE_ENV_INFO_PREFIX = '__ENSO_REMOTE_ENV__';
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 8_000];
const SCP_CONNECT_TIMEOUT_SECONDS = 30;
const SCP_UPLOAD_TIMEOUT_MS = 10 * 60_000;

type RemoteServerLaunchMode = 'bridge' | 'ensure-daemon' | 'self-test' | 'stop-daemon';

let cachedRemoteServerSource: string | null = null;
let cachedRemoteServerSourceSha256: string | null = null;

function now(): number {
  return Date.now();
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n');
}

function stripHashbang(input: string): string {
  return input.replace(/^#!.*\r?\n/, '');
}

function getNormalizedRemoteServerSource(): string {
  if (cachedRemoteServerSource === null) {
    cachedRemoteServerSource = normalizeLineEndings(getRemoteServerSource());
  }
  return cachedRemoteServerSource;
}

function getNormalizedRemoteServerSourceSha256(): string {
  if (cachedRemoteServerSourceSha256 === null) {
    cachedRemoteServerSourceSha256 = createHash('sha256')
      .update(getNormalizedRemoteServerSource())
      .digest('hex');
  }
  return cachedRemoteServerSourceSha256;
}

function sanitizeConnectionProfile(profile: StoredConnectionProfile): ConnectionProfile {
  return {
    id: profile.id,
    name: profile.name,
    sshTarget: profile.sshTarget,
    runtimeInstallDir: profile.runtimeInstallDir,
    helperInstallDir: profile.helperInstallDir,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function splitDiagnosticChunk(input: string): string[] {
  return normalizeLineEndings(input)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function appendDiagnosticLines(target: string[], chunk: string): void {
  for (const line of splitDiagnosticChunk(chunk)) {
    target.push(line);
  }

  while (target.length > MAX_REMOTE_DIAGNOSTIC_LINES) {
    target.shift();
  }

  while (target.length > 1 && target.join('\n').length > MAX_REMOTE_DIAGNOSTIC_CHARS) {
    target.shift();
  }
}

function appendCommandOutput(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= COMMAND_OUTPUT_LIMIT_CHARS) {
    return next;
  }
  return next.slice(-COMMAND_OUTPUT_LIMIT_CHARS);
}

function normalizeRemotePath(input: string): string {
  const replaced = input.replace(/\\/g, '/').replace(/\/+$/g, '');
  if (/^[A-Za-z]:$/.test(replaced)) {
    return `${replaced}/`;
  }
  return replaced || '/';
}

function parseJsonLine<T>(input: string): T | null {
  const lines = normalizeLineEndings(input)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]) as T;
    } catch {
      // Ignore non-JSON noise and keep searching backwards.
    }
  }

  return null;
}

function parseRemoteEnvInfo(input: string): {
  platform?: string;
  arch?: string;
  homeDir?: string;
  libc?: string;
} | null {
  const result: {
    platform?: string;
    arch?: string;
    homeDir?: string;
    libc?: string;
  } = {};
  let matched = false;

  for (const line of normalizeLineEndings(input).split('\n')) {
    if (!line.startsWith(REMOTE_ENV_INFO_PREFIX)) {
      continue;
    }

    const entry = line.slice(REMOTE_ENV_INFO_PREFIX.length);
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = entry.slice(0, separatorIndex);
    const value = entry.slice(separatorIndex + 1);

    switch (key) {
      case 'platform':
        result.platform = value.trim();
        matched = true;
        break;
      case 'arch':
        result.arch = value.trim();
        matched = true;
        break;
      case 'homeDir':
        result.homeDir = value;
        matched = true;
        break;
      case 'libc':
        result.libc = value.trim();
        matched = true;
        break;
      default:
        break;
    }
  }

  return matched ? result : null;
}

function extractRemotePtyError(detail: string | undefined): string | undefined {
  if (!detail) {
    return undefined;
  }

  const match = detail.match(/REMOTE_PTY_UNAVAILABLE:\s*([^\n]+)/);
  return match?.[1]?.trim() || undefined;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isValidSshTarget(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || trimmed.startsWith('-') || /\s/.test(trimmed)) {
    return false;
  }

  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === 0) {
    return false;
  }
  const host = atIndex >= 0 ? trimmed.slice(atIndex + 1) : trimmed;
  if (!host || host.startsWith('-') || host.includes('/') || host.includes('\\')) {
    return false;
  }

  return true;
}

function isVersionDirectoryName(name: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(name);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomically(targetPath: string, data: unknown): Promise<void> {
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(tempPath, targetPath);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

function getRemoteSettingsPath(): string {
  return join(app.getPath('userData'), REMOTE_SETTINGS_PATH);
}

function getRemoteStateRoot(): string {
  return join(process.env.HOME || process.env.USERPROFILE || app.getPath('home'), '.ensoai');
}

function getAppKnownHostsPath(): string {
  return join(getRemoteStateRoot(), REMOTE_KNOWN_HOSTS_PATH);
}

function expandHomePath(input: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) {
    return input;
  }
  if (input === '~') {
    return home;
  }
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return join(home, input.slice(2));
  }
  return input;
}

function parseSshConfig(stdout: string): Map<string, string[]> {
  const config = new Map<string, string[]>();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const firstSpace = line.indexOf(' ');
    if (firstSpace <= 0) continue;
    const key = line.slice(0, firstSpace).toLowerCase();
    const value = line.slice(firstSpace + 1).trim();
    if (!value) continue;
    if (key === 'userknownhostsfile' || key === 'globalknownhostsfile') {
      config.set(
        key,
        value
          .split(/\s+/)
          .map((entry) => expandHomePath(entry))
          .filter(Boolean)
      );
      continue;
    }
    config.set(key, [value]);
  }
  return config;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

function getKnownHostQueries(host: string, port: number): string[] {
  const results = [`[${host}]:${port}`];
  if (port === 22) {
    results.unshift(host);
  }
  return results;
}

function formatKnownHostEntryHost(host: string, port: number): string {
  if (port !== 22 || host.includes(':')) {
    return `[${host}]:${port}`;
  }
  return host;
}

function normalizeScannedKnownHostsEntries(
  scannedKeys: string,
  knownHost: string,
  port: number
): string {
  const hostField = formatKnownHostEntryHost(knownHost, port);
  return scannedKeys
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 3) {
        return null;
      }
      return `${hostField} ${parts[1]} ${parts[2]}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

function parseFingerprintLine(
  line: string,
  host: string,
  port: number
): RemoteHostFingerprint | null {
  const match = line.trim().match(/^(\d+)\s+(\S+)\s+.+\(([^)]+)\)$/);
  if (!match) {
    return null;
  }
  return {
    host,
    port,
    bits: Number.parseInt(match[1], 10),
    fingerprint: match[2],
    keyType: match[3],
  };
}

function isAuthenticationFailure(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes('permission denied') ||
    normalized.includes('authentication failed') ||
    normalized.includes('too many authentication failures') ||
    normalized.includes('sign_and_send_pubkey') ||
    normalized.includes('load key')
  );
}

function phaseLabelFor(phase: RemoteConnectionPhase | undefined): string | undefined {
  switch (phase) {
    case 'probing-host':
      return translateRemote('Checking SSH host...');
    case 'resolving-platform':
      return translateRemote('Resolving remote platform...');
    case 'preparing-runtime':
      return translateRemote('Preparing managed remote runtime...');
    case 'uploading-runtime':
      return translateRemote('Uploading managed remote runtime...');
    case 'extracting-runtime':
      return translateRemote('Extracting managed remote runtime...');
    case 'syncing-server':
      return translateRemote('Syncing remote server files...');
    case 'starting-server':
      return translateRemote('Starting remote server...');
    case 'handshake':
      return translateRemote('Waiting for remote server handshake...');
    case 'reconnecting':
      return translateRemote('Reconnecting remote connection...');
    case 'connected':
      return translateRemote('Connected');
    case 'failed':
      return translateRemote('Connection failed');
    default:
      return undefined;
  }
}

async function runLocalCommand(
  command: string,
  args: string[],
  env?: Record<string, string>,
  timeoutMs = LOCAL_COMMAND_TIMEOUT_MS
): Promise<LocalCommandResult> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env ? { ...getEnvForCommand(), ...env } : getEnvForCommand(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendCommandOutput(stdout, chunk.toString());
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendCommandOutput(stderr, chunk.toString());
    });
    child.on('error', (error) => {
      finish(() => reject(error));
    });
    child.on('close', (code) => {
      finish(() => resolve({ stdout, stderr, code }));
    });

    const timeout = setTimeout(() => {
      const detail = [stderr.trim(), stdout.trim(), `${command} ${args.join(' ')}`]
        .filter(Boolean)
        .join('\n');
      finish(() => {
        killProcessTree(child);
        reject(createRemoteError('Local command timed out', undefined, detail));
      });
    }, timeoutMs);
  });
}

export class RemoteConnectionManager {
  private profiles = new Map<string, ConnectionProfile>();
  private servers = new Map<string, RemoteServerProcess>();
  private pendingConnections = new Map<string, Promise<RemoteConnectionStatus>>();
  private resolvedHosts = new Map<string, ResolvedHostConfig>();
  private runtimes = new Map<string, ConnectionRuntime>();
  private runtimeVerifications = new Map<string, CachedRuntimeVerification>();
  private pendingRuntimeVerifications = new Map<string, Promise<void>>();
  private volatileStatuses = new Map<string, RemoteConnectionStatus>();
  private diagnostics = new Map<string, RemoteConnectionDiagnostics>();
  private disconnectListeners = new Map<string, Set<() => void>>();
  private localStatusListeners = new Map<string, Set<(status: RemoteConnectionStatus) => void>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private reconnectPromises = new Map<string, Promise<RemoteConnectionStatus>>();
  private reconnectAttempts = new Map<string, number>();
  private intentionalDisconnects = new Set<string>();
  private readonly authBroker = new RemoteAuthBroker();
  private loaded = false;
  private loadingProfiles: Promise<ConnectionProfile[]> | null = null;
  private profileFlushQueue: Promise<void> = Promise.resolve();

  async loadProfiles(): Promise<ConnectionProfile[]> {
    if (this.loaded) {
      return this.listProfiles();
    }

    if (this.loadingProfiles) {
      return this.loadingProfiles;
    }

    this.loadingProfiles = (async () => {
      const path = getRemoteSettingsPath();
      let shouldFlush = false;
      if (await pathExists(path)) {
        try {
          const content = await readFile(path, 'utf8');
          const parsed = JSON.parse(content) as StoredConnectionProfile[];
          for (const profile of parsed) {
            const sanitized = sanitizeConnectionProfile(profile);
            if ('platformHint' in profile) {
              shouldFlush = true;
            }
            this.profiles.set(sanitized.id, sanitized);
          }
        } catch (error) {
          console.warn('[remote] Failed to read profiles:', error);
        }
      }

      this.loaded = true;
      if (shouldFlush) {
        await this.flush();
      }
      return this.listProfiles();
    })().finally(() => {
      this.loadingProfiles = null;
    });

    return this.loadingProfiles;
  }

  listProfiles(): ConnectionProfile[] {
    return [...this.profiles.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveProfile(
    input: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<ConnectionProfile> {
    await this.loadProfiles();
    const existing = input.id ? this.profiles.get(input.id) : null;
    const sshTarget = input.sshTarget.trim();
    if (!isValidSshTarget(sshTarget)) {
      throw createRemoteError('Invalid SSH target');
    }
    const profile: ConnectionProfile = {
      id: input.id ?? randomUUID(),
      name: input.name.trim(),
      sshTarget,
      runtimeInstallDir:
        input.runtimeInstallDir?.trim() || input.helperInstallDir?.trim() || undefined,
      helperInstallDir: input.helperInstallDir?.trim() || undefined,
      createdAt: existing?.createdAt ?? input.createdAt ?? now(),
      updatedAt: now(),
    };

    this.profiles.set(profile.id, profile);
    this.resolvedHosts.delete(profile.id);
    this.runtimes.delete(profile.id);
    this.runtimeVerifications.delete(profile.id);
    this.pendingRuntimeVerifications.delete(profile.id);
    this.authBroker.clearSecrets(profile.id);
    await this.flush();
    return profile;
  }

  async deleteProfile(profileId: string): Promise<void> {
    await this.loadProfiles();
    await this.disconnect(profileId).catch(() => {});
    this.profiles.delete(profileId);
    this.resolvedHosts.delete(profileId);
    this.runtimes.delete(profileId);
    this.runtimeVerifications.delete(profileId);
    this.pendingRuntimeVerifications.delete(profileId);
    this.volatileStatuses.delete(profileId);
    this.diagnostics.delete(profileId);
    this.disconnectListeners.delete(profileId);
    this.localStatusListeners.delete(profileId);
    this.authBroker.clearSecrets(profileId);
    await this.flush();
  }

  getStatus(connectionId: string): RemoteConnectionStatus {
    const status = this.servers.get(connectionId)?.status ??
      this.volatileStatuses.get(connectionId) ?? {
        connectionId,
        connected: false,
        phase: 'idle',
        lastCheckedAt: now(),
      };
    const diagnostics = this.diagnostics.get(connectionId);
    return diagnostics ? { ...status, diagnostics } : status;
  }

  async testConnection(profileOrId: string | ConnectionProfile): Promise<ConnectionTestResult> {
    const profile = await this.resolveProfile(profileOrId);
    try {
      const runtime = await this.resolveRuntime(profile, true, { includeGitVersion: true });
      const paths = this.getRuntimeInstallPaths(profile, runtime);
      let runtimeVerified = false;
      let runtimeError: string | undefined;
      if (await this.isExpectedRuntimeInstalled(profile, runtime, paths)) {
        try {
          const verification = await this.measureDiagnosticStep(profile.id, 'verify-runtime', () =>
            this.verifyManagedRuntime(profile, runtime, paths)
          );
          this.cacheRuntimeVerification(profile.id, paths.installDir, verification);
          runtimeVerified = true;
        } catch (error) {
          runtimeError =
            getRemoteErrorDetail(error) || translateRemote('Remote server bootstrap timed out');
          this.cacheRuntimeVerificationFailure(profile.id, paths.installDir, runtimeError);
        }
      }
      return {
        success: true,
        platform: runtime.platform,
        arch: runtime.arch,
        homeDir: runtime.homeDir,
        nodeVersion: MANAGED_REMOTE_NODE_VERSION,
        gitVersion: runtime.gitVersion,
        libc: runtime.libc,
        runtimeVerified,
        runtimeError,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getRuntimeStatus(profileOrId: string | ConnectionProfile): Promise<RemoteRuntimeStatus> {
    const profile = await this.resolveProfile(profileOrId);
    const connectionStatus = this.getStatus(profile.id);
    const connected = connectionStatus.connected;
    let ptySupported = connectionStatus.ptySupported;
    let ptyError = connectionStatus.ptyError;
    let verificationState: RemoteVerificationState =
      connectionStatus.verificationState ?? (connected ? 'pending' : 'summary');

    try {
      const runtime = await this.resolveRuntime(profile, false);
      const paths = this.getRuntimeInstallPaths(profile, runtime);
      const installedVersions = await this.listInstalledRuntimeVersions(profile, runtime, paths);
      const cachedVerification = this.getCachedRuntimeVerification(profile.id, paths.installDir);
      let error: string | undefined;
      if (cachedVerification?.result) {
        verificationState = 'verified';
        ptySupported = cachedVerification.result.ptySupported ?? ptySupported;
        ptyError =
          cachedVerification.result.ptySupported === true
            ? undefined
            : (cachedVerification.result.ptyError ?? ptyError);
      } else if (cachedVerification?.error) {
        verificationState = 'failed';
        error = cachedVerification.error;
        const verificationPtyError = extractRemotePtyError(error);
        if (verificationPtyError) {
          ptySupported = false;
          ptyError = verificationPtyError;
        }
      } else if (installedVersions.includes(REMOTE_SERVER_VERSION)) {
        verificationState = connected ? 'pending' : 'summary';
      }

      return {
        connectionId: profile.id,
        installed: installedVersions.length > 0,
        installDir: paths.installDir,
        installedVersions,
        currentVersion: REMOTE_SERVER_VERSION,
        runtimeVersion: MANAGED_REMOTE_NODE_VERSION,
        serverVersion: REMOTE_SERVER_VERSION,
        connected,
        ptySupported,
        ptyError,
        verificationState,
        error,
        lastCheckedAt: now(),
      };
    } catch (error) {
      const installDir = profile.runtimeInstallDir?.trim()
        ? normalizeRemotePath(profile.runtimeInstallDir)
        : profile.helperInstallDir?.trim()
          ? normalizeRemotePath(profile.helperInstallDir)
          : DEFAULT_RUNTIME_DIR;

      return {
        connectionId: profile.id,
        installed: false,
        installDir,
        installedVersions: [],
        currentVersion: REMOTE_SERVER_VERSION,
        runtimeVersion: MANAGED_REMOTE_NODE_VERSION,
        serverVersion: REMOTE_SERVER_VERSION,
        connected,
        ptySupported,
        ptyError,
        verificationState: 'failed',
        error: error instanceof Error ? error.message : String(error),
        lastCheckedAt: now(),
      };
    }
  }

  async getHelperStatus(profileOrId: string | ConnectionProfile): Promise<RemoteHelperStatus> {
    return this.getRuntimeStatus(profileOrId);
  }

  async installRuntime(profileOrId: string | ConnectionProfile): Promise<RemoteRuntimeStatus> {
    const profile = await this.resolveProfile(profileOrId);
    await this.disconnect(profile.id).catch(() => {});
    const runtime = await this.resolveRuntime(profile, false);
    const paths = this.getRuntimeInstallPaths(profile, runtime);
    this.invalidateRuntimeVerification(profile.id);
    await this.stopRemoteDaemon(profile, runtime, paths).catch(() => {});
    await this.installManagedRuntime(profile, runtime, paths);
    const verification = await this.measureDiagnosticStep(profile.id, 'verify-runtime', () =>
      this.verifyManagedRuntime(profile, runtime, paths)
    );
    this.cacheRuntimeVerification(profile.id, paths.installDir, verification);
    return this.getRuntimeStatus(profile);
  }

  async installHelperManually(
    profileOrId: string | ConnectionProfile
  ): Promise<RemoteHelperStatus> {
    return this.installRuntime(profileOrId);
  }

  async updateRuntime(profileOrId: string | ConnectionProfile): Promise<RemoteRuntimeStatus> {
    const profile = await this.resolveProfile(profileOrId);
    await this.disconnect(profile.id).catch(() => {});
    const runtime = await this.resolveRuntime(profile, false);
    const paths = this.getRuntimeInstallPaths(profile, runtime);
    this.invalidateRuntimeVerification(profile.id);
    await this.stopRemoteDaemon(profile, runtime, paths).catch(() => {});
    await this.installManagedRuntime(profile, runtime, paths);
    const verification = await this.measureDiagnosticStep(profile.id, 'verify-runtime', () =>
      this.verifyManagedRuntime(profile, runtime, paths)
    );
    this.cacheRuntimeVerification(profile.id, paths.installDir, verification);
    await this.cleanupOldRuntimeVersionsOnHost(profile, runtime, paths);
    return this.getRuntimeStatus(profile);
  }

  async updateHelper(profileOrId: string | ConnectionProfile): Promise<RemoteHelperStatus> {
    return this.updateRuntime(profileOrId);
  }

  async deleteRuntime(profileOrId: string | ConnectionProfile): Promise<RemoteRuntimeStatus> {
    const profile = await this.resolveProfile(profileOrId);
    await this.disconnect(profile.id).catch(() => {});
    const runtime = await this.resolveRuntime(profile, false);
    const paths = this.getRuntimeInstallPaths(profile, runtime);
    this.invalidateRuntimeVerification(profile.id);
    await this.stopRemoteDaemon(profile, runtime, paths).catch(() => {});
    await this.deleteInstalledRuntimeVersions(profile, runtime, paths);
    return this.getRuntimeStatus(profile);
  }

  async deleteHelper(profileOrId: string | ConnectionProfile): Promise<RemoteHelperStatus> {
    return this.deleteRuntime(profileOrId);
  }

  async connect(
    profileOrId: string | ConnectionProfile,
    options?: { preserveReconnectState?: boolean }
  ): Promise<RemoteConnectionStatus> {
    const profile = await this.resolveProfile(profileOrId);
    this.intentionalDisconnects.delete(profile.id);
    this.clearReconnectTimer(profile.id);
    if (!options?.preserveReconnectState) {
      this.reconnectAttempts.delete(profile.id);
    }
    const existing = this.servers.get(profile.id);
    if (existing) {
      return existing.status;
    }

    const pending = this.pendingConnections.get(profile.id);
    if (pending) {
      return pending;
    }

    this.resetDiagnostics(profile.id);
    const connectionAttempt = this.establishManagedRuntimeConnection(profile).finally(() => {
      if (this.pendingConnections.get(profile.id) === connectionAttempt) {
        this.pendingConnections.delete(profile.id);
      }
    });

    this.pendingConnections.set(profile.id, connectionAttempt);
    return connectionAttempt;
  }

  async disconnect(connectionId: string): Promise<void> {
    this.intentionalDisconnects.add(connectionId);
    this.clearReconnectTimer(connectionId);
    this.reconnectPromises.delete(connectionId);
    this.reconnectAttempts.delete(connectionId);
    const server = this.servers.get(connectionId);
    if (!server) {
      const status = this.getStatus(connectionId);
      this.emitStatusChange(connectionId, {
        ...status,
        connected: false,
        phase: 'idle',
        phaseLabel: phaseLabelFor('idle'),
        error: undefined,
        recoverable: false,
        reconnectAttempt: undefined,
        nextRetryAt: undefined,
      });
      this.intentionalDisconnects.delete(connectionId);
      return;
    }
    this.finalizeServerShutdown(server);
    this.terminateServerProcess(server.proc);
  }

  async browseRoots(profileOrId: string | ConnectionProfile): Promise<string[]> {
    const profile = await this.resolveProfile(profileOrId);
    const runtime = await this.resolveRuntime(profile, false);
    return ['/', runtime.homeDir.replace(/\\/g, '/')];
  }

  async listDirectory(
    profileOrId: string | ConnectionProfile,
    remotePath: string
  ): Promise<FileEntry[]> {
    const status = await this.connect(profileOrId);
    const normalizedPath = normalizeRemotePath(remotePath);
    return this.call<FileEntry[]>(status.connectionId, 'fs:list', {
      path: normalizedPath,
    });
  }

  async getRuntimeInfo(
    profileOrId: string | ConnectionProfile
  ): Promise<RemoteConnectionRuntimeInfo> {
    const profile = await this.resolveProfile(profileOrId);
    const runtime = await this.resolveRuntime(profile, false);
    return {
      profile,
      sshTarget: profile.sshTarget,
      platform: runtime.platform,
      homeDir: runtime.homeDir,
      nodeVersion: MANAGED_REMOTE_NODE_VERSION,
      gitVersion: runtime.gitVersion,
      libc: runtime.libc,
      resolvedHost: {
        host: runtime.resolvedHost.host,
        port: runtime.resolvedHost.port,
      },
    };
  }

  respondAuthPrompt(response: RemoteAuthResponse): boolean {
    return this.authBroker.respond(response);
  }

  async call<T = unknown>(
    connectionId: string,
    method: string,
    params: Record<string, unknown>,
    timeoutMs = REMOTE_RPC_TIMEOUT_MS
  ): Promise<T> {
    const server = this.servers.get(connectionId) ?? (await this.ensureConnected(connectionId));
    return this.callServer<T>(server, method, params, timeoutMs);
  }

  async addEventListener(
    connectionId: string,
    event: string,
    listener: RemoteEventListener
  ): Promise<() => void> {
    const server = this.servers.get(connectionId) ?? (await this.ensureConnected(connectionId));
    server.proc.on(event, listener);
    return () => {
      server.proc.off(event, listener);
    };
  }

  onDidDisconnect(connectionId: string, listener: () => void): () => void {
    const listeners = this.disconnectListeners.get(connectionId) ?? new Set<() => void>();
    listeners.add(listener);
    this.disconnectListeners.set(connectionId, listeners);
    return () => {
      const current = this.disconnectListeners.get(connectionId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.disconnectListeners.delete(connectionId);
      }
    };
  }

  onDidStatusChange(
    connectionId: string,
    listener: (status: RemoteConnectionStatus) => void
  ): () => void {
    const listeners =
      this.localStatusListeners.get(connectionId) ??
      new Set<(status: RemoteConnectionStatus) => void>();
    listeners.add(listener);
    this.localStatusListeners.set(connectionId, listeners);
    listener(this.getStatus(connectionId));
    return () => {
      const current = this.localStatusListeners.get(connectionId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.localStatusListeners.delete(connectionId);
      }
    };
  }

  async cleanup(): Promise<void> {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.pendingConnections.clear();
    this.reconnectPromises.clear();
    this.reconnectAttempts.clear();
    this.intentionalDisconnects.clear();
    const ids = [...this.servers.keys()];
    await Promise.allSettled(ids.map((id) => this.disconnect(id)));
    await this.authBroker.dispose();
  }

  recordDiagnosticStep(
    connectionId: string,
    step: RemoteConnectionDiagnosticStep,
    durationMs: number
  ): void {
    const diagnostics = this.getOrCreateDiagnostics(connectionId);
    diagnostics.stepDurationsMs = {
      ...diagnostics.stepDurationsMs,
      [step]: (diagnostics.stepDurationsMs?.[step] ?? 0) + durationMs,
    };
    if (diagnostics.attemptStartedAt) {
      diagnostics.totalDurationMs = now() - diagnostics.attemptStartedAt;
    }
    this.diagnostics.set(connectionId, diagnostics);
    this.setStatus(connectionId, (current) => current);
  }

  private setStatus(
    connectionId: string,
    updater: (current: RemoteConnectionStatus) => RemoteConnectionStatus
  ): RemoteConnectionStatus {
    const current = this.getStatus(connectionId);
    const timestamp = now();
    const next = {
      ...updater(current),
      connectionId,
      lastCheckedAt: timestamp,
    };
    next.diagnostics = this.updateDiagnostics(connectionId, current.phase, next.phase, timestamp);

    const server = this.servers.get(connectionId);
    if (server) {
      server.status = next;
    } else {
      this.volatileStatuses.set(connectionId, next);
    }

    this.emitStatusChange(connectionId, next);

    return next;
  }

  private emitStatusChange(connectionId: string, status: RemoteConnectionStatus): void {
    this.volatileStatuses.set(connectionId, status);
    const payload = { connectionId, status };
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) {
        continue;
      }
      window.webContents.send(IPC_CHANNELS.REMOTE_STATUS_CHANGED, payload);
    }

    const listeners = this.localStatusListeners.get(connectionId);
    if (!listeners) {
      return;
    }

    for (const listener of [...listeners]) {
      try {
        listener(status);
      } catch (error) {
        console.warn('[remote] Status listener failed:', error);
      }
    }
  }

  private resetDiagnostics(connectionId: string): void {
    this.diagnostics.set(connectionId, {
      attemptStartedAt: now(),
      totalDurationMs: 0,
      phaseDurationsMs: {},
      stepDurationsMs: {},
    });
  }

  private getOrCreateDiagnostics(connectionId: string): RemoteConnectionDiagnostics {
    const existing = this.diagnostics.get(connectionId);
    if (existing) {
      return {
        ...existing,
        phaseDurationsMs: { ...existing.phaseDurationsMs },
        stepDurationsMs: { ...existing.stepDurationsMs },
      };
    }

    return {
      attemptStartedAt: now(),
      totalDurationMs: 0,
      phaseDurationsMs: {},
      stepDurationsMs: {},
    };
  }

  private updateDiagnostics(
    connectionId: string,
    previousPhase: RemoteConnectionPhase | undefined,
    nextPhase: RemoteConnectionPhase | undefined,
    timestamp: number
  ): RemoteConnectionDiagnostics | undefined {
    const diagnostics = this.getOrCreateDiagnostics(connectionId);

    if (
      previousPhase &&
      previousPhase !== nextPhase &&
      typeof diagnostics.phaseStartedAt === 'number'
    ) {
      diagnostics.phaseDurationsMs = {
        ...diagnostics.phaseDurationsMs,
        [previousPhase]:
          (diagnostics.phaseDurationsMs?.[previousPhase] ?? 0) +
          (timestamp - diagnostics.phaseStartedAt),
      };
    }

    if (previousPhase !== nextPhase) {
      diagnostics.phaseStartedAt = timestamp;
    }

    if (diagnostics.attemptStartedAt) {
      diagnostics.totalDurationMs = timestamp - diagnostics.attemptStartedAt;
    }

    this.diagnostics.set(connectionId, diagnostics);
    return diagnostics;
  }

  private async measureDiagnosticStep<T>(
    connectionId: string,
    step: RemoteConnectionDiagnosticStep,
    action: () => Promise<T>
  ): Promise<T> {
    const startedAt = now();
    try {
      return await action();
    } finally {
      this.recordDiagnosticStep(connectionId, step, now() - startedAt);
    }
  }

  private async ensureConnected(connectionId: string): Promise<RemoteServerProcess> {
    const reconnecting = this.reconnectPromises.get(connectionId);
    if (reconnecting) {
      await reconnecting;
    }
    await this.connect(connectionId);
    const server = this.servers.get(connectionId);
    if (!server) {
      throw createRemoteError('Failed to establish remote server for {{connectionId}}', {
        connectionId,
      });
    }
    return server;
  }

  private async establishManagedRuntimeConnection(
    profile: ConnectionProfile
  ): Promise<RemoteConnectionStatus> {
    this.clearReconnectTimer(profile.id);
    this.setStatus(profile.id, (current) => ({
      ...current,
      connected: false,
      phase: 'probing-host',
      phaseLabel: phaseLabelFor('probing-host'),
      error: undefined,
      recoverable: false,
      reconnectAttempt: undefined,
      nextRetryAt: undefined,
      runtimeVersion: MANAGED_REMOTE_NODE_VERSION,
      serverVersion: REMOTE_SERVER_VERSION,
      helperVersion: REMOTE_SERVER_VERSION,
    }));

    const runtime = await this.measureDiagnosticStep(profile.id, 'resolve-runtime', () =>
      this.resolveRuntime(profile, false)
    );
    const paths = this.getRuntimeInstallPaths(profile, runtime);

    try {
      return await this.startConnectedServer(profile, runtime, paths);
    } catch (fastPathError) {
      const detail = fastPathError instanceof Error ? fastPathError.message : String(fastPathError);
      console.warn(
        `[remote:${profile.name}] Fast remote connection path failed, reinstalling: ${detail}`
      );
    }

    await this.disconnect(profile.id).catch(() => {});
    await this.stopRemoteDaemon(profile, runtime, paths).catch(() => {});

    this.setStatus(profile.id, (current) => ({
      ...current,
      phase: 'preparing-runtime',
      phaseLabel: phaseLabelFor('preparing-runtime'),
      platform: runtime.platform,
      arch: runtime.arch,
    }));

    await this.measureDiagnosticStep(profile.id, 'install-runtime', () =>
      this.installManagedRuntime(profile, runtime, paths)
    );
    const verification = await this.measureDiagnosticStep(profile.id, 'verify-runtime', () =>
      this.verifyManagedRuntime(profile, runtime, paths)
    );
    this.cacheRuntimeVerification(profile.id, paths.installDir, verification);
    return this.startConnectedServer(profile, runtime, paths);
  }

  private getRuntimeInstallPaths(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime
  ): RuntimeInstallPaths {
    const installDir = normalizeRemotePath(
      profile.runtimeInstallDir?.trim() ||
        profile.helperInstallDir?.trim() ||
        `${runtime.homeDir.replace(/\\/g, '/')}/${DEFAULT_RUNTIME_DIR}`
    );

    const versionDir = normalizeRemotePath(`${installDir}/${REMOTE_SERVER_VERSION}`);
    const incomingDir = normalizeRemotePath(`${installDir}/incoming`);
    const archivePath = normalizeRemotePath(`${incomingDir}/runtime.tar.gz`);
    const runtimeRootDir = normalizeRemotePath(`${versionDir}/runtime`);
    const nodeFolder = `node-v${MANAGED_REMOTE_NODE_VERSION}-${runtime.platform}-${runtime.arch}`;
    const nodePath = normalizeRemotePath(`${runtimeRootDir}/${nodeFolder}/bin/node`);

    return {
      installDir,
      versionDir,
      incomingDir,
      archivePath,
      runtimeRootDir,
      nodeModulesPath: normalizeRemotePath(`${versionDir}/node_modules`),
      serverPath: normalizeRemotePath(`${versionDir}/${SERVER_FILENAME}`),
      manifestPath: normalizeRemotePath(`${versionDir}/${RUNTIME_MANIFEST_FILENAME}`),
      nodePath,
    };
  }

  private async installManagedRuntime(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths
  ): Promise<void> {
    const runtimeAsset = await ensureRemoteRuntimeAsset(runtime.platform, runtime.arch);

    this.setStatus(profile.id, (current) => ({
      ...current,
      phase: 'uploading-runtime',
      phaseLabel: phaseLabelFor('uploading-runtime'),
      platform: runtime.platform,
      arch: runtime.arch,
    }));

    await this.execSsh(
      profile,
      [
        `mkdir -p ${shellQuote(paths.installDir)} ${shellQuote(paths.versionDir)} ${shellQuote(paths.incomingDir)}`,
      ],
      runtime.resolvedHost
    );

    await this.uploadFileOverScp(
      profile,
      runtimeAsset.localPath,
      paths.archivePath,
      runtime.resolvedHost
    );

    this.setStatus(profile.id, (current) => ({
      ...current,
      phase: 'extracting-runtime',
      phaseLabel: phaseLabelFor('extracting-runtime'),
    }));

    await this.extractManagedRuntime(profile, runtime, paths, runtimeAsset.asset);

    this.setStatus(profile.id, (current) => ({
      ...current,
      phase: 'syncing-server',
      phaseLabel: phaseLabelFor('syncing-server'),
    }));

    await this.syncRemoteServerSource(profile, runtime, paths.serverPath);
    await this.syncRemoteRuntimeManifest(profile, runtime, paths, runtimeAsset.asset);
  }

  private getRemoteSharedStatePaths(runtime: ConnectionRuntime): {
    rootDir: string;
    settingsPath: string;
    sessionStatePath: string;
  } {
    const rootDir = normalizeRemotePath(`${runtime.homeDir}/.ensoai`);
    return {
      rootDir,
      settingsPath: normalizeRemotePath(`${rootDir}/${REMOTE_SHARED_SETTINGS_FILENAME}`),
      sessionStatePath: normalizeRemotePath(`${rootDir}/${REMOTE_SHARED_SESSION_STATE_FILENAME}`),
    };
  }

  private async syncRemoteSharedState(
    connectionId: string,
    server: RemoteServerProcess,
    runtime: ConnectionRuntime
  ): Promise<void> {
    const sharedStatePaths = this.getRemoteSharedStatePaths(runtime);
    await this.callServer(
      server,
      'fs:createDirectory',
      { path: sharedStatePaths.rootDir },
      REMOTE_SHARED_STATE_SYNC_TIMEOUT_MS
    );

    await this.measureDiagnosticStep(connectionId, 'sync-settings', async () => {
      await this.callServer(
        server,
        'fs:write',
        {
          path: sharedStatePaths.settingsPath,
          content: JSON.stringify(readSharedSettings(), null, 2),
        },
        REMOTE_SHARED_STATE_SYNC_TIMEOUT_MS
      );
    });

    await this.measureDiagnosticStep(connectionId, 'sync-session-state', async () => {
      await this.callServer(
        server,
        'fs:write',
        {
          path: sharedStatePaths.sessionStatePath,
          content: JSON.stringify(readSharedSessionState(), null, 2),
        },
        REMOTE_SHARED_STATE_SYNC_TIMEOUT_MS
      );
    });
  }

  private syncRemoteSharedStateInBackground(
    connectionId: string,
    server: RemoteServerProcess,
    runtime: ConnectionRuntime
  ): void {
    void this.syncRemoteSharedState(connectionId, server, runtime).catch((error) => {
      console.warn(
        `[remote:${server.profile.name}] Failed to sync shared state: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  private async extractManagedRuntime(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    asset: RemoteRuntimeAsset
  ): Promise<void> {
    await this.execSsh(
      profile,
      [
        [
          `rm -rf ${shellQuote(paths.runtimeRootDir)}`,
          `rm -rf ${shellQuote(paths.nodeModulesPath)}`,
          `rm -f ${shellQuote(paths.serverPath)}`,
          `mkdir -p ${shellQuote(paths.versionDir)}`,
          `tar -xzf ${shellQuote(paths.archivePath)} -C ${shellQuote(paths.versionDir)}`,
        ].join(' && '),
      ],
      runtime.resolvedHost
    );

    const nodeExists = await this.remoteFileExists(profile, runtime, paths.nodePath);
    if (!nodeExists) {
      throw new Error(
        `Managed remote runtime node executable not found after extract: ${asset.archiveName}`
      );
    }

    await this.execSsh(profile, [`chmod +x ${shellQuote(paths.nodePath)}`], runtime.resolvedHost);
  }

  private async syncRemoteServerSource(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    serverPath: string
  ): Promise<void> {
    const source = getNormalizedRemoteServerSource();
    const tempPath = join(
      app.getPath('temp'),
      `enso-remote-server-${profile.id}-${randomUUID()}.cjs`
    );
    try {
      await this.validateRemoteServerSource(source);
      await writeFile(tempPath, source, 'utf8');
      await this.uploadFileOverScp(profile, tempPath, serverPath, runtime.resolvedHost);

      await this.execSsh(profile, [`chmod +x ${shellQuote(serverPath)}`], runtime.resolvedHost);
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }

  private buildExpectedRuntimeManifest(
    runtime: ConnectionRuntime,
    runtimeAsset: Pick<RemoteRuntimeAsset, 'archiveName'>
  ): RemoteRuntimeManifest {
    return {
      manifestVersion: 1,
      serverVersion: REMOTE_SERVER_VERSION,
      nodeVersion: MANAGED_REMOTE_NODE_VERSION,
      platform: runtime.platform,
      arch: runtime.arch,
      linuxPtyRequired: true,
      helperSourceSha256: getNormalizedRemoteServerSourceSha256(),
      runtimeArchiveName: runtimeAsset.archiveName,
    };
  }

  private describeRuntimeManifestMismatch(
    actual: RemoteRuntimeManifest,
    expected: RemoteRuntimeManifest
  ): string | null {
    const mismatches: string[] = [];

    if (actual.manifestVersion !== expected.manifestVersion) {
      mismatches.push(
        `manifestVersion=${actual.manifestVersion} (expected ${expected.manifestVersion})`
      );
    }
    if (actual.serverVersion !== expected.serverVersion) {
      mismatches.push(`serverVersion=${actual.serverVersion} (expected ${expected.serverVersion})`);
    }
    if (actual.nodeVersion !== expected.nodeVersion) {
      mismatches.push(`nodeVersion=${actual.nodeVersion} (expected ${expected.nodeVersion})`);
    }
    if (actual.platform !== expected.platform) {
      mismatches.push(`platform=${actual.platform} (expected ${expected.platform})`);
    }
    if (actual.arch !== expected.arch) {
      mismatches.push(`arch=${actual.arch} (expected ${expected.arch})`);
    }
    if (actual.linuxPtyRequired !== expected.linuxPtyRequired) {
      mismatches.push(
        `linuxPtyRequired=${String(actual.linuxPtyRequired)} (expected ${String(expected.linuxPtyRequired)})`
      );
    }
    if (actual.helperSourceSha256 !== expected.helperSourceSha256) {
      mismatches.push('helperSourceSha256 mismatch');
    }
    if (actual.runtimeArchiveName !== expected.runtimeArchiveName) {
      mismatches.push(
        `runtimeArchiveName=${actual.runtimeArchiveName} (expected ${expected.runtimeArchiveName})`
      );
    }

    return mismatches.length > 0 ? mismatches.join('; ') : null;
  }

  private async syncRemoteRuntimeManifest(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    runtimeAsset: RemoteRuntimeAsset
  ): Promise<void> {
    const tempPath = join(
      app.getPath('temp'),
      `enso-remote-runtime-manifest-${profile.id}-${randomUUID()}.json`
    );
    const manifest = this.buildExpectedRuntimeManifest(runtime, runtimeAsset);

    try {
      await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      await this.uploadFileOverScp(profile, tempPath, paths.manifestPath, runtime.resolvedHost);
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }

  private async validateRemoteServerSource(source: string): Promise<void> {
    try {
      const { Script } = await import('node:vm');
      // Validate the generated CommonJS payload before we upload it to the remote host.
      new Script(stripHashbang(source), { filename: SERVER_FILENAME });
    } catch (error) {
      throw createRemoteError('Generated remote server source is invalid', undefined, error);
    }
  }

  private buildRemoteServerCommand(
    _runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    mode: RemoteServerLaunchMode
  ): string {
    return this.buildRemoteServerCommandWithArgs(paths, [mode]);
  }

  private buildRemoteServerCommandWithArgs(paths: RuntimeInstallPaths, args: string[]): string {
    const quotedArgs = args.map((arg) => `--${arg}`).join(' ');
    return `${shellQuote(paths.nodePath)} ${shellQuote(paths.serverPath)} ${quotedArgs}`;
  }

  private buildRemoteShCommand(script: string | string[], args: string[] = []): string {
    // Keep compound shell syntax on separate lines. Joining blocks with ";" breaks POSIX sh.
    const source = normalizeLineEndings(Array.isArray(script) ? script.join('\n') : script);
    const quotedArgs = args.map((arg) => shellQuote(arg)).join(' ');
    return quotedArgs
      ? `sh -lc ${shellQuote(source)} sh ${quotedArgs}`
      : `sh -lc ${shellQuote(source)}`;
  }

  private runRemoteShScript(
    profile: ConnectionProfile,
    resolvedHost: ResolvedHostConfig,
    script: string | string[],
    args: string[] = []
  ): Promise<LocalCommandResult> {
    return this.runSshCommand(profile, [this.buildRemoteShCommand(script, args)], resolvedHost);
  }

  private execRemoteShScript(
    profile: ConnectionProfile,
    resolvedHost: ResolvedHostConfig,
    script: string | string[],
    args: string[] = [],
    strictExit = true
  ): Promise<string> {
    return this.execSsh(
      profile,
      [this.buildRemoteShCommand(script, args)],
      resolvedHost,
      strictExit
    );
  }

  private formatCommandResultDetail(result: LocalCommandResult): string | undefined {
    const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean);
    if (details.length > 0) {
      return details.join('\n');
    }

    if (result.code !== null) {
      return translateRemote('SSH command exited with code {{code}}', {
        code: String(result.code),
      });
    }

    return undefined;
  }

  private formatServerDiagnostics(server: RemoteServerProcess): string | undefined {
    const sections: string[] = [];

    if (server.stderrTail.length > 0) {
      sections.push(`stderr:\n${server.stderrTail.join('\n')}`);
    }

    if (server.stdoutNoiseTail.length > 0) {
      sections.push(`stdout:\n${server.stdoutNoiseTail.join('\n')}`);
    }

    return sections.join('\n\n') || undefined;
  }

  private buildServerFailureError(baseMessage: string, server: RemoteServerProcess): Error {
    if (server.closed && server.status.error) {
      return new Error(server.status.error);
    }

    const message = baseMessage.trim() || translateRemote('Remote server disconnected');
    const diagnostics = this.formatServerDiagnostics(server);
    if (!diagnostics || message.includes(diagnostics)) {
      return new Error(message);
    }

    return createRemoteError(message, undefined, diagnostics);
  }

  private async verifyManagedRuntime(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths
  ): Promise<RemoteRuntimeVerificationResult> {
    const runtimeAsset = getRemoteRuntimeAsset(runtime.platform, runtime.arch);
    const expectedManifest = this.buildExpectedRuntimeManifest(runtime, runtimeAsset);
    const selfTestResult = await this.runSshCommand(
      profile,
      [this.buildRemoteServerCommand(runtime, paths, 'self-test')],
      runtime.resolvedHost
    );
    const selfTestInfo =
      parseJsonLine<RemoteRuntimeSelfTestResult>(selfTestResult.stdout) ??
      parseJsonLine<RemoteRuntimeSelfTestResult>(selfTestResult.stderr);

    if (selfTestResult.code !== 0) {
      const detail =
        selfTestInfo?.ptySupported === false && selfTestInfo.ptyError
          ? `${REMOTE_PTY_UNAVAILABLE_PREFIX} ${selfTestInfo.ptyError}`
          : selfTestInfo?.ptyError ||
            this.formatCommandResultDetail(selfTestResult) ||
            translateRemote('Remote server bootstrap timed out');

      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed remote server self-test'),
        },
        detail
      );
    }

    if (!selfTestInfo) {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed remote server self-test'),
        },
        translateRemote('Remote server bootstrap timed out')
      );
    }

    const manifest = selfTestInfo.runtimeManifest;
    if (!manifest) {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed runtime manifest'),
        },
        'Runtime manifest missing from self-test payload'
      );
    }

    const manifestMismatch = this.describeRuntimeManifestMismatch(manifest, expectedManifest);
    if (manifestMismatch) {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed runtime manifest'),
        },
        manifestMismatch
      );
    }

    const reportedNodeVersion = selfTestInfo.nodeVersion?.trim();
    const expectedNodeVersion = `v${MANAGED_REMOTE_NODE_VERSION}`;
    if (reportedNodeVersion !== expectedNodeVersion) {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed runtime node --version'),
        },
        `Unexpected node version: ${reportedNodeVersion || '<empty>'} (expected ${expectedNodeVersion})`
      );
    }

    const helperSourceSha256 = selfTestInfo.helperSourceSha256?.trim();
    if (helperSourceSha256 !== getNormalizedRemoteServerSourceSha256()) {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed remote server self-test'),
        },
        'helperSourceSha256 mismatch'
      );
    }

    if (selfTestInfo.serverVersion !== REMOTE_SERVER_VERSION) {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed remote server self-test'),
        },
        `Unexpected server version: ${selfTestInfo.serverVersion || '<empty>'} (expected ${REMOTE_SERVER_VERSION})`
      );
    }

    if (selfTestInfo.platform !== runtime.platform) {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed remote server self-test'),
        },
        `Unexpected platform: ${selfTestInfo.platform} (expected ${runtime.platform})`
      );
    }

    const reportedArch = this.normalizeArchitecture(selfTestInfo.arch);
    if (reportedArch !== runtime.arch) {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed remote server self-test'),
        },
        `Unexpected architecture: ${reportedArch} (expected ${runtime.arch})`
      );
    }

    if (runtime.libc === 'glibc' && selfTestInfo.libc && selfTestInfo.libc !== 'glibc') {
      throw createRemoteError(
        'Managed remote runtime verification failed during {{step}}',
        {
          step: translateRemote('Managed remote server self-test'),
        },
        `Unexpected libc: ${selfTestInfo.libc}`
      );
    }

    return {
      platform: selfTestInfo.platform,
      arch: reportedArch,
      nodeVersion: reportedNodeVersion,
      manifest,
      helperSourceSha256,
      ptySupported: selfTestInfo?.ptySupported,
      ptyError: selfTestInfo?.ptyError || undefined,
    };
  }

  private async startConnectedServer(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths
  ): Promise<RemoteConnectionStatus> {
    const cachedVerification = this.getCachedRuntimeVerification(profile.id, paths.installDir);
    this.setStatus(profile.id, (current) => ({
      ...current,
      phase: 'starting-server',
      phaseLabel: phaseLabelFor('starting-server'),
      platform: runtime.platform,
      arch: runtime.arch,
      runtimeVersion: cachedVerification?.result?.nodeVersion ?? `v${MANAGED_REMOTE_NODE_VERSION}`,
      serverVersion: REMOTE_SERVER_VERSION,
      helperVersion: REMOTE_SERVER_VERSION,
      verificationState: cachedVerification?.result
        ? 'verified'
        : cachedVerification?.error
          ? 'failed'
          : 'pending',
    }));

    const server = await this.measureDiagnosticStep(profile.id, 'spawn-bridge', () =>
      this.spawnServerProcess(profile, runtime, paths)
    );
    try {
      this.setStatus(profile.id, (current) => ({
        ...current,
        phase: 'handshake',
        phaseLabel: phaseLabelFor('handshake'),
      }));
      server.status = this.getStatus(profile.id);

      const handshake = await this.measureDiagnosticStep(profile.id, 'bridge-handshake', () =>
        this.callServer<RemoteDaemonPingResult>(server, 'daemon:ping', {}, BOOTSTRAP_TIMEOUT_MS)
      );
      const handshakeRuntime = this.applyHandshakeRuntime(profile.id, runtime, handshake);
      const currentVerification = this.getCachedRuntimeVerification(profile.id, paths.installDir);

      const timestamp = now();
      server.status = {
        ...server.status,
        connected: true,
        phase: 'connected',
        phaseLabel: phaseLabelFor('connected'),
        error: undefined,
        recoverable: false,
        reconnectAttempt: undefined,
        nextRetryAt: undefined,
        lastDisconnectReason: undefined,
        platform: handshakeRuntime.platform,
        arch: handshakeRuntime.arch,
        runtimeVersion:
          handshake.nodeVersion?.trim() ||
          currentVerification?.result?.nodeVersion ||
          `v${MANAGED_REMOTE_NODE_VERSION}`,
        serverVersion: handshake.serverVersion?.trim() || REMOTE_SERVER_VERSION,
        helperVersion: REMOTE_SERVER_VERSION,
        ptySupported:
          handshake.ptySupported ??
          currentVerification?.result?.ptySupported ??
          server.status.ptySupported,
        ptyError:
          handshake.ptySupported === true
            ? undefined
            : handshake.ptyError?.trim() ||
              currentVerification?.result?.ptyError ||
              server.status.ptyError,
        verificationState: currentVerification?.result
          ? 'verified'
          : currentVerification?.error
            ? 'failed'
            : 'pending',
        lastCheckedAt: timestamp,
        diagnostics: this.updateDiagnostics(
          profile.id,
          server.status.phase,
          'connected',
          timestamp
        ),
      };
      this.servers.set(profile.id, server);
      this.volatileStatuses.delete(profile.id);
      this.emitStatusChange(profile.id, server.status);
      this.syncRemoteSharedStateInBackground(profile.id, server, handshakeRuntime);
      this.scheduleBackgroundRuntimeVerification(
        profile,
        handshakeRuntime,
        paths,
        server.status.verificationState
      );
      void this.cleanupOldRuntimeVersions(server, paths).catch((error) => {
        console.warn(
          `[remote:${profile.name}] Failed to clean up old remote runtime versions: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
      return server.status;
    } catch (error) {
      const baseMessage =
        getRemoteErrorDetail(error) || translateRemote('Failed to start remote server');
      const failure = this.buildServerFailureError(baseMessage, server);
      this.finalizeServerShutdown(server, failure);
      this.terminateServerProcess(server.proc);
      throw failure;
    }
  }

  private terminateServerProcess(
    proc: import('node:child_process').ChildProcessWithoutNullStreams
  ): void {
    const clearForceKillTimer = () => {
      clearTimeout(forceKillTimer);
    };
    const forceKillTimer = setTimeout(() => {
      killProcessTree(proc);
    }, SERVER_SHUTDOWN_GRACE_MS);
    proc.once('exit', clearForceKillTimer);
    proc.once('close', clearForceKillTimer);
    killProcessTree(proc, 'SIGTERM');
  }

  private async spawnServerProcess(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths
  ): Promise<RemoteServerProcess> {
    const { spawn } = await import('node:child_process');
    const remoteCommand = this.buildRemoteServerCommand(runtime, paths, 'bridge');
    const sshContext = await this.buildSshContext(profile, runtime.resolvedHost);
    const proc = spawn('ssh', [...sshContext.optionArgs, profile.sshTarget, remoteCommand], {
      env: sshContext.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const server: RemoteServerProcess = {
      connectionId: profile.id,
      profile,
      proc,
      nextRequestId: 1,
      pending: new Map(),
      buffer: '',
      closed: false,
      stderrTail: [],
      stdoutNoiseTail: [],
      status: {
        ...this.getStatus(profile.id),
        connected: false,
        phase: 'starting-server',
        phaseLabel: phaseLabelFor('starting-server'),
        runtimeVersion: MANAGED_REMOTE_NODE_VERSION,
        serverVersion: REMOTE_SERVER_VERSION,
        helperVersion: REMOTE_SERVER_VERSION,
        platform: runtime.platform,
        arch: runtime.arch,
        lastCheckedAt: now(),
      },
    };

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      server.buffer += chunk;
      if (server.buffer.length > REMOTE_SERVER_BUFFER_LIMIT_CHARS) {
        server.buffer = '';
        const detail = createRemoteError(
          'Remote server protocol buffer exceeded limit',
          undefined,
          `connectionId=${server.connectionId}`
        );
        this.finalizeServerShutdown(server, detail);
        this.terminateServerProcess(proc);
        return;
      }
      const lines = server.buffer.split('\n');
      server.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;

        let message: {
          type?: string;
          id?: number;
          result?: unknown;
          error?: string;
          event?: string;
          payload?: unknown;
        };

        try {
          message = JSON.parse(line);
        } catch (error) {
          appendDiagnosticLines(server.stdoutNoiseTail, line);
          console.warn('[remote] Failed to parse remote server output:', error);
          continue;
        }

        if (message.type === 'response' && typeof message.id === 'number') {
          const pending = server.pending.get(message.id);
          if (!pending) continue;
          if (message.error) {
            pending.reject(new Error(message.error));
          } else {
            pending.resolve(message.result);
          }
        } else if (message.type === 'event' && message.event) {
          try {
            server.proc.emit(`remote:${message.event}`, message.payload);
          } catch (emitError) {
            console.warn(
              `[remote:${profile.name}] Remote event listener failed for ${message.event}:`,
              emitError
            );
          }
        }
      }
    });

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      appendDiagnosticLines(server.stderrTail, chunk);
      const lines = splitDiagnosticChunk(chunk);
      if (lines.length === 0) {
        return;
      }
      for (const line of lines) {
        if (isAuthenticationFailure(line)) {
          this.authBroker.clearSecrets(profile.id);
        }
        console.warn(`[remote:${profile.name}] ${line}`);
      }
    });

    proc.on('error', (error) => {
      this.finalizeServerShutdown(server, this.buildServerFailureError(error.message, server));
    });

    proc.on('exit', (code, signal) => {
      this.finalizeServerShutdown(
        server,
        code === 0
          ? undefined
          : this.buildServerFailureError(
              translateRemote('Remote server exited ({{reason}})', {
                reason: `${code ?? 'signal'}${signal ? `/${signal}` : ''}`,
              }),
              server
            )
      );
    });

    return server;
  }

  private async stopRemoteDaemon(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths
  ): Promise<void> {
    await this.runSshCommand(
      profile,
      [this.buildRemoteServerCommand(runtime, paths, 'stop-daemon')],
      runtime.resolvedHost
    );
  }

  private finalizeServerShutdown(server: RemoteServerProcess, error?: unknown): void {
    if (server.closed) {
      return;
    }

    const detail = getRemoteErrorDetail(error);
    const timestamp = now();
    const intentional = this.intentionalDisconnects.delete(server.connectionId);
    server.closed = true;
    try {
      if (!server.proc.stdin.destroyed && server.proc.stdin.writable) {
        server.proc.stdin.end();
      }
    } catch {
      // Ignore shutdown races when ssh already closed its stdin.
    }
    server.status = {
      ...server.status,
      connected: false,
      phase: intentional ? 'idle' : detail ? 'failed' : 'idle',
      phaseLabel: intentional
        ? phaseLabelFor('idle')
        : detail
          ? phaseLabelFor('failed')
          : phaseLabelFor('idle'),
      error: detail,
      recoverable: !intentional && this.shouldAutoReconnect(detail),
      reconnectAttempt: undefined,
      nextRetryAt: undefined,
      lastDisconnectReason: detail,
      lastCheckedAt: timestamp,
      verificationState: intentional ? 'summary' : server.status.verificationState,
      diagnostics: this.updateDiagnostics(
        server.connectionId,
        server.status.phase,
        intentional ? 'idle' : detail ? 'failed' : 'idle',
        timestamp
      ),
    };

    for (const pending of server.pending.values()) {
      pending.reject(
        new Error(server.status.error || translateRemote('Remote server disconnected'))
      );
    }
    server.pending.clear();

    if (this.servers.get(server.connectionId) === server) {
      this.servers.delete(server.connectionId);
    }
    this.volatileStatuses.set(server.connectionId, server.status);
    this.emitStatusChange(server.connectionId, server.status);

    const disconnectListeners = this.disconnectListeners.get(server.connectionId);
    if (disconnectListeners) {
      for (const listener of disconnectListeners) {
        try {
          listener();
        } catch (listenerError) {
          console.warn('[remote] Disconnect listener failed:', listenerError);
        }
      }
    }

    if (!intentional && server.status.recoverable) {
      this.scheduleReconnect(server.connectionId, detail);
    } else {
      this.clearReconnectTimer(server.connectionId);
      this.reconnectPromises.delete(server.connectionId);
      this.reconnectAttempts.delete(server.connectionId);
    }
  }

  private shouldAutoReconnect(detail: string | undefined): boolean {
    if (!detail) {
      return true;
    }
    if (isAuthenticationFailure(detail)) {
      return false;
    }
    return !detail.toLowerCase().includes('host verification');
  }

  private clearReconnectTimer(connectionId: string): void {
    const timer = this.reconnectTimers.get(connectionId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(connectionId);
    }
  }

  private scheduleReconnect(connectionId: string, reason?: string): void {
    if (this.reconnectPromises.has(connectionId) || this.reconnectTimers.has(connectionId)) {
      return;
    }

    const attempt = (this.reconnectAttempts.get(connectionId) ?? 0) + 1;
    if (attempt > RECONNECT_DELAYS_MS.length) {
      this.reconnectAttempts.delete(connectionId);
      this.setStatus(connectionId, (current) => ({
        ...current,
        connected: false,
        phase: 'failed',
        phaseLabel: phaseLabelFor('failed'),
        error: reason || current.error,
        recoverable: false,
        reconnectAttempt: attempt - 1,
        nextRetryAt: undefined,
        lastDisconnectReason: reason || current.lastDisconnectReason,
      }));
      return;
    }

    const delay =
      RECONNECT_DELAYS_MS[attempt - 1] ?? RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1];
    const nextRetryAt = now() + delay;
    this.reconnectAttempts.set(connectionId, attempt);
    this.setStatus(connectionId, (current) => ({
      ...current,
      connected: false,
      phase: 'reconnecting',
      phaseLabel: phaseLabelFor('reconnecting'),
      recoverable: true,
      reconnectAttempt: attempt,
      nextRetryAt,
      lastDisconnectReason: reason || current.lastDisconnectReason,
      error: reason || current.error,
    }));

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(connectionId);
      const reconnectPromise = this.performReconnect(connectionId, attempt);
      this.reconnectPromises.set(connectionId, reconnectPromise);
      void reconnectPromise.finally(() => {
        if (this.reconnectPromises.get(connectionId) === reconnectPromise) {
          this.reconnectPromises.delete(connectionId);
        }
      });
    }, delay);
    this.reconnectTimers.set(connectionId, timer);
  }

  private async performReconnect(
    connectionId: string,
    attempt: number
  ): Promise<RemoteConnectionStatus> {
    try {
      const status = await this.connect(connectionId, { preserveReconnectState: true });
      this.reconnectAttempts.delete(connectionId);
      return status;
    } catch (error) {
      const detail = getRemoteErrorDetail(error);
      this.setStatus(connectionId, (current) => ({
        ...current,
        connected: false,
        phase: 'reconnecting',
        phaseLabel: translateRemote('Reconnecting remote connection...'),
        recoverable: true,
        reconnectAttempt: attempt,
        nextRetryAt: undefined,
        error: detail || current.error,
        lastDisconnectReason: detail || current.lastDisconnectReason,
      }));
      this.reconnectPromises.delete(connectionId);
      this.scheduleReconnect(connectionId, detail);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async callServer<T = unknown>(
    server: RemoteServerProcess,
    method: string,
    params: Record<string, unknown>,
    timeoutMs = REMOTE_RPC_TIMEOUT_MS
  ): Promise<T> {
    const id = server.nextRequestId;
    server.nextRequestId =
      server.nextRequestId >= Number.MAX_SAFE_INTEGER ? 1 : server.nextRequestId + 1;
    const payload = JSON.stringify({ id, method, params });
    if (payload.includes('\n') || payload.includes('\r')) {
      throw createRemoteError(
        'Remote request payload contains unexpected line breaks',
        undefined,
        `method=${method}; connectionId=${server.connectionId}`
      );
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let writeTimeout: ReturnType<typeof setTimeout> | undefined;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        if (writeTimeout) {
          clearTimeout(writeTimeout);
        }
        server.pending.delete(id);
        callback();
      };

      server.pending.set(id, {
        resolve: (value) => finish(() => resolve(value as T)),
        reject: (error) => finish(() => reject(error)),
      });

      writeTimeout = setTimeout(
        () => {
          finish(() =>
            reject(
              createRemoteError(
                'Remote request write timed out',
                undefined,
                `method=${method}; connectionId=${server.connectionId}`
              )
            )
          );
        },
        Math.max(timeoutMs, BOOTSTRAP_TIMEOUT_MS)
      );

      server.proc.stdin.write(`${payload}\n`, 'utf8', (error) => {
        if (error) {
          finish(() => reject(error));
          return;
        }
        if (writeTimeout) {
          clearTimeout(writeTimeout);
          writeTimeout = undefined;
        }
      });

      if (timeoutMs) {
        timeout = setTimeout(() => {
          finish(() =>
            reject(
              createRemoteError(
                'Remote request timed out',
                undefined,
                `method=${method}; connectionId=${server.connectionId}`
              )
            )
          );
        }, timeoutMs);
      }
    });
  }

  private async cleanupOldRuntimeVersions(
    server: RemoteServerProcess,
    paths: RuntimeInstallPaths
  ): Promise<void> {
    const runtime = await this.resolveRuntime(server.profile, false);
    await this.cleanupOldRuntimeVersionsOnHost(server.profile, runtime, paths, server);
  }

  private async cleanupOldRuntimeVersionsOnHost(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    server?: RemoteServerProcess
  ): Promise<void> {
    const entries = await this.listRuntimeVersionDirectories(profile, runtime, paths, server);
    for (const entry of entries) {
      if (entry.name === REMOTE_SERVER_VERSION) {
        continue;
      }
      await this.deleteRuntimeVersionDirectory(profile, runtime, entry.path, server);
    }
  }

  private getCachedRuntimeVerification(
    connectionId: string,
    installDir: string
  ): CachedRuntimeVerification | null {
    const cached = this.runtimeVerifications.get(connectionId);
    if (!cached || cached.version !== REMOTE_SERVER_VERSION || cached.installDir !== installDir) {
      return null;
    }
    return cached;
  }

  private cacheRuntimeVerification(
    connectionId: string,
    installDir: string,
    result: RemoteRuntimeVerificationResult
  ): void {
    this.runtimeVerifications.set(connectionId, {
      version: REMOTE_SERVER_VERSION,
      installDir,
      verifiedAt: now(),
      result,
    });
  }

  private cacheRuntimeVerificationFailure(
    connectionId: string,
    installDir: string,
    error: string
  ): void {
    this.runtimeVerifications.set(connectionId, {
      version: REMOTE_SERVER_VERSION,
      installDir,
      verifiedAt: now(),
      error,
    });
  }

  private invalidateRuntimeVerification(connectionId: string): void {
    this.runtimeVerifications.delete(connectionId);
    this.pendingRuntimeVerifications.delete(connectionId);
  }

  private async isExpectedRuntimeInstalled(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths
  ): Promise<boolean> {
    return this.remoteFileExists(profile, runtime, paths.serverPath);
  }

  private applyHandshakeRuntime(
    connectionId: string,
    runtime: ConnectionRuntime,
    handshake: RemoteDaemonPingResult
  ): ConnectionRuntime {
    const nextRuntime: ConnectionRuntime = {
      ...runtime,
      platform: handshake.platform === 'linux' ? 'linux' : runtime.platform,
      arch:
        typeof handshake.arch === 'string'
          ? this.normalizeArchitecture(handshake.arch)
          : runtime.arch,
      homeDir: handshake.homeDir ? normalizeRemotePath(handshake.homeDir) : runtime.homeDir,
      gitVersion: handshake.gitVersion?.trim() || runtime.gitVersion,
    };
    this.runtimes.set(connectionId, nextRuntime);
    return nextRuntime;
  }

  private scheduleBackgroundRuntimeVerification(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    currentState: RemoteVerificationState | undefined
  ): void {
    if (currentState === 'verified') {
      return;
    }
    if (this.pendingRuntimeVerifications.has(profile.id)) {
      return;
    }
    if (!this.servers.has(profile.id) && currentState !== 'failed') {
      return;
    }

    const verificationTask = (async () => {
      try {
        if (!(await this.isExpectedRuntimeInstalled(profile, runtime, paths))) {
          return;
        }
        const verification = await this.measureDiagnosticStep(profile.id, 'verify-runtime', () =>
          this.verifyManagedRuntime(profile, runtime, paths)
        );
        this.cacheRuntimeVerification(profile.id, paths.installDir, verification);
        this.setStatus(profile.id, (status) => ({
          ...status,
          verificationState: 'verified',
          ptySupported: verification.ptySupported ?? status.ptySupported,
          ptyError:
            verification.ptySupported === true
              ? undefined
              : (verification.ptyError ?? status.ptyError),
        }));
      } catch (error) {
        const detail =
          getRemoteErrorDetail(error) || translateRemote('Remote server bootstrap timed out');
        this.cacheRuntimeVerificationFailure(profile.id, paths.installDir, detail);
        const verificationPtyError = extractRemotePtyError(detail);
        this.setStatus(profile.id, (status) => ({
          ...status,
          verificationState: 'failed',
          ptySupported: verificationPtyError ? false : status.ptySupported,
          ptyError: verificationPtyError ?? status.ptyError,
        }));
      } finally {
        this.pendingRuntimeVerifications.delete(profile.id);
      }
    })();

    this.pendingRuntimeVerifications.set(profile.id, verificationTask);
  }

  private async listInstalledRuntimeVersions(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths
  ): Promise<string[]> {
    const entries = await this.listRuntimeVersionDirectories(profile, runtime, paths);
    return entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  }

  private async deleteInstalledRuntimeVersions(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths
  ): Promise<void> {
    const entries = await this.listRuntimeVersionDirectories(profile, runtime, paths);
    for (const entry of entries) {
      await this.deleteRuntimeVersionDirectory(profile, runtime, entry.path);
    }
  }

  private async listRuntimeVersionDirectories(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    server?: RemoteServerProcess
  ): Promise<RemoteDirectoryEntry[]> {
    const entries = server
      ? await this.callServer<RemoteDirectoryEntry[]>(server, 'fs:list', { path: paths.installDir })
      : await this.listRemoteDirectory(profile, runtime, paths.installDir);

    const runtimeDirectories: RemoteDirectoryEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory || !isVersionDirectoryName(entry.name)) {
        continue;
      }
      const serverFilePath = normalizeRemotePath(`${entry.path}/${SERVER_FILENAME}`);
      const serverFileExists = server
        ? await this.callServer<boolean>(server, 'fs:exists', { path: serverFilePath })
        : await this.remoteFileExists(profile, runtime, serverFilePath);
      if (!serverFileExists) {
        continue;
      }
      runtimeDirectories.push({
        name: entry.name,
        path: normalizeRemotePath(entry.path),
        isDirectory: true,
      });
    }

    return runtimeDirectories;
  }

  private async deleteRuntimeVersionDirectory(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    directoryPath: string,
    server?: RemoteServerProcess
  ): Promise<void> {
    if (server) {
      await this.callServer(server, 'fs:delete', {
        path: directoryPath,
        recursive: true,
      });
      return;
    }

    await this.deleteRemotePath(profile, runtime, directoryPath);
  }

  private async listRemoteDirectory(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    dirPath: string
  ): Promise<RemoteDirectoryEntry[]> {
    const output = await this.execRemoteShScript(
      profile,
      runtime.resolvedHost,
      [
        'dir=$1',
        '[ -d "$dir" ] || exit 0',
        'for entry in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do',
        '  [ -e "$entry" ] || continue',
        '  name=$(basename "$entry")',
        '  if [ -d "$entry" ]; then is_directory=true; else is_directory=false; fi',
        '  printf "%s\\t%s\\t%s\\n" "$name" "$entry" "$is_directory"',
        'done',
      ],
      [dirPath]
    );
    const trimmed = output.trim();
    if (!trimmed) {
      return [];
    }

    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = '', path = '', isDirectory = 'false'] = line.split('\t');
        return {
          name,
          path: normalizeRemotePath(path),
          isDirectory: isDirectory === 'true',
        };
      });
  }

  private async remoteFileExists(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    targetPath: string
  ): Promise<boolean> {
    const command = [`test -f ${shellQuote(targetPath)} && printf true || printf false`];
    const output = await this.execSsh(profile, command, runtime.resolvedHost);
    return output.trim() === 'true';
  }

  private async deleteRemotePath(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    targetPath: string
  ): Promise<void> {
    const command = [`rm -rf ${shellQuote(targetPath)}`];
    await this.execSsh(profile, command, runtime.resolvedHost);
  }

  private async resolveRuntime(
    profile: ConnectionProfile,
    refresh: boolean,
    options: { includeGitVersion?: boolean } = {}
  ): Promise<ConnectionRuntime> {
    const cached = this.runtimes.get(profile.id);
    if (
      cached &&
      !refresh &&
      (options.includeGitVersion !== true || cached.gitVersion !== undefined)
    ) {
      return cached;
    }

    this.setStatus(profile.id, (current) => ({
      ...current,
      phase: 'resolving-platform',
      phaseLabel: phaseLabelFor('resolving-platform'),
      connected: false,
    }));

    const resolvedHost = await this.ensureHostTrusted(profile);
    const envInfoResult = await this.runRemoteShScript(profile, resolvedHost, [
      'platform=$(uname -s 2>/dev/null | tr "[:upper:]" "[:lower:]" || printf "")',
      'arch=$(uname -m 2>/dev/null || printf "")',
      'home=$(printf %s "$HOME")',
      'libc=""',
      'if command -v getconf >/dev/null 2>&1 && getconf GNU_LIBC_VERSION >/dev/null 2>&1; then',
      '  libc="glibc"',
      'elif command -v ldd >/dev/null 2>&1; then',
      '  ldd_output=$(ldd --version 2>&1 || true)',
      '  case "$ldd_output" in',
      '    *musl*) libc="musl" ;;',
      '    *glibc*|*GNU\\ libc*) libc="glibc" ;;',
      '  esac',
      'fi',
      `printf '${REMOTE_ENV_INFO_PREFIX}platform=%s\\n' "$platform"`,
      `printf '${REMOTE_ENV_INFO_PREFIX}arch=%s\\n' "$arch"`,
      `printf '${REMOTE_ENV_INFO_PREFIX}homeDir=%s\\n' "$home"`,
      `printf '${REMOTE_ENV_INFO_PREFIX}libc=%s\\n' "$libc"`,
    ]);

    if (envInfoResult.code !== 0) {
      throw createRemoteError(
        'Failed to detect remote platform',
        undefined,
        this.formatCommandResultDetail(envInfoResult)
      );
    }

    const envInfoRaw = envInfoResult.stdout.trim();
    const envInfo = parseRemoteEnvInfo(envInfoRaw);

    if (!envInfo) {
      throw createRemoteError(
        'Failed to parse remote platform information',
        undefined,
        [envInfoRaw, envInfoResult.stderr.trim()].filter(Boolean).join('\n') ||
          translateRemote('Remote platform probe returned no environment payload')
      );
    }

    if (envInfo.platform !== 'linux') {
      throw createRemoteError(
        LINUX_ONLY_REMOTE_ERROR,
        undefined,
        `Unsupported platform: ${envInfo.platform || '<unknown>'}`
      );
    }

    if (envInfo.libc !== 'glibc') {
      throw createRemoteError(
        LINUX_ONLY_REMOTE_ERROR,
        undefined,
        `Unsupported libc: ${envInfo.libc || '<unknown>'}`
      );
    }

    const runtime: ConnectionRuntime = {
      platform: 'linux',
      arch: this.normalizeArchitecture(envInfo.arch),
      homeDir: normalizeRemotePath(envInfo.homeDir || '/'),
      gitVersion:
        options.includeGitVersion === true
          ? (await this.getRemoteGitVersion(profile, resolvedHost)).trim() || undefined
          : cached?.gitVersion,
      libc: 'glibc',
      resolvedHost,
    };

    this.runtimes.set(profile.id, runtime);
    return runtime;
  }

  private normalizeArchitecture(value: string | undefined): RemoteArchitecture {
    const normalized = (value || '').toLowerCase();
    if (normalized.includes('arm64') || normalized.includes('aarch64')) {
      return 'arm64';
    }
    if (
      normalized.includes('x64') ||
      normalized.includes('x86_64') ||
      normalized.includes('amd64')
    ) {
      return 'x64';
    }
    throw createRemoteError(
      LINUX_ONLY_REMOTE_ERROR,
      undefined,
      `Unsupported architecture: ${value || '<empty>'}`
    );
  }

  private async getRemoteGitVersion(
    profile: ConnectionProfile,
    resolvedHost: ResolvedHostConfig
  ): Promise<string> {
    try {
      return await this.execSsh(profile, ['git --version'], resolvedHost);
    } catch {
      return '';
    }
  }

  private async ensureHostTrusted(profile: ConnectionProfile): Promise<ResolvedHostConfig> {
    const config = await this.resolveHostConfig(profile);
    const appKnownHostsPath = getAppKnownHostsPath();
    const verifiedConfig = {
      ...config,
      userKnownHostsFiles: uniquePaths([appKnownHostsPath, ...config.userKnownHostsFiles]),
    };
    if (await this.isTrustedHost(verifiedConfig)) {
      return verifiedConfig;
    }

    await mkdir(getRemoteStateRoot(), { recursive: true });
    let scannedKeys = '';
    try {
      scannedKeys = await this.scanHostKeys(verifiedConfig);
      const fingerprints = await this.buildFingerprints(
        scannedKeys,
        verifiedConfig.knownHost,
        verifiedConfig.port
      );
      await this.authBroker.requestHostVerification(profile, {
        host: verifiedConfig.knownHost,
        port: verifiedConfig.port,
        fingerprints,
      });
      await appendFile(
        appKnownHostsPath,
        scannedKeys.endsWith('\n') ? scannedKeys : `${scannedKeys}\n`,
        'utf8'
      );
      return verifiedConfig;
    } catch (error) {
      const detail = getRemoteErrorDetail(error);
      if (detail === translateRemote('SSH authentication was cancelled')) {
        throw error;
      }
      // Fall back to a real SSH handshake when keyscan cannot produce usable fingerprints.
    }

    await this.verifyHostTrustWithSshHandshake(profile, verifiedConfig);
    if (await this.isTrustedHost(verifiedConfig)) {
      return verifiedConfig;
    }

    throw createRemoteError('Failed to verify remote host with SSH handshake');
  }

  private async resolveHostConfig(profile: ConnectionProfile): Promise<ResolvedHostConfig> {
    const cached = this.resolvedHosts.get(profile.id);
    if (cached) {
      return cached;
    }

    const result = await runLocalCommand('ssh', ['-G', profile.sshTarget]);
    if (result.code !== 0) {
      throw createRemoteError('Failed to resolve SSH configuration', undefined, result.stderr);
    }

    const config = parseSshConfig(result.stdout);
    const host = config.get('hostname')?.[0];
    const port = Number.parseInt(config.get('port')?.[0] ?? '22', 10) || 22;
    const appKnownHostsPath = getAppKnownHostsPath();
    const userKnownHostsFiles = uniquePaths([
      appKnownHostsPath,
      ...(config.get('userknownhostsfile') ?? []),
    ]);
    const globalKnownHostsFiles = uniquePaths(config.get('globalknownhostsfile') ?? []);

    if (!host) {
      throw createRemoteError('Failed to resolve SSH target for {{connectionId}}', {
        connectionId: profile.id,
      });
    }

    const knownHost = config.get('hostkeyalias')?.[0] || host;
    const resolved = {
      host,
      port,
      knownHost,
      userKnownHostsFiles,
      globalKnownHostsFiles,
    };
    this.resolvedHosts.set(profile.id, resolved);
    return resolved;
  }

  private async isKnownHost(host: string, port: number, files: string[]): Promise<boolean> {
    const queries = getKnownHostQueries(host, port);
    for (const file of files) {
      if (!(await pathExists(file))) {
        continue;
      }
      for (const query of queries) {
        const result = await runLocalCommand('ssh-keygen', ['-F', query, '-f', file]);
        if (result.code === 0) {
          return true;
        }
      }
    }
    return false;
  }

  private async isTrustedHost(config: ResolvedHostConfig): Promise<boolean> {
    return this.isKnownHost(
      config.knownHost,
      config.port,
      uniquePaths([...config.userKnownHostsFiles, ...config.globalKnownHostsFiles])
    );
  }

  private async buildFingerprints(
    scannedKeys: string,
    host: string,
    port: number
  ): Promise<RemoteHostFingerprint[]> {
    const tempPath = join(
      app.getPath('temp'),
      `enso-remote-host-${host.replace(/[^a-z0-9_.-]/gi, '_')}-${port}-${randomUUID()}.keys`
    );

    try {
      await writeFile(tempPath, scannedKeys, 'utf8');
      const result = await runLocalCommand('ssh-keygen', ['-lf', tempPath]);
      if (result.code !== 0) {
        throw createRemoteError(
          'Failed to parse remote host fingerprint',
          undefined,
          result.stderr
        );
      }
      const fingerprints = result.stdout
        .split(/\r?\n/)
        .map((line) => parseFingerprintLine(line, host, port))
        .filter((item): item is RemoteHostFingerprint => item !== null);
      if (fingerprints.length === 0) {
        throw createRemoteError('Failed to parse remote host fingerprint');
      }
      return fingerprints;
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }

  private async scanHostKeys(config: ResolvedHostConfig): Promise<string> {
    const result = await runLocalCommand(
      'ssh-keyscan',
      ['-T', String(SSH_KEYSCAN_TIMEOUT_SECONDS), '-p', String(config.port), config.host],
      {
        LANG: 'C',
        LC_ALL: 'C',
      }
    );

    const scannedKeys = normalizeScannedKnownHostsEntries(
      result.stdout,
      config.knownHost,
      config.port
    );
    if (scannedKeys) {
      return scannedKeys;
    }

    throw createRemoteError('Failed to scan remote host fingerprint', undefined, result.stderr);
  }

  private async verifyHostTrustWithSshHandshake(
    profile: ConnectionProfile,
    resolvedHost: ResolvedHostConfig
  ): Promise<void> {
    const result = await this.runHostTrustProbe(profile, resolvedHost);
    const detail = this.formatCommandResultDetail(result);
    if (
      result.code === 0 ||
      (await this.isTrustedHost(resolvedHost)) ||
      (detail && isAuthenticationFailure(detail))
    ) {
      return;
    }

    if (result.promptShown) {
      throw createRemoteError(
        'Failed to verify remote host with SSH handshake',
        undefined,
        detail || translateRemote('SSH handshake ended before host verification')
      );
    }

    throw createRemoteError(
      'Failed to verify remote host with SSH handshake',
      undefined,
      detail || translateRemote('SSH handshake timed out before host verification')
    );
  }

  private async buildSshContext(
    profile: ConnectionProfile,
    resolvedHost: ResolvedHostConfig
  ): Promise<SshContext> {
    await mkdir(getRemoteStateRoot(), { recursive: true });
    const askpassEnv = await this.authBroker.getAskpassEnv(profile, undefined, resolvedHost.port);
    const env = {
      ...getEnvForCommand(),
      ...askpassEnv,
      LANG: 'C',
      LC_ALL: 'C',
    };
    const optionArgs = [
      '-o',
      'BatchMode=no',
      '-o',
      'PreferredAuthentications=publickey,keyboard-interactive,password',
      '-o',
      'NumberOfPasswordPrompts=1',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      `UserKnownHostsFile=${resolvedHost.userKnownHostsFiles.join(' ')}`,
    ];
    return { env, optionArgs };
  }

  private async runHostTrustProbe(
    profile: ConnectionProfile,
    resolvedHost: ResolvedHostConfig
  ): Promise<HostTrustProbeResult> {
    const env = {
      ...getEnvForCommand(),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'C',
      LC_ALL: 'C',
    } as Record<string, string>;
    const args = [
      '-o',
      'BatchMode=no',
      '-o',
      'StrictHostKeyChecking=ask',
      '-o',
      `UserKnownHostsFile=${resolvedHost.userKnownHostsFiles.join(' ')}`,
      '-o',
      'PreferredAuthentications=none',
      '-o',
      'NumberOfPasswordPrompts=0',
      '-o',
      'PasswordAuthentication=no',
      '-o',
      'KbdInteractiveAuthentication=no',
      '-o',
      'PubkeyAuthentication=no',
      '-o',
      `ConnectTimeout=${SSH_KEYSCAN_TIMEOUT_SECONDS}`,
      profile.sshTarget,
      'true',
    ];

    return new Promise((resolve, reject) => {
      let proc: pty.IPty;
      try {
        proc = pty.spawn('ssh', args, {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME || process.env.USERPROFILE || '/',
          env,
        });
      } catch (error) {
        reject(error);
        return;
      }

      let output = '';
      let promptShown = false;
      let settled = false;
      let pendingPrompt: Promise<void> | null = null;
      let dataDisposable: { dispose(): void } | null = null;
      let exitDisposable: { dispose(): void } | null = null;

      const cleanup = () => {
        clearTimeout(timer);
        const disposables = [dataDisposable, exitDisposable];
        dataDisposable = null;
        exitDisposable = null;

        for (const disposable of disposables) {
          if (!disposable) {
            continue;
          }
          try {
            disposable.dispose();
          } catch {
            // Ignore
          }
        }

        try {
          killProcessTree(proc, 'SIGTERM');
        } catch {
          // Ignore
        }
      };

      const finish = (result: HostTrustProbeResult) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      };

      const abort = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };

      const maybeHandlePrompt = () => {
        if (promptShown || pendingPrompt) {
          return;
        }
        const hostPrompt = parseHostVerificationPrompt(
          output,
          resolvedHost.knownHost,
          resolvedHost.port
        );
        if (!hostPrompt) {
          return;
        }

        promptShown = true;
        pendingPrompt = this.authBroker
          .requestHostVerification(profile, hostPrompt, output)
          .then(() => {
            if (!settled) {
              proc.write('yes\n');
            }
          })
          .catch((error) => {
            if (!settled) {
              proc.write('no\n');
            }
            abort(error);
          })
          .finally(() => {
            pendingPrompt = null;
          });
      };

      const timer = setTimeout(() => {
        finish({
          stdout: '',
          stderr: output,
          code: null,
          promptShown,
        });
      }, SSH_HOST_VERIFICATION_PROMPT_TIMEOUT_MS);

      dataDisposable = proc.onData((chunk) => {
        output += chunk;
        maybeHandlePrompt();
      });
      exitDisposable = proc.onExit(({ exitCode }) => {
        if (settled) {
          return;
        }
        if (pendingPrompt) {
          void pendingPrompt.finally(() => {
            finish({
              stdout: '',
              stderr: output,
              code: exitCode,
              promptShown,
            });
          });
          return;
        }
        finish({
          stdout: '',
          stderr: output,
          code: exitCode,
          promptShown,
        });
      });
    });
  }

  private async resolveProfile(
    profileOrId: string | ConnectionProfile
  ): Promise<ConnectionProfile> {
    await this.loadProfiles();
    if (typeof profileOrId !== 'string') {
      return profileOrId;
    }
    const profile = this.profiles.get(profileOrId);
    if (!profile) {
      throw createRemoteError('Unknown remote profile: {{connectionId}}', {
        connectionId: profileOrId,
      });
    }
    return profile;
  }

  private async flush(): Promise<void> {
    const path = getRemoteSettingsPath();
    const profiles = this.listProfiles().map((profile) => ({ ...profile }));
    const flushTask = this.profileFlushQueue
      .catch(() => {})
      .then(async () => {
        await mkdir(app.getPath('userData'), { recursive: true });
        await writeJsonAtomically(path, profiles);
      });
    this.profileFlushQueue = flushTask;
    await flushTask;
  }

  private async uploadFileOverScp(
    profile: ConnectionProfile,
    localPath: string,
    remotePath: string,
    resolvedHost: ResolvedHostConfig
  ): Promise<void> {
    const { spawn } = await import('node:child_process');
    const sshContext = await this.buildSshContext(profile, resolvedHost);
    const args = [
      '-o',
      `ConnectTimeout=${SCP_CONNECT_TIMEOUT_SECONDS}`,
      ...sshContext.optionArgs,
      localPath,
      `${profile.sshTarget}:${remotePath}`,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn('scp', args, {
        env: sshContext.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = appendCommandOutput(stdout, chunk.toString());
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = appendCommandOutput(stderr, chunk.toString());
      });
      child.on('error', (error) => {
        finish(() => reject(error));
      });
      child.on('close', (code) => {
        finish(() => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(
            new Error(stderr.trim() || stdout.trim() || `scp exited with code ${code ?? 'unknown'}`)
          );
        });
      });

      const timeout = setTimeout(() => {
        const detail = [stderr.trim(), stdout.trim(), `remotePath=${remotePath}`]
          .filter(Boolean)
          .join('\n');
        finish(() => {
          killProcessTree(child);
          reject(createRemoteError('SCP upload timed out', undefined, detail));
        });
      }, SCP_UPLOAD_TIMEOUT_MS);
    });
  }

  private async runSshCommand(
    profile: ConnectionProfile,
    remoteCommand: string[],
    resolvedHost: ResolvedHostConfig,
    timeoutMs = SSH_COMMAND_TIMEOUT_MS
  ): Promise<LocalCommandResult> {
    const { spawn } = await import('node:child_process');
    const sshContext = await this.buildSshContext(profile, resolvedHost);

    return new Promise((resolve, reject) => {
      const child = spawn('ssh', [...sshContext.optionArgs, profile.sshTarget, ...remoteCommand], {
        env: sshContext.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = appendCommandOutput(stdout, chunk.toString());
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = appendCommandOutput(stderr, chunk.toString());
      });
      child.on('error', (error) => {
        finish(() => reject(error));
      });
      child.on('close', (code) => {
        finish(() => {
          const result = { stdout, stderr, code };
          const detail = this.formatCommandResultDetail(result);
          if (detail && isAuthenticationFailure(detail)) {
            this.authBroker.clearSecrets(profile.id);
            this.resolvedHosts.delete(profile.id);
            this.runtimes.delete(profile.id);
            this.invalidateRuntimeVerification(profile.id);
          }
          resolve(result);
        });
      });

      const timeout = setTimeout(() => {
        const detail = [
          stderr.trim(),
          stdout.trim(),
          `target=${profile.sshTarget}`,
          `command=${remoteCommand.join(' ')}`,
        ]
          .filter(Boolean)
          .join('\n');
        finish(() => {
          killProcessTree(child);
          reject(createRemoteError('SSH command timed out', undefined, detail));
        });
      }, timeoutMs);
    });
  }

  private async execSsh(
    profile: ConnectionProfile,
    remoteCommand: string[],
    resolvedHost: ResolvedHostConfig,
    strictExit = true
  ): Promise<string> {
    const result = await this.runSshCommand(profile, remoteCommand, resolvedHost);
    if (result.code === 0 || !strictExit) {
      return result.stdout;
    }

    throw new Error(this.formatCommandResultDetail(result));
  }
}

export const remoteConnectionManager = new RemoteConnectionManager();
