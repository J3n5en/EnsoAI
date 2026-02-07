import http from 'node:http';
import type { InspectPayload, WebInspectorStatus } from '@shared/types/webInspector';
import type { BrowserWindow } from 'electron';

const WEB_INSPECTOR_PORT = 18765;
const MAX_BODY_SIZE = 1024 * 1024; // 1MB

export type { InspectPayload, WebInspectorStatus };

type StatusChangeCallback = (status: WebInspectorStatus) => void;

export class WebInspectorServer {
  private server: http.Server | null = null;
  private mainWindow: BrowserWindow | null = null;
  private statusChangeCallbacks: StatusChangeCallback[] = [];

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  onStatusChange(callback: StatusChangeCallback): () => void {
    this.statusChangeCallbacks.push(callback);
    return () => {
      const index = this.statusChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.statusChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyStatusChange(running: boolean) {
    const status = { running, port: WEB_INSPECTOR_PORT };
    for (const callback of this.statusChangeCallbacks) {
      callback(status);
    }
    // Also send to renderer via IPC
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('web-inspector:status-change', status);
    }
  }

  start(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (this.server) {
        resolve({ success: true }); // Already running
        return;
      }

      try {
        this.server = http.createServer((req, res) => {
          // Set CORS headers for all requests
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          // Handle preflight requests
          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          // Only accept POST /inspect
          if (req.method !== 'POST' || req.url !== '/inspect') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
          }

          let body = '';
          let bodySize = 0;

          req.on('data', (chunk: Buffer) => {
            bodySize += chunk.length;
            // Limit request body size to prevent DoS
            if (bodySize > MAX_BODY_SIZE) {
              req.destroy();
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request body too large' }));
              return;
            }
            body += chunk.toString();
          });

          req.on('end', () => {
            try {
              const payload: InspectPayload = JSON.parse(body);
              this.handleInspectData(payload);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
        });

        this.server.on('error', (error: NodeJS.ErrnoException) => {
          console.error('[WebInspector] Server error:', error);
          if (error.code === 'EADDRINUSE') {
            this.server = null;
            this.notifyStatusChange(false);
            resolve({ success: false, error: `Port ${WEB_INSPECTOR_PORT} is already in use` });
          }
        });

        this.server.listen(WEB_INSPECTOR_PORT, '127.0.0.1', () => {
          console.log(`[WebInspector] Server started on port ${WEB_INSPECTOR_PORT}`);
          this.notifyStatusChange(true);
          resolve({ success: true });
        });
      } catch (error) {
        console.error('[WebInspector] Failed to start server:', error);
        resolve({ success: false, error: String(error) });
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        const server = this.server;
        this.server = null;
        server.close(() => {
          console.log('[WebInspector] Server stopped');
          this.notifyStatusChange(false);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.server?.listening ?? false;
  }

  getStatus(): { running: boolean; port: number } {
    return {
      running: this.isRunning(),
      port: WEB_INSPECTOR_PORT,
    };
  }

  private handleInspectData(payload: InspectPayload) {
    // Send to renderer process via IPC
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('web-inspector:data', payload);
    }
  }
}

// Singleton instance
export const webInspectorServer = new WebInspectorServer();
