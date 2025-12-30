import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentCliInfo, BuiltinAgentId, CustomAgent } from '@shared/types';
import { getEnvForCommand, getShellForCommand } from '../../utils/shell';

const execAsync = promisify(exec);

// Detection timeout in milliseconds (increased for slow shells like PowerShell with -Login)
const DETECT_TIMEOUT = 15000;

/**
 * Check if an error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as { killed?: boolean; signal?: string; code?: string };
    // Node.js kills the process with SIGTERM on timeout
    return err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
  }
  return false;
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

class CliDetector {
  /**
   * Execute command in login shell to load user's environment (PATH, nvm, etc.)
   * Uses user's configured shell from settings.
   */
  private async execInLoginShell(command: string, timeout = DETECT_TIMEOUT): Promise<string> {
    const { shell, args } = getShellForCommand();
    const env = getEnvForCommand();

    let fullCommand: string;
    const shellName = shell.toLowerCase();

    if (shellName.includes('wsl')) {
      // WSL: use user's default shell to load environment properly
      // sh -lc starts login shell, exec $SHELL replaces with user's shell (zsh/bash/etc.)
      const escapedCommand = command.replace(/"/g, '\\"');
      fullCommand = `wsl.exe -- sh -lc 'exec "$SHELL" -ilc "${escapedCommand}"'`;
    } else if (shellName.includes('cmd')) {
      // cmd.exe: don't quote the command, just pass it directly
      fullCommand = `"${shell}" ${args.join(' ')} ${command}`;
    } else if (shellName.includes('powershell') || shellName.includes('pwsh')) {
      // PowerShell: use -Command with the command string
      const escapedCommand = command.replace(/"/g, '\\"');
      fullCommand = `"${shell}" ${args.map((a) => `"${a}"`).join(' ')} "${escapedCommand}"`;
    } else {
      // Unix shells (bash, zsh, etc.): escape quotes and wrap in quotes
      const escapedCommand = command.replace(/"/g, '\\"');
      fullCommand = `"${shell}" ${args.map((a) => `"${a}"`).join(' ')} "${escapedCommand}"`;
    }

    console.log('[CliDetector] shell:', shell, 'args:', args);
    console.log('[CliDetector] fullCommand:', fullCommand);
    try {
      const { stdout, stderr } = await execAsync(fullCommand, { timeout, env });
      console.log('[CliDetector] stdout:', stdout);
      if (stderr) console.log('[CliDetector] stderr:', stderr);
      return stdout;
    } catch (error) {
      console.log('[CliDetector] error:', error);
      throw error;
    }
  }

  private async detectBuiltin(config: BuiltinAgentConfig): Promise<AgentCliInfo> {
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
    } catch (error) {
      return {
        id: config.id,
        name: config.name,
        command: config.command,
        installed: false,
        isBuiltin: true,
        timedOut: isTimeoutError(error),
      };
    }
  }

  private async detectCustom(agent: CustomAgent): Promise<AgentCliInfo> {
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
    } catch (error) {
      return {
        id: agent.id,
        name: agent.name,
        command: agent.command,
        installed: false,
        isBuiltin: false,
        timedOut: isTimeoutError(error),
      };
    }
  }

  async detectOne(agentId: string, customAgent?: CustomAgent): Promise<AgentCliInfo> {
    const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === agentId);
    if (builtinConfig) {
      return await this.detectBuiltin(builtinConfig);
    } else if (customAgent) {
      return await this.detectCustom(customAgent);
    } else {
      return {
        id: agentId,
        name: agentId,
        command: agentId,
        installed: false,
        isBuiltin: false,
      };
    }
  }
}

export const cliDetector = new CliDetector();
