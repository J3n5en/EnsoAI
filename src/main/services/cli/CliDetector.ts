import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type AgentCliInfo,
  type BuiltinAgentId,
  type CliDetectDebugLog,
  type CustomAgent,
  IPC_CHANNELS,
} from '@shared/types';
import { app, BrowserWindow } from 'electron';
import { execInPty, getEnvForCommand, getShellForCommand } from '../../utils/shell';

const isWindows = process.platform === 'win32';
const CLI_DETECT_DEBUG_ENV = 'ENSO_DEBUG_CLI_DETECT';

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
  private hasFileLogErrorNotified = false;

  private isDebugEnabled(): boolean {
    const debugValue = process.env[CLI_DETECT_DEBUG_ENV];
    if (!debugValue) return false;
    return debugValue === '1' || debugValue.toLowerCase() === 'true';
  }

  private getLogFilePath(): string {
    const logBaseDir = app.isReady() ? app.getPath('userData') : process.cwd();
    return join(logBaseDir, 'logs', 'cli-detect.log');
  }

  private emitRendererLog(payload: CliDetectDebugLog): void {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send(IPC_CHANNELS.CLI_DETECT_LOG, payload);
    }
  }

  private writeLogFile(
    level: 'debug' | 'warn',
    message: string,
    details?: Record<string, unknown>
  ): void {
    const payload: CliDetectDebugLog = {
      level,
      message,
      details,
      timestamp: new Date().toISOString(),
    };
    if (this.isDebugEnabled()) {
      this.emitRendererLog(payload);
    }

    try {
      const logFilePath = this.getLogFilePath();
      const logDirPath = dirname(logFilePath);
      mkdirSync(logDirPath, { recursive: true });
      const detailText = details ? ` ${JSON.stringify(details)}` : '';
      const line = `[${payload.timestamp}] [${level}] ${message}${detailText}\n`;
      appendFileSync(logFilePath, line, { encoding: 'utf8' });
    } catch (error) {
      if (!this.hasFileLogErrorNotified) {
        this.hasFileLogErrorNotified = true;
        console.warn('[cli-detect] failed to write cli-detect.log', this.formatError(error));
      }
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private getPathPreview(pathValue: string | undefined): string[] {
    if (!pathValue) return [];
    const delimiter = isWindows ? ';' : ':';
    return pathValue
      .split(delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  private previewOutput(output: string): string {
    const firstLine = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (!firstLine) return '';
    return firstLine.length > 200 ? `${firstLine.slice(0, 200)}...` : firstLine;
  }

  private logDebug(message: string, details?: Record<string, unknown>): void {
    if (!this.isDebugEnabled()) return;
    this.writeLogFile('debug', message, details);
    if (details) {
      console.log(`[cli-detect] ${message}`, details);
      return;
    }
    console.log(`[cli-detect] ${message}`);
  }

  private logDetectFailure(
    agentId: string,
    command: string,
    error: unknown,
    timeout: number,
    phase: 'version' | 'probe'
  ): void {
    const { shell, args } = getShellForCommand();
    const env = getEnvForCommand();

    const details = {
      agentId,
      command,
      phase,
      timeout,
      error: this.formatError(error),
      shell,
      shellArgs: args,
      pathPreview: this.getPathPreview(env.PATH),
      packaged: app.isPackaged,
    };

    this.writeLogFile('warn', 'command detection failed', details);
    console.warn('[cli-detect] command detection failed', details);
  }

  private extractExecutable(command: string): string {
    const trimmed = command.trim();
    if (!trimmed) return '';

    const firstChar = trimmed[0];
    if (firstChar === '"' || firstChar === "'") {
      const endIndex = trimmed.indexOf(firstChar, 1);
      if (endIndex > 1) {
        return trimmed.slice(1, endIndex);
      }
    }

    const firstWhitespaceIndex = trimmed.search(/\s/);
    return firstWhitespaceIndex === -1 ? trimmed : trimmed.slice(0, firstWhitespaceIndex);
  }

  private isPathLike(command: string): boolean {
    return (
      command.includes('/') ||
      command.includes('\\') ||
      /^[a-zA-Z]:/.test(command) ||
      command.startsWith('.')
    );
  }

  private async isCommandAvailable(command: string, timeout: number): Promise<boolean> {
    const executable = this.extractExecutable(command);
    if (!executable) return false;

    if (this.isPathLike(executable)) {
      const exists = existsSync(executable);
      this.logDebug('Path-like command probe result', { command, executable, exists });
      return exists;
    }

    const probeCommand = isWindows ? `where.exe ${executable}` : `command -v ${executable}`;
    this.logDebug('Start command availability probe', {
      command,
      executable,
      probeCommand,
      timeout,
    });
    try {
      const stdout = await execInPty(probeCommand, { timeout: Math.min(timeout, 10000) });
      const available = stdout.trim().length > 0;
      this.logDebug('Command availability probe success', {
        command,
        executable,
        available,
        outputPreview: this.previewOutput(stdout),
      });
      return available;
    } catch (error) {
      this.logDetectFailure(executable, probeCommand, error, Math.min(timeout, 10000), 'probe');
      return false;
    }
  }

  private async detectBuiltin(
    config: BuiltinAgentConfig,
    customPath?: string
  ): Promise<AgentCliInfo> {
    // Use customPath if provided, otherwise use default command
    const effectiveCommand = customPath || config.command;
    // Windows: use 60s timeout due to slower shell initialization (PowerShell, WSL)
    const timeout = isWindows ? 60000 : 15000;
    const { shell, args } = getShellForCommand();
    const env = getEnvForCommand();

    this.logDebug('Start builtin CLI detection', {
      agentId: config.id,
      effectiveCommand,
      timeout,
      shell,
      shellArgs: args,
      pathPreview: this.getPathPreview(env.PATH),
      packaged: process.env.NODE_ENV === 'production',
    });

    try {
      const stdout = await execInPty(`${effectiveCommand} ${config.versionFlag}`, { timeout });

      let version: string | undefined;
      if (config.versionRegex) {
        const match = stdout.match(config.versionRegex);
        version = match ? match[1] : undefined;
      }

      this.logDebug('Builtin CLI version command success', {
        agentId: config.id,
        effectiveCommand,
        version,
        outputPreview: this.previewOutput(stdout),
      });

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
      this.logDetectFailure(
        config.id,
        `${effectiveCommand} ${config.versionFlag}`,
        error,
        timeout,
        'version'
      );
      const commandAvailable = await this.isCommandAvailable(effectiveCommand, timeout);
      this.logDebug('Builtin CLI fallback probe result', {
        agentId: config.id,
        effectiveCommand,
        commandAvailable,
      });

      if (commandAvailable) {
        return {
          id: config.id,
          name: config.name,
          command: config.command,
          installed: true,
          isBuiltin: true,
          environment: 'native',
        };
      }

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
    // Windows: use 60s timeout due to slower shell initialization (PowerShell, WSL)
    const timeout = isWindows ? 60000 : 15000;
    const { shell, args } = getShellForCommand();
    const env = getEnvForCommand();

    this.logDebug('Start custom CLI detection', {
      agentId: agent.id,
      command: agent.command,
      timeout,
      shell,
      shellArgs: args,
      pathPreview: this.getPathPreview(env.PATH),
      packaged: process.env.NODE_ENV === 'production',
    });

    try {
      const stdout = await execInPty(`${agent.command} --version`, { timeout });

      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      const version = match ? match[1] : undefined;

      this.logDebug('Custom CLI version command success', {
        agentId: agent.id,
        command: agent.command,
        version,
        outputPreview: this.previewOutput(stdout),
      });

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
      this.logDetectFailure(agent.id, `${agent.command} --version`, error, timeout, 'version');
      const commandAvailable = await this.isCommandAvailable(agent.command, timeout);
      this.logDebug('Custom CLI fallback probe result', {
        agentId: agent.id,
        command: agent.command,
        commandAvailable,
      });

      if (commandAvailable) {
        return {
          id: agent.id,
          name: agent.name,
          command: agent.command,
          installed: true,
          isBuiltin: false,
          environment: 'native',
        };
      }

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
    this.logDebug('Detect one CLI request received', {
      agentId,
      hasCustomAgent: Boolean(customAgent),
      hasCustomPath: Boolean(customPath),
      customPath: customPath || '',
    });

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
