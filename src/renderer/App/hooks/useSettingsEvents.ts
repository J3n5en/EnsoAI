import { useEffect } from 'react';
import type { SettingsCategory } from '@/components/settings/constants';

export function useSettingsEvents(
  openSettings: () => void,
  setSettingsCategory: (category: SettingsCategory) => void,
  setScrollToProvider: (scroll: boolean) => void
) {
  // Listen for 'open-settings-provider' event
  useEffect(() => {
    const handleOpenSettingsProvider = () => {
      setSettingsCategory('integration');
      setScrollToProvider(true);
      openSettings();
    };

    window.addEventListener('open-settings-provider', handleOpenSettingsProvider);
    return () => {
      window.removeEventListener('open-settings-provider', handleOpenSettingsProvider);
    };
  }, [openSettings, setSettingsCategory, setScrollToProvider]);

  // Listen for 'open-settings-agent' event
  useEffect(() => {
    const handleOpenSettingsAgent = () => {
      setSettingsCategory('agent');
      openSettings();
    };

    window.addEventListener('open-settings-agent', handleOpenSettingsAgent);
    return () => {
      window.removeEventListener('open-settings-agent', handleOpenSettingsAgent);
    };
  }, [openSettings, setSettingsCategory]);
}
