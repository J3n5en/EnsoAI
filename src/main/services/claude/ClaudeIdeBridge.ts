import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import {
  ensureStatusLineHook,
  ensureStopHook,
  isClaudeInstalled,
  isStatusLineHookInstalled,
  removeStatusLineHook,
  removeStopHook,
} from './ClaudeHookManager';
import { MCP_TOOLS } from './mcpTools';

interface LockFilePayload {
  pid: number;
  workspaceFolders: string[];
  ideName: string;
  transport: string;
  runningInWindows: boolean;
  authToken: string;
}

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface ClaudeIdeBridgeOptions {
  workspaceFolders?: string[];
  ideName?: string;
}

interface SelectionChangedParams {
  text: string;
  filePath: string;
  fileUrl: string;
  selection: {
    start: { line: number; character: number };
    end: { line: number; character: number };
    isEmpty: boolean;
  };
}

interface AtMentionedParams {
  filePath: string;
  lineStart: number;
  lineEnd: number;
}

// Client connection with associated workspace
interface ClientConnection {
  ws: WebSocket;
  workspace: string | null; // null means not yet identified
}

interface ClaudeIdeBridgeInstance {
  port: number;
  authToken: string;
  lockPath: string;
  workspaceFolders: string[];
  setEnvForChild: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  updateWorkspaceFolders: (folders: string[]) => void;
  sendSelectionChanged: (params: SelectionChangedParams) => void;
  sendAtMentioned: (params: AtMentionedParams) => void;
  dispose: () => void;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function getIdeDir(): string {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return path.join(process.env.CLAUDE_CONFIG_DIR, 'ide');
  }
  return path.join(os.homedir(), '.claude', 'ide');
}

function writeLockFile({
  port,
  authToken,
  workspaceFolders = [],
  ideName = 'EnsoAI',
}: {
  port: number;
  authToken: string;
  workspaceFolders?: string[];
  ideName?: string;
}): string {
  const ideDir = getIdeDir();
  ensureDir(ideDir);

  const lockPath = path.join(ideDir, `${port}.lock`);
  const payload: LockFilePayload = {
    pid: process.pid,
    workspaceFolders,
    ideName,
    transport: 'ws',
    runningInWindows: process.platform === 'win32',
    authToken,
  };

  fs.writeFileSync(lockPath, JSON.stringify(payload), { mode: 0o600 });
  return lockPath;
}

function deleteLockFile(port: number): void {
  const lockPath = path.join(getIdeDir(), `${port}.lock`);
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // Ignore errors
  }
}

function safeJsonParse(s: string): JsonRpcRequest | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function createJsonRpcHandler({ ideName }: { ideName: string }) {
  let initialized = false;

  function reply(ws: WebSocket, id: number | string, result: unknown): void {
    const response = { jsonrpc: '2.0', id, result };
    ws.send(JSON.stringify(response));
  }

  function error(ws: WebSocket, id: number | string, code: number, message: string): void {
    const response = { jsonrpc: '2.0', id, error: { code, message } };
    ws.send(JSON.stringify(response));
  }

  return async function onMessage(ws: WebSocket, raw: RawData): Promise<void> {
    const rawStr = raw.toString('utf-8');
    const msg = safeJsonParse(rawStr);
    if (!msg || msg.jsonrpc !== '2.0') return;

    // Notification (no id)
    if (!('id' in msg) || msg.id === undefined) {
      if (msg.method === 'notifications/initialized') {
        initialized = true;
      }
      return;
    }

    const { id, method, params } = msg;

    if (method === 'ping') {
      return reply(ws, id, {});
    }

    if (method === 'initialize') {
      return reply(ws, id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          logging: {},
          prompts: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          tools: { listChanged: true },
        },
        serverInfo: { name: ideName, version: '0.0.1' },
      });
    }

    if (!initialized && method !== 'ping') {
      return error(ws, id, -32002, 'Server not initialized');
    }

    if (method === 'tools/list') {
      return reply(ws, id, { tools: MCP_TOOLS });
    }

    if (method === 'prompts/list') {
      return reply(ws, id, { prompts: [] });
    }

    if (method === 'resources/list') {
      return reply(ws, id, { resources: [] });
    }

    if (method === 'tools/call') {
      const toolName = params?.name as string | undefined;
      return error(ws, id, -32601, `Tool not found: ${toolName}`);
    }

    return error(ws, id, -32601, `Method not found: ${method}`);
  };
}

