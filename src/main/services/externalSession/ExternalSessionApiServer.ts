import http from 'node:http';
import {
  type ExternalSessionApiItem,
  type ExternalSessionFocusPayload,
  type ExternalSessionSnapshot,
  IPC_CHANNELS,
} from '@shared/types';
import { BrowserWindow } from 'electron';

const DEFAULT_EXTERNAL_SESSION_API_PORT = 27124;
interface WindowSnapshotEntry {
  windowId: number;
  snapshot: ExternalSessionSnapshot;
}

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

function normalizePathname(url: string | undefined): string {
  if (!url) {
    return '/';
  }

  try {
    return new URL(url, 'http://127.0.0.1').pathname;
  } catch {
    return '/';
  }
}

export class ExternalSessionApiServer {
  private server: http.Server | null = null;
  private snapshots = new Map<number, WindowSnapshotEntry>();
  private port = DEFAULT_EXTERNAL_SESSION_API_PORT;

  start(port = this.port): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (this.server) {
        resolve({ success: true });
        return;
      }
      this.port = port;

      this.server = http.createServer((req, res) => {
        if (req.method === 'OPTIONS') {
          // Intentionally do not emit CORS headers. This API is designed for local
          // desktop integrations, not arbitrary browser pages.
          json(res, 204, {});
          return;
        }

        const pathname = normalizePathname(req.url);

        if (req.method === 'GET' && pathname === '/health') {
          json(res, 200, { ok: true, port: this.port });
          return;
        }

        if (req.method === 'GET' && pathname === '/api/sessions') {
          json(res, 200, { sessions: this.listSessions() });
          return;
        }

        if (req.method === 'GET' && pathname === '/api/sessions/active') {
          json(res, 200, { session: this.getActiveSession() });
          return;
        }

        if (req.method === 'POST' && pathname.startsWith('/api/sessions/')) {
          const parts = pathname.split('/');
          const sessionId = decodeURIComponent(parts[3] || '');
          const action = parts[4] || '';

          if (!sessionId || action !== 'focus') {
            json(res, 404, { error: 'Not found' });
            return;
          }
          const payload = this.focusSession(sessionId);
          if (!payload) {
            json(res, 404, { error: 'Session not found' });
            return;
          }
          json(res, 200, { ok: true, session: payload });
          return;
        }

        json(res, 404, { error: 'Not found' });
      });

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        console.error('[external-session-api] Server error:', error);
        this.server = null;
        resolve({
          success: false,
          error:
            error.code === 'EADDRINUSE' ? `Port ${this.port} is already in use` : error.message,
        });
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[external-session-api] Server started on port ${this.port}`);
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.EXTERNAL_SESSION_RESYNC);
          }
        }
        resolve({ success: true });
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        this.snapshots.clear();
        resolve();
        return;
      }

      const server = this.server;
      this.server = null;
      server.close(() => {
        this.snapshots.clear();
        resolve();
      });
    });
  }

  updateSnapshot(windowId: number, snapshot: ExternalSessionSnapshot): void {
    if (!this.server) {
      return;
    }
    this.snapshots.set(windowId, { windowId, snapshot });
  }

  clearWindow(windowId: number): void {
    this.snapshots.delete(windowId);
  }

  getPort(): number {
    return this.port;
  }

  listSessions(): ExternalSessionApiItem[] {
    const items: ExternalSessionApiItem[] = [];
    const staleWindowIds: number[] = [];

    for (const entry of this.snapshots.values()) {
      const window = BrowserWindow.fromId(entry.windowId);
      if (!window || window.isDestroyed()) {
        staleWindowIds.push(entry.windowId);
        continue;
      }

      for (const session of entry.snapshot.sessions) {
        items.push({
          ...session,
          windowId: entry.windowId,
        });
      }
    }

    for (const windowId of staleWindowIds) {
      this.snapshots.delete(windowId);
    }

    return items.sort((left, right) => {
      if (left.isSessionActive !== right.isSessionActive) {
        return left.isSessionActive ? -1 : 1;
      }
      if (left.isGroupActive !== right.isGroupActive) {
        return left.isGroupActive ? -1 : 1;
      }
      return right.updatedAt - left.updatedAt;
    });
  }

  getActiveSession(): ExternalSessionApiItem | null {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const sessions = this.listSessions();

    if (focusedWindow) {
      const focused = sessions.find(
        (session) =>
          session.windowId === focusedWindow.id && session.isGroupActive && session.isSessionActive
      );
      if (focused) {
        return focused;
      }
    }

    return sessions.find((session) => session.isGroupActive && session.isSessionActive) ?? null;
  }

  focusSession(sessionId: string): ExternalSessionFocusPayload | null {
    const target = this.listSessions().find((session) => session.id === sessionId);
    if (!target) {
      return null;
    }

    const window = BrowserWindow.fromId(target.windowId);
    if (!window || window.isDestroyed()) {
      this.snapshots.delete(target.windowId);
      return null;
    }

    if (window.isMinimized()) {
      window.restore();
    }
    window.moveTop();
    window.show();
    window.focus();

    const payload: ExternalSessionFocusPayload = {
      sessionId: target.id,
      cwd: target.cwd,
      groupId: target.groupId,
    };
    window.webContents.send(IPC_CHANNELS.EXTERNAL_SESSION_FOCUS, payload);
    return payload;
  }
}

export const externalSessionApiServer = new ExternalSessionApiServer();
