import type { ProxySettings } from '@shared/types';
import type { Session } from 'electron';
import { session } from 'electron';

let currentProxySettings: ProxySettings | null = null;
let updaterSession: Session | null = null;

function normalizeProxyUrl(url: string): string {
  if (/^(https?|socks5?h?|socks4a?):\/\//.test(url)) {
    return url;
  }
  return `http://${url}`;
}

function normalizeBypassList(bypassList: string): string {
  return bypassList
    .split(',')
    .map((s) => s.trim())
    .map((s) => s.replace(/^\*\./, '.')) // *.domain → .domain (Chromium format)
    .filter(Boolean)
    .join(',');
}

export function registerUpdaterSession(s: Session): void {
  updaterSession = s;
}

export function getProxyEnvVars(): Record<string, string> {
  if (!currentProxySettings?.enabled || !currentProxySettings.server) {
    return {};
  }

  const proxyUrl = normalizeProxyUrl(currentProxySettings.server);

  const noProxy = normalizeBypassList(currentProxySettings.bypassList || 'localhost,127.0.0.1');

  return {
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    ALL_PROXY: proxyUrl,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  };
}

export async function applyProxy(settings: ProxySettings): Promise<void> {
  currentProxySettings = settings;

  const proxyConfig =
    settings.enabled && settings.server
      ? {
          proxyRules: normalizeProxyUrl(settings.server),
          proxyBypassRules: normalizeBypassList(settings.bypassList || 'localhost,127.0.0.1'),
        }
      : { mode: 'direct' as const };

  await session.defaultSession.setProxy(proxyConfig);

  if (updaterSession) {
    const useProxy = settings.enabled && settings.useProxyForUpdates && settings.server;
    await updaterSession.setProxy(useProxy ? proxyConfig : { mode: 'system' });
  }
}

const TEST_URLS = [
  'https://cp.cloudflare.com',
  'https://www.google.com/generate_204',
  'https://www.gstatic.com/generate_204',
];

const TEST_SESSION_PARTITION = 'proxy-test';

export async function testProxy(
  proxyUrl: string
): Promise<{ success: boolean; latency?: number; error?: string }> {
  const testSession = session.fromPartition(TEST_SESSION_PARTITION);

  try {
    await testSession.setProxy({ proxyRules: normalizeProxyUrl(proxyUrl), proxyBypassRules: '' });

    for (const testUrl of TEST_URLS) {
      try {
        const startTime = Date.now();
        const response = await testSession.fetch(testUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        const latency = Date.now() - startTime;

        if (response.ok || response.status === 204) {
          return { success: true, latency };
        }
      } catch {
        // Try next URL
      }
    }

    return { success: false, error: 'All test endpoints failed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  } finally {
    await testSession.clearCache();
    await testSession.clearStorageData();
  }
}