export async function startClaudeIdeBridge(
  options: ClaudeIdeBridgeOptions = {}
): Promise<ClaudeIdeBridgeInstance> {
  const { workspaceFolders: initialFolders = [], ideName = 'EnsoAI' } = options;
  const authToken = crypto.randomUUID();

  // Mutable state for workspace folders
  let currentWorkspaceFolders = [...initialFolders];

  const httpServer = http.createServer((req, res) => {
    // Handle POST /agent-stop for Claude stop hook notifications
    if (req.method === 'POST' && req.url === '/agent-stop') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const sessionId = data.session_id;
          if (sessionId) {
            // Broadcast to all windows
            for (const window of BrowserWindow.getAllWindows()) {
              if (!window.isDestroyed()) {
                window.webContents.send(IPC_CHANNELS.AGENT_STOP_NOTIFICATION, { sessionId });
              }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Handle POST /status-line for Claude status line updates
    if (req.method === 'POST' && req.url === '/status-line') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const sessionId = data.session_id;
          if (sessionId) {
            // Broadcast status update to all windows
            for (const window of BrowserWindow.getAllWindows()) {
              if (!window.isDestroyed()) {
                window.webContents.send(IPC_CHANNELS.AGENT_STATUS_UPDATE, {
                  sessionId,
                  model: data.model,
                  contextWindow: data.context_window,
                  cost: data.cost,
                  workspace: data.workspace,
                });
              }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }
    // WebSocket upgrade handled by ws, other requests get 404
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server: httpServer });

  const jsonRpcHandler = createJsonRpcHandler({ ideName });

  // Map of client connections, keyed by unique client ID
  const clients = new Map<string, ClientConnection>();
  let clientIdCounter = 0;

  // Find matching workspace folder for a file path
  function findWorkspaceForPath(filePath: string): string | null {
    let bestMatch: string | null = null;
    let bestMatchLength = 0;

    for (const folder of currentWorkspaceFolders) {
      if (filePath.startsWith(folder) && folder.length > bestMatchLength) {
        bestMatch = folder;
        bestMatchLength = folder.length;
      }
    }

    return bestMatch;
  }

  // Find client by workspace path (longest prefix match)
  function findClientForPath(filePath: string): ClientConnection | null {
    let bestMatch: ClientConnection | null = null;
    let bestMatchLength = 0;

    // First try to match by client's registered workspace
    for (const [, client] of clients) {
      if (client.workspace && filePath.startsWith(client.workspace)) {
        if (client.workspace.length > bestMatchLength) {
          bestMatch = client;
          bestMatchLength = client.workspace.length;
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    // If no direct workspace match, try to find a client whose workspace
    // matches the same workspace folder as the filePath
    const targetWorkspace = findWorkspaceForPath(filePath);
    if (targetWorkspace) {
      for (const [, client] of clients) {
        // Client with matching workspace folder
        if (client.workspace?.startsWith(targetWorkspace)) {
          return client;
        }
        // Client without workspace but connected - assign this workspace folder
        if (!client.workspace) {
          client.workspace = targetWorkspace;
          return client;
        }
      }
    }

    // Final fallback: return first connected client
    if (clients.size > 0) {
      const firstClient = clients.entries().next().value;
      return firstClient ? firstClient[1] : null;
    }

    return null;
  }

  // Function to send notifications to specific Claude Code client
  function sendNotificationToClient(
    client: ClientConnection,
    method: string,
    params: object
  ): void {
    if (client.ws.readyState === 1) {
      client.ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
    }
  }

  // Function to send notifications to Claude Code (routed by filePath)
  function sendNotification(method: string, params: { filePath: string } & object): void {
    const client = findClientForPath(params.filePath);
    if (client) {
      sendNotificationToClient(client, method, params);
    }
  }

  // IPC handlers for selection/mention notifications from renderer
  const onSelectionChanged = (_: Electron.IpcMainEvent, params: SelectionChangedParams) => {
    sendNotification('selection_changed', params);
  };
  const onAtMentioned = (_: Electron.IpcMainEvent, params: AtMentionedParams) => {
    sendNotification('at_mentioned', params);
  };
  ipcMain.on(IPC_CHANNELS.MCP_SELECTION_CHANGED, onSelectionChanged);
  ipcMain.on(IPC_CHANNELS.MCP_AT_MENTIONED, onAtMentioned);

  wss.on('connection', (ws, req) => {
    const token = req.headers['x-claude-code-ide-authorization'];
    if (token !== authToken) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    // Get workspace from header if provided
    const workspaceHeader = req.headers['x-claude-code-workspace'];
    const workspace =
      typeof workspaceHeader === 'string' ? workspaceHeader : (workspaceHeader?.[0] ?? null);

    const clientId = String(++clientIdCounter);
    const clientConnection: ClientConnection = { ws, workspace };
    clients.set(clientId, clientConnection);

    // Custom message handler that can update workspace from initialize
    ws.on('message', (data) => {
      const rawStr = data.toString('utf-8');
      const msg = safeJsonParse(rawStr);

      // Try to extract workspace from initialize request
      if (msg?.method === 'initialize' && msg.params) {
        const params = msg.params as Record<string, unknown>;
        // Check clientInfo.cwd or rootUri
        const clientInfo = params.clientInfo as Record<string, unknown> | undefined;
        const cwd = clientInfo?.cwd as string | undefined;
        const rootUri = params.rootUri as string | undefined;
        const workspacePath = cwd || rootUri?.replace('file://', '');

        if (workspacePath && !clientConnection.workspace) {
          clientConnection.workspace = workspacePath;
        }
      }

      jsonRpcHandler(ws, data);
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });
  });

  // Listen on random port
  const port = await new Promise<number>((resolve, reject) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('Failed to get server port'));
      }
    });
    httpServer.on('error', reject);
  });

  const lockPath = writeLockFile({
    port,
    authToken,
    workspaceFolders: currentWorkspaceFolders,
    ideName,
  });

  return {
    port,
    authToken,
    lockPath,
    get workspaceFolders() {
      return currentWorkspaceFolders;
    },
    setEnvForChild(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
      return {
        ...env,
        CLAUDE_CODE_SSE_PORT: String(port),
        ENABLE_IDE_INTEGRATION: 'true',
      };
    },
    updateWorkspaceFolders(folders: string[]): void {
      currentWorkspaceFolders = [...folders];
      writeLockFile({ port, authToken, workspaceFolders: currentWorkspaceFolders, ideName });
    },
    // Send selection_changed notification to Claude Code
    sendSelectionChanged(params: {
      text: string;
      filePath: string;
      fileUrl: string;
      selection: {
        start: { line: number; character: number };
        end: { line: number; character: number };
        isEmpty: boolean;
      };
    }): void {
      sendNotification('selection_changed', params);
    },
    // Send at_mentioned notification to Claude Code
    sendAtMentioned(params: { filePath: string; lineStart: number; lineEnd: number }): void {
      sendNotification('at_mentioned', params);
    },
    dispose(): void {
      deleteLockFile(port);
      ipcMain.removeListener(IPC_CHANNELS.MCP_SELECTION_CHANGED, onSelectionChanged);
      ipcMain.removeListener(IPC_CHANNELS.MCP_AT_MENTIONED, onAtMentioned);
      try {
        wss.close();
      } catch {
        // Ignore
      }
      try {
        httpServer.close();
      } catch {
        // Ignore
      }
    },
  };
}

// Singleton instance
let bridgeInstance: ClaudeIdeBridgeInstance | null = null;

export async function initClaudeIdeBridge(
  options?: ClaudeIdeBridgeOptions
): Promise<ClaudeIdeBridgeInstance> {
  if (bridgeInstance) {
    return bridgeInstance;
  }
  bridgeInstance = await startClaudeIdeBridge(options);
  return bridgeInstance;
}

export function disposeClaudeIdeBridge(): void {
  if (bridgeInstance) {
    bridgeInstance.dispose();
    bridgeInstance = null;
  }
}

export function getClaudeIdeBridge(): ClaudeIdeBridgeInstance | null {
  return bridgeInstance;
}

export function updateClaudeWorkspaceFolders(folders: string[]): void {
  if (bridgeInstance) {
    bridgeInstance.updateWorkspaceFolders(folders);
  }
}

// Dynamic enable/disable based on settings
let bridgeOptions: ClaudeIdeBridgeOptions = { ideName: 'EnsoAI' };

export async function setClaudeBridgeEnabled(
  enabled: boolean,
  workspaceFolders?: string[]
): Promise<boolean> {
  if (enabled) {
    // Skip bridge setup if Claude is not installed
    if (!isClaudeInstalled()) {
      console.log('[ClaudeIdeBridge] Claude not installed, skipping bridge setup');
      return false;
    }

    if (!bridgeInstance) {
      bridgeInstance = await startClaudeIdeBridge({
        ...bridgeOptions,
        workspaceFolders: workspaceFolders ?? [],
      });
    } else if (workspaceFolders) {
      bridgeInstance.updateWorkspaceFolders(workspaceFolders);
    }
    return true;
  } else {
    if (bridgeInstance) {
      bridgeInstance.dispose();
      bridgeInstance = null;
    }
    return false;
  }
}

export function getClaudeBridgeStatus(): { enabled: boolean; port: number | null } {
  return {
    enabled: bridgeInstance !== null,
    port: bridgeInstance?.port ?? null,
  };
}

export function setBridgeOptions(options: ClaudeIdeBridgeOptions): void {
  bridgeOptions = { ...bridgeOptions, ...options };
}

/**
 * Enable or disable the Stop hook for precise agent completion notifications
 */
export function setStopHookEnabled(enabled: boolean): boolean {
  if (enabled) {
    return ensureStopHook();
  } else {
    return removeStopHook();
  }
}

/**
 * Enable or disable the Status Line hook for displaying agent status
 */
export function setStatusLineHookEnabled(enabled: boolean): boolean {
  if (enabled) {
    return ensureStatusLineHook();
  } else {
    return removeStatusLineHook();
  }
}

// Register IPC handlers for bridge control
export function registerClaudeBridgeIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.MCP_BRIDGE_SET_ENABLED,
    async (_, enabled: boolean, workspaceFolders?: string[]) => {
      return setClaudeBridgeEnabled(enabled, workspaceFolders);
    }
  );

  ipcMain.handle(IPC_CHANNELS.MCP_BRIDGE_GET_STATUS, () => {
    return getClaudeBridgeStatus();
  });

  ipcMain.handle(IPC_CHANNELS.MCP_STOP_HOOK_SET, (_, enabled: boolean) => {
    return setStopHookEnabled(enabled);
  });

  ipcMain.handle(IPC_CHANNELS.MCP_STATUSLINE_HOOK_SET, (_, enabled: boolean) => {
    return setStatusLineHookEnabled(enabled);
  });

  ipcMain.handle(IPC_CHANNELS.MCP_STATUSLINE_HOOK_STATUS, () => {
    return isStatusLineHookInstalled();
  });
}
