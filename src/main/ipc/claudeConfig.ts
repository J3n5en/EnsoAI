import type { McpServer } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import {
  deleteMcpServer,
  readMcpServers,
  serverToConfig,
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
import {
  addRepositoryRemoteMarketplace,
  backupRepositoryClaudePrompt,
  installRepositoryRemotePlugin,
  listRepositoryRemoteAvailablePlugins,
  listRepositoryRemoteMarketplaces,
  listRepositoryRemotePlugins,
  readRepositoryClaudePrompt,
  readRepositoryRemoteMcpServers,
  refreshRepositoryRemoteMarketplaces,
  removeRepositoryRemoteMarketplace,
  setRepositoryRemotePluginEnabled,
  uninstallRepositoryRemotePlugin,
  writeRepositoryClaudePrompt,
  writeRepositoryRemoteMcpServers,
} from '../services/remote/RemoteEnvironmentService';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';

export function registerClaudeConfigHandlers(): void {
  // MCP Management
  ipcMain.handle(IPC_CHANNELS.CLAUDE_MCP_READ, async (_, repoPath?: string) => {
    const context = resolveRepositoryRuntimeContext(repoPath);
    if (context.kind === 'remote') {
      return (await readRepositoryRemoteMcpServers(repoPath)) ?? {};
    }
    return readMcpServers();
  });

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MCP_SYNC,
    async (_, repoPath: string | undefined, servers: McpServer[]) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote') {
        const mcpServers: Record<string, import('@shared/types').McpServerConfig> = {};
        for (const server of servers) {
          if (!server.enabled) continue;
          const config = serverToConfig(server);
          if (config) {
            mcpServers[server.id] = config;
          }
        }
        return writeRepositoryRemoteMcpServers(repoPath, mcpServers);
      }
      return syncMcpServers(servers);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MCP_UPSERT,
    async (_, repoPath: string | undefined, server: McpServer) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote') {
        const existing = (await readRepositoryRemoteMcpServers(repoPath)) ?? {};
        const next = { ...existing };
        if (server.enabled) {
          const config = serverToConfig(server);
          if (config) {
            next[server.id] = config;
          }
        } else {
          delete next[server.id];
        }
        return writeRepositoryRemoteMcpServers(repoPath, next);
      }
      return upsertMcpServer(server);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MCP_DELETE,
    async (_, repoPath: string | undefined, serverId: string) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote') {
        const existing = (await readRepositoryRemoteMcpServers(repoPath)) ?? {};
        const next = { ...existing };
        delete next[serverId];
        return writeRepositoryRemoteMcpServers(repoPath, next);
      }
      return deleteMcpServer(serverId);
    }
  );

  // Prompts Management
  ipcMain.handle(IPC_CHANNELS.CLAUDE_PROMPTS_READ, async (_, repoPath?: string) => {
    const context = resolveRepositoryRuntimeContext(repoPath);
    if (context.kind === 'remote') {
      return readRepositoryClaudePrompt(repoPath);
    }
    return readClaudeMd();
  });

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PROMPTS_WRITE,
    async (_, repoPath: string | undefined, content: string) => {
      const context = resolveRepositoryRuntimeContext(repoPath);
      if (context.kind === 'remote') {
        return writeRepositoryClaudePrompt(repoPath, content);
      }
      return writeClaudeMd(content);
    }
  );

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PROMPTS_BACKUP, async (_, repoPath?: string) => {
    const context = resolveRepositoryRuntimeContext(repoPath);
    if (context.kind === 'remote') {
      return backupRepositoryClaudePrompt(repoPath);
    }
    return backupClaudeMd();
  });

  // Plugins Management
  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_LIST, (_, repoPath?: string) => {
    if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
      return listRepositoryRemotePlugins(repoPath);
    }
    return getPlugins();
  });

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_SET_ENABLED,
    (_, repoPath: string | undefined, pluginId: string, enabled: boolean) => {
      if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
        return setRepositoryRemotePluginEnabled(repoPath, pluginId, enabled);
      }
      return setPluginEnabled(pluginId, enabled);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_AVAILABLE,
    (_, repoPath: string | undefined, marketplace?: string) => {
      if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
        return listRepositoryRemoteAvailablePlugins(repoPath, marketplace);
      }
      return getAvailablePlugins(marketplace);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_INSTALL,
    (_, repoPath: string | undefined, pluginName: string, marketplace?: string) => {
      if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
        return installRepositoryRemotePlugin(repoPath, pluginName, marketplace);
      }
      return installPlugin(pluginName, marketplace);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_UNINSTALL,
    (_, repoPath: string | undefined, pluginId: string) => {
      if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
        return uninstallRepositoryRemotePlugin(repoPath, pluginId);
      }
      return uninstallPlugin(pluginId);
    }
  );

  // Marketplaces Management
  ipcMain.handle(IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_LIST, (_, repoPath?: string) => {
    if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
      return listRepositoryRemoteMarketplaces(repoPath);
    }
    return getMarketplaces();
  });

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_ADD,
    (_, repoPath: string | undefined, repo: string) => {
      if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
        return addRepositoryRemoteMarketplace(repoPath, repo);
      }
      return addMarketplace(repo);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REMOVE,
    (_, repoPath: string | undefined, name: string) => {
      if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
        return removeRepositoryRemoteMarketplace(repoPath, name);
      }
      return removeMarketplace(name);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_PLUGINS_MARKETPLACES_REFRESH,
    (_, repoPath: string | undefined, name?: string) => {
      if (resolveRepositoryRuntimeContext(repoPath).kind === 'remote') {
        return refreshRepositoryRemoteMarketplaces(repoPath, name);
      }
      return refreshMarketplaces(name);
    }
  );
}
