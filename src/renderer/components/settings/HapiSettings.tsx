import { Check, Copy, Download, ExternalLink, Github, RefreshCw, Square } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

interface HapiStatus {
  running: boolean;
  ready?: boolean;
  pid?: number;
  port?: number;
  error?: string;
}

interface HapiGlobalStatus {
  installed: boolean;
  version?: string;
}

interface HappyGlobalStatus {
  installed: boolean;
  version?: string;
}

interface CloudflaredStatus {
  installed: boolean;
  version?: string;
  running: boolean;
  url?: string;
  error?: string;
}

export function HapiSettings() {
  const { t } = useI18n();
  const { hapiSettings, setHapiSettings } = useSettingsStore();
  const [status, setStatus] = React.useState<HapiStatus>({ running: false });
  const [loading, setLoading] = React.useState(false);

  // Hapi global installation status
  const [hapiGlobal, setHapiGlobal] = React.useState<HapiGlobalStatus>({ installed: false });

  // Happy global installation status (null = loading)
  const [happyGlobal, setHappyGlobal] = React.useState<HappyGlobalStatus | null>(null);

  // Cloudflared state
  const [cfStatus, setCfStatus] = React.useState<CloudflaredStatus>({
    installed: false,
    running: false,
  });
  const [cfLoading, setCfLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Local state for inputs
  const [localPort, setLocalPort] = React.useState(String(hapiSettings.webappPort));
  const [localToken, setLocalToken] = React.useState(hapiSettings.cliApiToken);
  const [localTelegramToken, setLocalTelegramToken] = React.useState(hapiSettings.telegramBotToken);
  const [localWebappUrl, setLocalWebappUrl] = React.useState(hapiSettings.webappUrl);
  const [localAllowedChatIds, setLocalAllowedChatIds] = React.useState(hapiSettings.allowedChatIds);

  // Sync local state with store
  React.useEffect(() => {
    setLocalPort(String(hapiSettings.webappPort));
    setLocalToken(hapiSettings.cliApiToken);
    setLocalTelegramToken(hapiSettings.telegramBotToken);
    setLocalWebappUrl(hapiSettings.webappUrl);
    setLocalAllowedChatIds(hapiSettings.allowedChatIds);
  }, [hapiSettings]);

  // Fetch initial status
  React.useEffect(() => {
    // Check hapi global installation
    window.electronAPI.hapi.checkGlobal(false).then((result) => {
      setHapiGlobal(result);
    });

    // Check happy global installation
    window.electronAPI.happy.checkGlobal(false).then((result) => {
      setHappyGlobal(result);
    });

    window.electronAPI.hapi.getStatus().then((s) => {
      setStatus(s);
      // Sync store enabled state with actual running state
      setHapiSettings({ enabled: s.running });
    });
    window.electronAPI.cloudflared.check().then((result) => {
      setCfStatus((prev) => ({ ...prev, ...result }));
    });
    window.electronAPI.cloudflared.getStatus().then((s) => {
      setCfStatus(s);
      // Sync store cfEnabled state with actual running state
      setHapiSettings({ cfEnabled: s.running });
    });

    const cleanupHapi = window.electronAPI.hapi.onStatusChanged((newStatus) => {
      setStatus(newStatus);
      // Sync store enabled state with actual running state
      setHapiSettings({ enabled: newStatus.running });
    });
    const cleanupCf = window.electronAPI.cloudflared.onStatusChanged((newStatus) => {
      setCfStatus(newStatus);
      // Sync store cfEnabled state with actual running state
      setHapiSettings({ cfEnabled: newStatus.running });
    });

    return () => {
      cleanupHapi();
      cleanupCf();
    };
  }, [setHapiSettings]);

  const getConfig = React.useCallback(() => {
    return {
      webappPort: Number(localPort) || 3006,
      cliApiToken: localToken,
      telegramBotToken: localTelegramToken,
      webappUrl: localWebappUrl,
      allowedChatIds: localAllowedChatIds,
    };
  }, [localPort, localToken, localTelegramToken, localWebappUrl, localAllowedChatIds]);

  const saveSettings = React.useCallback(() => {
    const config = getConfig();
    setHapiSettings(config);
  }, [getConfig, setHapiSettings]);

  const handleEnabledChange = async (enabled: boolean) => {
    setLoading(true);
    saveSettings();
    setHapiSettings({ enabled });

    try {
      if (enabled) {
        const config = getConfig();
        await window.electronAPI.hapi.start({
          ...config,
          runnerEnabled: hapiSettings.runnerEnabled,
        });
      } else {
        await window.electronAPI.hapi.stop();
        // Also stop cloudflared when disabling hapi
        if (hapiSettings.cfEnabled) {
          await window.electronAPI.cloudflared.stop();
          setHapiSettings({ cfEnabled: false });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await window.electronAPI.hapi.stop();
      setHapiSettings({ enabled: false });
      // Also stop cloudflared
      if (hapiSettings.cfEnabled) {
        await window.electronAPI.cloudflared.stop();
        setHapiSettings({ cfEnabled: false });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    saveSettings();
    try {
      const config = getConfig();
      await window.electronAPI.hapi.restart({
        ...config,
        runnerEnabled: hapiSettings.runnerEnabled,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRunnerEnabledChange = (checked: boolean) => {
    setHapiSettings({ runnerEnabled: checked });
  };

  const handleGenerateToken = () => {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    setLocalToken(token);
    setHapiSettings({ cliApiToken: token });
  };

  // Cloudflared handlers
  const handleCfInstall = async () => {
    setCfLoading(true);
    try {
      const result = await window.electronAPI.cloudflared.install();
      setCfStatus((prev) => ({ ...prev, ...result }));
    } finally {
      setCfLoading(false);
    }
  };

  const handleCfEnabledChange = async (enabled: boolean) => {
    setCfLoading(true);
    try {
      if (enabled) {
        const config = {
          mode: hapiSettings.tunnelMode,
          port: Number(localPort) || 3006,
          token: hapiSettings.tunnelMode === 'auth' ? hapiSettings.tunnelToken : undefined,
          protocol: hapiSettings.useHttp2 ? 'http2' : undefined,
        };
        await window.electronAPI.cloudflared.start(config);
        setHapiSettings({ cfEnabled: true });
      } else {
        await window.electronAPI.cloudflared.stop();
        setHapiSettings({ cfEnabled: false });
      }
    } finally {
      setCfLoading(false);
    }
  };

  const handleCopyUrl = async () => {
    if (cfStatus.url) {
      await navigator.clipboard.writeText(cfStatus.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">Hapi</h3>
          <button
            type="button"
            onClick={() => window.electronAPI.shell.openExternal('https://github.com/tiann/hapi')}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="GitHub"
          >
            <Github className="h-4 w-4" />
          </button>
          {hapiGlobal.installed ? (
            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
              v{hapiGlobal.version || '?'}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              npx
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('Share agent sessions remotely via Web and Telegram')}
        </p>
      </div>

      {/* Enable Switch */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">{t('Start Hapi Service')}</span>
          <p className="text-xs text-muted-foreground">
            {t('Start Hapi server for remote access')}
            {status.running && status.port && ` (Port: ${status.port})`}
            {status.running && !status.ready && ` - ${t('Starting...')}`}
          </p>
        </div>
        <Switch
          checked={hapiSettings.enabled}
          onCheckedChange={handleEnabledChange}
          disabled={loading}
        />
      </div>

      {/* Status indicator */}
      {status.error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {status.error}
        </div>
      )}

      {/* Only show controls and configuration when enabled */}
      {hapiSettings.enabled && (
        <>
          {/* Control buttons when running */}
          {status.running && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleStop} disabled={loading}>
                <Square className="mr-1.5 h-3.5 w-3.5" />
                {t('Stop')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleRestart} disabled={loading}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {t('Restart')}
              </Button>
            </div>
          )}

          {/* Runner Section */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Enable Remote Spawn (Runner)')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Automatically start Hapi Runner with Hapi service for remote session spawning')}
                  {' '}
                  {t('(Changes apply after service restart)')}
                </p>
              </div>
              <Switch
                checked={hapiSettings.runnerEnabled}
                onCheckedChange={handleRunnerEnabledChange}
                disabled={loading}
              />
            </div>
          </div>

          {/* Cloudflared Section */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Public Access (Cloudflared)')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Expose local server to the internet via Cloudflare Tunnel')}
                </p>
              </div>
              <Switch
                checked={hapiSettings.cfEnabled}
                onCheckedChange={handleCfEnabledChange}
                disabled={cfLoading || !cfStatus.installed || !status.ready}
              />
            </div>

            {/* Version and Install */}
            <div className="flex items-center gap-3">
              {cfStatus.installed ? (
                <span className="text-xs text-muted-foreground">
                  cloudflared {cfStatus.version}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{t('Not installed')}</span>
              )}
              {!cfStatus.installed && (
                <Button variant="outline" size="sm" onClick={handleCfInstall} disabled={cfLoading}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {cfLoading ? t('Installing...') : t('Install')}
                </Button>
              )}
            </div>

            {/* Cloudflared Error */}
            {cfStatus.error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {cfStatus.error}
              </div>
            )}

            {/* Tunnel URL when running */}
            {cfStatus.running && cfStatus.url && (
              <div className="flex items-center gap-2 rounded-md bg-accent/50 p-3">
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                <code className="flex-1 truncate text-xs">{cfStatus.url}</code>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleCopyUrl}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            )}

            {/* Tunnel Mode Tabs */}
            {cfStatus.installed && (
              <Tabs
                value={hapiSettings.tunnelMode}
                onValueChange={(v) => setHapiSettings({ tunnelMode: v as 'quick' | 'auth' })}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="quick" disabled={cfStatus.running}>
                    {t('Quick Tunnel')}
                  </TabsTrigger>
                  <TabsTrigger value="auth" disabled={cfStatus.running}>
                    {t('Auth Tunnel')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="quick" className="mt-3">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'Create a temporary tunnel with auto-generated URL. No authentication required.'
                    )}
                  </p>
                </TabsContent>
                <TabsContent value="auth" className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t('Use a pre-configured tunnel with your Cloudflare account.')}
                  </p>
                  <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                    <span className="text-sm font-medium">{t('Tunnel Token')}</span>
                    <Input
                      type="password"
                      value={hapiSettings.tunnelToken}
                      onChange={(e) => setHapiSettings({ tunnelToken: e.target.value })}
                      placeholder="eyJhIjoiNj..."
                      className="font-mono text-xs"
                      disabled={cfStatus.running}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {/* HTTP2 Protocol Switch */}
            {cfStatus.installed && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{t('Use HTTP/2 Protocol')}</span>
                  <p className="text-xs text-muted-foreground">
                    {t('More compatible than QUIC when behind firewalls')}
                  </p>
                </div>
                <Switch
                  checked={hapiSettings.useHttp2}
                  onCheckedChange={(checked) => setHapiSettings({ useHttp2: checked })}
                  disabled={cfStatus.running}
                />
              </div>
            )}
          </div>

          {/* Configuration */}
          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-medium text-muted-foreground">{t('Configuration')}</h4>

            {/* Server Port */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Server Port')}</span>
              <div className="space-y-1.5">
                <Input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)}
                  onBlur={() => setHapiSettings({ webappPort: Number(localPort) || 3006 })}
                  min={1024}
                  max={65535}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">{t('Server listening port')}</p>
              </div>
            </div>

            {/* Access Token */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Access Token')}</span>
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={localToken}
                    onChange={(e) => setLocalToken(e.target.value)}
                    onBlur={() => setHapiSettings({ cliApiToken: localToken })}
                    placeholder={t('Auto-generated if empty')}
                    className="flex-1 font-mono text-xs"
                  />
                  <Button variant="outline" size="sm" onClick={handleGenerateToken}>
                    {t('Generate')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('Access token for CLI and web UI')}
                </p>
              </div>
            </div>

            {/* Telegram Bot Token */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Telegram Bot Token')}</span>
              <div className="space-y-1.5">
                <Input
                  type="password"
                  value={localTelegramToken}
                  onChange={(e) => setLocalTelegramToken(e.target.value)}
                  onBlur={() => setHapiSettings({ telegramBotToken: localTelegramToken })}
                  placeholder={t('Optional')}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t('Telegram bot token (optional)')}
                </p>
              </div>
            </div>

            {/* Public URL */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Public URL')}</span>
              <div className="space-y-1.5">
                <Input
                  type="url"
                  value={localWebappUrl}
                  onChange={(e) => setLocalWebappUrl(e.target.value)}
                  onBlur={() => setHapiSettings({ webappUrl: localWebappUrl })}
                  placeholder="https://example.com"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t('Public URL for Telegram Mini App')}
                </p>
              </div>
            </div>

            {/* Allowed Chat IDs */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Allowed Chat IDs')}</span>
              <div className="space-y-1.5">
                <Input
                  type="text"
                  value={localAllowedChatIds}
                  onChange={(e) => setLocalAllowedChatIds(e.target.value)}
                  onBlur={() => setHapiSettings({ allowedChatIds: localAllowedChatIds })}
                  placeholder="123456789,987654321"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t('Comma-separated Telegram chat IDs')}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Happy Section */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">Happy</h3>
          <button
            type="button"
            onClick={() => window.electronAPI.shell.openExternal('https://github.com/slopus/happy')}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="GitHub"
          >
            <Github className="h-4 w-4" />
          </button>
          {happyGlobal === null ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          ) : happyGlobal.installed ? (
            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
              v{happyGlobal.version || '?'}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t('Not installed')}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('Run agents through Happy for enhanced experience')}
        </p>

        {/* Happy Enable Switch */}
        <div className="mt-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Enable Happy Agent')}</span>
            <p className="text-xs text-muted-foreground">
              {happyGlobal?.installed
                ? t('Use Happy to run supported agents')
                : t('Install Happy globally to enable this feature')}
            </p>
          </div>
          <Switch
            checked={hapiSettings.happyEnabled}
            onCheckedChange={(checked) => setHapiSettings({ happyEnabled: checked })}
            disabled={happyGlobal === null || !happyGlobal.installed}
          />
        </div>
      </div>
    </div>
  );
}
