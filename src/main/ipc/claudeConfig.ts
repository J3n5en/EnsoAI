import type { McpServer } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import {
  deleteMcpServer,
  readMcpServers,
  syncMcpServers,
  upsertMcpServer,
} from '../services/claude/McpManager';
import {
  addMarketplace,
  getAvailablePlugins,
  getMarketplaces,
  getPlugins,
  installPlugin,
  refreshMarketplaces,
  removeMarketplace,
  setPluginEnabled,
  uninstallPlugin,
} from '../services/claude/PluginsManager';
import { backupClaudeMd, readClaudeMd, writeClaudeMd } from '../services/claude/PromptsManager';

export function registerClaudeConfigHandlers(): void {
  // MCP Management
  ipcMain.handle(IPC_CHANNELS.CLAUDE_MCP_READ, () => {
    return readMcpServers();
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_MCP_SYNC, (_, servers: McpServer[]) => {
    return syncMcpServers(servers);
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_MCP_UPSERT, (_, server: McpServer) => {
    return upsertMcpServer(server);
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_MCP_DELETE, (_, serverId: string) => {
    return deleteMcpServer(serverId);
  });

  // Prompts Management
  ipcMain.handle(IPC_CHANNELS.CLAUDE_PROMPTS_READ, () => {
    return readClaudeMd();
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PROMPTS_WRITE, (_, content: string) => {
    return writeClaudeMd(content);
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PROMPTS_BACKUP, () => {
    return backupClaudeMd();
  });

  // Plugins Management
  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_LIST, () => {
    return getPlugins();
  });

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_SET_ENABLED,
    (_, pluginId: string, enabled: boolean) => {
      return setPluginEnabled(pluginId, enabled);
    }
  );

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_AVAILABLE, (_, marketplace?: string) => {
    return getAvailablePlugins(marketplace);
  });

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_INSTALL,
    (_, pluginName: string, marketplace?: string) => {
      return installPlugin(pluginName, marketplace);
    }
  );

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_UNINSTALL, (_, pluginId: string) => {
    return uninstallPlugin(pluginId);
  });

  // Marketplaces Management
  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_LIST, () => {
    return getMarketplaces();
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_ADD, (_, repo: string) => {
    return addMarketplace(repo);
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REMOVE, (_, name: string) => {
    return removeMarketplace(name);
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REFRESH, (_, name?: string) => {
    return refreshMarketplaces(name);
  });
}
