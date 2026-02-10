import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { killProcessTree } from '../../utils/processUtils';
import { getEnvForCommand, getShellForCommand } from '../../utils/shell';
import { hapiServerManager } from './HapiServerManager';

export interface HapiRunnerStatus {
  running: boolean;
  pid?: number;
  error?: string;
}

type RunnerAction = 'start' | 'stop';

interface RunnerCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

class HapiRunnerManager extends EventEmitter {
  private status: HapiRunnerStatus = { running: false };

  private async getRunnerCommand(action: RunnerAction): Promise<string> {
    const hapiCommand = await hapiServerManager.getHapiCommand();
    return hapiCommand === 'hapi'
      ? `hapi runner ${action}`
      : `npx -y @twsxtd/hapi runner ${action}`;
  }

  private async runRunnerCommand(
    action: RunnerAction,
    timeoutMs = 30000
  ): Promise<RunnerCommandResult> {
    const command = await this.getRunnerCommand(action);
    const { shell, args: shellArgs } = getShellForCommand();

    return new Promise((resolve) => {
      const proc = spawn(shell, [...shellArgs, command], {
        env: getEnvForCommand(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        killProcessTree(proc);
        resolve({ code: null, stdout, stderr, timedOut: true });
      }, timeoutMs);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve({
          code: null,
          stdout,
          stderr: `${stderr}\n${error.message}`.trim(),
          timedOut: false,
        });
      });

      proc.on('exit', (code) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve({ code, stdout, stderr, timedOut: false });
      });
    });
  }

  private setStatus(nextStatus: HapiRunnerStatus): HapiRunnerStatus {
    const changed =
      this.status.running !== nextStatus.running ||
      this.status.pid !== nextStatus.pid ||
      this.status.error !== nextStatus.error;

    this.status = nextStatus;

    if (changed) {
      this.emit('statusChanged', this.status);
    }

    return this.status;
  }

  private buildCommandError(action: RunnerAction, result: RunnerCommandResult): string {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (output) {
      return output;
    }

    if (result.timedOut) {
      return `hapi runner ${action} timed out`;
    }

    return `hapi runner ${action} exited with code ${result.code ?? 'unknown'}`;
  }

  private extractPid(output: string): number | undefined {
    const match = output.match(/\bpid\s*[:=]?\s*(\d+)\b/i);
    if (!match) {
      return undefined;
    }

    const pid = Number(match[1]);
    return Number.isFinite(pid) ? pid : undefined;
  }

  private isRunningOutput(output: string): boolean {
    return /(already\s+running|\brunning\b|\bactive\b|\bonline\b)/i.test(output);
  }

  private isStoppedOutput(output: string): boolean {
    return /(already\s+stopped|not\s+running|\bstopped\b|\binactive\b|no\s+runner)/i.test(output);
  }

  async start(): Promise<HapiRunnerStatus> {
    const result = await this.runRunnerCommand('start', 120000);
    const output = `${result.stdout}\n${result.stderr}`.trim();

    if (result.code === 0 || this.isRunningOutput(output)) {
      return this.setStatus({
        running: true,
        pid: this.extractPid(output),
      });
    }

    return this.setStatus({
      running: false,
      error: this.buildCommandError('start', result),
    });
  }

  async stop(timeoutMs = 30000): Promise<HapiRunnerStatus> {
    const result = await this.runRunnerCommand('stop', timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`.trim();

    if (result.code === 0 || this.isStoppedOutput(output)) {
      return this.setStatus({ running: false });
    }

    if (this.isRunningOutput(output)) {
      return this.setStatus({
        ...this.status,
        running: true,
        error: this.buildCommandError('stop', result),
      });
    }

    return this.setStatus({
      running: false,
      error: this.buildCommandError('stop', result),
    });
  }

  getStatus(): HapiRunnerStatus {
    return this.status;
  }

  async cleanup(timeoutMs = 5000): Promise<void> {
    const status = await this.stop(timeoutMs);
    if (status.error) {
      console.warn('[hapi:runner] Cleanup warning:', status.error);
    }
  }

  cleanupSync(): void {
    void this.stop(3000).catch((error) => {
      console.warn('[hapi:runner] Sync cleanup failed:', error);
    });
  }
}

export const hapiRunnerManager = new HapiRunnerManager();
