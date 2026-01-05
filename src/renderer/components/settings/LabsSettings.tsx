import { FlaskConical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

export function LabsSettings() {
  const { labsUseGhosttyWeb, setLabsUseGhosttyWeb } = useSettingsStore();
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          {t('Labs')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('Experimental features that may be unstable')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Use Ghostty Web')}</span>
            <p className="text-xs text-muted-foreground">
              {t(
                'Replace xterm.js with ghostty-web for terminal rendering. Provides better Unicode and VT100 support.'
              )}
            </p>
          </div>
          <Switch checked={labsUseGhosttyWeb} onCheckedChange={setLabsUseGhosttyWeb} />
        </div>
      </div>
    </div>
  );
}
