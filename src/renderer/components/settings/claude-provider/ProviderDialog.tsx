import type { ClaudeProvider } from '@shared/types';
import { Eye, EyeOff } from 'lucide-react';
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: ClaudeProvider | null;
  initialValues?: Partial<ClaudeProvider> | null;
}

export function ProviderDialog({
  open,
  onOpenChange,
  provider,
  initialValues,
}: ProviderDialogProps) {
  const { t } = useI18n();
  const addClaudeProvider = useSettingsStore((s) => s.addClaudeProvider);
  const updateClaudeProvider = useSettingsStore((s) => s.updateClaudeProvider);

  const isEditing = !!provider;

  // 表单状态
  const [showToken, setShowToken] = React.useState(false);
  const [name, setName] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [authToken, setAuthToken] = React.useState('');
  const [model, setModel] = React.useState('');
  const [smallFastModel, setSmallFastModel] = React.useState('');
  const [defaultSonnetModel, setDefaultSonnetModel] = React.useState('');
  const [defaultOpusModel, setDefaultOpusModel] = React.useState('');
  const [defaultHaikuModel, setDefaultHaikuModel] = React.useState('');

  // 初始化表单
  React.useEffect(() => {
    if (open) {
      setShowToken(false);
      if (provider) {
        setName(provider.name);
        setBaseUrl(provider.baseUrl);
        setAuthToken(provider.authToken);
        setModel(provider.model ?? '');
        setSmallFastModel(provider.smallFastModel ?? '');
        setDefaultSonnetModel(provider.defaultSonnetModel ?? '');
        setDefaultOpusModel(provider.defaultOpusModel ?? '');
        setDefaultHaikuModel(provider.defaultHaikuModel ?? '');
      } else if (initialValues) {
        // 从当前配置保存时，忽略 model 和 smallFastModel 字段
        // 这些字段仅在用户手动添加配置时才设置
        setName('');
        setBaseUrl(initialValues.baseUrl ?? '');
        setAuthToken(initialValues.authToken ?? '');
        setModel('');
        setSmallFastModel('');
        setDefaultSonnetModel(initialValues.defaultSonnetModel ?? '');
        setDefaultOpusModel(initialValues.defaultOpusModel ?? '');
        setDefaultHaikuModel(initialValues.defaultHaikuModel ?? '');
      } else {
        setName('');
        setBaseUrl('');
        setAuthToken('');
        setModel('');
        setSmallFastModel('');
        setDefaultSonnetModel('');
        setDefaultOpusModel('');
        setDefaultHaikuModel('');
      }
    }
  }, [open, provider, initialValues]);

  const handleSave = async () => {
    if (!name.trim() || !baseUrl.trim() || !authToken.trim()) {
      return;
    }

    const providerData: ClaudeProvider = {
      id: provider?.id ?? crypto.randomUUID(),
      ...(provider && { enabled: provider.enabled, displayOrder: provider.displayOrder }),
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      authToken: authToken.trim(),
      model: model.trim() || undefined,
      smallFastModel: smallFastModel.trim() || undefined,
      defaultSonnetModel: defaultSonnetModel.trim() || undefined,
      defaultOpusModel: defaultOpusModel.trim() || undefined,
      defaultHaikuModel: defaultHaikuModel.trim() || undefined,
    };

    if (isEditing) {
      updateClaudeProvider(provider.id, providerData);
    } else {
      addClaudeProvider(providerData);
    }

    onOpenChange(false);
  };

  const isValid = name.trim() && baseUrl.trim() && authToken.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup zIndexLevel="nested">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('Edit Provider') : t('Add Provider')}</DialogTitle>
          <DialogDescription>{t('Configure Claude API provider settings')}</DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          {/* 名称 */}
          <Field>
            <FieldLabel>{t('Name')} *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g., Official API')}
            />
          </Field>

          {/* Base URL */}
          <Field>
            <FieldLabel>{t('Base URL')} *</FieldLabel>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.anthropic.com"
            />
          </Field>

          {/* Auth Token */}
          <Field>
            <FieldLabel>{t('Auth Token')} *</FieldLabel>
            <div className="relative w-full">
              <Input
                type={showToken ? 'text' : 'password'}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="sk-ant-..."
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {/* 可选字段 - 折叠区域 */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              {t('Advanced Options')}
            </summary>
            <div className="mt-3 space-y-3">
              {/* Model */}
              <Field>
                <FieldLabel>{t('Model')}</FieldLabel>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="opus / sonnet / haiku"
                />
              </Field>

              {/* Small Fast Model */}
              <Field>
                <FieldLabel>{t('Small/Fast Model')}</FieldLabel>
                <Input
                  value={smallFastModel}
                  onChange={(e) => setSmallFastModel(e.target.value)}
                  placeholder="claude-3-haiku-..."
                />
              </Field>

              {/* Default Sonnet Model */}
              <Field>
                <FieldLabel>{t('Sonnet Model')}</FieldLabel>
                <Input
                  value={defaultSonnetModel}
                  onChange={(e) => setDefaultSonnetModel(e.target.value)}
                  placeholder="claude-sonnet-4-..."
                />
              </Field>

              {/* Default Opus Model */}
              <Field>
                <FieldLabel>{t('Opus Model')}</FieldLabel>
                <Input
                  value={defaultOpusModel}
                  onChange={(e) => setDefaultOpusModel(e.target.value)}
                  placeholder="claude-opus-4-..."
                />
              </Field>

              {/* Default Haiku Model */}
              <Field>
                <FieldLabel>{t('Haiku Model')}</FieldLabel>
                <Input
                  value={defaultHaikuModel}
                  onChange={(e) => setDefaultHaikuModel(e.target.value)}
                  placeholder="claude-3-haiku-..."
                />
              </Field>
            </div>
          </details>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button onClick={handleSave} disabled={!isValid}>
            {isEditing ? t('Save') : t('Add')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
