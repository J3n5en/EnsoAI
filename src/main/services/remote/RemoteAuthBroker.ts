import { randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  ConnectionProfile,
  RemoteAuthPrompt,
  RemoteAuthPromptKind,
  RemoteAuthResponse,
} from '@shared/types';
import { BrowserWindow } from 'electron';
import type { HostVerificationPrompt } from './RemoteHostVerification';
import { parseHostVerificationPrompt } from './RemoteHostVerification';
import { createRemoteError, translateRemote } from './RemoteI18n';

type PromptResolver =
  | {
      kind: 'secret';
      resolve: (value: string) => void;
      reject: (error: Error) => void;
      profileId: string;
      cacheKey?: string;
      timeout: ReturnType<typeof setTimeout>;
    }
  | {
      kind: 'confirm';
      resolve: (value: boolean) => void;
      reject: (error: Error) => void;
      profileId: string;
      timeout: ReturnType<typeof setTimeout>;
    };

interface AskpassArtifacts {
  scriptPath: string;
  wrapperPath: string;
}

const MAX_PROMPT_MESSAGE_CHARS = 64 * 1024;
const AUTH_SOCKET_TIMEOUT_MS = 30_000;
const AUTH_PROMPT_SCRIPT_TIMEOUT_MS = AUTH_SOCKET_TIMEOUT_MS + 5_000;
const AUTH_PROMPT_RESPONSE_TIMEOUT_MS = 120_000;

