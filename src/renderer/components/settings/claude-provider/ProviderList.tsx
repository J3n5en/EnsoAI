import type { ClaudeProvider } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Circle, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { ProviderDialog } from './ProviderDialog';

interface ProviderListProps {
  className?: string;
}

export function ProviderList({ className }: ProviderListProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const providers = useSettingsStore((s) => s.claudeCodeIntegration.providers);
  const removeClaudeProvider = useSettingsStore((s) => s.removeClaudeProvider);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingProvider, setEditingProvider] = React.useState<ClaudeProvider | null>(null);
  const [saveFromCurrent, setSaveFromCurrent] = React.useState(false);

  // 读取当前 Claude settings
  // 主要依赖 IPC 实时监听机制同步配置变化，轮询作为备用保障（30 秒间隔）
  const { data: claudeData } = useQuery({
    queryKey: ['claude-settings'],
    queryFn: () => window.electronAPI.claudeProvider.readSettings(),
    refetchInterval: 30000,
  });

  // 监听 settings.json 文件变化事件（由主进程 fs.watch 触发）
  // 当外部工具（如 cc-switch）修改配置时，立即刷新数据
  React.useEffect(() => {
    const cleanup = window.electronAPI.claudeProvider.onSettingsChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['claude-settings'] });
    });
    return cleanup;
  }, [queryClient]);

  // 计算当前激活的 Provider
  const activeProvider = React.useMemo(() => {
    const env = claudeData?.settings?.env;
    if (!env) return null;
    return (
      providers.find(
        (p) => p.baseUrl === env.ANTHROPIC_BASE_URL && p.authToken === env.ANTHROPIC_AUTH_TOKEN
      ) ?? null
    );
  }, [providers, claudeData?.settings]);

  // 检查当前配置是否未保存
  const hasUnsavedConfig = React.useMemo(() => {
    if (!claudeData?.extracted?.baseUrl) return false;
    return !activeProvider;
  }, [claudeData?.extracted, activeProvider]);

  // 切换 Provider
  const handleSwitch = async (provider: ClaudeProvider) => {
    const success = await window.electronAPI.claudeProvider.apply(provider);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['claude-settings'] });
      toastManager.add({
        type: 'success',
        title: t('Provider switched'),
        description: provider.name,
      });
    }
  };

  // 编辑 Provider
  const handleEdit = (provider: ClaudeProvider) => {
    setEditingProvider(provider);
    setSaveFromCurrent(false);
    setDialogOpen(true);
  };

  // 删除 Provider
  const handleDelete = (provider: ClaudeProvider) => {
    removeClaudeProvider(provider.id);
  };

  // 新建 Provider
  const handleAdd = () => {
    setEditingProvider(null);
    setSaveFromCurrent(false);
    setDialogOpen(true);
  };

  // 从当前配置保存
  const handleSaveFromCurrent = () => {
    setEditingProvider(null);
    setSaveFromCurrent(true);
    setDialogOpen(true);
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* 当前配置状态 */}
      {hasUnsavedConfig && claudeData?.extracted && (
        <div className="flex items-center justify-between rounded-md border border-dashed border-yellow-500/50 bg-yellow-500/5 px-3 py-2">
          <span className="text-sm text-muted-foreground">{t('Current config not saved')}</span>
          <Button variant="outline" size="sm" onClick={handleSaveFromCurrent}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {t('Save')}
          </Button>
        </div>
      )}

      {/* Provider 列表 */}
      {providers.length > 0 ? (
        <div className="space-y-1">
          {providers.map((provider) => {
            const isActive = activeProvider?.id === provider.id;
            return (
              <div
                key={provider.id}
                role="button"
                tabIndex={isActive ? -1 : 0}
                className={cn(
                  'group flex items-center justify-between rounded-md px-3 py-2 transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'cursor-pointer hover:bg-accent/50'
                )}
                onClick={() => !isActive && handleSwitch(provider)}
                onKeyDown={(e) => {
                  if (!isActive && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleSwitch(provider);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  {isActive ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{provider.name}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(provider);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(provider);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-4 text-center text-sm text-muted-foreground">
          {t('No providers configured')}
        </div>
      )}

      {/* 添加按钮 */}
      <Button variant="outline" size="sm" className="w-full" onClick={handleAdd}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t('Add Provider')}
      </Button>

      {/* 弹窗 */}
      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider={editingProvider}
        initialValues={saveFromCurrent ? claudeData?.extracted : undefined}
      />
    </div>
  );
}
