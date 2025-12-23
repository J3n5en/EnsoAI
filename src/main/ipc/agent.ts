import { IPC_CHANNELS } from '@shared/types';
import { BrowserWindow, ipcMain } from 'electron';
import { AgentRegistry, BUILTIN_AGENTS } from '../services/agent/AgentRegistry';
import { AgentSessionManager } from '../services/agent/AgentSession';

const registry = new AgentRegistry(BUILTIN_AGENTS);
const sessionManager = new AgentSessionManager();

export function registerAgentHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AGENT_LIST, async () => {
    return registry.list();
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_START, async (event, agentId: string, workdir: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error('No window found');
    }

    const agent = registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const session = await sessionManager.create(agent, workdir, (message) => {
      window.webContents.send(IPC_CHANNELS.AGENT_MESSAGE, message);
    });

    return session.id;
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_STOP, async (_, sessionId: string) => {
    await sessionManager.stop(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_SEND, async (_, sessionId: string, content: string) => {
    await sessionManager.send(sessionId, content);
  });
}
