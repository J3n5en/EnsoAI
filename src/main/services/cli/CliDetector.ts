import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentCliInfo, BuiltinAgentId, CustomAgent } from '@shared/types';
import { getEnvForCommand } from '../../utils/shell';

const execFileAsync = promisify(execFile);

/**
 * Check if an error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as { message?: string };
    return err.message === 'Detection timeout';
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
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    versionFlag: '--version',
    versionRegex: /(\d+\.\d+\.\d+)/,
  },
];

class CliDetector {
  private async execVersionCommand(executable: string, args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      timeout: 15000,
      env: getEnvForCommand(),
      windowsHide: true,
    });
    // Some CLIs print version to stderr; treat both as output for regex match.
    return `${stdout ?? ''}${stderr ?? ''}`.trim();
  }

  private async detectBuiltin(
    config: BuiltinAgentConfig,
    customPath?: string
  ): Promise<AgentCliInfo> {
    try {
      // Use customPath if provided, otherwise use default command
      const effectiveCommand = customPath || config.command;
      const stdout = await this.execVersionCommand(effectiveCommand, [config.versionFlag]);

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
      const stdout = await this.execVersionCommand(agent.command, ['--version']);

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

  async detectOne(
    agentId: string,
    customAgent?: CustomAgent,
    customPath?: string
  ): Promise<AgentCliInfo> {
    const builtinConfig = BUILTIN_AGENT_CONFIGS.find((c) => c.id === agentId);
    if (builtinConfig) {
      return await this.detectBuiltin(builtinConfig, customPath);
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
