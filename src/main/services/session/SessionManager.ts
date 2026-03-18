import {
  IPC_CHANNELS,
  type SessionAttachOptions,
  type SessionAttachResult,
  type SessionCreateOptions,
  type SessionDataEvent,
  type SessionDescriptor,
  type SessionExitEvent,
  type SessionOpenResult,
  type SessionRuntimeState,
  type SessionStateEvent,
} from '@shared/types';
import { BrowserWindow, type WebContents } from 'electron';
import { remoteConnectionManager } from '../remote/RemoteConnectionManager';
import { isRemoteVirtualPath, parseRemoteVirtualPath } from '../remote/RemotePath';
import { PtyManager } from '../terminal/PtyManager';

interface ManagedSessionRecord extends SessionDescriptor {
  attachedWindowIds: Set<number>;
  connectionId?: string;
  runtimeState?: SessionRuntimeState;
  replayBuffer?: string;
  streamState?: 'buffering' | 'attaching' | 'live';
  pendingExit?: SessionExitEvent;
}

const MAX_SESSION_REPLAY_CHARS = 65_536;

function getWindowId(target: BrowserWindow | WebContents | number): number {
  if (typeof target === 'number') {
    return target;
  }

  if (target instanceof BrowserWindow) {
    return target.id;
  }

  const window = BrowserWindow.fromWebContents(target);
  if (!window) {
    throw new Error('Window not found for session');
  }
  return window.id;
}

function now(): number {
  return Date.now();
}

export class SessionManager {
  readonly localPtyManager = new PtyManager();

  private readonly sessions = new Map<string, ManagedSessionRecord>();
  private readonly remoteSubscriptions = new Map<
    string,
    {
      offData: () => void;
      offExit: () => void;
    }
  >();
  private readonly remoteDisconnectSubscriptions = new Map<string, () => void>();
  private readonly remoteStatusSubscriptions = new Map<string, () => void>();

  async create(
    target: BrowserWindow | WebContents | number,
    options: SessionCreateOptions = {}
  ): Promise<SessionOpenResult> {
    const windowId = getWindowId(target);
    if (options.cwd && isRemoteVirtualPath(options.cwd)) {
      return this.createRemote(windowId, options);
    }
    return this.createLocal(windowId, options);
  }

  async attach(
    target: BrowserWindow | WebContents | number,
    options: SessionAttachOptions
  ): Promise<SessionAttachResult> {
    const windowId = getWindowId(target);
    const existing = this.sessions.get(options.sessionId);
    if (existing?.backend === 'local') {
      existing.attachedWindowIds.add(windowId);
      const replay = existing.replayBuffer || undefined;
      if (existing.streamState === 'buffering') {
        existing.streamState = 'attaching';
        this.activateLocalStreamAfterAttach(existing.sessionId, existing.replayBuffer?.length ?? 0);
      }
      return {
        session: this.toDescriptor(existing),
        replay,
      };
    }

    if (existing?.backend === 'remote' && existing.connectionId) {
      await this.ensureRemoteSubscriptions(existing.connectionId);
      const result = await remoteConnectionManager.call<SessionAttachResult>(
        existing.connectionId,
        'session:attach',
        {
          sessionId: options.sessionId,
        }
      );
      const record = this.registerRemoteSession(windowId, existing.connectionId, result.session);
      this.setSessionRuntimeState(record.sessionId, 'live');
      return {
        session: this.toDescriptor(record),
        replay: result.replay,
      };
    }

    if (!options.cwd || !isRemoteVirtualPath(options.cwd)) {
      throw new Error(`Session not found: ${options.sessionId}`);
    }

    const { connectionId } = parseRemoteVirtualPath(options.cwd);
    await this.ensureRemoteSubscriptions(connectionId);
    const result = await remoteConnectionManager.call<SessionAttachResult>(
      connectionId,
      'session:attach',
      {
        sessionId: options.sessionId,
      }
    );
    const record = this.registerRemoteSession(windowId, connectionId, result.session);
    this.setSessionRuntimeState(record.sessionId, 'live');
    return {
      session: this.toDescriptor(record),
      replay: result.replay,
    };
  }

  list(target: BrowserWindow | WebContents | number): SessionDescriptor[] {
    const windowId = getWindowId(target);
    return [...this.sessions.values()]
      .filter((session) => session.attachedWindowIds.has(windowId))
      .map((session) => this.toDescriptor(session));
  }

