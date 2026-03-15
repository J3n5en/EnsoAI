import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import type {
  ConnectionProfile,
  RemoteWindowSession,
  SessionStorageDocument,
  SessionTodoTask,
} from '@shared/types';
import { BrowserWindow, type WebContents } from 'electron';
import type { RemoteConnectionRuntimeInfo } from './RemoteConnectionManager';
import { remoteConnectionManager } from './RemoteConnectionManager';
import { normalizeRemotePath, toRemoteVirtualPath } from './RemotePath';

interface ActiveRemoteSession {
  session: RemoteWindowSession;
  storage: SessionStorageDocument;
}

interface RemoteFileReadResult {
  content: string;
  isBinary?: boolean;
}

interface RemoteDirectoryEntry {
  path: string;
  isDirectory: boolean;
  name: string;
}

const STORAGE_VERSION = 2;
const REMOTE_WINDOW_ROOT = '.ensoai/host-windows';
const REMOTE_SETTINGS_PATH = '.ensoai/settings.json';

function now(): number {
  return Date.now();
}

function defaultSettingsData(): Record<string, unknown> {
  return {};
}

function defaultSessionStorageDocument(
  input?: Partial<
    Pick<SessionStorageDocument, 'updatedAt' | 'settingsData' | 'localStorage' | 'todos'>
  >
): SessionStorageDocument {
  return {
    version: STORAGE_VERSION,
    updatedAt: input?.updatedAt ?? now(),
    settingsData: input?.settingsData ?? defaultSettingsData(),
    localStorage: input?.localStorage ?? {},
    todos: input?.todos ?? {},
  };
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildHostKey(runtime: RemoteConnectionRuntimeInfo): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        host: runtime.resolvedHost.host,
        port: runtime.resolvedHost.port,
        homeDir: normalizeRemotePath(runtime.homeDir, runtime.platform),
      })
    )
    .digest('hex')
    .slice(0, 16);

  const basename = runtime.profile.name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${basename || 'remote-host'}-${digest}`;
}

function buildRemoteWindowRoot(homeDir: string, hostKey: string): string {
  const normalizedHome = normalizeRemotePath(homeDir);
  return `${normalizedHome}/${REMOTE_WINDOW_ROOT}/${hostKey}`;
}

function getRemoteStorageRealPath(session: RemoteWindowSession): string {
  return `${buildRemoteWindowRoot(session.remoteHomeDir, session.hostKey)}/session-state.json`;
}

function getRemoteSettingsRealPath(session: RemoteWindowSession): string {
  return `${normalizeRemotePath(session.remoteHomeDir, session.platform)}/${REMOTE_SETTINGS_PATH}`;
}

function buildRemoteSession(
  runtime: RemoteConnectionRuntimeInfo,
  hostKey: string
): RemoteWindowSession {
  const remoteHomeDir = normalizeRemotePath(runtime.homeDir, runtime.platform);
  const storagePath = `${buildRemoteWindowRoot(runtime.homeDir, hostKey)}/session-state.json`;

  return {
    sessionId: randomUUID(),
    connectionId: runtime.profile.id,
    profileId: runtime.profile.id,
    profileName: runtime.profile.name,
    sshTarget: runtime.sshTarget,
    platform: runtime.platform,
    remoteHomeDir,
    storagePath: toRemoteVirtualPath(runtime.profile.id, storagePath),
    hostKey,
  };
}

function parseStorageDocument(content: string): SessionStorageDocument | null {
  const parsed = safeJsonParse<Partial<SessionStorageDocument>>(content);
  if (!parsed || parsed.version !== STORAGE_VERSION) {
    return null;
  }

  return defaultSessionStorageDocument({
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : now(),
    settingsData:
      parsed.settingsData && typeof parsed.settingsData === 'object'
        ? (parsed.settingsData as Record<string, unknown>)
        : defaultSettingsData(),
    localStorage:
      parsed.localStorage && typeof parsed.localStorage === 'object'
        ? (parsed.localStorage as Record<string, string>)
        : {},
    todos:
      parsed.todos && typeof parsed.todos === 'object'
        ? (parsed.todos as Record<string, SessionTodoTask[]>)
        : {},
  });
}

function getWindowId(target: BrowserWindow | WebContents | number): number {
  if (typeof target === 'number') {
    return target;
  }

  if (target instanceof BrowserWindow) {
    return target.id;
  }

  const window = BrowserWindow.fromWebContents(target as WebContents);
  if (!window) {
    throw new Error('Window not found for remote session');
  }
  return window.id;
}

export class RemoteSessionManager {
  private readonly sessions = new Map<number, ActiveRemoteSession>();

  async openSession(profileOrId: string | ConnectionProfile): Promise<ActiveRemoteSession> {
    const status = await remoteConnectionManager.connect(profileOrId);
    const runtime = await remoteConnectionManager.getRuntimeInfo(status.connectionId);

    const hostKey = buildHostKey(runtime);
    const session = buildRemoteSession(runtime, hostKey);
    const [storage, settingsData] = await Promise.all([
      this.measureConnectionStep(session.connectionId, 'load-session-storage', () =>
        this.loadOrCreateStorage(session)
      ),
      this.measureConnectionStep(session.connectionId, 'load-session-settings', () =>
        this.loadOrCreateSettings(session)
      ),
    ]);
    storage.settingsData = settingsData;

    return {
      session,
      storage,
    };
  }

  async attachToWindow(
    target: BrowserWindow | WebContents | number,
    nextState: ActiveRemoteSession
  ): Promise<void> {
    const windowId = getWindowId(target);
    const previous = this.sessions.get(windowId);
    this.sessions.set(windowId, nextState);

    if (previous) {
      await this.flushStorage(previous);
      await this.maybeDisconnect(previous.session.connectionId, windowId);
    }
  }

  hasSession(target: BrowserWindow | WebContents | number): boolean {
    return this.sessions.has(getWindowId(target));
  }

  getSession(target: BrowserWindow | WebContents | number): RemoteWindowSession | null {
    return this.sessions.get(getWindowId(target))?.session ?? null;
  }

  getSessionState(
    target: BrowserWindow | WebContents | number
  ): { session: RemoteWindowSession; localStorage: Record<string, string> } | null {
    const state = this.sessions.get(getWindowId(target));
    if (!state) {
      return null;
    }

    return {
      session: state.session,
      localStorage: { ...state.storage.localStorage },
    };
  }

  async closeSession(target: BrowserWindow | WebContents | number): Promise<void> {
    const windowId = getWindowId(target);
    const state = this.sessions.get(windowId);
    if (!state) {
      return;
    }

    await this.flushStorage(state);
    this.sessions.delete(windowId);
    await this.maybeDisconnect(state.session.connectionId, windowId);
  }

  async closeSessionForClosedWindow(windowId: number): Promise<void> {
    const state = this.sessions.get(windowId);
    if (!state) {
      return;
    }

    await this.flushStorage(state);
    this.sessions.delete(windowId);
    await this.maybeDisconnect(state.session.connectionId, windowId);
  }

  async syncLocalStorage(
    target: BrowserWindow | WebContents | number,
    localStorage: Record<string, string>
  ): Promise<void> {
    const state = this.requireSession(target);
    state.storage.localStorage = { ...localStorage };
    state.storage.updatedAt = now();
    await this.flushStorage(state);
  }

  readSettingsData(target: BrowserWindow | WebContents | number): Record<string, unknown> | null {
    const state = this.sessions.get(getWindowId(target));
    return state?.storage.settingsData ?? null;
  }

  async writeSettingsData(
    target: BrowserWindow | WebContents | number,
    data: Record<string, unknown>
  ): Promise<boolean> {
    const state = this.requireSession(target);
    state.storage.settingsData = data;
    state.storage.updatedAt = now();

    const wroteSettings = await this.writeRemoteJsonFileForConnection(
      state.session.connectionId,
      getRemoteSettingsRealPath(state.session),
      data
    );
    if (!wroteSettings) {
      return false;
    }

    await this.flushStorage(state);
    return true;
  }

  getTodoTasks(target: BrowserWindow | WebContents | number, repoPath: string): SessionTodoTask[] {
    const state = this.requireSession(target);
    return [...(state.storage.todos[repoPath] ?? [])].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status.localeCompare(b.status);
      }
      return a.order - b.order;
    });
  }

  async addTodoTask(
    target: BrowserWindow | WebContents | number,
    repoPath: string,
    task: SessionTodoTask
  ): Promise<SessionTodoTask> {
    const state = this.requireSession(target);
    state.storage.todos[repoPath] = [...(state.storage.todos[repoPath] ?? []), task];
    state.storage.updatedAt = now();
    await this.flushStorage(state);
    return task;
  }

  async updateTodoTask(
    target: BrowserWindow | WebContents | number,
    repoPath: string,
    taskId: string,
    updates: Partial<Pick<SessionTodoTask, 'title' | 'description' | 'priority' | 'status'>>
  ): Promise<void> {
    const state = this.requireSession(target);
    const tasks = state.storage.todos[repoPath] ?? [];
    state.storage.todos[repoPath] = tasks.map((task) =>
      task.id === taskId ? { ...task, ...updates, updatedAt: now() } : task
    );
    state.storage.updatedAt = now();
    await this.flushStorage(state);
  }

  async deleteTodoTask(
    target: BrowserWindow | WebContents | number,
    repoPath: string,
    taskId: string
  ): Promise<void> {
    const state = this.requireSession(target);
    state.storage.todos[repoPath] = (state.storage.todos[repoPath] ?? []).filter(
      (task) => task.id !== taskId
    );
    state.storage.updatedAt = now();
    await this.flushStorage(state);
  }

  async moveTodoTask(
    target: BrowserWindow | WebContents | number,
    repoPath: string,
    taskId: string,
    newStatus: string,
    newOrder: number
  ): Promise<void> {
    const state = this.requireSession(target);
    state.storage.todos[repoPath] = (state.storage.todos[repoPath] ?? []).map((task) =>
      task.id === taskId ? { ...task, status: newStatus, order: newOrder, updatedAt: now() } : task
    );
    state.storage.updatedAt = now();
    await this.flushStorage(state);
  }

  async reorderTodoTasks(
    target: BrowserWindow | WebContents | number,
    repoPath: string,
    status: string,
    orderedIds: string[]
  ): Promise<void> {
    const state = this.requireSession(target);
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    state.storage.todos[repoPath] = (state.storage.todos[repoPath] ?? []).map((task) =>
      task.status === status && orderMap.has(task.id)
        ? { ...task, order: orderMap.get(task.id) ?? task.order, updatedAt: now() }
        : task
    );
    state.storage.updatedAt = now();
    await this.flushStorage(state);
  }

  getClaudeConfigDir(target: BrowserWindow | WebContents | number): string {
    return `${this.requireSession(target).session.remoteHomeDir}/.claude`;
  }

  getEnsoSettingsPath(target: BrowserWindow | WebContents | number): string {
    return getRemoteSettingsRealPath(this.requireSession(target).session);
  }

  getClaudeSettingsPath(target: BrowserWindow | WebContents | number): string {
    return `${this.getClaudeConfigDir(target)}/settings.json`;
  }

  getClaudeJsonPath(target: BrowserWindow | WebContents | number): string {
    return `${this.requireSession(target).session.remoteHomeDir}/.claude.json`;
  }

  getClaudePromptPath(target: BrowserWindow | WebContents | number): string {
    return `${this.getClaudeConfigDir(target)}/CLAUDE.md`;
  }

  getClaudePluginsDir(target: BrowserWindow | WebContents | number): string {
    return `${this.getClaudeConfigDir(target)}/plugins`;
  }

  getClaudeCommandsDir(target: BrowserWindow | WebContents | number): string {
    return `${this.getClaudeConfigDir(target)}/commands`;
  }

  getClaudeSkillsDir(target: BrowserWindow | WebContents | number): string {
    return `${this.getClaudeConfigDir(target)}/skills`;
  }

  async remoteFileExists(
    target: BrowserWindow | WebContents | number,
    remotePath: string
  ): Promise<boolean> {
    const state = this.requireSession(target);
    return remoteConnectionManager.call<boolean>(state.session.connectionId, 'fs:exists', {
      path: remotePath,
    });
  }

  async readRemoteTextFile(
    target: BrowserWindow | WebContents | number,
    remotePath: string
  ): Promise<string | null> {
    const state = this.requireSession(target);
    return this.readRemoteTextFileForConnection(state.session.connectionId, remotePath);
  }

  async writeRemoteTextFile(
    target: BrowserWindow | WebContents | number,
    remotePath: string,
    content: string
  ): Promise<boolean> {
    const state = this.requireSession(target);
    return this.writeRemoteTextFileForConnection(state.session.connectionId, remotePath, content);
  }

  async readRemoteJsonFile<T>(
    target: BrowserWindow | WebContents | number,
    remotePath: string
  ): Promise<T | null> {
    const content = await this.readRemoteTextFile(target, remotePath);
    if (!content) {
      return null;
    }
    return safeJsonParse<T>(content);
  }

  async writeRemoteJsonFile(
    target: BrowserWindow | WebContents | number,
    remotePath: string,
    data: unknown
  ): Promise<boolean> {
    return this.writeRemoteTextFile(target, remotePath, JSON.stringify(data, null, 2));
  }

  async listRemoteDirectory(
    target: BrowserWindow | WebContents | number,
    remotePath: string
  ): Promise<RemoteDirectoryEntry[]> {
    const state = this.requireSession(target);
    try {
      return await remoteConnectionManager.call<RemoteDirectoryEntry[]>(
        state.session.connectionId,
        'fs:list',
        { path: remotePath }
      );
    } catch {
      return [];
    }
  }

  private requireSession(target: BrowserWindow | WebContents | number): ActiveRemoteSession {
    const state = this.sessions.get(getWindowId(target));
    if (!state) {
      throw new Error('No remote session is active for this window');
    }
    return state;
  }

  private async measureConnectionStep<T>(
    connectionId: string,
    step: 'load-session-storage' | 'load-session-settings',
    action: () => Promise<T>
  ): Promise<T> {
    const startedAt = now();
    try {
      return await action();
    } finally {
      remoteConnectionManager.recordDiagnosticStep(connectionId, step, now() - startedAt);
    }
  }

  private async loadOrCreateStorage(session: RemoteWindowSession): Promise<SessionStorageDocument> {
    const existingContent = await this.readRemoteTextFileForConnection(
      session.connectionId,
      getRemoteStorageRealPath(session)
    );
    const parsed = existingContent ? parseStorageDocument(existingContent) : null;
    if (parsed) {
      return parsed;
    }

    const initialStorage = defaultSessionStorageDocument({
      settingsData: defaultSettingsData(),
      localStorage: {},
      todos: {},
    });

    await this.writeRemoteTextFileForConnection(
      session.connectionId,
      getRemoteStorageRealPath(session),
      JSON.stringify(initialStorage, null, 2)
    );
    return initialStorage;
  }

  private async loadOrCreateSettings(
    session: RemoteWindowSession
  ): Promise<Record<string, unknown>> {
    const existing =
      (await this.readRemoteJsonFileForConnection<Record<string, unknown>>(
        session.connectionId,
        getRemoteSettingsRealPath(session)
      )) ?? null;

    if (existing && typeof existing === 'object') {
      return existing;
    }

    const defaults = defaultSettingsData();
    await this.writeRemoteTextFileForConnection(
      session.connectionId,
      getRemoteSettingsRealPath(session),
      JSON.stringify(defaults, null, 2)
    );
    return defaults;
  }

  private async flushStorage(state: ActiveRemoteSession): Promise<void> {
    await this.writeRemoteTextFileForConnection(
      state.session.connectionId,
      getRemoteStorageRealPath(state.session),
      JSON.stringify(state.storage, null, 2)
    );
  }

  private async maybeDisconnect(connectionId: string, closingWindowId: number): Promise<void> {
    const stillUsed = [...this.sessions.entries()].some(
      ([windowId, state]) =>
        windowId !== closingWindowId && state.session.connectionId === connectionId
    );

    if (!stillUsed) {
      await remoteConnectionManager.disconnect(connectionId).catch(() => {});
    }
  }

  private async readRemoteTextFileForConnection(
    connectionId: string,
    remotePath: string
  ): Promise<string | null> {
    try {
      const result = await remoteConnectionManager.call<RemoteFileReadResult>(
        connectionId,
        'fs:read',
        {
          path: remotePath,
        }
      );
      if (result.isBinary) {
        return null;
      }
      return result.content;
    } catch {
      return null;
    }
  }

  private async readRemoteJsonFileForConnection<T>(
    connectionId: string,
    remotePath: string
  ): Promise<T | null> {
    const content = await this.readRemoteTextFileForConnection(connectionId, remotePath);
    if (!content) {
      return null;
    }
    return safeJsonParse<T>(content);
  }

  private async writeRemoteJsonFileForConnection(
    connectionId: string,
    remotePath: string,
    data: unknown
  ): Promise<boolean> {
    return this.writeRemoteTextFileForConnection(
      connectionId,
      remotePath,
      JSON.stringify(data, null, 2)
    );
  }

  private async writeRemoteTextFileForConnection(
    connectionId: string,
    remotePath: string,
    content: string
  ): Promise<boolean> {
    try {
      await remoteConnectionManager.call(connectionId, 'fs:createDirectory', {
        path: dirname(remotePath).replace(/\\/g, '/'),
      });
      await remoteConnectionManager.call(connectionId, 'fs:write', {
        path: remotePath,
        content,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const remoteSessionManager = new RemoteSessionManager();
