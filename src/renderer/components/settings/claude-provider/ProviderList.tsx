import type { ClaudeProvider } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Reorder, useDragControls } from 'framer-motion';
import {
  Ban,
  Check,
  CheckCircle,
  Circle,
  Eye,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { toastManager } from '@/components/ui/toast';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';
import {
  clearClaudeProviderSwitch,
  isClaudeProviderMatch,
  markClaudeProviderSwitch,
} from '@/lib/claudeProvider';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { ProviderDialog } from './ProviderDialog';

interface ProviderListProps {
  className?: string;
}

interface ProviderItemProps {
  provider: ClaudeProvider;
  isActive: boolean;
  isDisabled: boolean;
  enableProviderDisableFeature: boolean;
  onSwitch: (provider: ClaudeProvider) => void;
  onToggleEnabled: (provider: ClaudeProvider, e: React.MouseEvent) => void;
  onEdit: (provider: ClaudeProvider) => void;
  onDelete: (provider: ClaudeProvider) => void;
  t: (key: string) => string;
}

function ProviderItem({
  provider,
  isActive,
  isDisabled,
  enableProviderDisableFeature,
  onSwitch,
  onToggleEnabled,
  onEdit,
  onDelete,
  t,
}: ProviderItemProps) {
  const controls = useDragControls();
  const isDraggingRef = React.useRef(false);

  // 当 enableProviderDisableFeature 为 false 时，视为所有 Provider 都启用
  const effectiveIsDisabled = enableProviderDisableFeature ? isDisabled : false;

  return (
    <Reorder.Item
      key={provider.id}
      value={provider}
      dragListener={false}
      dragControls={controls}
      className={cn(
        'group flex items-center justify-between rounded-md px-3 py-2 transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : effectiveIsDisabled
            ? 'opacity-60'
            : 'cursor-pointer hover:bg-accent/50'
      )}
      onClick={() => {
        // 如果刚刚在拖拽手柄上释放，不触发选中
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          return;
        }
        !isActive && !effectiveIsDisabled && onSwitch(provider);
      }}
      onKeyDown={(e) => {
        if (!isActive && !effectiveIsDisabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSwitch(provider);
        }
      }}
      drag="y"
    >
      <div className="flex items-center gap-2">
        <div
          role="button"
          tabIndex={0}
          aria-label={t('Drag to reorder')}
          onPointerDown={(e) => {
            isDraggingRef.current = true;
            controls.start(e);
          }}
          className="cursor-grab text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {isActive ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}

        <span
          className={cn(
            'text-sm font-medium',
            effectiveIsDisabled && 'text-muted-foreground line-through'
          )}
        >
          {provider.name}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {enableProviderDisableFeature && (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button variant="ghost" size="icon-xs" onClick={(e) => onToggleEnabled(provider, e)}>
                {isDisabled ? (
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipPopup>
              {isDisabled
                ? t('Click to enable this Provider')
                : t('Click to disable this Provider')}
            </TooltipPopup>
          </Tooltip>
        )}

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(provider);
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
            onDelete(provider);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Reorder.Item>
  );
}

export function ProviderList({ className }: ProviderListProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const providers = useSettingsStore((s) => s.claudeCodeIntegration.providers);
  const removeClaudeProvider = useSettingsStore((s) => s.removeClaudeProvider);
  const shouldPoll = useShouldPoll();
  const enableProviderDisableFeature = useSettingsStore(
    (s) => s.claudeCodeIntegration.enableProviderDisableFeature
  );

  const setClaudeProviderEnabled = useSettingsStore((s) => s.setClaudeProviderEnabled);
  const setClaudeProviderOrder = useSettingsStore((s) => s.setClaudeProviderOrder);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingProvider, setEditingProvider] = React.useState<ClaudeProvider | null>(null);
  const [saveFromCurrent, setSaveFromCurrent] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  // 读取当前 Claude settings（窗口空闲时停止轮询）
  const { data: claudeData } = useQuery({
    queryKey: ['claude-settings'],
    queryFn: () => window.electronAPI.claudeProvider.readSettings(),
    refetchInterval: shouldPoll ? 30000 : false,
  });

  // 监听 settings.json 文件变化事件（由主进程 fs.watch 触发）
  // 当外部工具（如 cc-switch）修改配置时，立即刷新数据
  // 窗口空闲时停止监听以节省资源
  React.useEffect(() => {
    if (!shouldPoll) return;

    const cleanup = window.electronAPI.claudeProvider.onSettingsChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['claude-settings'] });
    });
    return cleanup;
  }, [queryClient, shouldPoll]);

  // 计算当前激活的 Provider
  const activeProvider = React.useMemo(() => {
    const currentConfig = claudeData?.extracted;
    if (!currentConfig) return null;
    return providers.find((p) => isClaudeProviderMatch(p, currentConfig)) ?? null;
  }, [providers, claudeData?.extracted]);

  // 检查当前配置是否未保存
  const hasUnsavedConfig = React.useMemo(() => {
    if (!claudeData?.extracted?.baseUrl) return false;
    return !activeProvider;
  }, [claudeData?.extracted, activeProvider]);

  // 切换 Provider
  const handleSwitch = async (provider: ClaudeProvider) => {
    markClaudeProviderSwitch(provider);
    const success = await window.electronAPI.claudeProvider.apply(provider);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['claude-settings'] });
      toastManager.add({
        type: 'success',
        title: t('Provider switched'),
        description: provider.name,
      });
    } else {
      clearClaudeProviderSwitch();
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

  // 处理拖拽重排序
  const handleReorder = (newProviders: ClaudeProvider[]) => {
    setClaudeProviderOrder(newProviders);
  };

  const handleToggleEnabled = (provider: ClaudeProvider, e: React.MouseEvent) => {
    e.stopPropagation();
    setClaudeProviderEnabled(provider.id, provider.enabled === false);
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

  React.useEffect(() => {
    const handlePreviewOpen = () => setPreviewOpen(true);
    const handleSaveOpen = () => {
      setEditingProvider(null);
      setSaveFromCurrent(true);
      setDialogOpen(true);
    };

    window.addEventListener('open-settings-provider-preview', handlePreviewOpen);
    window.addEventListener('open-settings-provider-save', handleSaveOpen);

    return () => {
      window.removeEventListener('open-settings-provider-preview', handlePreviewOpen);
      window.removeEventListener('open-settings-provider-save', handleSaveOpen);
    };
  }, []);

  return (
    <div className={cn('space-y-3', className)}>
      {/* 当前配置状态 */}
      {hasUnsavedConfig && claudeData?.extracted && (
        <div className="flex items-center justify-between rounded-md border border-dashed border-yellow-500/50 bg-yellow-500/5 px-3 py-2">
          <span className="text-sm text-muted-foreground">{t('Current config not saved')}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="xs" className="h-6" onClick={() => setPreviewOpen(true)}>
              <Eye className="mr-1 h-3.5 w-3.5" />
              {t('Preview')}
            </Button>
            <Button variant="outline" size="xs" className="h-6" onClick={handleSaveFromCurrent}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {t('Save')}
            </Button>
          </div>
        </div>
      )}

      {/* Provider 列表 */}
      {providers.length > 0 ? (
        <Reorder.Group axis="y" values={providers} onReorder={handleReorder} className="space-y-1">
          {providers.map((provider) => {
            const isActive = activeProvider?.id === provider.id;
            const isDisabled = provider.enabled === false;

            return (
              <ProviderItem
                key={provider.id}
                provider={provider}
                isActive={isActive}
                isDisabled={isDisabled}
                enableProviderDisableFeature={enableProviderDisableFeature}
                onSwitch={handleSwitch}
                onToggleEnabled={handleToggleEnabled}
                onEdit={handleEdit}
                onDelete={handleDelete}
                t={t}
              />
            );
          })}
        </Reorder.Group>
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogPopup className="max-w-xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t('Preview')}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <pre className="max-h-[420px] whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              {JSON.stringify(
                {
                  env: {
                    ANTHROPIC_BASE_URL: claudeData?.settings?.env?.ANTHROPIC_BASE_URL,
                    ANTHROPIC_AUTH_TOKEN: claudeData?.settings?.env?.ANTHROPIC_AUTH_TOKEN,
                    ANTHROPIC_DEFAULT_SONNET_MODEL:
                      claudeData?.settings?.env?.ANTHROPIC_DEFAULT_SONNET_MODEL,
                    ANTHROPIC_DEFAULT_OPUS_MODEL:
                      claudeData?.settings?.env?.ANTHROPIC_DEFAULT_OPUS_MODEL,
                    ANTHROPIC_DEFAULT_HAIKU_MODEL:
                      claudeData?.settings?.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL,
                  },
                },
                null,
                2
              )}
            </pre>
          </DialogPanel>
          <DialogFooter variant="default">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={handleSaveFromCurrent}>
                {t('Save')}
              </Button>
              <Button size="sm" className="h-8" onClick={() => setPreviewOpen(false)}>
                {t('Close')}
              </Button>
            </div>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
