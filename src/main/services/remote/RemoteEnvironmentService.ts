import type {
  AvailablePlugin,
  ClaudeSettings,
  ConnectionProfile,
  McpServerConfig,
  Plugin,
  PluginMarketplace,
} from '@shared/types';
import { resolveRepositoryRuntimeContext } from '../repository/RepositoryContextResolver';
import { remoteConnectionManager } from './RemoteConnectionManager';

function normalizeRemoteDir(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

async function getRemoteHomeDir(connectionId: string): Promise<string> {
  const runtime = await remoteConnectionManager.getRuntimeInfo(connectionId);
  return normalizeRemoteDir(runtime.homeDir);
}

async function readRemoteTextFile(
  connectionId: string,
  remotePath: string
): Promise<string | null> {
  try {
    const result = await remoteConnectionManager.call<{ content: string; isBinary?: boolean }>(
      connectionId,
      'fs:read',
      { path: remotePath }
    );
    if (result.isBinary) {
      return null;
    }
    return result.content;
  } catch {
    return null;
  }
}

async function writeRemoteTextFile(
  connectionId: string,
  remotePath: string,
  content: string
): Promise<boolean> {
  try {
    const parent = remotePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '') || '/';
    await remoteConnectionManager.call(connectionId, 'fs:createDirectory', { path: parent });
    await remoteConnectionManager.call(connectionId, 'fs:write', {
      path: remotePath,
      content,
    });
    return true;
  } catch {
    return false;
  }
}

async function readRemoteJsonFile<T>(connectionId: string, remotePath: string): Promise<T | null> {
  const content = await readRemoteTextFile(connectionId, remotePath);
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeRemoteJsonFile(
  connectionId: string,
  remotePath: string,
  data: unknown
): Promise<boolean> {
  return writeRemoteTextFile(connectionId, remotePath, JSON.stringify(data, null, 2));
}

export async function getRepositoryEnvironmentContext(repoPath?: string | null): Promise<
  | {
      kind: 'local';
    }
  | {
      kind: 'remote';
      connectionId: string;
      homeDir: string;
      claudeDir: string;
      claudeSettingsPath: string;
      claudeJsonPath: string;
      claudePromptPath: string;
      claudeCommandsDir: string;
      claudeSkillsDir: string;
    }
> {
  const runtime = resolveRepositoryRuntimeContext(repoPath);
  if (runtime.kind === 'local' || !runtime.connectionId) {
    return { kind: 'local' };
  }

  const homeDir = await getRemoteHomeDir(runtime.connectionId);
  const claudeDir = `${homeDir}/.claude`;

  return {
    kind: 'remote',
    connectionId: runtime.connectionId,
    homeDir,
    claudeDir,
    claudeSettingsPath: `${claudeDir}/settings.json`,
    claudeJsonPath: `${homeDir}/.claude.json`,
    claudePromptPath: `${claudeDir}/CLAUDE.md`,
    claudeCommandsDir: `${claudeDir}/commands`,
    claudeSkillsDir: `${claudeDir}/skills`,
  };
}

export async function readRepositoryClaudeSettings(
  repoPath?: string | null
): Promise<ClaudeSettings | null> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    return null;
  }
  return readRemoteJsonFile<ClaudeSettings>(context.connectionId, context.claudeSettingsPath);
}

export async function writeRepositoryClaudeSettings(
  repoPath: string | undefined,
  data: ClaudeSettings
): Promise<boolean> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    return false;
  }
  return writeRemoteJsonFile(context.connectionId, context.claudeSettingsPath, data);
}

export async function readRepositoryClaudeJson(
  repoPath?: string | null
): Promise<Record<string, unknown> | null> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    return null;
  }
  return readRemoteJsonFile<Record<string, unknown>>(context.connectionId, context.claudeJsonPath);
}

export async function writeRepositoryClaudeJson(
  repoPath: string | undefined,
  data: Record<string, unknown>
): Promise<boolean> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    return false;
  }
  return writeRemoteJsonFile(context.connectionId, context.claudeJsonPath, data);
}

export async function readRepositoryClaudePrompt(repoPath?: string | null): Promise<string | null> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    return null;
  }
  return readRemoteTextFile(context.connectionId, context.claudePromptPath);
}

export async function writeRepositoryClaudePrompt(
  repoPath: string | undefined,
  content: string
): Promise<boolean> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    return false;
  }
  return writeRemoteTextFile(context.connectionId, context.claudePromptPath, content);
}

