import type { ChildProcess } from 'node:child_process';
import { exec, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import type { ShellConfig } from '@shared/types';
import { findLoginShell, getEnhancedPath } from '../terminal/PtyManager';
import { shellDetector } from '../terminal/ShellDetector';

const execAsync = promisify(exec);
const isWindows = process.platform === 'win32';

export interface HapiConfig {
  webappPort: number;
  cliApiToken: string;
  telegramBotToken: string;
  webappUrl: string;
  allowedChatIds: string;
}

export interface HapiGlobalStatus {
  installed: boolean;
  version?: string;
}

export interface HappyGlobalStatus {
  installed: boolean;
  version?: string;
}

export interface HapiStatus {
  running: boolean;
  ready?: boolean;
  pid?: number;
  port?: number;
  error?: string;
}

class HapiServerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private status: HapiStatus = { running: false };
  private ready: boolean = false;

  // Global installation cache
  private globalStatus: HapiGlobalStatus | null = null;
  private globalCacheTimestamp: number = 0;
  private readonly CACHE_TTL = 300000; // 5 minutes cache

  // Happy global installation cache
  private happyGlobalStatus: HappyGlobalStatus | null = null;
  private happyGlobalCacheTimestamp: number = 0;

  // Shell config for command execution
  private currentShellConfig: ShellConfig | null = null;

  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Set shell config for command execution
   */
  setShellConfig(config: ShellConfig): void {
    this.currentShellConfig = config;
  }

  /**
   * Execute command in login shell to load user's environment.
   * Uses user's configured shell from settings if available.
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

    // Fallback to findLoginShell (uses cmd.exe on Windows, $SHELL on Unix)
    const { shell, args } = findLoginShell();
    const fullCommand = `"${shell}" ${args.map((a) => `"${a}"`).join(' ')} "${escapedCommand}"`;
    const { stdout } = await execAsync(fullCommand, {
      timeout,
      env: { ...process.env, PATH: getEnhancedPath() },
    });
    return stdout;
  }

  /**
   * Check if hapi is globally installed (cached)
   */
  async checkGlobalInstall(
    forceRefresh = false,
    shellConfig?: ShellConfig
  ): Promise<HapiGlobalStatus> {
    // Set shell config if provided
    if (shellConfig) {
      this.setShellConfig(shellConfig);
    }

    // Return cached result if still valid
    if (
      !forceRefresh &&
      this.globalStatus &&
      Date.now() - this.globalCacheTimestamp < this.CACHE_TTL
    ) {
      return this.globalStatus;
    }

    try {
      // Increase timeout to 30000ms - PowerShell profile loading can be slow on first run
      const stdout = await this.execInLoginShell('hapi --version', 30000);
      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      this.globalStatus = {
        installed: true,
        version: match ? match[1] : undefined,
      };
    } catch (error: unknown) {
      // PowerShell profile may have non-fatal errors (e.g., Set-PSReadLineOption in non-TTY)
      // Check if stdout contains version info despite the error
      const execError = error as { stdout?: string };
      if (execError.stdout) {
        const match = execError.stdout.match(/(\d+\.\d+\.\d+)/);
        if (match) {
          this.globalStatus = {
            installed: true,
            version: match[1],
          };
          this.globalCacheTimestamp = Date.now();
          return this.globalStatus;
        }
      }
      this.globalStatus = { installed: false };
      // Don't cache failed result - allow immediate retry
      return this.globalStatus;
    }

    this.globalCacheTimestamp = Date.now();
    return this.globalStatus;
  }

  /**
   * Check if happy is globally installed (cached)
   * Uses 'which happy' for fast detection, then gets version separately
   */
  async checkHappyGlobalInstall(
    forceRefresh = false,
    shellConfig?: ShellConfig
  ): Promise<HappyGlobalStatus> {
    // Set shell config if provided
    if (shellConfig) {
      this.setShellConfig(shellConfig);
    }

    // Return cached result if still valid
    if (
      !forceRefresh &&
      this.happyGlobalStatus &&
      Date.now() - this.happyGlobalCacheTimestamp < this.CACHE_TTL
    ) {
      return this.happyGlobalStatus;
    }

    try {
      // Directly execute 'happy --version' like CliDetector does for agent detection
      // This avoids compatibility issues with Get-Command/where.exe/which
      const stdout = await this.execInLoginShell('happy --version', 30000);
      // Match version from first line: "happy version: X.Y.Z"
      const match = stdout.match(/happy version:\s*(\d+\.\d+\.\d+)/i);
      this.happyGlobalStatus = {
        installed: true,
        version: match ? match[1] : undefined,
      };
    } catch (error: unknown) {
      // PowerShell profile may have non-fatal errors (e.g., Set-PSReadLineOption in non-TTY)
      // Check if stdout contains version info despite the error
      const execError = error as { stdout?: string };
      if (execError.stdout) {
        const match = execError.stdout.match(/happy version:\s*(\d+\.\d+\.\d+)/i);
        if (match) {
          this.happyGlobalStatus = {
            installed: true,
            version: match[1],
          };
          this.happyGlobalCacheTimestamp = Date.now();
          return this.happyGlobalStatus;
        }
      }
      this.happyGlobalStatus = { installed: false };
      // Don't cache failed result - allow immediate retry
      return this.happyGlobalStatus;
    }

    this.happyGlobalCacheTimestamp = Date.now();
    return this.happyGlobalStatus;
  }

  /**
   * Get the hapi command to use (global 'hapi' or 'npx -y @twsxtd/hapi')
   */
  async getHapiCommand(): Promise<string> {
    const status = await this.checkGlobalInstall();
    return status.installed ? 'hapi' : 'npx -y @twsxtd/hapi';
  }

  async start(config: HapiConfig): Promise<HapiStatus> {
    if (this.process) {
      return this.status;
    }

    const env: Record<string, string> = {
      ...process.env,
      PATH: getEnhancedPath(),
      WEBAPP_PORT: String(config.webappPort),
    } as Record<string, string>;

    if (config.cliApiToken) {
      env.CLI_API_TOKEN = config.cliApiToken;
    }
    if (config.telegramBotToken) {
      env.TELEGRAM_BOT_TOKEN = config.telegramBotToken;
    }
    if (config.webappUrl) {
      env.WEBAPP_URL = config.webappUrl;
    }
    if (config.allowedChatIds) {
      env.ALLOWED_CHAT_IDS = config.allowedChatIds;
    }

    try {
      // Check if hapi is globally installed
      const hapiCommand = await this.getHapiCommand();
      const isGlobal = hapiCommand === 'hapi';

      // Use login shell to ensure proper environment (nvm, etc.)
      const { shell, args: shellArgs } = findLoginShell();
      const command = isGlobal ? 'hapi server' : 'npx -y @twsxtd/hapi server';

      this.process = spawn(shell, [...shellArgs, command], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });

      this.ready = false;
      this.status = {
        running: true,
        pid: this.process.pid,
        port: config.webappPort,
      };

      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[hapi]', output);
        // Detect when server is ready (listening message)
        if (!this.ready && /listening|started|ready/i.test(output)) {
          console.log('[hapi] Server ready detected!');
          this.ready = true;
          this.status = { ...this.status, ready: true };
          this.emit('statusChanged', this.status);
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.error('[hapi]', output);
        // Also detect ready message from stderr
        if (!this.ready && /listening|started|ready/i.test(output)) {
          console.log('[hapi] Server ready detected (stderr)!');
          this.ready = true;
          this.status = { ...this.status, ready: true };
          this.emit('statusChanged', this.status);
        }
      });

      this.process.on('error', (error) => {
        console.error('[hapi] Process error:', error);
        this.ready = false;
        this.status = { running: false, error: error.message };
        this.process = null;
        this.emit('statusChanged', this.status);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[hapi] Process exited with code ${code}, signal ${signal}`);
        this.ready = false;
        this.status = { running: false };
        this.process = null;
        this.emit('statusChanged', this.status);
      });

      this.emit('statusChanged', this.status);
      return this.status;
    } catch (error) {
      this.status = {
        running: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.emit('statusChanged', this.status);
      return this.status;
    }
  }

  async stop(): Promise<HapiStatus> {
    if (!this.process) {
      return this.status;
    }

    return new Promise((resolve) => {
      const proc = this.process!;
      const pid = proc.pid;

      const timeout = setTimeout(() => {
        this.killProcessTree(pid, 'SIGKILL');
      }, 5000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        this.process = null;
        this.status = { running: false };
        this.emit('statusChanged', this.status);
        resolve(this.status);
      });

      this.killProcessTree(pid, 'SIGTERM');
    });
  }

  private killProcessTree(pid: number | undefined, signal: NodeJS.Signals): void {
    if (!pid) return;

    try {
      if (process.platform !== 'win32') {
        // Kill the entire process group on Unix
        process.kill(-pid, signal);
      } else {
        // On Windows, use taskkill synchronously to ensure process is killed
        spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
      }
    } catch {
      // Process may have already exited
    }
  }

  async restart(config: HapiConfig): Promise<HapiStatus> {
    await this.stop();
    return this.start(config);
  }

  getStatus(): HapiStatus {
    return this.status;
  }

  cleanup(): void {
    if (this.process) {
      this.killProcessTree(this.process.pid, 'SIGKILL');
      this.process = null;
    }
  }
}

export const hapiServerManager = new HapiServerManager();
