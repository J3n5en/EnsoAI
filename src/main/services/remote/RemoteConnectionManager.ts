import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ConnectionProfile,
  ConnectionTestResult,
  FileEntry,
  RemoteArchitecture,
  RemoteAuthResponse,
  RemoteConnectionDiagnosticStep,
  RemoteConnectionDiagnostics,
  RemoteConnectionPhase,
  RemoteConnectionStatus,
  RemoteHelperStatus,
  RemoteHostFingerprint,
  RemotePlatform,
  RemoteRuntimeStatus,
} from '@shared/types';
import { app } from 'electron';
import { getEnvForCommand } from '../../utils/shell';
import { RemoteAuthBroker } from './RemoteAuthBroker';
import { getRemoteServerSource, REMOTE_SERVER_VERSION } from './RemoteHelperSource';
import { createRemoteError, getRemoteErrorDetail, translateRemote } from './RemoteI18n';
import {
  ensureRemoteRuntimeAsset,
  getRemoteRuntimeAsset,
  MANAGED_REMOTE_NODE_VERSION,
  MANAGED_REMOTE_RUNTIME_DIR,
  type RemoteRuntimeAsset,
} from './RemoteRuntimeAssets';

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

export interface RemoteConnectionRuntimeInfo {
  profile: ConnectionProfile;
  sshTarget: string;
  platform: RemotePlatform;
  homeDir: string;
  nodeVersion: string;
  gitVersion?: string;
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
const MAX_REMOTE_DIAGNOSTIC_LINES = 40;
const MAX_REMOTE_DIAGNOSTIC_CHARS = 8_192;
const REMOTE_PTY_UNAVAILABLE_PREFIX = 'REMOTE_PTY_UNAVAILABLE:';
const RUNTIME_MANIFEST_FILENAME = 'enso-remote-runtime-manifest.json';
const REMOTE_SERVER_SOURCE = normalizeLineEndings(getRemoteServerSource());
const REMOTE_SERVER_SOURCE_SHA256 = createHash('sha256').update(REMOTE_SERVER_SOURCE).digest('hex');

type RemoteServerLaunchMode = 'bridge' | 'ensure-daemon' | 'self-test' | 'stop-daemon';

function now(): number {
  return Date.now();
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n');
}

function stripHashbang(input: string): string {
  return input.replace(/^#!.*\r?\n/, '');
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
  env?: Record<string, string>
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
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

export class RemoteConnectionManager {
  private profiles = new Map<string, ConnectionProfile>();
  private servers = new Map<string, RemoteServerProcess>();
  private pendingConnections = new Map<string, Promise<RemoteConnectionStatus>>();
  private runtimes = new Map<string, ConnectionRuntime>();
  private volatileStatuses = new Map<string, RemoteConnectionStatus>();
  private diagnostics = new Map<string, RemoteConnectionDiagnostics>();
  private disconnectListeners = new Map<string, Set<() => void>>();
  private readonly authBroker = new RemoteAuthBroker();
  private loaded = false;

  async loadProfiles(): Promise<ConnectionProfile[]> {
    if (this.loaded) {
      return this.listProfiles();
    }

    const path = getRemoteSettingsPath();
    if (await pathExists(path)) {
      try {
        const content = await readFile(path, 'utf8');
        const parsed = JSON.parse(content) as ConnectionProfile[];
        for (const profile of parsed) {
          this.profiles.set(profile.id, profile);
        }
      } catch (error) {
        console.warn('[remote] Failed to read profiles:', error);
      }
    }

    this.loaded = true;
    return this.listProfiles();
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
    const profile: ConnectionProfile = {
      id: input.id ?? randomUUID(),
      name: input.name.trim(),
      sshTarget: input.sshTarget.trim(),
      runtimeInstallDir:
        input.runtimeInstallDir?.trim() || input.helperInstallDir?.trim() || undefined,
      helperInstallDir: input.helperInstallDir?.trim() || undefined,
      platformHint: input.platformHint,
      createdAt: existing?.createdAt ?? input.createdAt ?? now(),
      updatedAt: now(),
    };

    this.profiles.set(profile.id, profile);
    this.runtimes.delete(profile.id);
    this.authBroker.clearSecrets(profile.id);
    await this.flush();
    return profile;
  }

  async deleteProfile(profileId: string): Promise<void> {
    await this.loadProfiles();
    await this.disconnect(profileId).catch(() => {});
    this.profiles.delete(profileId);
    this.runtimes.delete(profileId);
    this.volatileStatuses.delete(profileId);
    this.diagnostics.delete(profileId);
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
      const runtime = await this.resolveRuntime(profile, true);
      return {
        success: true,
        platform: runtime.platform,
        arch: runtime.arch,
        homeDir: runtime.homeDir,
        nodeVersion: MANAGED_REMOTE_NODE_VERSION,
        gitVersion: runtime.gitVersion,
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

    try {
      const runtime = await this.resolveRuntime(profile, false);
      const paths = this.getRuntimeInstallPaths(profile, runtime);
      const installedVersions = await this.listInstalledRuntimeVersions(profile, runtime, paths);
      let error: string | undefined;
      if (installedVersions.includes(REMOTE_SERVER_VERSION)) {
        try {
          const verification = await this.verifyManagedRuntime(profile, runtime, paths);
          ptySupported = verification.ptySupported ?? ptySupported;
          ptyError =
            verification.ptySupported === true ? undefined : (verification.ptyError ?? ptyError);
        } catch (verificationError) {
          error = getRemoteErrorDetail(verificationError);
          const verificationPtyError = extractRemotePtyError(error);
          if (verificationPtyError) {
            ptySupported = false;
            ptyError = verificationPtyError;
          }
        }
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
    await this.stopRemoteDaemon(profile, runtime, paths).catch(() => {});
    await this.installManagedRuntime(profile, runtime, paths);
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
    await this.stopRemoteDaemon(profile, runtime, paths).catch(() => {});
    await this.installManagedRuntime(profile, runtime, paths);
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
    await this.stopRemoteDaemon(profile, runtime, paths).catch(() => {});
    await this.deleteInstalledRuntimeVersions(profile, runtime, paths);
    return this.getRuntimeStatus(profile);
  }

  async deleteHelper(profileOrId: string | ConnectionProfile): Promise<RemoteHelperStatus> {
    return this.deleteRuntime(profileOrId);
  }

  async connect(profileOrId: string | ConnectionProfile): Promise<RemoteConnectionStatus> {
    const profile = await this.resolveProfile(profileOrId);
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
    const server = this.servers.get(connectionId);
    if (!server) return;
    this.finalizeServerShutdown(server);
    server.proc.kill('SIGTERM');
  }

  async browseRoots(profileOrId: string | ConnectionProfile): Promise<string[]> {
    const profile = await this.resolveProfile(profileOrId);
    const runtime = await this.resolveRuntime(profile, false);
    if (runtime.platform === 'win32') {
      return [runtime.homeDir.replace(/\\/g, '/')];
    }
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
    params: Record<string, unknown>
  ): Promise<T> {
    const server = this.servers.get(connectionId) ?? (await this.ensureConnected(connectionId));
    return this.callServer<T>(server, method, params);
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

  async cleanup(): Promise<void> {
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

    return next;
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
    this.setStatus(profile.id, (current) => ({
      ...current,
      connected: false,
      phase: 'probing-host',
      phaseLabel: phaseLabelFor('probing-host'),
      error: undefined,
      runtimeVersion: MANAGED_REMOTE_NODE_VERSION,
      serverVersion: REMOTE_SERVER_VERSION,
      helperVersion: REMOTE_SERVER_VERSION,
    }));

    const runtime = await this.measureDiagnosticStep(profile.id, 'resolve-runtime', () =>
      this.resolveRuntime(profile, false)
    );
    const paths = this.getRuntimeInstallPaths(profile, runtime);

    try {
      const verification = await this.measureDiagnosticStep(profile.id, 'verify-runtime', () =>
        this.verifyManagedRuntime(profile, runtime, paths)
      );
      return await this.startConnectedServer(profile, runtime, paths, verification);
    } catch (reuseError) {
      const detail = reuseError instanceof Error ? reuseError.message : String(reuseError);
      console.warn(
        `[remote:${profile.name}] Failed to reuse remote runtime server, reinstalling: ${detail}`
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
    return this.startConnectedServer(profile, runtime, paths, verification);
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
    const archivePath = normalizeRemotePath(
      `${incomingDir}/runtime.${runtime.platform === 'win32' ? 'zip' : 'tar.gz'}`
    );
    const runtimeRootDir = normalizeRemotePath(`${versionDir}/runtime`);
    const nodeFolder =
      runtime.platform === 'win32'
        ? `node-v${MANAGED_REMOTE_NODE_VERSION}-win-${runtime.arch}`
        : `node-v${MANAGED_REMOTE_NODE_VERSION}-${runtime.platform}-${runtime.arch}`;
    const nodePath =
      runtime.platform === 'win32'
        ? normalizeRemotePath(`${runtimeRootDir}/${nodeFolder}/node.exe`)
        : normalizeRemotePath(`${runtimeRootDir}/${nodeFolder}/bin/node`);

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
        runtime.platform === 'win32'
          ? [
              `$paths = @(${this.toPowerShellString(paths.installDir)}, ${this.toPowerShellString(
                paths.versionDir
              )}, ${this.toPowerShellString(paths.incomingDir)}, ${this.toPowerShellString(
                paths.runtimeRootDir
              )})`,
              'foreach ($path in $paths) { New-Item -ItemType Directory -Force -Path $path | Out-Null }',
            ].join('; ')
          : runtime.platform === 'linux'
            ? `mkdir -p ${shellQuote(paths.installDir)} ${shellQuote(paths.versionDir)} ${shellQuote(paths.incomingDir)}`
            : `mkdir -p ${shellQuote(paths.installDir)} ${shellQuote(paths.versionDir)} ${shellQuote(paths.incomingDir)} ${shellQuote(paths.runtimeRootDir)}`,
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

  private async extractManagedRuntime(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    asset: RemoteRuntimeAsset
  ): Promise<void> {
    const command =
      runtime.platform === 'win32'
        ? [
            'powershell',
            '-NoProfile',
            '-Command',
            [
              `if (Test-Path -LiteralPath ${this.toPowerShellString(paths.runtimeRootDir)}) { Remove-Item -LiteralPath ${this.toPowerShellString(paths.runtimeRootDir)} -Force -Recurse }`,
              `New-Item -ItemType Directory -Force -Path ${this.toPowerShellString(paths.runtimeRootDir)} | Out-Null`,
              `Expand-Archive -LiteralPath ${this.toPowerShellString(paths.archivePath)} -DestinationPath ${this.toPowerShellString(paths.runtimeRootDir)} -Force`,
            ].join('; '),
          ]
        : runtime.platform === 'linux'
          ? [
              [
                `rm -rf ${shellQuote(paths.runtimeRootDir)}`,
                `rm -rf ${shellQuote(paths.nodeModulesPath)}`,
                `rm -f ${shellQuote(paths.serverPath)}`,
                `mkdir -p ${shellQuote(paths.versionDir)}`,
                `tar -xzf ${shellQuote(paths.archivePath)} -C ${shellQuote(paths.versionDir)}`,
              ].join(' && '),
            ]
          : [
              `rm -rf ${shellQuote(paths.runtimeRootDir)} && mkdir -p ${shellQuote(paths.runtimeRootDir)} && tar -xzf ${shellQuote(paths.archivePath)} -C ${shellQuote(paths.runtimeRootDir)}`,
            ];

    await this.execSsh(profile, command, runtime.resolvedHost);

    const nodeExists = await this.remoteFileExists(profile, runtime, paths.nodePath);
    if (!nodeExists) {
      throw new Error(
        `Managed remote runtime node executable not found after extract: ${asset.archiveName}`
      );
    }

    if (runtime.platform !== 'win32') {
      await this.execSsh(profile, [`chmod +x ${shellQuote(paths.nodePath)}`], runtime.resolvedHost);
    }
  }

  private async syncRemoteServerSource(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    serverPath: string
  ): Promise<void> {
    const tempPath = join(
      app.getPath('temp'),
      `enso-remote-server-${profile.id}-${randomUUID()}.cjs`
    );
    try {
      await this.validateRemoteServerSource(REMOTE_SERVER_SOURCE);
      await writeFile(tempPath, REMOTE_SERVER_SOURCE, 'utf8');
      await this.uploadFileOverScp(profile, tempPath, serverPath, runtime.resolvedHost);

      if (runtime.platform !== 'win32') {
        await this.execSsh(profile, [`chmod +x ${shellQuote(serverPath)}`], runtime.resolvedHost);
      }
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
      linuxPtyRequired: runtime.platform === 'linux',
      helperSourceSha256: REMOTE_SERVER_SOURCE_SHA256,
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
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    mode: RemoteServerLaunchMode
  ): string {
    return this.buildRemoteServerCommandWithArgs(runtime, paths, [mode]);
  }

  private buildRemoteServerCommandWithArgs(
    runtime: ConnectionRuntime,
    paths: RuntimeInstallPaths,
    args: string[]
  ): string {
    if (runtime.platform === 'win32') {
      const quotedArgs = args.map((arg) => `--${arg}`).join(' ');
      return `"${paths.nodePath.replace(/\//g, '\\')}" "${paths.serverPath.replace(/\//g, '\\')}" ${quotedArgs}`;
    }

    const quotedArgs = args.map((arg) => `--${arg}`).join(' ');
    return `${shellQuote(paths.nodePath)} ${shellQuote(paths.serverPath)} ${quotedArgs}`;
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
    if (helperSourceSha256 !== REMOTE_SERVER_SOURCE_SHA256) {
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
    paths: RuntimeInstallPaths,
    verification: RemoteRuntimeVerificationResult
  ): Promise<RemoteConnectionStatus> {
    this.setStatus(profile.id, (current) => ({
      ...current,
      phase: 'starting-server',
      phaseLabel: phaseLabelFor('starting-server'),
      platform: runtime.platform,
      arch: runtime.arch,
      runtimeVersion: verification.nodeVersion,
      serverVersion: REMOTE_SERVER_VERSION,
      helperVersion: REMOTE_SERVER_VERSION,
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

      await this.measureDiagnosticStep(profile.id, 'bridge-handshake', () =>
        this.callServer(server, 'daemon:ping', {}, BOOTSTRAP_TIMEOUT_MS)
      );

      const timestamp = now();
      server.status = {
        ...server.status,
        connected: true,
        phase: 'connected',
        phaseLabel: phaseLabelFor('connected'),
        error: undefined,
        platform: verification.platform,
        arch: verification.arch,
        runtimeVersion: verification.nodeVersion,
        serverVersion: REMOTE_SERVER_VERSION,
        helperVersion: REMOTE_SERVER_VERSION,
        ptySupported: verification.ptySupported,
        ptyError: verification.ptyError || undefined,
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
      server.proc.kill('SIGTERM');
      throw failure;
    }
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
          server.proc.emit(`remote:${message.event}`, message.payload);
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
    server.closed = true;
    server.status = {
      ...server.status,
      connected: false,
      phase: detail ? 'failed' : 'idle',
      phaseLabel: detail ? phaseLabelFor('failed') : phaseLabelFor('idle'),
      error: detail,
      lastCheckedAt: timestamp,
      diagnostics: this.updateDiagnostics(
        server.connectionId,
        server.status.phase,
        detail ? 'failed' : 'idle',
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
  }

  private async callServer<T = unknown>(
    server: RemoteServerProcess,
    method: string,
    params: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<T> {
    const id = server.nextRequestId++;
    const payload = JSON.stringify({ id, method, params });

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        server.pending.delete(id);
        callback();
      };

      server.pending.set(id, {
        resolve: (value) => finish(() => resolve(value as T)),
        reject: (error) => finish(() => reject(error)),
      });

      server.proc.stdin.write(`${payload}\n`, 'utf8', (error) => {
        if (error) {
          finish(() => reject(error));
        }
      });

      if (timeoutMs) {
        timeout = setTimeout(() => {
          finish(() => reject(new Error(translateRemote('Remote server bootstrap timed out'))));
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
    const command =
      runtime.platform === 'win32'
        ? [
            'powershell',
            '-NoProfile',
            '-Command',
            [
              `$dir = ${this.toPowerShellString(dirPath)}`,
              'if (-not (Test-Path -LiteralPath $dir)) { Write-Output "[]"; exit 0 }',
              '$entries = Get-ChildItem -LiteralPath $dir -Force | ForEach-Object {',
              '  [PSCustomObject]@{',
              '    name = $_.Name',
              "    path = ($_.FullName -replace '\\\\', '/')",
              '    isDirectory = $_.PSIsContainer',
              '  }',
              '}',
              '$entries | ConvertTo-Json -Compress',
            ].join('; '),
          ]
        : [
            `sh -lc ${shellQuote(
              [
                'dir=$1',
                '[ -d "$dir" ] || exit 0',
                'for entry in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do',
                '  [ -e "$entry" ] || continue',
                '  name=$(basename "$entry")',
                '  if [ -d "$entry" ]; then is_directory=true; else is_directory=false; fi',
                '  printf "%s\\t%s\\t%s\\n" "$name" "$entry" "$is_directory"',
                'done',
              ].join('; ')
            )} sh ${shellQuote(dirPath)}`,
          ];

    const output = await this.execSsh(profile, command, runtime.resolvedHost);
    const trimmed = output.trim();
    if (!trimmed) {
      return [];
    }

    if (runtime.platform === 'win32') {
      const parsed = JSON.parse(trimmed) as RemoteDirectoryEntry | RemoteDirectoryEntry[];
      return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
        ...entry,
        path: normalizeRemotePath(entry.path),
      }));
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
    const command =
      runtime.platform === 'win32'
        ? [
            'powershell',
            '-NoProfile',
            '-Command',
            `if (Test-Path -LiteralPath ${this.toPowerShellString(targetPath)} -PathType Leaf) { Write-Output true } else { Write-Output false }`,
          ]
        : [`test -f ${shellQuote(targetPath)} && printf true || printf false`];
    const output = await this.execSsh(profile, command, runtime.resolvedHost);
    return output.trim() === 'true';
  }

  private async deleteRemotePath(
    profile: ConnectionProfile,
    runtime: ConnectionRuntime,
    targetPath: string
  ): Promise<void> {
    const command =
      runtime.platform === 'win32'
        ? [
            'powershell',
            '-NoProfile',
            '-Command',
            `if (Test-Path -LiteralPath ${this.toPowerShellString(targetPath)}) { Remove-Item -LiteralPath ${this.toPowerShellString(targetPath)} -Recurse -Force }`,
          ]
        : [`rm -rf ${shellQuote(targetPath)}`];
    await this.execSsh(profile, command, runtime.resolvedHost);
  }

  private toPowerShellString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private async resolveRuntime(
    profile: ConnectionProfile,
    refresh: boolean
  ): Promise<ConnectionRuntime> {
    const cached = this.runtimes.get(profile.id);
    if (cached && !refresh) {
      return cached;
    }

    this.setStatus(profile.id, (current) => ({
      ...current,
      phase: 'resolving-platform',
      phaseLabel: phaseLabelFor('resolving-platform'),
      connected: false,
    }));

    const resolvedHost = await this.ensureHostTrusted(profile);
    const envInfoRaw = await this.execSsh(
      profile,
      [
        `sh -lc ${shellQuote(
          [
            'set +e',
            "arch=$(uname -m 2>/dev/null || printf '')",
            'home=$(printf %s "$HOME")',
            'printf \'{"platform":"linux","arch":"%s","homeDir":"%s"}\' "$arch" "$home"',
          ].join('; ')
        )}`,
      ],
      resolvedHost,
      false
    ).catch(async () => {
      return this.execSsh(
        profile,
        [
          'powershell',
          '-NoProfile',
          '-Command',
          [
            "$arch = if ([Environment]::Is64BitOperatingSystem) { if ($env:PROCESSOR_ARCHITECTURE -match 'ARM') { 'arm64' } else { 'x64' } } else { 'x64' }",
            '$homeDir = $HOME',
            'Write-Output (\'{"platform":"win32","arch":"\' + $arch + \'","homeDir":"\' + (($homeDir -replace \'\\\\\', \'/\')) + \'"}\')',
          ].join('; '),
        ],
        resolvedHost,
        false
      );
    });

    const envInfo = JSON.parse(envInfoRaw.trim()) as {
      platform: RemotePlatform;
      arch: string;
      homeDir: string;
    };

    const runtime: ConnectionRuntime = {
      platform: envInfo.platform,
      arch: this.normalizeArchitecture(envInfo.arch),
      homeDir: normalizeRemotePath(envInfo.homeDir),
      gitVersion: (await this.getRemoteGitVersion(profile, resolvedHost)).trim() || undefined,
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
    return 'x64';
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
    const allKnownHostsFiles = uniquePaths([
      ...config.userKnownHostsFiles,
      ...config.globalKnownHostsFiles,
    ]);
    const known = await this.isKnownHost(config.knownHost, config.port, allKnownHostsFiles);
    if (known) {
      return config;
    }

    const appKnownHostsPath = getAppKnownHostsPath();
    await mkdir(getRemoteStateRoot(), { recursive: true });
    const scannedKeys = await this.scanHostKeys(config);
    const fingerprints = await this.buildFingerprints(scannedKeys, config.knownHost, config.port);
    await this.authBroker.requestHostVerification(profile, {
      host: config.knownHost,
      port: config.port,
      fingerprints,
    });
    await appendFile(
      appKnownHostsPath,
      scannedKeys.endsWith('\n') ? scannedKeys : `${scannedKeys}\n`,
      'utf8'
    );

    return {
      ...config,
      userKnownHostsFiles: uniquePaths([appKnownHostsPath, ...config.userKnownHostsFiles]),
    };
  }

  private async resolveHostConfig(profile: ConnectionProfile): Promise<ResolvedHostConfig> {
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
    return {
      host,
      port,
      knownHost,
      userKnownHostsFiles,
      globalKnownHostsFiles,
    };
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

  private async buildSshContext(
    profile: ConnectionProfile,
    resolvedHost: ResolvedHostConfig
  ): Promise<SshContext> {
    await mkdir(getRemoteStateRoot(), { recursive: true });
    const askpassEnv = await this.authBroker.getAskpassEnv(profile);
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
    await mkdir(app.getPath('userData'), { recursive: true });
    await writeFile(path, JSON.stringify(this.listProfiles(), null, 2), 'utf8');
  }

  private async uploadFileOverScp(
    profile: ConnectionProfile,
    localPath: string,
    remotePath: string,
    resolvedHost: ResolvedHostConfig
  ): Promise<void> {
    const { spawn } = await import('node:child_process');
    const sshContext = await this.buildSshContext(profile, resolvedHost);
    const args = [...sshContext.optionArgs, localPath, `${profile.sshTarget}:${remotePath}`];

    await new Promise<void>((resolve, reject) => {
      const child = spawn('scp', args, {
        env: sshContext.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(stderr.trim() || stdout.trim() || `scp exited with code ${code ?? 'unknown'}`)
        );
      });
    });
  }

  private async runSshCommand(
    profile: ConnectionProfile,
    remoteCommand: string[],
    resolvedHost: ResolvedHostConfig
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
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        const result = { stdout, stderr, code };
        const detail = this.formatCommandResultDetail(result);
        if (detail && isAuthenticationFailure(detail)) {
          this.authBroker.clearSecrets(profile.id);
          this.runtimes.delete(profile.id);
        }
        resolve(result);
      });
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
