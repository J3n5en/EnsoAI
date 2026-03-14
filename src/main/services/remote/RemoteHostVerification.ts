import type { RemoteHostFingerprint } from '@shared/types';
import { createRemoteError } from './RemoteI18n';

const HOST_VERIFICATION_SUFFIX =
  'Are you sure you want to continue connecting (yes/no/[fingerprint])?';
const HOST_LINE_PATTERN = /The authenticity of host '([^']+)' can't be established\./;
const FINGERPRINT_PATTERN =
  /([A-Z0-9-]+) key fingerprint is (SHA256:[A-Za-z0-9+/=]+|MD5:[0-9a-f:]+)\.?/gi;

export interface HostVerificationPrompt {
  host: string;
  port: number;
  fingerprints: RemoteHostFingerprint[];
}

function normalizePromptText(promptText: string): string {
  return promptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function parsePromptHost(promptHost: string, fallbackHost: string, fallbackPort: number) {
  const normalized = promptHost.trim();
  const primaryHost = normalized.split(' (', 1)[0]?.trim() || fallbackHost;

  const bracketMatch = primaryHost.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracketMatch) {
    return {
      host: bracketMatch[1],
      port: Number.parseInt(bracketMatch[2], 10) || fallbackPort,
    };
  }

  return {
    host: primaryHost,
    port: primaryHost === fallbackHost ? fallbackPort : 22,
  };
}

export function parseHostVerificationPrompt(
  promptText: string,
  fallbackHost: string,
  fallbackPort: number
): HostVerificationPrompt | null {
  const normalized = normalizePromptText(promptText);
  if (!normalized.endsWith(HOST_VERIFICATION_SUFFIX)) {
    return null;
  }

  const hostMatch = normalized.match(HOST_LINE_PATTERN);
  const fingerprintMatches = [...normalized.matchAll(FINGERPRINT_PATTERN)];
  if (fingerprintMatches.length === 0) {
    throw createRemoteError(
      'Failed to parse remote host fingerprint from SSH handshake',
      undefined,
      normalized
    );
  }

  const parsedHost = parsePromptHost(hostMatch?.[1] || fallbackHost, fallbackHost, fallbackPort);
  return {
    host: parsedHost.host,
    port: parsedHost.port,
    fingerprints: fingerprintMatches.map((match) => ({
      host: parsedHost.host,
      port: parsedHost.port,
      keyType: match[1],
      fingerprint: match[2],
    })),
  };
}
