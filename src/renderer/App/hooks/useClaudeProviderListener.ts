import { useEffect, useRef } from 'react';
import { consumeClaudeProviderSwitch, isClaudeProviderMatch } from '@/lib/claudeProvider';
import { addToast, toastManager } from '@/components/ui/toast';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/i18n';
import type { SettingsCategory } from '@/components/settings/constants';

export function useClaudeProviderListener(
  setSettingsCategory: (category: SettingsCategory) => void,
  setScrollToProvider: (scroll: boolean) => void,
  openSettings: () => void,
  setPendingProviderAction: (action: 'preview' | 'save' | null) => void
) {
  const { t } = useI18n();
  const claudeProviders = useSettingsStore((s) => s.claudeCodeIntegration.providers);
  const providerToastRef = useRef<ReturnType<typeof toastManager.add> | null>(null);

  useEffect(() => {
    const cleanup = window.electronAPI.claudeProvider.onSettingsChanged((data) => {
      const { extracted } = data;
      if (!extracted?.baseUrl) return;

      if (consumeClaudeProviderSwitch(extracted)) {
        return;
      }

      // Close previous provider toast if exists
      if (providerToastRef.current) {
        toastManager.close(providerToastRef.current);
      }

      // Check if the new config matches any saved provider
      const matched = claudeProviders.find((p) => isClaudeProviderMatch(p, extracted));

      if (matched) {
        // Switched to a known provider
        providerToastRef.current = toastManager.add({
          type: 'info',
          title: t('Provider switched'),
          description: matched.name,
        });
      } else {
        // New unsaved config detected
        providerToastRef.current = addToast({
          type: 'info',
          title: t('New provider detected'),
          description: t('Click to save this config'),
          actions: [
            {
              label: t('Preview'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
                setPendingProviderAction('preview');
              },
              variant: 'ghost',
            },
            {
              label: t('Save'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
                setPendingProviderAction('save');
              },
              variant: 'outline',
            },
            {
              label: t('Open Settings'),
              onClick: () => {
                setSettingsCategory('integration');
                setScrollToProvider(true);
                openSettings();
              },
            },
          ],
        });
      }
    });

    return () => {
      if (providerToastRef.current) {
        toastManager.close(providerToastRef.current);
        providerToastRef.current = null;
      }
      cleanup();
    };
  }, [claudeProviders, t, openSettings, setSettingsCategory, setScrollToProvider, setPendingProviderAction]);
}
