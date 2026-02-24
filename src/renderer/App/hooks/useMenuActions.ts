import { useEffect } from 'react';

export function useMenuActions(openSettings: () => void, setActionPanelOpen: (open: boolean) => void) {
  useEffect(() => {
    const cleanup = window.electronAPI.menu.onAction((action) => {
      switch (action) {
        case 'open-settings':
          openSettings();
          break;
        case 'open-action-panel':
          setActionPanelOpen(true);
          break;
      }
    });
    return cleanup;
  }, [openSettings, setActionPanelOpen]);
}