export async function backupRepositoryClaudePrompt(
  repoPath?: string | null
): Promise<string | null> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    return null;
  }

  const content = await readRemoteTextFile(context.connectionId, context.claudePromptPath);
  if (content === null) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${context.claudeDir}/backups/CLAUDE.md.${timestamp}.bak`;
  const ok = await writeRemoteTextFile(context.connectionId, backupPath, content);
  return ok ? backupPath : null;
}

export async function readRepositoryRemoteMcpServers(
  repoPath?: string | null
): Promise<Record<string, McpServerConfig> | null> {
  const data = await readRepositoryClaudeJson(repoPath);
  if (!data) {
    return null;
  }
  return (data.mcpServers as Record<string, McpServerConfig> | undefined) ?? {};
}

export async function writeRepositoryRemoteMcpServers(
  repoPath: string | undefined,
  nextServers: Record<string, McpServerConfig>
): Promise<boolean> {
  const data = (await readRepositoryClaudeJson(repoPath)) ?? {};
  return writeRepositoryClaudeJson(repoPath, {
    ...data,
    mcpServers: nextServers,
  });
}

export async function listRepositoryRemoteDirectory(
  repoPath: string | undefined,
  remotePath: string
): Promise<Array<{ path: string; isDirectory: boolean; name: string }>> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    return [];
  }
  try {
    return await remoteConnectionManager.call<
      Array<{ path: string; isDirectory: boolean; name: string }>
    >(context.connectionId, 'fs:list', { path: remotePath });
  } catch {
    return [];
  }
}

export async function getRepositoryRemoteConnectionId(
  repoPath?: string | null
): Promise<string | null> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  return context.kind === 'remote' ? context.connectionId : null;
}

export async function getRepositoryRemoteProfile(
  repoPath?: string | null
): Promise<ConnectionProfile | null> {
  const connectionId = await getRepositoryRemoteConnectionId(repoPath);
  if (!connectionId) {
    return null;
  }
  const runtime = await remoteConnectionManager.getRuntimeInfo(connectionId);
  return runtime.profile;
}

async function callRepositoryRemote<T>(
  repoPath: string | undefined,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'local') {
    throw new Error('Repository is not remote');
  }
  return remoteConnectionManager.call<T>(context.connectionId, method, params);
}

export async function listRepositoryRemotePlugins(repoPath?: string): Promise<Plugin[]> {
  return callRepositoryRemote<Plugin[]>(repoPath, 'claude:plugins:list');
}

export async function setRepositoryRemotePluginEnabled(
  repoPath: string | undefined,
  pluginId: string,
  enabled: boolean
): Promise<boolean> {
  return callRepositoryRemote<boolean>(repoPath, 'claude:plugins:setEnabled', {
    pluginId,
    enabled,
  });
}

export async function listRepositoryRemoteAvailablePlugins(
  repoPath: string | undefined,
  marketplace?: string
): Promise<AvailablePlugin[]> {
  return callRepositoryRemote<AvailablePlugin[]>(repoPath, 'claude:plugins:available', {
    marketplace,
  });
}

export async function installRepositoryRemotePlugin(
  repoPath: string | undefined,
  pluginName: string,
  marketplace?: string
): Promise<boolean> {
  return callRepositoryRemote<boolean>(repoPath, 'claude:plugins:install', {
    pluginName,
    marketplace,
  });
}

export async function uninstallRepositoryRemotePlugin(
  repoPath: string | undefined,
  pluginId: string
): Promise<boolean> {
  return callRepositoryRemote<boolean>(repoPath, 'claude:plugins:uninstall', {
    pluginId,
  });
}

export async function listRepositoryRemoteMarketplaces(
  repoPath?: string
): Promise<PluginMarketplace[]> {
  return callRepositoryRemote<PluginMarketplace[]>(repoPath, 'claude:plugins:marketplaces:list');
}

export async function addRepositoryRemoteMarketplace(
  repoPath: string | undefined,
  repo: string
): Promise<boolean> {
  return callRepositoryRemote<boolean>(repoPath, 'claude:plugins:marketplaces:add', {
    repo,
  });
}

export async function removeRepositoryRemoteMarketplace(
  repoPath: string | undefined,
  name: string
): Promise<boolean> {
  return callRepositoryRemote<boolean>(repoPath, 'claude:plugins:marketplaces:remove', {
    name,
  });
}

export async function refreshRepositoryRemoteMarketplaces(
  repoPath: string | undefined,
  name?: string
): Promise<boolean> {
  return callRepositoryRemote<boolean>(repoPath, 'claude:plugins:marketplaces:refresh', {
    name,
  });
}
