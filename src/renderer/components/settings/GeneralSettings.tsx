import type { Locale } from '@shared/i18n';
import type { ShellInfo } from '@shared/types';
import { Columns3, FolderOpen, RefreshCw, TreePine } from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { type LayoutMode, type TerminalRenderer, useSettingsStore } from '@/stores/settings';

// Parse shell arguments string, supporting single/double quotes for paths with spaces
function parseShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quoteChar = '';
  for (const ch of input) {
    if (!quoteChar && (ch === '"' || ch === "'")) {
      quoteChar = ch;
    } else if (ch === quoteChar) {
      quoteChar = '';
    } else if (ch === ' ' && !quoteChar) {
      if (current) args.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

function stringifyShellArgs(args: string[]): string {
  return args
    .map((a) => {
      if (a.includes(' ') || a.includes('"') || a.includes("'")) {
        return `"${a.replace(/"/g, '\\"')}"`;
      }
      return a;
    })
    .join(' ');
}

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: { version?: string };
  error?: string;
}

export function GeneralSettings() {
  const {
    language,
    setLanguage,
    layoutMode,
    setLayoutMode,
    terminalRenderer,
    setTerminalRenderer,
    terminalScrollback,
    setTerminalScrollback,
    shellConfig,
    setShellConfig,
    agentNotificationEnabled,
    setAgentNotificationEnabled,
    agentNotificationDelay,
    setAgentNotificationDelay,
    agentNotificationEnterDelay,
    setAgentNotificationEnterDelay,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
    defaultWorktreePath,
    setDefaultWorktreePath,
    proxySettings,
    setProxySettings,
    autoCreateSessionOnActivate,
    setAutoCreateSessionOnActivate,
    quickTerminal,
    setQuickTerminalEnabled,
    hideGroups,
    setHideGroups,
    temporaryWorkspaceEnabled,
    setTemporaryWorkspaceEnabled,
    defaultTemporaryPath,
    setDefaultTemporaryPath,
    autoCreateSessionOnTempActivate,
    setAutoCreateSessionOnTempActivate,
  } = useSettingsStore();
  const { t, locale } = useI18n();

  const layoutModeOptions: {
    value: LayoutMode;
    icon: React.ElementType;
    label: string;
    description: string;
  }[] = [
    {
      value: 'columns',
      icon: Columns3,
      label: t('Columns'),
      description: t('Three-column layout: repos, worktrees, workspace'),
    },
    {
      value: 'tree',
      icon: TreePine,
      label: t('Tree'),
      description: t('Two-column layout: tree sidebar, workspace'),
    },
  ];

  const numberFormatter = React.useMemo(
    () => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US'),
    [locale]
  );

  const rendererOptions = React.useMemo(
    () => [
      { value: 'dom', label: 'DOM', description: t('Best compatibility (recommended)') },
      { value: 'webgl', label: 'WebGL', description: t('Higher performance, may have issues') },
    ],
    [t]
  );

  const scrollbackOptions = React.useMemo(
    () =>
      [1000, 5000, 10000, 20000, 50000].map((value) => ({
        value,
        label: t('{{count}} lines', { count: numberFormatter.format(value) }),
      })),
    [t, numberFormatter]
  );

  const notificationDelayOptions = React.useMemo(
    () =>
      [1, 2, 3, 5, 10].map((value) => ({
        value,
        label: t('{{count}} seconds', { count: value }),
      })),
    [t]
  );

  const enterDelayOptions = React.useMemo(
    () => [
      { value: 0, label: t('Disabled') },
      ...[1, 2, 3, 5, 10].map((value) => ({
        value,
        label: t('{{count}} seconds', { count: value }),
      })),
    ],
    [t]
  );

  const [shells, setShells] = React.useState<ShellInfo[]>([]);
  const [loadingShells, setLoadingShells] = React.useState(true);
  const appVersion = window.electronAPI?.env.appVersion || '0.0.0';

  // Update status state
  const [updateStatus, setUpdateStatus] = React.useState<UpdateStatus | null>(null);

  // Proxy test state
  const [proxyTestStatus, setProxyTestStatus] = React.useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [proxyTestLatency, setProxyTestLatency] = React.useState<number | null>(null);
  const [proxyTestError, setProxyTestError] = React.useState<string | null>(null);
  const [tempPathDialogOpen, setTempPathDialogOpen] = React.useState(false);

  const handleTestProxy = React.useCallback(async () => {
    if (!proxySettings.server) return;

    setProxyTestStatus('testing');
    setProxyTestLatency(null);
    setProxyTestError(null);

    const result = await window.electronAPI.app.testProxy(proxySettings.server);

    if (result.success) {
      setProxyTestStatus('success');
      setProxyTestLatency(result.latency ?? null);
    } else {
      setProxyTestStatus('error');
      setProxyTestError(result.error ?? 'Unknown error');
    }
  }, [proxySettings.server]);

  const handleProxyServerChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setProxySettings({ server: e.target.value });
      // Reset test status when server changes
      setProxyTestStatus('idle');
      setProxyTestLatency(null);
      setProxyTestError(null);
    },
    [setProxySettings]
  );

  const handleSelectTempPath = React.useCallback(async () => {
    const result = await window.electronAPI.dialog.openDirectory();
    if (!result) return;
    const check = await window.electronAPI.tempWorkspace.checkPath(result);
    if (check.ok) {
      setDefaultTemporaryPath(result);
      return;
    }
    setTempPathDialogOpen(true);
  }, [setDefaultTemporaryPath]);

  React.useEffect(() => {
    window.electronAPI.shell.detect().then((detected) => {
      setShells(detected);
      setLoadingShells(false);
    });
  }, []);

  // Listen for update status changes
  React.useEffect(() => {
    const cleanup = window.electronAPI.updater.onStatus((status) => {
      setUpdateStatus(status as UpdateStatus);
    });
    return cleanup;
  }, []);

  const handleCheckForUpdates = React.useCallback(() => {
    window.electronAPI.updater.checkForUpdates();
  }, []);

  const availableShells = shells.filter((s) => s.available);
  const currentShell = shells.find((s) => s.id === shellConfig.shellType);
  const isCustomShell = shellConfig.shellType === 'custom';

  const [customArgsText, setCustomArgsText] = React.useState(() =>
    stringifyShellArgs(shellConfig.customShellArgs || []),
  );

  React.useEffect(() => {
    setCustomArgsText(stringifyShellArgs(shellConfig.customShellArgs || []));
  }, [shellConfig.customShellArgs]);

  const commitCustomArgs = React.useCallback(() => {
    setShellConfig({
      ...shellConfig,
      customShellArgs: parseShellArgs(customArgsText),
    });
  }, [customArgsText, shellConfig, setShellConfig]);

  const isWindows = window.electronAPI?.env.platform === 'win32';
  const shellPathPlaceholder = isWindows ? 'cmd.exe' : '/bin/bash';
  const shellArgsPlaceholder = isWindows ? '/k "C:\\Program Files\\init.bat"' : "-l -c '/usr/local/bin/app'";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Language')}</h3>
        <p className="text-sm text-muted-foreground">{t('Choose display language')}</p>
      </div>

      {/* Language */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Language')}</span>
        <div className="space-y-1.5">
          <Select value={language} onValueChange={(v) => setLanguage(v as Locale)}>
            <SelectTrigger className="w-48">
              <SelectValue>{language === 'zh' ? t('Chinese') : t('English')}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="en">{t('English')}</SelectItem>
              <SelectItem value="zh">{t('Chinese')}</SelectItem>
            </SelectPopup>
          </Select>
        </div>
      </div>

      {/* Layout Section */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Layout')}</h3>
        <p className="text-sm text-muted-foreground">{t('Choose sidebar layout mode')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {layoutModeOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setLayoutMode(option.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
              layoutMode === option.value
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                layoutMode === option.value
                  ? 'bg-accent-foreground/20 text-accent-foreground'
                  : 'bg-muted'
              )}
            >
              <option.icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground text-center">{option.description}</span>
          </button>
        ))}
      </div>

      {/* Auto-create session */}
      {/* Quick Terminal */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Quick Terminal')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Show floating terminal button for quick access')}
          </p>
          <Switch checked={quickTerminal.enabled} onCheckedChange={setQuickTerminalEnabled} />
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Temp Session')}</h3>
        <p className="text-sm text-muted-foreground">{t('Temp Session settings')}</p>
      </div>

      {/* Temp Session */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Temp Session')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Show Temp Session entry for quick scratch sessions')}
          </p>
          <Switch
            checked={temporaryWorkspaceEnabled}
            onCheckedChange={setTemporaryWorkspaceEnabled}
          />
        </div>
      </div>

      {/* Temp Session Auto-create */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto-create session')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Automatically create Agent/Terminal Session when activating a temp session')}
          </p>
          <Switch
            checked={autoCreateSessionOnTempActivate}
            onCheckedChange={setAutoCreateSessionOnTempActivate}
            disabled={!temporaryWorkspaceEnabled}
          />
        </div>
      </div>

      {/* Temp Session Path */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Save location')}</span>
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={defaultTemporaryPath}
              onChange={(e) => setDefaultTemporaryPath(e.target.value)}
              placeholder="~/ensoai/temporary"
              className="flex-1"
              disabled={!temporaryWorkspaceEnabled}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleSelectTempPath}
              disabled={!temporaryWorkspaceEnabled}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('Default directory for new temp sessions. Leave empty to use ~/ensoai/temporary')}
          </p>
        </div>
      </div>

      {/* Hide Groups */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Hide Groups')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Hide group management panel and show all repositories')}
          </p>
          <Switch checked={hideGroups} onCheckedChange={setHideGroups} />
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Worktree')}</h3>
        <p className="text-sm text-muted-foreground">{t('Git worktree save location settings')}</p>
      </div>

      {/* Auto-create session */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto-create session')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Automatically create Agent/Terminal session when activating a worktree')}
          </p>
          <Switch
            checked={autoCreateSessionOnActivate}
            onCheckedChange={setAutoCreateSessionOnActivate}
          />
        </div>
      </div>

      {/* Default Worktree Path */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Save location')}</span>
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={defaultWorktreePath}
              onChange={(e) => setDefaultWorktreePath(e.target.value)}
              placeholder="~/ensoai/workspaces"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                const result = await window.electronAPI.dialog.openDirectory();
                if (result) {
                  setDefaultWorktreePath(result);
                }
              }}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('Default directory for new worktrees. Leave empty to use ~/ensoai/workspaces')}
          </p>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Terminal')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Terminal renderer and performance settings')}
        </p>
      </div>

      {/* Shell */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Shell')}</span>
        <div className="space-y-1.5">
          {loadingShells ? (
            <div className="flex h-10 items-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </div>
          ) : (
            <Select
              value={shellConfig.shellType}
              onValueChange={(v) => setShellConfig({ ...shellConfig, shellType: v as never })}
            >
              <SelectTrigger className="w-64">
                <SelectValue>
                  {isCustomShell ? t('Custom') : (currentShell?.name || shellConfig.shellType)}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {availableShells.map((shell) => (
                  <SelectItem key={shell.id} value={shell.id}>
                    <div className="flex items-center gap-2">
                      <span>{shell.name}</span>
                      {shell.isWsl && (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                          WSL
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="custom">
                  <span>{t('Custom')}</span>
                </SelectItem>
              </SelectPopup>
            </Select>
          )}
          {isCustomShell && (
            <div className="space-y-2 mt-2">
              <Input
                className="w-64"
                placeholder={t('Shell path (e.g. {{example}})', { example: shellPathPlaceholder })}
                value={shellConfig.customShellPath || ''}
                onChange={(e) =>
                  setShellConfig({ ...shellConfig, customShellPath: e.target.value })
                }
              />
              <Input
                className="w-64"
                placeholder={t('Arguments (e.g. {{example}})', { example: shellArgsPlaceholder })}
                value={customArgsText}
                onChange={(e) => setCustomArgsText(e.target.value)}
                onBlur={commitCustomArgs}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCustomArgs();
                }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals')}</p>
        </div>
      </div>

      {/* Renderer */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Renderer')}</span>
        <div className="space-y-1.5">
          <Select
            value={terminalRenderer}
            onValueChange={(v) => setTerminalRenderer(v as TerminalRenderer)}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {rendererOptions.find((o) => o.value === terminalRenderer)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {rendererOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {rendererOptions.find((o) => o.value === terminalRenderer)?.description}
          </p>
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals or restart')}</p>
        </div>
      </div>

      {/* Scrollback */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Terminal scrollback')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(terminalScrollback)}
            onValueChange={(v) => setTerminalScrollback(Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {scrollbackOptions.find((o) => o.value === terminalScrollback)?.label ??
                  t('{{count}} lines', { count: numberFormatter.format(terminalScrollback) })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {scrollbackOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('History lines in the terminal. Higher values use more memory.')}
          </p>
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals only')}</p>
        </div>
      </div>

      {/* Agent Notification Section */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-medium">{t('Agent Notifications')}</h3>
        <p className="text-sm text-muted-foreground">{t('Stop output notification')}</p>
      </div>

      {/* Notification Enable */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Enable notifications')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Notifications when agent is idle')}</p>
          <Switch
            checked={agentNotificationEnabled}
            onCheckedChange={setAgentNotificationEnabled}
          />
        </div>
      </div>

      {/* Notification Delay */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Idle time')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(agentNotificationDelay)}
            onValueChange={(v) => setAgentNotificationDelay(Number(v))}
            disabled={!agentNotificationEnabled}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {notificationDelayOptions.find((o) => o.value === agentNotificationDelay)?.label ??
                  t('{{count}} seconds', { count: agentNotificationDelay })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {notificationDelayOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('How long to wait before notifying after the agent stops output.')}
          </p>
        </div>
      </div>

      {/* Enter Delay */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Enter delay')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(agentNotificationEnterDelay)}
            onValueChange={(v) => setAgentNotificationEnterDelay(Number(v))}
            disabled={!agentNotificationEnabled}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {enterDelayOptions.find((o) => o.value === agentNotificationEnterDelay)?.label ??
                  t('{{count}} seconds', { count: agentNotificationEnterDelay })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {enterDelayOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('How long to wait after pressing Enter before starting idle timer.')}
          </p>
        </div>
      </div>

      {/* Proxy Section */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-medium">{t('Proxy')}</h3>
        <p className="text-sm text-muted-foreground">{t('Network proxy settings')}</p>
      </div>

      {/* Proxy Enable */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Enable proxy')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Route all network requests through proxy')}
          </p>
          <Switch
            checked={proxySettings.enabled}
            onCheckedChange={(enabled) => setProxySettings({ enabled })}
          />
        </div>
      </div>

      {/* Proxy Server */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Proxy server')}</span>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Input
              value={proxySettings.server}
              onChange={handleProxyServerChange}
              placeholder="http://127.0.0.1:7897"
              disabled={!proxySettings.enabled}
              className="w-64"
              aria-invalid={
                proxySettings.enabled &&
                !!proxySettings.server &&
                !/^((https?|socks5?h?|socks4a?):\/\/)?[\w.-]+:\d+/.test(proxySettings.server)
              }
            />
            <Button
              variant="outline"
              size="sm"
              disabled={
                !proxySettings.enabled ||
                !proxySettings.server ||
                !/^((https?|socks5?h?|socks4a?):\/\/)?[\w.-]+:\d+/.test(proxySettings.server) ||
                proxyTestStatus === 'testing'
              }
              onClick={handleTestProxy}
            >
              {proxyTestStatus === 'testing' ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t('Testing...')}
                </>
              ) : (
                t('Test')
              )}
            </Button>
            {proxyTestStatus === 'success' && proxyTestLatency !== null && (
              <span className="text-xs text-green-600 dark:text-green-400">
                ✓ {proxyTestLatency}ms
              </span>
            )}
            {proxyTestStatus === 'error' && proxyTestError && (
              <span className="text-xs text-destructive" title={proxyTestError}>
                ✗ {t('Failed')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('e.g., 127.0.0.1:7897 or http://proxy:8080')}
          </p>
        </div>
      </div>

      {/* Proxy Bypass */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Bypass list')}</span>
        <div className="space-y-1.5">
          <Input
            value={proxySettings.bypassList}
            onChange={(e) => setProxySettings({ bypassList: e.target.value })}
            placeholder="localhost,127.0.0.1"
            disabled={!proxySettings.enabled}
            className="w-64"
          />
          <p className="text-xs text-muted-foreground">
            {t('Comma-separated list of hosts that bypass the proxy')}
          </p>
        </div>
      </div>

      {/* Updates Section */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-medium">{t('Updates')}</h3>
        <p className="text-sm text-muted-foreground">{t('Application update settings')}</p>
      </div>

      {/* Current Version */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Version')}</span>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">v{appVersion}</span>
            {updateStatus?.status === 'available' && updateStatus.info?.version && (
              <span className="text-xs text-green-600 dark:text-green-400">
                ({t('New version')}: v{updateStatus.info.version})
              </span>
            )}
            {updateStatus?.status === 'not-available' && (
              <span className="text-xs text-muted-foreground">({t('Up to date')})</span>
            )}
            {updateStatus?.status === 'error' && (
              <span className="text-xs text-destructive">({t('Check failed')})</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckForUpdates}
            disabled={updateStatus?.status === 'checking' || updateStatus?.status === 'downloading'}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${updateStatus?.status === 'checking' ? 'animate-spin' : ''}`}
            />
            {updateStatus?.status === 'checking' ? t('Checking...') : t('Check for updates')}
          </Button>
        </div>
      </div>

      {/* Auto Update */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto update')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Automatically download and install updates')}
          </p>
          <Switch checked={autoUpdateEnabled} onCheckedChange={setAutoUpdateEnabled} />
        </div>
      </div>

      <AlertDialog open={tempPathDialogOpen} onOpenChange={setTempPathDialogOpen}>
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Directory unavailable')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This directory is not readable or writable. Please choose another location.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose asChild>
              <Button variant="outline">{t('Cancel')}</Button>
            </AlertDialogClose>
            <AlertDialogClose asChild>
              <Button onClick={handleSelectTempPath}>{t('Choose directory')}</Button>
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
