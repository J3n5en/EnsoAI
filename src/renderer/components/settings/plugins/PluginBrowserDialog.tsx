import type { AvailablePlugin, PluginMarketplace } from '@shared/types';
import { Download, Loader2, Search, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';

interface PluginBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: () => void;
}

export function PluginBrowserDialog({ open, onOpenChange, onInstalled }: PluginBrowserDialogProps) {
  const { t } = useI18n();
  const [marketplaces, setMarketplaces] = React.useState<PluginMarketplace[]>([]);
  const [selectedMarketplace, setSelectedMarketplace] = React.useState<string>('all');
  const [plugins, setPlugins] = React.useState<AvailablePlugin[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [installing, setInstalling] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  const loadMarketplaces = React.useCallback(async () => {
    try {
      const list = await window.electronAPI.claudeConfig.plugins.marketplaces.list();
      setMarketplaces(list);
    } catch (error) {
      console.error('Failed to load marketplaces:', error);
    }
  }, []);

  const loadPlugins = React.useCallback(async () => {
    setLoading(true);
    try {
      const marketplace = selectedMarketplace === 'all' ? undefined : selectedMarketplace;
      const list = await window.electronAPI.claudeConfig.plugins.available(marketplace);
      setPlugins(list);
    } catch (err) {
      console.error('Failed to load available plugins:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMarketplace]);

  React.useEffect(() => {
    if (open) {
      loadMarketplaces();
      loadPlugins();
    }
  }, [open, loadMarketplaces, loadPlugins]);

  const handleInstall = async (plugin: AvailablePlugin) => {
    const pluginId = `${plugin.name}@${plugin.marketplace}`;
    setInstalling(pluginId);

    try {
      const success = await window.electronAPI.claudeConfig.plugins.install(
        plugin.name,
        plugin.marketplace
      );

      if (success) {
        toastManager.add({ type: 'success', title: t('Plugin installed') });
        // 本地更新状态，避免重新加载导致滚动重置
        setPlugins((prev) =>
          prev.map((p) =>
            p.name === plugin.name && p.marketplace === plugin.marketplace
              ? { ...p, installed: true }
              : p
          )
        );
        onInstalled?.();
      } else {
        toastManager.add({ type: 'error', title: t('Failed to install plugin') });
      }
    } catch {
      toastManager.add({ type: 'error', title: t('Failed to install plugin') });
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (plugin: AvailablePlugin) => {
    const pluginId = `${plugin.name}@${plugin.marketplace}`;
    setInstalling(pluginId);

    try {
      const success = await window.electronAPI.claudeConfig.plugins.uninstall(pluginId);

      if (success) {
        toastManager.add({ type: 'success', title: t('Plugin uninstalled') });
        // 本地更新状态，避免重新加载导致滚动重置
        setPlugins((prev) =>
          prev.map((p) =>
            p.name === plugin.name && p.marketplace === plugin.marketplace
              ? { ...p, installed: false }
              : p
          )
        );
        onInstalled?.();
      } else {
        toastManager.add({ type: 'error', title: t('Failed to uninstall plugin') });
      }
    } catch {
      toastManager.add({ type: 'error', title: t('Failed to uninstall plugin') });
    } finally {
      setInstalling(null);
    }
  };

  const filteredPlugins = React.useMemo(() => {
    if (!searchQuery.trim()) return plugins;

    const query = searchQuery.toLowerCase();
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.author?.name?.toLowerCase().includes(query)
    );
  }, [plugins, searchQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl" zIndexLevel="nested">
        <DialogHeader>
          <DialogTitle>{t('Browse Plugins')}</DialogTitle>
          <DialogDescription>{t('Browse and install plugins from marketplaces')}</DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <div className="flex gap-2">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-md border bg-background px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Search plugins...')}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Select
              value={selectedMarketplace}
              onValueChange={(v) => v && setSelectedMarketplace(v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue>
                  {selectedMarketplace === 'all' ? t('All Marketplaces') : selectedMarketplace}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="all">{t('All Marketplaces')}</SelectItem>
                {marketplaces.map((mp) => (
                  <SelectItem key={mp.name} value={mp.name}>
                    {mp.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPlugins.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {searchQuery ? t('No plugins found') : t('No plugins available')}
              </p>
            ) : (
              filteredPlugins.map((plugin) => {
                const pluginId = `${plugin.name}@${plugin.marketplace}`;
                const isInstalling = installing === pluginId;

                return (
                  <div
                    key={pluginId}
                    className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/50 hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{plugin.name}</span>
                        <span className="text-xs text-muted-foreground">@{plugin.marketplace}</span>
                        {plugin.installed && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            {t('Installed')}
                          </span>
                        )}
                      </div>
                      {plugin.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {plugin.description}
                        </p>
                      )}
                      {plugin.author?.name && (
                        <p className="text-xs text-muted-foreground">by {plugin.author.name}</p>
                      )}
                    </div>
                    <div className="ml-2">
                      {plugin.installed ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleUninstall(plugin)}
                          disabled={isInstalling}
                        >
                          {isInstalling ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-1" />
                          )}
                          {t('Uninstall')}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInstall(plugin)}
                          disabled={isInstalling}
                        >
                          {isInstalling ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 mr-1" />
                          )}
                          {t('Install')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Close')}</Button>} />
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
