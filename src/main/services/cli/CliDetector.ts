import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  AgentCliInfo,
  AgentCliStatus,
  BuiltinAgentId,
  CustomAgent,
  ShellConfig,
} from '@shared/types';
import { getEnhancedPath } from '../terminal/PtyManager';
import { shellDetector } from '../terminal/ShellDetector';

const isWindows = process.platform === 'win32';

const execAsync = promisify(exec);

interface BuiltinAgentConfig {
  id: BuiltinAgentId;
  name: string;
  command: string;
  versionFlag: string;
  versionRegex?: RegExp;
}

const BUILTIN_AGENT_CONFIGS: BuiltinAgentConfig[] = [
  {
    id: 'claude',
    name: 'Claude',
    command: 'claude',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'droid',
    name: 'Droid',
    command: 'droid',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: 'gemini',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'auggie',
    name: 'Auggie',
    command: 'auggie',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    command: 'cursor-agent',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
];

export interface CliDetectOptions {
  includeWsl?: boolean;
  shellConfig?: ShellConfig;
}

class CliDetector {
  private cachedStatus: AgentCliStatus | null = null;
  private cachedAgents: Map<string, AgentCliInfo> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache
  private wslAvailable: boolean | null = null;
  private currentShellConfig: ShellConfig | null = null;

  /**
   * Set shell config for command execution
   */
  setShellConfig(config: ShellConfig): void {
    this.currentShellConfig = config;
  }

  /**
   * Execute command in login shell to load user's environment (PATH, nvm, etc.)
   * Uses user's configured shell from settings.
   */
  private async execInLoginShell(command: string, timeout = 5000): Promise<string> {
    const escapedCommand = command.replace(/"/g, '\\"');

    // Use user's configured shell if available
    if (this.currentShellConfig) {
      const { shell, execArgs } = shellDetector.resolveShellForCommand(this.currentShellConfig);
      // Quote shell path in case it contains spaces (e.g., "C:\Program Files\PowerShell\7\pwsh.exe")
      const fullCommand = `"${shell}" ${execArgs.map((a) => `"${a}"`).join(' ')} "${escapedCommand}"`;
      // Don't override PATH - let the login shell load environment from profile
      // This is important for version managers like vfox that initialize in profile
      const { stdout } = await execAsync(fullCommand, { timeout });
      return stdout;
    }

    // Fallback to default behavior
    if (isWindows) {
      // Windows: use PowerShell by default for better environment support
      const { stdout } = await execAsync(`powershell.exe -NoLogo -Command "${escapedCommand}"`, {
        timeout,
        env: { ...process.env, PATH: getEnhancedPath() },
      });
      return stdout;
    }

    // Unix: use $SHELL with login flags
    const shell = process.env.SHELL || '/bin/sh';
    try {
      const { stdout } = await execAsync(`${shell} -ilc "${escapedCommand}"`, {
        timeout,
      });
      return stdout;
    } catch {
      const { stdout } = await execAsync(`${shell} -lc "${escapedCommand}"`, {
        timeout,
      });
      return stdout;
    }
  }

  private async isWslAvailable(): Promise<boolean> {
    if (this.wslAvailable !== null) {
      return this.wslAvailable;
    }
    if (!isWindows) {
      this.wslAvailable = false;
      return false;
    }
    try {
      await execAsync('wsl --status', { timeout: 3000 });
      this.wslAvailable = true;
      return true;
    } catch {
      this.wslAvailable = false;
      return false;
    }
  }

  async detectBuiltin(config: BuiltinAgentConfig): Promise<AgentCliInfo> {
    try {
      const stdout = await this.execInLoginShell(`${config.command} ${config.versionFlag}`);

      let version: string | undefined;
      if (config.versionRegex) {
        const match = stdout.match(config.versionRegex);
        version = match ? match[1] : undefined;
      }

      return {
        id: config.id,
        name: config.name,
        command: config.command,
        installed: true,
        version,
        isBuiltin: true,
        environment: 'native',
      };
    } catch {
      return {
        id: config.id,
        name: config.name,
        command: config.command,
        installed: false,
        isBuiltin: true,
      };
    }
  }

  async detectBuiltinInWsl(config: BuiltinAgentConfig): Promise<AgentCliInfo> {
    try {
      // Use interactive login shell (-il) to load nvm/rbenv/pyenv and other version managers
      // Use $SHELL to respect user's default shell (bash/zsh/etc)
      await execAsync(`wsl -- sh -c 'exec $SHELL -ilc "which ${config.command}"'`, {
        timeout: 8000,
      });
      const { stdout } = await execAsync(
        `wsl -- sh -c 'exec $SHELL -ilc "${config.command} ${config.versionFlag}"'`,
        {
          timeout: 8000,
        }
      );

      let version: string | undefined;
      if (config.versionRegex) {
        const match = stdout.match(config.versionRegex);
        version = match ? match[1] : undefined;
      }

      return {
        id: `${config.id}-wsl`,
        name: `${config.name} (WSL)`,
        command: config.command,
        installed: true,
        version,
        isBuiltin: true,
        environment: 'wsl',
      };
    } catch {
      return {
        id: `${config.id}-wsl`,
        name: `${config.name} (WSL)`,
        command: config.command,
        installed: false,
        isBuiltin: true,
        environment: 'wsl',
      };
    }
  }

  async detectCustom(agent: CustomAgent): Promise<AgentCliInfo> {
    try {
      const stdout = await this.execInLoginShell(`${agent.command} --version`);

      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      const version = match ? match[1] : undefined;

      return {
        id: agent.id,
        name: agent.name,
        command: agent.command,
        installed: true,
        version,
        isBuiltin: false,
        environment: 'native',
      };
    } catch {
      return {
        id: agent.id,
        name: agent.name,
        command: agent.command,
        installed: false,
        isBuiltin: false,
      };
    }
  }

  async detectCustomInWsl(agent: CustomAgent): Promise<AgentCliInfo> {
    try {
      // Use interactive login shell (-il) to load nvm/rbenv/pyenv and other version managers
      // Use $SHELL to respect user's default shell (bash/zsh/etc)
      await execAsync(`wsl -- sh -c 'exec $SHELL -ilc "which ${agent.command}"'`, {
        timeout: 8000,
      });
      const { stdout } = await execAsync(
        `wsl -- sh -c 'exec $SHELL -ilc "${agent.command} --version"'`,
        {
          timeout: 8000,
        }
      );

      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      const version = match ? match[1] : undefined;

      return {
        id: `${agent.id}-wsl`,
        name: `${agent.name} (WSL)`,
        command: agent.command,
        installed: true,
        version,
        isBuiltin: false,
        environment: 'wsl',
      };
    } catch {
      return {
        id: `${agent.id}-wsl`,
        name: `${agent.name} (WSL)`,
        command: agent.command,
        installed: false,
        isBuiltin: false,
        environment: 'wsl',
      };
    }
  }

  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
  }

  async detectOne(
    agentId: string,
    customAgent?: CustomAgent,
    options?: CliDetectOptions
  ): Promise<AgentCliInfo> {
    // Set shell config if provided
    if (options?.shellConfig) {
      this.setShellConfig(options.shellConfig);
    }

    // Check cache first
    if (this.isCacheValid() && this.cachedAgents.has(agentId)) {
      return this.cachedAgents.get(agentId)!;
    }

    // Check if this is a WSL agent (id ends with -wsl)
    const isWslAgent = agentId.endsWith('-wsl');
    const baseAgentId = isWslAgent ? agentId.slice(0, -4) : agentId;

    let result: AgentCliInfo;

    if (isWslAgent) {
      // Check if WSL is available first
      if (!(await this.isWslAvailable())) {
        result = {
          id: agentId,
          name: `${baseAgentId} (WSL)`,
          command: baseAgentId,
          installed: false,
          isBuiltin: false,
          environment: 'wsl',
        };
      } else {
        const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === baseAgentId);
        if (builtinConfig) {
          result = await this.detectBuiltinInWsl(builtinConfig);
        } else if (customAgent) {
          // For WSL custom agent, use the base agent info
          const baseAgent = { ...customAgent, id: baseAgentId };
          result = await this.detectCustomInWsl(baseAgent);
        } else {
          result = {
            id: agentId,
            name: `${baseAgentId} (WSL)`,
            command: baseAgentId,
            installed: false,
            isBuiltin: false,
            environment: 'wsl',
          };
        }
      }
    } else {
      const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === agentId);
      if (builtinConfig) {
        result = await this.detectBuiltin(builtinConfig);
      } else if (customAgent) {
        result = await this.detectCustom(customAgent);
      } else {
        result = {
          id: agentId,
          name: agentId,
          command: agentId,
          installed: false,
          isBuiltin: false,
        };
      }
    }

    // Cache the result
    this.cachedAgents.set(agentId, result);
    if (!this.isCacheValid()) {
      this.cacheTimestamp = Date.now();
    }

    return result;
  }

  /**
   * Detect all agents in parallel using Promise.all
   */
  private async detectAllInShell(
    configs: Array<{ id: string; command: string; versionFlag: string; versionRegex?: RegExp }>,
    customAgents: CustomAgent[]
  ): Promise<Map<string, { installed: boolean; version?: string }>> {
    const results = new Map<string, { installed: boolean; version?: string }>();
    const allCommands: Array<{ id: string; command: string; versionRegex?: RegExp }> = [];

    for (const config of configs) {
      allCommands.push({
        id: config.id,
        command: `${config.command} ${config.versionFlag}`,
        versionRegex: config.versionRegex,
      });
    }

    for (const agent of customAgents) {
      allCommands.push({
        id: agent.id,
        command: `${agent.command} --version`,
        versionRegex: /(\d+\.\d+\.\d+)/,
      });
    }

    const detectPromises = allCommands.map(async ({ id, command, versionRegex }) => {
      try {
        const output = await this.execInLoginShell(command, 5000);
        const versionMatch = versionRegex ? output.match(versionRegex) : null;
        results.set(id, {
          installed: true,
          version: versionMatch ? versionMatch[1] : undefined,
        });
      } catch {
        results.set(id, { installed: false });
      }
    });

    await Promise.all(detectPromises);
    return results;
  }

  /**
   * Detect all agents in WSL in parallel using Promise.all
   */
  private async detectAllInWsl(
    configs: Array<{ id: string; command: string; versionFlag: string; versionRegex?: RegExp }>,
    customAgents: CustomAgent[]
  ): Promise<Map<string, { installed: boolean; version?: string }>> {
    const results = new Map<string, { installed: boolean; version?: string }>();
    const allCommands: Array<{ id: string; command: string; versionRegex?: RegExp }> = [];

    for (const config of configs) {
      allCommands.push({
        id: `${config.id}-wsl`,
        command: `${config.command} ${config.versionFlag}`,
        versionRegex: config.versionRegex,
      });
    }

    for (const agent of customAgents) {
      allCommands.push({
        id: `${agent.id}-wsl`,
        command: `${agent.command} --version`,
        versionRegex: /(\d+\.\d+\.\d+)/,
      });
    }

    const detectPromises = allCommands.map(async ({ id, command, versionRegex }) => {
      try {
        const { stdout } = await execAsync(`wsl -- sh -c 'exec $SHELL -ilc "${command}"'`, {
          timeout: 8000,
        });
        const versionMatch = versionRegex ? stdout.match(versionRegex) : null;
        results.set(id, {
          installed: true,
          version: versionMatch ? versionMatch[1] : undefined,
        });
      } catch {
        results.set(id, { installed: false });
      }
    });

    await Promise.all(detectPromises);
    return results;
  }

  async detectAll(
    customAgents: CustomAgent[] = [],
    options: CliDetectOptions = {}
  ): Promise<AgentCliStatus> {
    // Set shell config if provided
    if (options.shellConfig) {
      this.setShellConfig(options.shellConfig);
    }

    // Return cached status if still valid
    if (this.isCacheValid() && this.cachedStatus) {
      return this.cachedStatus;
    }

    const agents: AgentCliInfo[] = [];

    // Detect native agents in parallel
    const nativeResults = await this.detectAllInShell(BUILTIN_AGENT_CONFIGS, customAgents);

    // Build native agent info
    for (const config of BUILTIN_AGENT_CONFIGS) {
      const result = nativeResults.get(config.id);
      agents.push({
        id: config.id,
        name: config.name,
        command: config.command,
        installed: result?.installed ?? false,
        version: result?.version,
        isBuiltin: true,
        environment: 'native',
      });
    }

    for (const agent of customAgents) {
      const result = nativeResults.get(agent.id);
      agents.push({
        id: agent.id,
        name: agent.name,
        command: agent.command,
        installed: result?.installed ?? false,
        version: result?.version,
        isBuiltin: false,
        environment: 'native',
      });
    }

    // Detect WSL agents in parallel if enabled
    if (options.includeWsl && (await this.isWslAvailable())) {
      const wslResults = await this.detectAllInWsl(BUILTIN_AGENT_CONFIGS, customAgents);

      for (const config of BUILTIN_AGENT_CONFIGS) {
        const result = wslResults.get(`${config.id}-wsl`);
        agents.push({
          id: `${config.id}-wsl`,
          name: `${config.name} (WSL)`,
          command: config.command,
          installed: result?.installed ?? false,
          version: result?.version,
          isBuiltin: true,
          environment: 'wsl',
        });
      }

      for (const agent of customAgents) {
        const result = wslResults.get(`${agent.id}-wsl`);
        agents.push({
          id: `${agent.id}-wsl`,
          name: `${agent.name} (WSL)`,
          command: agent.command,
          installed: result?.installed ?? false,
          version: result?.version,
          isBuiltin: false,
          environment: 'wsl',
        });
      }
    }

    // Update caches
    this.cachedStatus = { agents };
    this.cacheTimestamp = Date.now();
    for (const agent of agents) {
      this.cachedAgents.set(agent.id, agent);
    }

    return this.cachedStatus;
  }

  /**
   * Force refresh cache on next detection
   */
  invalidateCache(): void {
    this.cacheTimestamp = 0;
    this.cachedAgents.clear();
    this.cachedStatus = null;
  }

  getCached(): AgentCliStatus | null {
    return this.cachedStatus;
  }
}

export const cliDetector = new CliDetector();
