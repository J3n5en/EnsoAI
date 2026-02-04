import { ExternalLink, Globe } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

const WEB_INSPECTOR_PORT = 18765;
const SCRIPT_INSTALL_URL =
  'https://raw.githubusercontent.com/J3n5en/EnsoAI/refs/heads/main/scripts/web-inspector.user.js';

export function WebInspectorSettings() {
  const { webInspectorEnabled, setWebInspectorEnabled } = useSettingsStore();
  const { t } = useI18n();
  const [serverStatus, setServerStatus] = React.useState<'unknown' | 'running' | 'stopped'>(
    'unknown'
  );

  // Check server status on mount and when enabled changes
  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await window.electronAPI.webInspector.status();
        setServerStatus(status.running ? 'running' : 'stopped');
      } catch {
        setServerStatus('unknown');
      }
    };

    checkStatus();

    // Listen for status changes
    const cleanup = window.electronAPI.webInspector.onStatusChange((status) => {
      setServerStatus(status.running ? 'running' : 'stopped');
    });

    return cleanup;
  }, []);

  const handleInstallScript = () => {
    window.electronAPI.shell.openExternal(SCRIPT_INSTALL_URL);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Web Inspector')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Inspect web elements and send to agent')}
        </p>
      </div>

      {/* Enable Switch */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Enable')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Start Web Inspector server on port {{port}}', { port: WEB_INSPECTOR_PORT })}
          </p>
          <Switch checked={webInspectorEnabled} onCheckedChange={setWebInspectorEnabled} />
        </div>
      </div>

      {/* Server Status */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Status')}</span>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              serverStatus === 'running'
                ? 'bg-green-500'
                : serverStatus === 'stopped'
                  ? 'bg-gray-400'
                  : 'bg-yellow-500'
            }`}
          />
          <span className="text-sm text-muted-foreground">
            {serverStatus === 'running'
              ? t('Running on port {{port}}', { port: WEB_INSPECTOR_PORT })
              : serverStatus === 'stopped'
                ? t('Stopped')
                : t('Unknown')}
          </span>
        </div>
      </div>

      {/* Userscript Installation */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Userscript Installation')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Install the userscript to enable element inspection in your browser')}
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Globe className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-sm">
              {t('To use Web Inspector, you need to install a userscript in your browser.')}
            </p>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>
                {t('Install')}{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() =>
                    window.electronAPI.shell.openExternal('https://www.tampermonkey.net/')
                  }
                >
                  Tampermonkey
                </button>{' '}
                {t('or')}{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() =>
                    window.electronAPI.shell.openExternal('https://violentmonkey.github.io/')
                  }
                >
                  Violentmonkey
                </button>{' '}
                {t('browser extension')}
              </li>
              <li>{t('Click the button below to open the script installation page')}</li>
              <li>{t('Click "Install" in the userscript manager')}</li>
            </ol>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={handleInstallScript}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {t('Install Userscript')}
        </Button>
      </div>

      {/* Usage Instructions */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Usage')}</h3>
        <p className="text-sm text-muted-foreground">{t('How to use Web Inspector')}</p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-2">
          <li>{t('Enable Web Inspector above')}</li>
          <li>{t('Open any webpage with the userscript installed')}</li>
          <li>{t('Click the userscript manager icon and select "Enable Web Inspector"')}</li>
          <li>{t('Click the Enso button on the webpage')}</li>
          <li>{t('Click on any element to inspect')}</li>
          <li>{t('Element info will be sent to your active agent session')}</li>
        </ol>
      </div>
    </div>
  );
}
