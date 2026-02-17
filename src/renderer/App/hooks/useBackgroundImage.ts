import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';

export function useBackgroundImage() {
  const backgroundImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const backgroundOpacity = useSettingsStore((s) => s.backgroundOpacity);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    if (backgroundImageEnabled) {
      body.classList.add('bg-image-enabled');
      body.style.backgroundColor = 'transparent';

      const isDark = html.classList.contains('dark');
      const panelOpacity = 1 - backgroundOpacity;

      if (isDark) {
        const bg = `oklch(0.145 0.014 285.82 / ${panelOpacity})`;
        const muted = `oklch(0.269 0.014 285.82 / ${panelOpacity})`;
        body.style.setProperty('--background', bg);
        body.style.setProperty('--card', bg);
        body.style.setProperty('--popover', bg);
        body.style.setProperty('--muted', muted);
        body.style.setProperty('--accent', muted);
        body.style.setProperty('--border', muted);
        body.style.setProperty('--input', muted);
        body.style.setProperty('--color-background', bg);
        body.style.setProperty('--color-card', bg);
        body.style.setProperty('--color-popover', bg);
        body.style.setProperty('--color-muted', muted);
        body.style.setProperty('--color-accent', muted);
        body.style.setProperty('--color-border', muted);
        body.style.setProperty('--color-input', muted);
      } else {
        const bg = `oklch(1 0 0 / ${panelOpacity})`;
        const muted = `oklch(0.965 0.003 285.82 / ${panelOpacity})`;
        body.style.setProperty('--background', bg);
        body.style.setProperty('--card', bg);
        body.style.setProperty('--popover', bg);
        body.style.setProperty('--muted', muted);
        body.style.setProperty('--accent', muted);
        body.style.setProperty('--color-background', bg);
        body.style.setProperty('--color-card', bg);
        body.style.setProperty('--color-popover', bg);
        body.style.setProperty('--color-muted', muted);
        body.style.setProperty('--color-accent', muted);
      }
    } else {
      body.classList.remove('bg-image-enabled');
      body.style.backgroundColor = '';
      const varsToRemove = [
        '--background',
        '--card',
        '--popover',
        '--muted',
        '--accent',
        '--border',
        '--input',
        '--color-background',
        '--color-card',
        '--color-popover',
        '--color-muted',
        '--color-accent',
        '--color-border',
        '--color-input',
      ];
      for (const v of varsToRemove) body.style.removeProperty(v);
    }

    return () => {
      body.classList.remove('bg-image-enabled');
      body.style.backgroundColor = '';
      const varsToRemove = [
        '--background',
        '--card',
        '--popover',
        '--muted',
        '--accent',
        '--border',
        '--input',
        '--color-background',
        '--color-card',
        '--color-popover',
        '--color-muted',
        '--color-accent',
        '--color-border',
        '--color-input',
      ];
      for (const v of varsToRemove) body.style.removeProperty(v);
    };
  }, [backgroundImageEnabled, backgroundOpacity]);
}
