import type { PluginMarketplace } from '@shared/types';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';

interface MarketplacesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarketplacesDialog({ open, onOpenChange }: MarketplacesDialogProps) {
  const { t } = useI18n();
  const [marketplaces, setMarketplaces] = React.useState<PluginMarketplace[]>([]);
  const [newRepo, setNewRepo] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadMarketplaces = React.useCallback(async () => {
    try {
      const list = await window.electronAPI.claudeConfig.plugins.marketplaces.list();
      setMarketplaces(list);
    } catch (error) {
      console.error('Failed to load marketplaces:', error);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      loadMarketplaces();
    }
  }, [open, loadMarketplaces]);

  const handleAdd = async () => {
    if (!newRepo.trim()) return;

    // 解析 GitHub URL 或直接使用 owner/repo 格式
    let repo = newRepo.trim();
    const githubUrlMatch = repo.match(/github\.com\/([^/]+\/[^/]+)/);
    if (githubUrlMatch) {
      repo = githubUrlMatch[1].replace(/\.git$/, '');
    }

    setLoading(true);
    try {
      const success = await window.electronAPI.claudeConfig.plugins.marketplaces.add(repo);
      if (success) {
        toastManager.add({ type: 'success', title: t('Marketplace added') });
        setNewRepo('');
        await loadMarketplaces();
      } else {
        toastManager.add({ type: 'error', title: t('Marketplace already exists') });
      }
    } catch {
      toastManager.add({ type: 'error', title: t('Failed to add marketplace') });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (name: string) => {
    try {
      const success = await window.electronAPI.claudeConfig.plugins.marketplaces.remove(name);
      if (success) {
        toastManager.add({ type: 'success', title: t('Marketplace removed') });
        await loadMarketplaces();
      }
    } catch {
      toastManager.add({ type: 'error', title: t('Failed to remove marketplace') });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const success = await window.electronAPI.claudeConfig.plugins.marketplaces.refresh();
      if (success) {
        toastManager.add({ type: 'success', title: t('Marketplaces updated') });
        await loadMarketplaces();
      } else {
        toastManager.add({ type: 'error', title: t('Failed to update marketplaces') });
      }
    } catch {
      toastManager.add({ type: 'error', title: t('Failed to update marketplaces') });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg" zIndexLevel="nested">
        <DialogHeader>
          <DialogTitle>{t('Plugin Marketplaces')}</DialogTitle>
          <DialogDescription>{t('Manage plugin marketplace sources')}</DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
              placeholder="owner/repo or GitHub URL"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
            <Button onClick={handleAdd} disabled={loading || !newRepo.trim()} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              title={t('Update All')}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {marketplaces.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('No marketplaces configured')}
              </p>
            ) : (
              marketplaces.map((marketplace) => (
                <div
                  key={marketplace.name}
                  className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">{marketplace.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{marketplace.repo}</span>
                      <span className="shrink-0">·</span>
                      <span className="shrink-0">
                        {new Date(marketplace.lastUpdated).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive ml-2"
                    onClick={() => handleRemove(marketplace.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
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
