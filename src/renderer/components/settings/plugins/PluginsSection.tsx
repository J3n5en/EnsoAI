import type { Plugin } from '@shared/types';
import { ChevronDown, ChevronRight, Loader2, Plus, Puzzle, Settings2, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { MarketplacesDialog } from './MarketplacesDialog';
import { PluginBrowserDialog } from './PluginBrowserDialog';

export function PluginsSection() {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const [plugins, setPlugins] = React.useState<Plugin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uninstalling, setUninstalling] = React.useState<string | null>(null);
  const [marketplacesOpen, setMarketplacesOpen] = React.useState(false);
  const [browserOpen, setBrowserOpen] = React.useState(false);

  const loadPlugins = React.useCallback(async () => {
    try {
      const list = await window.electronAPI.claudeConfig.plugins.list();
      setPlugins(list);
    } catch (error) {
      console.error('Failed to load plugins:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    // 乐观更新 UI
    setPlugins((prev) => prev.map((p) => (p.id === pluginId ? { ...p, enabled } : p)));

    // 调用后端
    const success = await window.electronAPI.claudeConfig.plugins.setEnabled(pluginId, enabled);
    if (!success) {
      // 回滚
      setPlugins((prev) => prev.map((p) => (p.id === pluginId ? { ...p, enabled: !enabled } : p)));
    }
  };

  const handleUninstall = async (pluginId: string) => {
    setUninstalling(pluginId);
    try {
      const success = await window.electronAPI.claudeConfig.plugins.uninstall(pluginId);
      if (success) {
        toastManager.add({ type: 'success', title: t('Plugin uninstalled') });
        setPlugins((prev) => prev.filter((p) => p.id !== pluginId));
      } else {
        toastManager.add({ type: 'error', title: t('Failed to uninstall plugin') });
      }
    } finally {
      setUninstalling(null);
    }
  };

  const enabledCount = plugins.filter((p) => p.enabled).length;

  return (
    <div className="border-t pt-4 mt-4">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Puzzle className="h-4 w-4" />
          <span className="text-sm font-medium">{t('Plugins')}</span>
          <span className="text-xs text-muted-foreground">
            ({enabledCount}/{plugins.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              setBrowserOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              setMarketplacesOpen(true);
            }}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </button>

      <MarketplacesDialog open={marketplacesOpen} onOpenChange={setMarketplacesOpen} />
      <PluginBrowserDialog
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onInstalled={loadPlugins}
      />

      {expanded && (
        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('Loading...')}</p>
          ) : plugins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('No plugins installed')}
            </p>
          ) : (
            plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/50 hover:bg-muted"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={(checked) => handleToggle(plugin.id, checked)}
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium truncate block">{plugin.name}</span>
                    <span className="text-xs text-muted-foreground truncate block">
                      {plugin.marketplace} · v{plugin.version}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive ml-2"
                  onClick={() => handleUninstall(plugin.id)}
                  disabled={uninstalling === plugin.id}
                >
                  {uninstalling === plugin.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