  async detach(target: BrowserWindow | WebContents | number, sessionId: string): Promise<void> {
    const windowId = getWindowId(target);
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.attachedWindowIds.delete(windowId);
    if (session.backend === 'remote' && session.connectionId) {
      await this.ensureRemoteSubscriptions(session.connectionId);
      await remoteConnectionManager
        .call(session.connectionId, 'session:detach', { sessionId })
        .catch(() => {});
      if (session.attachedWindowIds.size === 0) {
        this.sessions.delete(sessionId);
      }
      return;
    }

    if (session.attachedWindowIds.size > 0) {
      return;
    }

    this.localPtyManager.destroy(sessionId);
    this.sessions.delete(sessionId);
  }

  async kill(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.backend === 'remote' && session.connectionId) {
      await this.ensureRemoteSubscriptions(session.connectionId);
      await remoteConnectionManager
        .call(session.connectionId, 'session:kill', { sessionId })
        .catch(() => {});
      this.sessions.delete(sessionId);
      this.emitState({
        sessionId,
        state: 'dead',
      });
      return;
    }

    this.localPtyManager.destroy(sessionId);
    this.sessions.delete(sessionId);
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.backend === 'remote' && session.connectionId) {
      if (session.runtimeState && session.runtimeState !== 'live') {
        return;
      }
      const { connectionId } = session;
      void this.ensureRemoteSubscriptions(connectionId)
        .then(() =>
          remoteConnectionManager.call(connectionId, 'session:write', { sessionId, data })
        )
        .catch(() => {
          this.setSessionRuntimeState(sessionId, 'reconnecting');
        });
      return;
    }

    this.localPtyManager.write(sessionId, data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.backend === 'remote' && session.connectionId) {
      if (session.runtimeState && session.runtimeState !== 'live') {
        return;
      }
      const { connectionId } = session;
      void this.ensureRemoteSubscriptions(connectionId)
        .then(() =>
          remoteConnectionManager.call(connectionId, 'session:resize', {
            sessionId,
            cols,
            rows,
          })
        )
        .catch(() => {
          this.setSessionRuntimeState(sessionId, 'reconnecting');
        });
      return;
    }

    this.localPtyManager.resize(sessionId, cols, rows);
  }

  async getActivity(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.backend === 'remote' && session.connectionId) {
      await this.ensureRemoteSubscriptions(session.connectionId);
      return remoteConnectionManager
        .call<boolean>(session.connectionId, 'session:getActivity', { sessionId })
        .catch(() => false);
    }

    return this.localPtyManager.getProcessActivity(sessionId);
  }

  async detachWindowSessions(windowId: number): Promise<void> {
    const ids = [...this.sessions.values()]
      .filter((session) => session.attachedWindowIds.has(windowId))
      .map((session) => session.sessionId);

    await Promise.allSettled(ids.map((sessionId) => this.detach(windowId, sessionId)));
  }

  async killByWorkdir(workdir: string): Promise<void> {
    const normalized = workdir.replace(/\\/g, '/').toLowerCase();
    const matches = [...this.sessions.values()].filter((session) => {
      const sessionCwd = session.cwd.replace(/\\/g, '/').toLowerCase();
      return sessionCwd === normalized || sessionCwd.startsWith(`${normalized}/`);
    });

    await Promise.allSettled(matches.map((session) => this.kill(session.sessionId)));
  }

  destroyAllLocal(): void {
    this.localPtyManager.destroyAll();
  }

  async destroyAllLocalAndWait(): Promise<void> {
    await this.localPtyManager.destroyAllAndWait();
  }

  private createLocal(windowId: number, options: SessionCreateOptions): SessionOpenResult {
    const kind = options.kind ?? 'terminal';
    const cwd = options.cwd || process.env.HOME || process.env.USERPROFILE || '/';
    const sessionId = this.localPtyManager.allocateId();
    const record: ManagedSessionRecord = {
      sessionId,
      backend: 'local',
      kind,
      cwd,
      persistOnDisconnect: Boolean(options.persistOnDisconnect),
      createdAt: now(),
      metadata: options.metadata,
      attachedWindowIds: new Set([windowId]),
      replayBuffer: '',
      streamState: 'buffering',
    };
    this.sessions.set(sessionId, record);

    try {
      this.localPtyManager.create(
        options,
        (data) => this.handleLocalData(sessionId, data),
        (exitCode, signal) => {
          this.handleLocalExit(sessionId, exitCode, signal);
        },
        sessionId
      );
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }

    return {
      session: this.toDescriptor(record),
    };
  }

  private async createRemote(
    windowId: number,
    options: SessionCreateOptions
  ): Promise<SessionOpenResult> {
    const { connectionId, remotePath } = parseRemoteVirtualPath(options.cwd!);
    await this.ensureRemoteSubscriptions(connectionId);
    const result = await remoteConnectionManager.call<SessionOpenResult>(
      connectionId,
      'session:createAndAttach',
      {
        options: {
          ...options,
          cwd: remotePath,
          spawnCwd: undefined,
          shellConfig: options.shellConfig,
          shell: options.shell,
          persistOnDisconnect: options.persistOnDisconnect ?? true,
        },
      }
    );
    const record = this.registerRemoteSession(windowId, connectionId, result.session);
    return {
      session: this.toDescriptor(record),
      replay: result.replay,
    };
  }

  private registerRemoteSession(
    windowId: number,
    connectionId: string,
    descriptor: SessionDescriptor
  ): ManagedSessionRecord {
    const existing = this.sessions.get(descriptor.sessionId);
    if (existing) {
      existing.attachedWindowIds.add(windowId);
      existing.connectionId = connectionId;
      existing.cwd = descriptor.cwd;
      existing.kind = descriptor.kind;
      existing.persistOnDisconnect = descriptor.persistOnDisconnect;
      existing.metadata = descriptor.metadata;
      existing.runtimeState = existing.runtimeState ?? 'live';
      return existing;
    }

    const record: ManagedSessionRecord = {
      ...descriptor,
      backend: 'remote',
      connectionId,
      runtimeState: 'live',
      attachedWindowIds: new Set([windowId]),
    };
    this.sessions.set(record.sessionId, record);
    return record;
  }

  private handleLocalExit(sessionId: string, exitCode: number, signal?: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const event: SessionExitEvent = {
      sessionId,
      exitCode,
      signal,
    };

    if (session.backend === 'local' && session.streamState !== 'live') {
      session.pendingExit = event;
      return;
    }

    const attachedWindowIds = new Set(session.attachedWindowIds);
    this.sessions.delete(sessionId);
    this.emitExit(event, attachedWindowIds);
  }

  private handleLocalData(sessionId: string, data: string): void {
    if (!data) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.backend !== 'local') {
      return;
    }

    const replay = `${session.replayBuffer || ''}${data}`;
    session.replayBuffer = replay.slice(-MAX_SESSION_REPLAY_CHARS);

    if (session.streamState === 'live') {
      this.emitData(sessionId, data, new Set(session.attachedWindowIds));
    }
  }

  private activateLocalStreamAfterAttach(sessionId: string, replayCursor: number): void {
    setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (!session || session.backend !== 'local' || session.streamState !== 'attaching') {
        return;
      }

      if (session.attachedWindowIds.size === 0) {
        session.streamState = 'buffering';
        return;
      }

      session.streamState = 'live';
      const replayBuffer = session.replayBuffer || '';
      const delta = replayBuffer.slice(replayCursor);
      if (delta) {
        this.emitData(sessionId, delta, new Set(session.attachedWindowIds));
      }

      if (session.pendingExit) {
        const pendingExit = session.pendingExit;
        this.sessions.delete(sessionId);
        this.emitExit(pendingExit, new Set(session.attachedWindowIds));
      }
    }, 0);
  }

  private async ensureRemoteSubscriptions(connectionId: string): Promise<void> {
    if (!this.remoteDisconnectSubscriptions.has(connectionId)) {
      const offDisconnect = remoteConnectionManager.onDidDisconnect(connectionId, () => {
        const subscription = this.remoteSubscriptions.get(connectionId);
        subscription?.offData();
        subscription?.offExit();
        this.remoteSubscriptions.delete(connectionId);
      });
      this.remoteDisconnectSubscriptions.set(connectionId, offDisconnect);
    }

    if (!this.remoteStatusSubscriptions.has(connectionId)) {
      const offStatus = remoteConnectionManager.onDidStatusChange(connectionId, (status) => {
        void this.handleRemoteStatusChange(connectionId, status);
      });
      this.remoteStatusSubscriptions.set(connectionId, offStatus);
    }

    if (this.remoteSubscriptions.has(connectionId)) {
      return;
    }

    const [offData, offExit] = await Promise.all([
      remoteConnectionManager.addEventListener(connectionId, 'remote:session:data', (payload) => {
        const event = payload as SessionDataEvent;
        this.emitData(event.sessionId, event.data);
      }),
      remoteConnectionManager.addEventListener(connectionId, 'remote:session:exit', (payload) => {
        const event = payload as SessionExitEvent;
        const session = this.sessions.get(event.sessionId);
        const attachedWindowIds = session ? new Set(session.attachedWindowIds) : new Set<number>();
        this.sessions.delete(event.sessionId);
        this.emitState({
          sessionId: event.sessionId,
          state: 'dead',
        });
        this.emitExit(event, attachedWindowIds);
      }),
    ]);

    this.remoteSubscriptions.set(connectionId, { offData, offExit });
  }

  private async handleRemoteStatusChange(
    connectionId: string,
    status: { connected: boolean; phase?: string; recoverable?: boolean }
  ): Promise<void> {
    const sessions = [...this.sessions.values()].filter(
      (session) => session.backend === 'remote' && session.connectionId === connectionId
    );
    if (sessions.length === 0) {
      return;
    }

    if (status.connected) {
      await this.ensureRemoteSubscriptions(connectionId);
      const remoteSessions = await remoteConnectionManager
        .call<SessionDescriptor[]>(connectionId, 'session:list', {})
        .then((items) => new Set(items.map((item) => item.sessionId)))
        .catch(() => null);
      if (!remoteSessions) {
        for (const session of sessions) {
          this.setSessionRuntimeState(session.sessionId, 'reconnecting');
        }
        return;
      }
      await Promise.allSettled(
        sessions.map(async (session) => {
          if (remoteSessions.has(session.sessionId)) {
            this.setSessionRuntimeState(session.sessionId, 'live');
            return;
          }
          const attachedWindowIds = new Set(session.attachedWindowIds);
          this.sessions.delete(session.sessionId);
          this.emitState({ sessionId: session.sessionId, state: 'dead' }, attachedWindowIds);
          this.emitExit(
            {
              sessionId: session.sessionId,
              exitCode: 1,
            },
            attachedWindowIds
          );
        })
      );
      return;
    }

    const nextState: SessionRuntimeState = status.recoverable ? 'reconnecting' : 'dead';
    for (const session of sessions) {
      this.setSessionRuntimeState(session.sessionId, nextState);
      if (nextState === 'dead') {
        const attachedWindowIds = new Set(session.attachedWindowIds);
        this.sessions.delete(session.sessionId);
        this.emitState(
          {
            sessionId: session.sessionId,
            state: 'dead',
          },
          attachedWindowIds
        );
        this.emitExit(
          {
            sessionId: session.sessionId,
            exitCode: 1,
          },
          attachedWindowIds
        );
      }
    }
  }

  private setSessionRuntimeState(sessionId: string, state: SessionRuntimeState): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.backend !== 'remote') {
      return;
    }
    if (session.runtimeState === state) {
      return;
    }
    session.runtimeState = state;
    this.emitState({ sessionId, state });
  }

  private emitData(sessionId: string, data: string, windowIds?: Set<number>): void {
    if (!data) {
      return;
    }

    this.emitToWindows(
      windowIds ?? this.sessions.get(sessionId)?.attachedWindowIds,
      'session:data',
      {
        sessionId,
        data,
      }
    );
  }

  private emitExit(event: SessionExitEvent, windowIds?: Set<number>): void {
    this.emitToWindows(windowIds, 'session:exit', event);
  }

  private emitState(event: SessionStateEvent, windowIds?: Set<number>): void {
    this.emitToWindows(
      windowIds ?? this.sessions.get(event.sessionId)?.attachedWindowIds,
      'session:state',
      event
    );
  }

  private emitToWindows(
    windowIds: Set<number> | undefined,
    channel: 'session:data' | 'session:exit' | 'session:state',
    payload: SessionDataEvent | SessionExitEvent | SessionStateEvent
  ): void {
    if (!windowIds || windowIds.size === 0) {
      return;
    }

    for (const windowId of windowIds) {
      const window = BrowserWindow.fromId(windowId);
      if (!window || window.isDestroyed()) {
        continue;
      }
      const resolvedChannel =
        channel === 'session:data'
          ? IPC_CHANNELS.SESSION_DATA
          : channel === 'session:exit'
            ? IPC_CHANNELS.SESSION_EXIT
            : IPC_CHANNELS.SESSION_STATE;
      window.webContents.send(resolvedChannel, payload);
    }
  }

  private toDescriptor(session: ManagedSessionRecord): SessionDescriptor {
    return {
      sessionId: session.sessionId,
      backend: session.backend,
      kind: session.kind,
      cwd: session.cwd,
      persistOnDisconnect: session.persistOnDisconnect,
      createdAt: session.createdAt,
      metadata: session.metadata,
    };
  }
}

export const sessionManager = new SessionManager();