function tokensEqual(left: string | undefined, right: string): boolean {
  if (typeof left !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function classifyPrompt(promptText: string): RemoteAuthPromptKind {
  const normalized = promptText.toLowerCase();
  if (normalized.includes('passphrase')) {
    return 'passphrase';
  }
  if (normalized.includes('password')) {
    return 'password';
  }
  return 'keyboard-interactive';
}

function buildPromptTitle(kind: RemoteAuthPromptKind): string {
  switch (kind) {
    case 'password':
      return translateRemote('SSH password required');
    case 'passphrase':
      return translateRemote('SSH key passphrase required');
    case 'keyboard-interactive':
      return translateRemote('SSH verification required');
    case 'host-verification':
      return translateRemote('Verify remote host');
  }
}

function buildPromptLabel(kind: RemoteAuthPromptKind): string {
  switch (kind) {
    case 'password':
      return translateRemote('Password');
    case 'passphrase':
      return translateRemote('Passphrase');
    case 'keyboard-interactive':
      return translateRemote('Response');
    case 'host-verification':
      return translateRemote('Confirm');
  }
}

function normalizePromptSignature(promptText: string): string {
  return promptText.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getBrokerRoot(): string {
  return join(process.env.HOME || process.env.USERPROFILE || homedir(), '.ensoai', 'remote-auth');
}

function normalizePromptText(promptText: string): string {
  return promptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function getAskpassScriptContent(): string {
  return String.raw`#!/usr/bin/env node
const net = require('node:net');

function fail(code = 1) {
  process.exit(code);
}

const port = Number(process.env.ENSO_REMOTE_PROMPT_PORT || '');
const token = process.env.ENSO_REMOTE_PROMPT_TOKEN || '';
const profileId = process.env.ENSO_REMOTE_PROFILE_ID || '';
const sessionId = process.env.ENSO_REMOTE_PROMPT_SESSION_ID || '';
const hostPort = Number(process.env.ENSO_REMOTE_HOST_PORT || '');
const prompt = process.argv.slice(2).join(' ');

if (!port || !token || !profileId) {
  fail(2);
}

const socket = net.createConnection({ host: '127.0.0.1', port });
socket.setEncoding('utf8');
let buffer = '';
let finished = false;

function finish(code) {
  if (finished) return;
  finished = true;
  socket.end();
  process.exit(code);
}

socket.on('connect', () => {
  socket.write(
    JSON.stringify({
      token,
      profileId,
      sessionId: sessionId || undefined,
      hostPort: Number.isFinite(hostPort) && hostPort > 0 ? hostPort : undefined,
      prompt,
    }) + '\n'
  );
});

socket.on('data', (chunk) => {
  buffer += chunk;
  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex === -1) return;
  const line = buffer.slice(0, newlineIndex);
  try {
    const message = JSON.parse(line);
    if (message && message.ok && typeof message.secret === 'string') {
      process.stdout.write(message.secret);
      finish(0);
      return;
    }
    if (message && message.error) {
      process.stderr.write(String(message.error) + '\n');
    }
  } catch {}
  finish(1);
});

socket.on('error', () => fail(1));
socket.on('close', () => finish(1));
setTimeout(() => fail(1), ${AUTH_PROMPT_SCRIPT_TIMEOUT_MS});
`;
}

function getUnixWrapperContent(scriptPath: string): string {
  return `#!/bin/sh
ELECTRON_RUN_AS_NODE=1 exec ${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)} "$@"
`;
}

function getWindowsWrapperContent(scriptPath: string): string {
  return `@echo off\r
set ELECTRON_RUN_AS_NODE=1\r
"${process.execPath}" "${scriptPath}" %*\r
`;
}

export class RemoteAuthBroker {
  private readonly token = randomUUID();
  private server: net.Server | null = null;
  private port: number | null = null;
  private artifacts: AskpassArtifacts | null = null;
  private pendingPrompts = new Map<string, PromptResolver>();
  private pendingSecrets = new Map<string, Promise<string>>();
  private secretCache = new Map<string, Map<string, string>>();
  private profiles = new Map<string, ConnectionProfile>();

  async getAskpassEnv(
    profile: ConnectionProfile,
    sessionId?: string,
    hostPort?: number
  ): Promise<Record<string, string>> {
    await this.ensureServer();
    const artifacts = await this.ensureArtifacts();
    this.profiles.set(profile.id, profile);

    const env: Record<string, string> = {
      ENSO_REMOTE_PROMPT_PORT: String(this.port),
      ENSO_REMOTE_PROMPT_TOKEN: this.token,
      ENSO_REMOTE_PROFILE_ID: profile.id,
      SSH_ASKPASS: artifacts.wrapperPath,
      SSH_ASKPASS_REQUIRE: 'force',
    };

    if (sessionId) {
      env.ENSO_REMOTE_PROMPT_SESSION_ID = sessionId;
    }
    if (hostPort && Number.isFinite(hostPort) && hostPort > 0) {
      env.ENSO_REMOTE_HOST_PORT = String(hostPort);
    }

    if (process.platform !== 'win32' && !process.env.DISPLAY) {
      env.DISPLAY = 'ensoai-askpass:0';
    }

    return env;
  }

  async requestSecret(profile: ConnectionProfile, promptText: string): Promise<string> {
    const cacheKey = normalizePromptSignature(promptText);
    const cached = this.secretCache.get(profile.id)?.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const pendingKey = `${profile.id}:${cacheKey}`;
    const inFlight = this.pendingSecrets.get(pendingKey);
    if (inFlight) {
      return inFlight;
    }

    const kind = classifyPrompt(promptText);
    const prompt: RemoteAuthPrompt = {
      id: randomUUID(),
      connectionId: profile.id,
      sshTarget: profile.sshTarget,
      profileName: profile.name,
      kind,
      title: buildPromptTitle(kind),
      message: translateRemote('Enter the SSH credential to continue connecting to {{target}}.', {
        target: profile.sshTarget,
      }),
      promptText,
      secretLabel: buildPromptLabel(kind),
      confirmLabel: translateRemote('Continue'),
      cancelLabel: translateRemote('Cancel'),
    };

    const promise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingPrompts.delete(prompt.id);
        reject(createRemoteError('SSH authentication prompt timed out'));
      }, AUTH_PROMPT_RESPONSE_TIMEOUT_MS);
      this.pendingPrompts.set(prompt.id, {
        kind: 'secret',
        resolve,
        reject,
        profileId: profile.id,
        cacheKey,
        timeout,
      });
      this.broadcastPrompt(prompt);
    })
      .then((secret) => {
        let cache = this.secretCache.get(profile.id);
        if (!cache) {
          cache = new Map();
          this.secretCache.set(profile.id, cache);
        }
        cache.set(cacheKey, secret);
        return secret;
      })
      .finally(() => {
        this.pendingSecrets.delete(pendingKey);
      });

    this.pendingSecrets.set(pendingKey, promise);
    return promise;
  }

  async requestHostVerification(
    profile: ConnectionProfile,
    parsed: HostVerificationPrompt,
    promptText?: string
  ): Promise<boolean> {
    const prompt: RemoteAuthPrompt = {
      id: randomUUID(),
      connectionId: profile.id,
      sshTarget: profile.sshTarget,
      profileName: profile.name,
      kind: 'host-verification',
      title: buildPromptTitle('host-verification'),
      message: translateRemote(
        'The remote host is not in your trusted list yet. Verify the fingerprint before continuing.'
      ),
      promptText,
      host: parsed.host,
      port: parsed.port,
      fingerprints: parsed.fingerprints,
      confirmLabel: translateRemote('Trust host'),
      cancelLabel: translateRemote('Cancel'),
    };

    return new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingPrompts.delete(prompt.id);
        reject(createRemoteError('SSH authentication prompt timed out'));
      }, AUTH_PROMPT_RESPONSE_TIMEOUT_MS);
      this.pendingPrompts.set(prompt.id, {
        kind: 'confirm',
        resolve: () => resolve(true),
        reject,
        profileId: profile.id,
        timeout,
      });
      this.broadcastPrompt(prompt);
    });
  }

  respond(response: RemoteAuthResponse): boolean {
    const pending = this.pendingPrompts.get(response.promptId);
    if (!pending) {
      return false;
    }

    this.pendingPrompts.delete(response.promptId);
    clearTimeout(pending.timeout);
    if (!response.accepted) {
      pending.reject(createRemoteError('SSH authentication was cancelled'));
      return true;
    }

    if (pending.kind === 'secret' && typeof response.secret === 'string') {
      pending.resolve(response.secret);
      return true;
    }

    if (pending.kind === 'confirm') {
      pending.resolve(true);
      return true;
    }

    pending.reject(createRemoteError('SSH authentication was cancelled'));
    return true;
  }

  clearSecrets(profileId: string): void {
    this.secretCache.delete(profileId);
  }

  async dispose(): Promise<void> {
    for (const pending of this.pendingPrompts.values()) {
      clearTimeout(pending.timeout);
      pending.reject(createRemoteError('SSH authentication was cancelled'));
    }
    this.pendingPrompts.clear();
    this.pendingSecrets.clear();
    this.secretCache.clear();
    this.profiles.clear();

    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
      this.server = null;
      this.port = null;
    });
  }

  private async ensureArtifacts(): Promise<AskpassArtifacts> {
    if (this.artifacts) {
      return this.artifacts;
    }

    const root = getBrokerRoot();
    await mkdir(root, { recursive: true });
    const scriptPath = join(root, 'ssh-askpass.cjs');
    const wrapperPath =
      process.platform === 'win32' ? join(root, 'ssh-askpass.cmd') : join(root, 'ssh-askpass.sh');

    await writeFile(scriptPath, getAskpassScriptContent(), 'utf8');
    await writeFile(
      wrapperPath,
      process.platform === 'win32'
        ? getWindowsWrapperContent(scriptPath)
        : getUnixWrapperContent(scriptPath),
      'utf8'
    );

    if (process.platform !== 'win32') {
      await chmod(scriptPath, 0o700);
      await chmod(wrapperPath, 0o700);
    }

    this.artifacts = { scriptPath, wrapperPath };
    return this.artifacts;
  }

  private async ensureServer(): Promise<void> {
    if (this.server && this.port) {
      return;
    }

    await mkdir(getBrokerRoot(), { recursive: true });
    this.server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.setTimeout(AUTH_SOCKET_TIMEOUT_MS);
      let buffer = '';
      let settled = false;

      const finish = (payload: { ok: boolean; secret?: string; error?: string }): void => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          if (!socket.destroyed) {
            socket.end(`${JSON.stringify(payload)}\n`);
          }
        } catch {
          // Ignore disconnect races while finishing auth exchange.
        }
      };

      socket.on('data', async (chunk: string) => {
        if (settled) {
          return;
        }

        buffer += chunk;
        if (buffer.length > MAX_PROMPT_MESSAGE_CHARS) {
          finish({
            ok: false,
            error: translateRemote('SSH authentication prompt payload is too large'),
          });
          return;
        }

        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          return;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        try {
          const payload = JSON.parse(line) as {
            token?: string;
            profileId?: string;
            sessionId?: string;
            hostPort?: number;
            prompt?: string;
          };
          if (!tokensEqual(payload.token, this.token) || !payload.profileId || !payload.prompt) {
            finish({ ok: false });
            return;
          }

          const profile = this.profiles.get(payload.profileId);
          if (!profile) {
            finish({
              ok: false,
              error: translateRemote('SSH authentication was cancelled'),
            });
            return;
          }

          const promptHostPort =
            typeof payload.hostPort === 'number' && payload.hostPort > 0 ? payload.hostPort : 22;
          const promptText = normalizePromptText(payload.prompt);
          const hostPrompt = parseHostVerificationPrompt(
            promptText,
            profile.sshTarget,
            promptHostPort
          );
          let secret: string;
          if (hostPrompt) {
            await this.requestHostVerification(profile, hostPrompt, promptText);
            secret = 'yes';
          } else {
            secret = await this.requestSecret(profile, promptText);
          }
          finish({ ok: true, secret });
        } catch (error) {
          finish({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      socket.on('timeout', () => {
        finish({
          ok: false,
          error: translateRemote('SSH authentication request timed out'),
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to start remote auth broker'));
          return;
        }
        this.port = address.port;
        resolve();
      });
    });
  }

  private broadcastPrompt(prompt: RemoteAuthPrompt): void {
    const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
    if (windows.length === 0) {
      const pending = this.pendingPrompts.get(prompt.id);
      if (pending) {
        clearTimeout(pending.timeout);
      }
      pending?.reject(createRemoteError('No window available for SSH authentication prompt'));
      this.pendingPrompts.delete(prompt.id);
      return;
    }

    let delivered = false;
    for (const window of windows) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) {
        continue;
      }
      try {
        window.webContents.send('remote:auth:prompt', prompt);
        delivered = true;
      } catch {
        // Window may be tearing down between enumeration and send.
      }
    }

    if (!delivered) {
      const pending = this.pendingPrompts.get(prompt.id);
      if (pending) {
        clearTimeout(pending.timeout);
      }
      pending?.reject(createRemoteError('No window available for SSH authentication prompt'));
      this.pendingPrompts.delete(prompt.id);
    }
  }
}
