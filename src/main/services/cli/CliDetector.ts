import { exec } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import type { AgentCliInfo, AgentCliStatus, BuiltinAgentId, CustomAgent } from '@shared/types';

const isWindows = process.platform === 'win32';

const execAsync = promisify(exec);

/**
 * Find user's default shell
 */
function findUserShell(): string {
  const userShell = process.env.SHELL;
  if (userShell && existsSync(userShell)) {
    return userShell;
  }
  // Fallback to common shells
  const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
  for (const shell of shells) {
    if (existsSync(shell)) {
      return shell;
    }
  }
  return '/bin/sh';
}

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
}

class CliDetector {
  private cachedStatus: AgentCliStatus | null = null;
  private wslAvailable: boolean | null = null;

  /**
   * Execute command in login shell to load user's environment (PATH, nvm, etc.)
   */
  private async execInLoginShell(command: string, timeout = 5000): Promise<string> {
    if (isWindows) {
      // Windows: use cmd directly with enhanced PATH
      const { stdout } = await execAsync(command, {
        timeout,
        env: { ...process.env, PATH: this.getEnhancedPath() },
      });
      return stdout;
    }

    // Unix: use login shell to load user's full environment
    const shell = findUserShell();
    const escapedCommand = command.replace(/"/g, '\\"');
    const { stdout } = await execAsync(`${shell} -ilc "${escapedCommand}"`, {
      timeout,
    });
    return stdout;
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

  private getEnhancedPath(): string {
    const home = process.env.HOME || process.env.USERPROFILE || homedir();
    const currentPath = process.env.PATH || '';

    if (isWindows) {
      // Windows: Add common Node.js paths
      const paths = [
        currentPath,
        join(home, 'AppData', 'Roaming', 'npm'),
        join(home, '.volta', 'bin'),
        join(home, 'scoop', 'shims'),
      ];
      return paths.filter(Boolean).join(delimiter);
    }

    // Unix: Add common paths
    const paths = [
      currentPath,
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/opt/homebrew/bin', // macOS Homebrew
      join(home, '.local', 'bin'),
      join(home, '.volta', 'bin'),
      join(home, '.cargo', 'bin'), // Rust
      join(home, '.bun', 'bin'), // Bun
      ...this.getNvmNodeBins(home),
    ];
    return paths.filter(Boolean).join(delimiter);
  }

  private getNvmNodeBins(home: string): string[] {
    const nvmVersionsDir = join(home, '.nvm/versions/node');
    try {
      const versions = readdirSync(nvmVersionsDir);
      return versions.map((v) => join(nvmVersionsDir, v, 'bin'));
    } catch {
      return [];
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

  async detectOne(agentId: string, customAgent?: CustomAgent): Promise<AgentCliInfo> {
    // Check if this is a WSL agent (id ends with -wsl)
    const isWslAgent = agentId.endsWith('-wsl');
    const baseAgentId = isWslAgent ? agentId.slice(0, -4) : agentId;

    if (isWslAgent) {
      // Check if WSL is available first
      if (!(await this.isWslAvailable())) {
        return {
          id: agentId,
          name: `${baseAgentId} (WSL)`,
          command: baseAgentId,
          installed: false,
          isBuiltin: false,
          environment: 'wsl',
        };
      }

      const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === baseAgentId);
      if (builtinConfig) {
        return this.detectBuiltinInWsl(builtinConfig);
      }
      if (customAgent) {
        // For WSL custom agent, use the base agent info
        const baseAgent = { ...customAgent, id: baseAgentId };
        return this.detectCustomInWsl(baseAgent);
      }
    }

    const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === agentId);
    if (builtinConfig) {
      return this.detectBuiltin(builtinConfig);
    }
    if (customAgent) {
      return this.detectCustom(customAgent);
    }
    return {
      id: agentId,
      name: agentId,
      command: agentId,
      installed: false,
      isBuiltin: false,
    };
  }

  async detectAll(
    customAgents: CustomAgent[] = [],
    options: CliDetectOptions = {}
  ): Promise<AgentCliStatus> {
    const builtinPromises = BUILTIN_AGENT_CONFIGS.map((config) => this.detectBuiltin(config));
    const customPromises = customAgents.map((agent) => this.detectCustom(agent));

    const promises: Promise<AgentCliInfo>[] = [...builtinPromises, ...customPromises];

    if (options.includeWsl && (await this.isWslAvailable())) {
      const wslBuiltinPromises = BUILTIN_AGENT_CONFIGS.map((config) =>
        this.detectBuiltinInWsl(config)
      );
      const wslCustomPromises = customAgents.map((agent) => this.detectCustomInWsl(agent));
      promises.push(...wslBuiltinPromises, ...wslCustomPromises);
    }

    const agents = await Promise.all(promises);

    this.cachedStatus = { agents };
    return this.cachedStatus;
  }

  getCached(): AgentCliStatus | null {
    return this.cachedStatus;
  }
}

export const cliDetector = new CliDetector();
