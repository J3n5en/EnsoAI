import type { Locale } from '@shared/i18n';
import type { AgentCliInfo, BuiltinAgentId, CustomAgent, ShellInfo } from '@shared/types';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  FileCode,
  Keyboard,
  Link,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from '@/components/ui/combobox';
import { Dialog, DialogPopup, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useKeybindingInterceptor } from '@/hooks/useKeybindingInterceptor';
import { useI18n } from '@/i18n';
import {
  defaultDarkTheme,
  getThemeNames,
  getXtermTheme,
  type XtermTheme,
} from '@/lib/ghosttyTheme';
import { codeToKey } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import {
  type EditorAutoClosingBrackets,
  type EditorAutoClosingQuotes,
  type EditorAutoSave,
  type EditorCursorBlinking,
  type EditorCursorStyle,
  type EditorLineNumbers,
  type EditorRenderLineHighlight,
  type EditorRenderWhitespace,
  type EditorWordWrap,
  type FontWeight,
  type TerminalKeybinding,
  type TerminalRenderer,
  type Theme,
  useSettingsStore,
} from '@/stores/settings';

type SettingsCategory =
  | 'general'
  | 'appearance'
  | 'editor'
  | 'keybindings'
  | 'agent'
  | 'integration';

interface SettingsDialogProps {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ trigger, open, onOpenChange }: SettingsDialogProps) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = React.useState<SettingsCategory>('general');
  const [internalOpen, setInternalOpen] = React.useState(false);
  const categories: Array<{ id: SettingsCategory; icon: React.ElementType; label: string }> = [
    { id: 'general', icon: Settings, label: t('General') },
    { id: 'appearance', icon: Palette, label: t('Appearance') },
    { id: 'editor', icon: FileCode, label: t('Editor') },
    { id: 'keybindings', icon: Keyboard, label: t('Keybindings') },
    { id: 'agent', icon: Bot, label: t('Agent') },
    { id: 'integration', icon: Link, label: t('Integration') },
  ];

  // Controlled mode (open prop provided) doesn't need trigger
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (isControlled) {
        onOpenChange?.(newOpen);
      } else {
        setInternalOpen(newOpen);
      }
    },
    [isControlled, onOpenChange]
  );

  const handleClose = React.useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  // Intercept close tab keybinding when dialog is open
  useKeybindingInterceptor(isOpen, 'closeTab', handleClose);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            )
          }
        />
      )}
      <DialogPopup className="sm:max-w-2xl" showCloseButton={true}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="text-lg font-medium">{t('Settings')}</DialogTitle>
        </div>
        <div className="flex h-[500px]">
          {/* Left: Category List */}
          <nav className="w-48 shrink-0 space-y-1 border-r p-2">
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  activeCategory === category.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <category.icon className="h-4 w-4" />
                {category.label}
              </button>
            ))}
          </nav>

          {/* Right: Settings Panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeCategory === 'general' && <GeneralSettings />}
            {activeCategory === 'appearance' && <AppearanceSettings />}
            {activeCategory === 'editor' && <EditorSettingsPanel />}
            {activeCategory === 'keybindings' && <KeybindingsSettings />}
            {activeCategory === 'agent' && <AgentSettings />}
            {activeCategory === 'integration' && <IntegrationSettings />}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function GeneralSettings() {
  const {
    language,
    setLanguage,
    terminalRenderer,
    setTerminalRenderer,
    terminalScrollback,
    setTerminalScrollback,
    shellConfig,
    setShellConfig,
    wslEnabled,
    setWslEnabled,
    agentNotificationEnabled,
    setAgentNotificationEnabled,
    agentNotificationDelay,
    setAgentNotificationDelay,
    agentNotificationEnterDelay,
    setAgentNotificationEnterDelay,
  } = useSettingsStore();
  const { t, locale } = useI18n();

  const numberFormatter = React.useMemo(
    () => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US'),
    [locale]
  );

  const rendererOptions = React.useMemo(
    () => [
      { value: 'webgl', label: 'WebGL', description: t('Best performance (recommended)') },
      { value: 'canvas', label: 'Canvas', description: t('Good compatibility') },
      { value: 'dom', label: 'DOM', description: t('Basic, lower performance') },
    ],
    [t]
  );

  const scrollbackOptions = React.useMemo(
    () =>
      [1000, 5000, 10000, 20000, 50000].map((value) => ({
        value,
        label: t('{{count}} lines', { count: numberFormatter.format(value) }),
      })),
    [t, numberFormatter]
  );

  const notificationDelayOptions = React.useMemo(
    () =>
      [1, 2, 3, 5, 10].map((value) => ({
        value,
        label: t('{{count}} seconds', { count: value }),
      })),
    [t]
  );

  const enterDelayOptions = React.useMemo(
    () => [
      { value: 0, label: t('Disabled') },
      ...[1, 2, 3, 5].map((value) => ({
        value,
        label: t('{{count}} seconds', { count: value }),
      })),
    ],
    [t]
  );

  const [shells, setShells] = React.useState<ShellInfo[]>([]);
  const [loadingShells, setLoadingShells] = React.useState(true);
  const isWindows = window.electronAPI?.env.platform === 'win32';

  React.useEffect(() => {
    window.electronAPI.shell.detect().then((detected) => {
      setShells(detected);
      setLoadingShells(false);
    });
  }, []);

  const availableShells = shells.filter((s) => s.available);
  const currentShell = shells.find((s) => s.id === shellConfig.shellType);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Language')}</h3>
        <p className="text-sm text-muted-foreground">{t('Choose display language')}</p>
      </div>

      {/* Language */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Language')}</span>
        <div className="space-y-1.5">
          <Select value={language} onValueChange={(v) => setLanguage(v as Locale)}>
            <SelectTrigger className="w-48">
              <SelectValue>{language === 'zh' ? t('Chinese') : t('English')}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="en">{t('English')}</SelectItem>
              <SelectItem value="zh">{t('Chinese')}</SelectItem>
            </SelectPopup>
          </Select>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Terminal')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Terminal renderer and performance settings')}
        </p>
      </div>

      {/* Shell */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Shell')}</span>
        <div className="space-y-1.5">
          {loadingShells ? (
            <div className="flex h-10 items-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </div>
          ) : (
            <Select
              value={shellConfig.shellType}
              onValueChange={(v) => setShellConfig({ ...shellConfig, shellType: v as never })}
            >
              <SelectTrigger className="w-64">
                <SelectValue>{currentShell?.name || shellConfig.shellType}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {availableShells.map((shell) => (
                  <SelectItem key={shell.id} value={shell.id}>
                    <div className="flex items-center gap-2">
                      <span>{shell.name}</span>
                      {shell.isWsl && (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                          WSL
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals')}</p>
        </div>
      </div>

      {/* WSL Settings (Windows only) */}
      {isWindows && (
        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
          <span className="text-sm font-medium">{t('WSL detection')}</span>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{t('Auto-detect agent CLI in WSL')}</p>
            <Switch checked={wslEnabled} onCheckedChange={setWslEnabled} />
          </div>
        </div>
      )}

      {/* Renderer */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Renderer')}</span>
        <div className="space-y-1.5">
          <Select
            value={terminalRenderer}
            onValueChange={(v) => setTerminalRenderer(v as TerminalRenderer)}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {rendererOptions.find((o) => o.value === terminalRenderer)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {rendererOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {rendererOptions.find((o) => o.value === terminalRenderer)?.description}
          </p>
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals or restart')}</p>
        </div>
      </div>

      {/* Scrollback */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Terminal scrollback')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(terminalScrollback)}
            onValueChange={(v) => setTerminalScrollback(Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {scrollbackOptions.find((o) => o.value === terminalScrollback)?.label ??
                  t('{{count}} lines', { count: numberFormatter.format(terminalScrollback) })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {scrollbackOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('History lines in the terminal. Higher values use more memory.')}
          </p>
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals only')}</p>
        </div>
      </div>

      {/* Agent Notification Section */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-medium">{t('Agent Notifications')}</h3>
        <p className="text-sm text-muted-foreground">{t('Stop output notification')}</p>
      </div>

      {/* Notification Enable */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Enable notifications')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Notifications when agent is idle')}</p>
          <Switch
            checked={agentNotificationEnabled}
            onCheckedChange={setAgentNotificationEnabled}
          />
        </div>
      </div>

      {/* Notification Delay */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Idle time')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(agentNotificationDelay)}
            onValueChange={(v) => setAgentNotificationDelay(Number(v))}
            disabled={!agentNotificationEnabled}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {notificationDelayOptions.find((o) => o.value === agentNotificationDelay)?.label ??
                  t('{{count}} seconds', { count: agentNotificationDelay })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {notificationDelayOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('How long to wait before notifying after the agent stops output.')}
          </p>
        </div>
      </div>

      {/* Enter Delay */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Enter delay')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(agentNotificationEnterDelay)}
            onValueChange={(v) => setAgentNotificationEnterDelay(Number(v))}
            disabled={!agentNotificationEnabled}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {enterDelayOptions.find((o) => o.value === agentNotificationEnterDelay)?.label ??
                  t('{{count}} seconds', { count: agentNotificationEnterDelay })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {enterDelayOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('How long to wait after pressing Enter before starting idle timer.')}
          </p>
        </div>
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const {
    theme,
    setTheme,
    terminalTheme,
    setTerminalTheme,
    terminalFontSize: globalFontSize,
    setTerminalFontSize,
    terminalFontFamily: globalFontFamily,
    setTerminalFontFamily,
    terminalFontWeight,
    setTerminalFontWeight,
    terminalFontWeightBold,
    setTerminalFontWeightBold,
  } = useSettingsStore();
  const { t } = useI18n();

  const themeModeOptions: {
    value: Theme;
    icon: React.ElementType;
    label: string;
    description: string;
  }[] = [
    { value: 'light', icon: Sun, label: t('Light'), description: t('Bright theme') },
    { value: 'dark', icon: Moon, label: t('Dark'), description: t('Eye-friendly dark theme') },
    { value: 'system', icon: Monitor, label: t('System'), description: t('Follow system theme') },
    {
      value: 'sync-terminal',
      icon: Terminal,
      label: t('Sync terminal theme'),
      description: t('Match terminal color scheme'),
    },
  ];

  // Local state for inputs
  const [localFontSize, setLocalFontSize] = React.useState(globalFontSize);
  const [localFontFamily, setLocalFontFamily] = React.useState(globalFontFamily);

  // Sync local state with global when global changes externally
  React.useEffect(() => {
    setLocalFontSize(globalFontSize);
  }, [globalFontSize]);

  React.useEffect(() => {
    setLocalFontFamily(globalFontFamily);
  }, [globalFontFamily]);

  // Apply font size change (with validation)
  const applyFontSizeChange = React.useCallback(() => {
    const validFontSize = Math.max(8, Math.min(32, localFontSize || 8));
    if (validFontSize !== localFontSize) {
      setLocalFontSize(validFontSize);
    }
    if (validFontSize !== globalFontSize) {
      setTerminalFontSize(validFontSize);
    }
  }, [localFontSize, globalFontSize, setTerminalFontSize]);

  // Apply font family change (with validation)
  const applyFontFamilyChange = React.useCallback(() => {
    const validFontFamily = localFontFamily.trim() || globalFontFamily;
    if (validFontFamily !== localFontFamily) {
      setLocalFontFamily(validFontFamily);
    }
    if (validFontFamily !== globalFontFamily) {
      setTerminalFontFamily(validFontFamily);
    }
  }, [localFontFamily, globalFontFamily, setTerminalFontFamily]);

  // Get theme names synchronously from embedded data
  const themeNames = React.useMemo(() => getThemeNames(), []);

  // Get current theme index
  const currentIndex = React.useMemo(() => {
    return themeNames.indexOf(terminalTheme);
  }, [themeNames, terminalTheme]);

  // Get preview theme synchronously
  const previewTheme = React.useMemo(() => {
    return getXtermTheme(terminalTheme) ?? defaultDarkTheme;
  }, [terminalTheme]);

  const handleThemeChange = (value: string | null) => {
    if (value) {
      setTerminalTheme(value);
    }
  };

  const handlePrevTheme = () => {
    const newIndex = currentIndex <= 0 ? themeNames.length - 1 : currentIndex - 1;
    setTerminalTheme(themeNames[newIndex]);
  };

  const handleNextTheme = () => {
    const newIndex = currentIndex >= themeNames.length - 1 ? 0 : currentIndex + 1;
    setTerminalTheme(themeNames[newIndex]);
  };

  return (
    <div className="space-y-6">
      {/* Theme Mode Section */}
      <div>
        <h3 className="text-lg font-medium">{t('Theme mode')}</h3>
        <p className="text-sm text-muted-foreground">{t('Choose interface theme')}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {themeModeOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors',
              theme === option.value
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                theme === option.value
                  ? 'bg-accent-foreground/20 text-accent-foreground'
                  : 'bg-muted'
              )}
            >
              <option.icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">{option.label}</span>
          </button>
        ))}
      </div>

      {/* Terminal Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Terminal')}</h3>
        <p className="text-sm text-muted-foreground">{t('Terminal appearance')}</p>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('Preview')}</p>
        <TerminalPreview
          theme={previewTheme}
          fontSize={localFontSize}
          fontFamily={localFontFamily}
          fontWeight={terminalFontWeight}
        />
      </div>

      {/* Theme Selector */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Color scheme')}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevTheme}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <ThemeCombobox
              value={terminalTheme}
              onValueChange={handleThemeChange}
              themes={themeNames}
            />
          </div>
          <Button variant="outline" size="icon" onClick={handleNextTheme}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Font Family */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Font')}</span>
        <Input
          value={localFontFamily}
          onChange={(e) => setLocalFontFamily(e.target.value)}
          onBlur={applyFontFamilyChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyFontFamilyChange();
              e.currentTarget.blur();
            }
          }}
          placeholder="JetBrains Mono, monospace"
        />
      </div>

      {/* Font Size */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Font size')}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={localFontSize}
            onChange={(e) => setLocalFontSize(Number(e.target.value))}
            onBlur={applyFontSizeChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyFontSizeChange();
                e.currentTarget.blur();
              }
            }}
            min={8}
            max={32}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">px</span>
        </div>
      </div>

      {/* Font Weight */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Font weight')}</span>
        <Select
          value={terminalFontWeight}
          onValueChange={(v) => setTerminalFontWeight(v as FontWeight)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {fontWeightOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Font Weight Bold */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Bold font weight')}</span>
        <Select
          value={terminalFontWeightBold}
          onValueChange={(v) => setTerminalFontWeightBold(v as FontWeight)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {fontWeightOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
    </div>
  );
}

const fontWeightOptions: { value: FontWeight; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: '100', label: '100 (Thin)' },
  { value: '200', label: '200 (Extra Light)' },
  { value: '300', label: '300 (Light)' },
  { value: '400', label: '400 (Regular)' },
  { value: '500', label: '500 (Medium)' },
  { value: '600', label: '600 (Semi Bold)' },
  { value: '700', label: '700 (Bold)' },
  { value: '800', label: '800 (Extra Bold)' },
  { value: '900', label: '900 (Black)' },
  { value: 'bold', label: 'Bold' },
];

// Auto save delay default (in milliseconds)
const AUTO_SAVE_DELAY_DEFAULT = 1000;

function EditorSettingsPanel() {
  const { editorSettings, setEditorSettings } = useSettingsStore();
  const { t } = useI18n();

  // Local state for font inputs
  const [localFontSize, setLocalFontSize] = React.useState(editorSettings.fontSize);
  const [localFontFamily, setLocalFontFamily] = React.useState(editorSettings.fontFamily);
  const [localAutoSaveDelay, setLocalAutoSaveDelay] = React.useState(editorSettings.autoSaveDelay);

  React.useEffect(() => {
    setLocalFontSize(editorSettings.fontSize);
  }, [editorSettings.fontSize]);

  React.useEffect(() => {
    setLocalFontFamily(editorSettings.fontFamily);
  }, [editorSettings.fontFamily]);

  React.useEffect(() => {
    setLocalAutoSaveDelay(editorSettings.autoSaveDelay);
  }, [editorSettings.autoSaveDelay]);

  const applyFontSizeChange = React.useCallback(() => {
    const validFontSize = Math.max(8, Math.min(32, localFontSize || 13));
    if (validFontSize !== localFontSize) setLocalFontSize(validFontSize);
    if (validFontSize !== editorSettings.fontSize) setEditorSettings({ fontSize: validFontSize });
  }, [localFontSize, editorSettings.fontSize, setEditorSettings]);

  const applyFontFamilyChange = React.useCallback(() => {
    const validFontFamily = localFontFamily.trim() || editorSettings.fontFamily;
    if (validFontFamily !== localFontFamily) setLocalFontFamily(validFontFamily);
    if (validFontFamily !== editorSettings.fontFamily)
      setEditorSettings({ fontFamily: validFontFamily });
  }, [localFontFamily, editorSettings.fontFamily, setEditorSettings]);

  const applyAutoSaveDelayChange = React.useCallback(() => {
    const rawVal = Number(localAutoSaveDelay);
    const validDelay = Number.isNaN(rawVal) || rawVal < 0 ? AUTO_SAVE_DELAY_DEFAULT : rawVal;
    if (validDelay !== localAutoSaveDelay) setLocalAutoSaveDelay(validDelay);
    if (validDelay !== editorSettings.autoSaveDelay)
      setEditorSettings({ autoSaveDelay: validDelay });
  }, [localAutoSaveDelay, editorSettings.autoSaveDelay, setEditorSettings]);

  const lineNumbersOptions: { value: EditorLineNumbers; label: string }[] = [
    { value: 'on', label: t('On') },
    { value: 'off', label: t('Off') },
    { value: 'relative', label: t('Relative') },
  ];

  const wordWrapOptions: { value: EditorWordWrap; label: string }[] = [
    { value: 'on', label: t('On') },
    { value: 'off', label: t('Off') },
    { value: 'wordWrapColumn', label: t('Word wrap column') },
    { value: 'bounded', label: t('Bounded') },
  ];

  const renderWhitespaceOptions: { value: EditorRenderWhitespace; label: string }[] = [
    { value: 'none', label: t('None') },
    { value: 'boundary', label: t('Boundary') },
    { value: 'selection', label: t('Selection') },
    { value: 'trailing', label: t('Trailing') },
    { value: 'all', label: t('All') },
  ];

  const renderLineHighlightOptions: { value: EditorRenderLineHighlight; label: string }[] = [
    { value: 'none', label: t('None') },
    { value: 'gutter', label: t('Gutter') },
    { value: 'line', label: t('Line') },
    { value: 'all', label: t('All') },
  ];

  const cursorStyleOptions: { value: EditorCursorStyle; label: string }[] = [
    { value: 'line', label: t('Line') },
    { value: 'line-thin', label: t('Line thin') },
    { value: 'block', label: t('Block') },
    { value: 'block-outline', label: t('Block outline') },
    { value: 'underline', label: t('Underline') },
    { value: 'underline-thin', label: t('Underline thin') },
  ];

  const cursorBlinkingOptions: { value: EditorCursorBlinking; label: string }[] = [
    { value: 'blink', label: t('Blink') },
    { value: 'smooth', label: t('Smooth') },
    { value: 'phase', label: t('Phase') },
    { value: 'expand', label: t('Expand') },
    { value: 'solid', label: t('Solid') },
  ];

  const matchBracketsOptions: { value: 'always' | 'near' | 'never'; label: string }[] = [
    { value: 'always', label: t('Always') },
    { value: 'near', label: t('Near') },
    { value: 'never', label: t('Never') },
  ];

  const autoClosingOptions: { value: EditorAutoClosingBrackets; label: string }[] = [
    { value: 'always', label: t('Always') },
    { value: 'languageDefined', label: t('Language defined') },
    { value: 'beforeWhitespace', label: t('Before whitespace') },
    { value: 'never', label: t('Never') },
  ];

  const autoSaveOptions = useMemo<
    {
      value: EditorAutoSave;
      label: string;
      description: string;
    }[]
  >(
    () => [
      { value: 'off', label: t('Off'), description: t('Auto save is disabled') },
      {
        value: 'afterDelay',
        label: t('After delay'),
        description: t('Auto save after a short delay'),
      },
      {
        value: 'onFocusChange',
        label: t('On focus change'),
        description: t('Auto save when editor loses focus'),
      },
      {
        value: 'onWindowChange',
        label: t('On window change'),
        description: t('Auto save when window loses focus'),
      },
    ],
    [t]
  );

  const tabSizeOptions = [2, 4, 8];

  return (
    <div className="space-y-6">
      {/* Font Section */}
      <div>
        <h3 className="text-lg font-medium">{t('Font')}</h3>
        <p className="text-sm text-muted-foreground">{t('Editor font settings')}</p>
      </div>

      {/* Font Family */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Font family')}</span>
        <Input
          value={localFontFamily}
          onChange={(e) => setLocalFontFamily(e.target.value)}
          onBlur={applyFontFamilyChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyFontFamilyChange();
              e.currentTarget.blur();
            }
          }}
          placeholder="JetBrains Mono, monospace"
        />
      </div>

      {/* Font Size */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Font size')}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={localFontSize}
            onChange={(e) => setLocalFontSize(Number(e.target.value))}
            onBlur={applyFontSizeChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyFontSizeChange();
                e.currentTarget.blur();
              }
            }}
            min={8}
            max={32}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">px</span>
        </div>
      </div>

      {/* Indentation Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Indentation')}</h3>
        <p className="text-sm text-muted-foreground">{t('Tab and space settings')}</p>
      </div>

      {/* Tab Size */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Tab size')}</span>
        <Select
          value={String(editorSettings.tabSize)}
          onValueChange={(v) => setEditorSettings({ tabSize: Number(v) })}
        >
          <SelectTrigger className="w-48">
            <SelectValue>{editorSettings.tabSize}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {tabSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Insert Spaces */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Insert spaces')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Use spaces instead of tabs')}</p>
          <Switch
            checked={editorSettings.insertSpaces}
            onCheckedChange={(checked) => setEditorSettings({ insertSpaces: checked })}
          />
        </div>
      </div>

      {/* Display Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Display')}</h3>
        <p className="text-sm text-muted-foreground">{t('Editor display settings')}</p>
      </div>

      {/* Minimap */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Minimap')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Show minimap in editor')}</p>
          <Switch
            checked={editorSettings.minimapEnabled}
            onCheckedChange={(checked) => setEditorSettings({ minimapEnabled: checked })}
          />
        </div>
      </div>

      {/* Line Numbers */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Line numbers')}</span>
        <Select
          value={editorSettings.lineNumbers}
          onValueChange={(v) => setEditorSettings({ lineNumbers: v as EditorLineNumbers })}
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {lineNumbersOptions.find((o) => o.value === editorSettings.lineNumbers)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {lineNumbersOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Word Wrap */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Word wrap')}</span>
        <Select
          value={editorSettings.wordWrap}
          onValueChange={(v) => setEditorSettings({ wordWrap: v as EditorWordWrap })}
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {wordWrapOptions.find((o) => o.value === editorSettings.wordWrap)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {wordWrapOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Render Whitespace */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Whitespace')}</span>
        <Select
          value={editorSettings.renderWhitespace}
          onValueChange={(v) =>
            setEditorSettings({ renderWhitespace: v as EditorRenderWhitespace })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {
                renderWhitespaceOptions.find((o) => o.value === editorSettings.renderWhitespace)
                  ?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {renderWhitespaceOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Render Line Highlight */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Line highlight')}</span>
        <Select
          value={editorSettings.renderLineHighlight}
          onValueChange={(v) =>
            setEditorSettings({ renderLineHighlight: v as EditorRenderLineHighlight })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {
                renderLineHighlightOptions.find(
                  (o) => o.value === editorSettings.renderLineHighlight
                )?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {renderLineHighlightOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Folding */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Code folding')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Enable code folding')}</p>
          <Switch
            checked={editorSettings.folding}
            onCheckedChange={(checked) => setEditorSettings({ folding: checked })}
          />
        </div>
      </div>

      {/* Links */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Clickable links')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Make links clickable')}</p>
          <Switch
            checked={editorSettings.links}
            onCheckedChange={(checked) => setEditorSettings({ links: checked })}
          />
        </div>
      </div>

      {/* Smooth Scrolling */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Smooth scrolling')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Enable smooth scrolling')}</p>
          <Switch
            checked={editorSettings.smoothScrolling}
            onCheckedChange={(checked) => setEditorSettings({ smoothScrolling: checked })}
          />
        </div>
      </div>

      {/* Cursor Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Cursor')}</h3>
        <p className="text-sm text-muted-foreground">{t('Cursor appearance settings')}</p>
      </div>

      {/* Cursor Style */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Cursor style')}</span>
        <Select
          value={editorSettings.cursorStyle}
          onValueChange={(v) => setEditorSettings({ cursorStyle: v as EditorCursorStyle })}
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {cursorStyleOptions.find((o) => o.value === editorSettings.cursorStyle)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {cursorStyleOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Cursor Blinking */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Cursor blinking')}</span>
        <Select
          value={editorSettings.cursorBlinking}
          onValueChange={(v) => setEditorSettings({ cursorBlinking: v as EditorCursorBlinking })}
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {cursorBlinkingOptions.find((o) => o.value === editorSettings.cursorBlinking)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {cursorBlinkingOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Brackets Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Brackets')}</h3>
        <p className="text-sm text-muted-foreground">{t('Bracket matching and guides')}</p>
      </div>

      {/* Bracket Pair Colorization */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Rainbow brackets')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Colorize matching bracket pairs')}</p>
          <Switch
            checked={editorSettings.bracketPairColorization}
            onCheckedChange={(checked) => setEditorSettings({ bracketPairColorization: checked })}
          />
        </div>
      </div>

      {/* Match Brackets */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Match brackets')}</span>
        <Select
          value={editorSettings.matchBrackets}
          onValueChange={(v) =>
            setEditorSettings({ matchBrackets: v as 'always' | 'near' | 'never' })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {matchBracketsOptions.find((o) => o.value === editorSettings.matchBrackets)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {matchBracketsOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Bracket Pair Guides */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Bracket guides')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Show bracket pair guides')}</p>
          <Switch
            checked={editorSettings.bracketPairGuides}
            onCheckedChange={(checked) => setEditorSettings({ bracketPairGuides: checked })}
          />
        </div>
      </div>

      {/* Indentation Guides */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Indent guides')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Show indentation guides')}</p>
          <Switch
            checked={editorSettings.indentationGuides}
            onCheckedChange={(checked) => setEditorSettings({ indentationGuides: checked })}
          />
        </div>
      </div>

      {/* Editing Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Editing')}</h3>
        <p className="text-sm text-muted-foreground">{t('Auto-completion settings')}</p>
      </div>

      {/* Auto Closing Brackets */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto brackets')}</span>
        <Select
          value={editorSettings.autoClosingBrackets}
          onValueChange={(v) =>
            setEditorSettings({ autoClosingBrackets: v as EditorAutoClosingBrackets })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {
                autoClosingOptions.find((o) => o.value === editorSettings.autoClosingBrackets)
                  ?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {autoClosingOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Auto Closing Quotes */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto quotes')}</span>
        <Select
          value={editorSettings.autoClosingQuotes}
          onValueChange={(v) =>
            setEditorSettings({ autoClosingQuotes: v as EditorAutoClosingQuotes })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {autoClosingOptions.find((o) => o.value === editorSettings.autoClosingQuotes)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {autoClosingOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Auto Save Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Auto Save')}</h3>
        <p className="text-sm text-muted-foreground">{t('Auto save settings')}</p>
      </div>

      {/* Auto Save Mode */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto save')}</span>
        <Select
          value={editorSettings.autoSave}
          onValueChange={(v) => setEditorSettings({ autoSave: v as EditorAutoSave })}
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {autoSaveOptions.find((o) => o.value === editorSettings.autoSave)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {autoSaveOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {/* Auto Save Delay */}
      {editorSettings.autoSave === 'afterDelay' && (
        <div className="grid grid-cols-[120px_1fr] items-center gap-4">
          <span className="text-sm font-medium">{t('Delay')}</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={localAutoSaveDelay}
              onChange={(e) => setLocalAutoSaveDelay(Number(e.target.value))}
              onBlur={applyAutoSaveDelayChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  applyAutoSaveDelayChange();
                }
              }}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">{t('ms')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TerminalPreview({
  theme,
  fontSize,
  fontFamily,
  fontWeight,
}: {
  theme: XtermTheme;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
}) {
  const sampleLines = [
    { id: 'prompt1', text: '$ ', color: theme.green },
    { id: 'cmd1', text: 'ls -la', color: theme.foreground },
    { id: 'nl1', text: '\n' },
    { id: 'perm1', text: 'drwxr-xr-x  ', color: theme.blue },
    { id: 'meta1', text: '5 user staff  160 Dec 23 ', color: theme.foreground },
    { id: 'dir1', text: 'Documents', color: theme.cyan },
    { id: 'nl2', text: '\n' },
    { id: 'perm2', text: '-rw-r--r--  ', color: theme.foreground },
    { id: 'meta2', text: '1 user staff 2048 Dec 22 ', color: theme.foreground },
    { id: 'file1', text: 'config.json', color: theme.yellow },
    { id: 'nl3', text: '\n' },
    { id: 'perm3', text: '-rwxr-xr-x  ', color: theme.foreground },
    { id: 'meta3', text: '1 user staff  512 Dec 21 ', color: theme.foreground },
    { id: 'file2', text: 'script.sh', color: theme.green },
    { id: 'nl4', text: '\n\n' },
    { id: 'prompt2', text: '$ ', color: theme.green },
    { id: 'cmd2', text: 'echo "Hello, World!"', color: theme.foreground },
    { id: 'nl5', text: '\n' },
    { id: 'output1', text: 'Hello, World!', color: theme.magenta },
  ];

  return (
    <div
      className="rounded-lg border p-4 h-40 overflow-auto"
      style={{
        backgroundColor: theme.background,
        fontSize: `${fontSize}px`,
        fontFamily,
        fontWeight,
      }}
    >
      {sampleLines.map((segment) =>
        segment.text === '\n' ? (
          <br key={segment.id} />
        ) : segment.text === '\n\n' ? (
          <React.Fragment key={segment.id}>
            <br />
            <br />
          </React.Fragment>
        ) : (
          <span key={segment.id} style={{ color: segment.color }}>
            {segment.text}
          </span>
        )
      )}
      <span
        className="inline-block w-2 h-4 animate-pulse"
        style={{ backgroundColor: theme.cursor }}
      />
    </div>
  );
}

function ThemeCombobox({
  value,
  onValueChange,
  themes,
}: {
  value: string;
  onValueChange: (value: string | null) => void;
  themes: string[];
}) {
  const { t } = useI18n();
  const [search, setSearch] = React.useState(value);
  const [isOpen, setIsOpen] = React.useState(false);

  // Update search when value changes externally (prev/next buttons)
  React.useEffect(() => {
    if (!isOpen) {
      setSearch(value);
    }
  }, [value, isOpen]);

  const filteredThemes = React.useMemo(() => {
    if (!search || search === value) return themes;
    const query = search.toLowerCase();
    return themes.filter((name) => name.toLowerCase().includes(query));
  }, [themes, search, value]);

  const handleValueChange = (newValue: string | null) => {
    onValueChange(newValue);
    if (newValue) {
      setSearch(newValue);
    }
  };

  return (
    <Combobox<string>
      value={value}
      onValueChange={handleValueChange}
      inputValue={search}
      onInputValueChange={setSearch}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <ComboboxInput placeholder={t('Search themes...')} />
      <ComboboxPopup>
        <ComboboxList>
          {filteredThemes.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t('No themes found')}
            </div>
          )}
          {filteredThemes.map((name) => (
            <ComboboxItem key={name} value={name}>
              {name}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

// KeybindingInput component for capturing keyboard shortcuts
function KeybindingInput({
  value,
  onChange,
}: {
  value: TerminalKeybinding;
  onChange: (binding: TerminalKeybinding) => void;
}) {
  const { t } = useI18n();
  const [isRecording, setIsRecording] = React.useState(false);

  const formatKeybinding = (binding: TerminalKeybinding): string => {
    const parts: string[] = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    if (binding.meta) parts.push('Cmd');
    parts.push(binding.key.toUpperCase());
    return parts.join(' + ');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    // Ignore modifier-only keys
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    // Use e.code to get the physical key (avoids Option key special chars on macOS)
    const key = codeToKey(e.code) || e.key.toLowerCase();

    // Record exactly what the user pressed
    const newBinding: TerminalKeybinding = {
      key,
    };

    // Only set modifier keys if they are actually pressed
    if (e.ctrlKey && !e.metaKey) newBinding.ctrl = true;
    if (e.altKey) newBinding.alt = true;
    if (e.shiftKey) newBinding.shift = true;
    if (e.metaKey) newBinding.meta = true;

    onChange(newBinding);
    setIsRecording(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          isRecording && 'ring-2 ring-ring ring-offset-2'
        )}
        onClick={() => setIsRecording(true)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        data-keybinding-recording={isRecording ? '' : undefined}
      >
        {isRecording ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Keyboard className="h-4 w-4" />
            {t('Press a shortcut...')}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            {formatKeybinding(value)}
          </span>
        )}
      </div>
      {isRecording && (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            setIsRecording(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// Keybindings Settings Component
function KeybindingsSettings() {
  const {
    terminalKeybindings,
    setTerminalKeybindings,
    mainTabKeybindings,
    setMainTabKeybindings,
    agentKeybindings,
    setAgentKeybindings,
    sourceControlKeybindings,
    setSourceControlKeybindings,
  } = useSettingsStore();
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      {/* Main Tab Switching */}
      <div>
        <h3 className="text-lg font-medium">{t('Main tab switching')}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t('Set global main tab shortcuts (Cmd on macOS, Win on Windows)')}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Switch to Agent')}</span>
            <KeybindingInput
              value={mainTabKeybindings.switchToAgent}
              onChange={(binding) => {
                setMainTabKeybindings({
                  ...mainTabKeybindings,
                  switchToAgent: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Switch to File')}</span>
            <KeybindingInput
              value={mainTabKeybindings.switchToFile}
              onChange={(binding) => {
                setMainTabKeybindings({
                  ...mainTabKeybindings,
                  switchToFile: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Switch to Terminal')}</span>
            <KeybindingInput
              value={mainTabKeybindings.switchToTerminal}
              onChange={(binding) => {
                setMainTabKeybindings({
                  ...mainTabKeybindings,
                  switchToTerminal: binding,
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* Agent Session Management */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Agent sessions')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('Agent session shortcuts')}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('New Session')}</span>
            <KeybindingInput
              value={agentKeybindings.newSession}
              onChange={(binding) => {
                setAgentKeybindings({
                  ...agentKeybindings,
                  newSession: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Close Session')}</span>
            <KeybindingInput
              value={agentKeybindings.closeSession}
              onChange={(binding) => {
                setAgentKeybindings({
                  ...agentKeybindings,
                  closeSession: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Next Session')}</span>
            <KeybindingInput
              value={agentKeybindings.nextSession}
              onChange={(binding) => {
                setAgentKeybindings({
                  ...agentKeybindings,
                  nextSession: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Previous Session')}</span>
            <KeybindingInput
              value={agentKeybindings.prevSession}
              onChange={(binding) => {
                setAgentKeybindings({
                  ...agentKeybindings,
                  prevSession: binding,
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* Terminal Shortcuts */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Terminal')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('Terminal shortcuts')}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('New Tab')}</span>
            <KeybindingInput
              value={terminalKeybindings.newTab}
              onChange={(binding) => {
                setTerminalKeybindings({
                  ...terminalKeybindings,
                  newTab: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Close Tab')}</span>
            <KeybindingInput
              value={terminalKeybindings.closeTab}
              onChange={(binding) => {
                setTerminalKeybindings({
                  ...terminalKeybindings,
                  closeTab: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Next Tab')}</span>
            <KeybindingInput
              value={terminalKeybindings.nextTab}
              onChange={(binding) => {
                setTerminalKeybindings({
                  ...terminalKeybindings,
                  nextTab: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Previous Tab')}</span>
            <KeybindingInput
              value={terminalKeybindings.prevTab}
              onChange={(binding) => {
                setTerminalKeybindings({
                  ...terminalKeybindings,
                  prevTab: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Clear terminal')}</span>
            <KeybindingInput
              value={terminalKeybindings.clear}
              onChange={(binding) => {
                setTerminalKeybindings({
                  ...terminalKeybindings,
                  clear: binding,
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* Source Control */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Source Control')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('Diff navigation shortcuts')}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Previous change')}</span>
            <KeybindingInput
              value={sourceControlKeybindings.prevDiff}
              onChange={(binding) => {
                setSourceControlKeybindings({
                  ...sourceControlKeybindings,
                  prevDiff: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Next change')}</span>
            <KeybindingInput
              value={sourceControlKeybindings.nextDiff}
              onChange={(binding) => {
                setSourceControlKeybindings({
                  ...sourceControlKeybindings,
                  nextDiff: binding,
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const BUILTIN_AGENT_INFO: Record<BuiltinAgentId, { name: string; description: string }> = {
  claude: { name: 'Claude', description: 'Anthropic Claude Code CLI' },
  codex: { name: 'Codex', description: 'OpenAI Codex CLI' },
  droid: { name: 'Droid', description: 'Droid AI CLI' },
  gemini: { name: 'Gemini', description: 'Google Gemini CLI' },
  auggie: { name: 'Auggie', description: 'Augment Code CLI' },
  cursor: { name: 'Cursor', description: 'Cursor Agent CLI' },
};

const BUILTIN_AGENTS: BuiltinAgentId[] = ['claude', 'codex', 'droid', 'gemini', 'auggie', 'cursor'];

function AgentSettings() {
  const {
    agentSettings,
    customAgents,
    wslEnabled,
    setAgentEnabled,
    setAgentDefault,
    addCustomAgent,
    updateCustomAgent,
    removeCustomAgent,
  } = useSettingsStore();
  const { t } = useI18n();
  const [cliStatus, setCliStatus] = React.useState<Record<string, AgentCliInfo>>({});
  const [loadingAgents, setLoadingAgents] = React.useState<Set<string>>(new Set());
  const [editingAgent, setEditingAgent] = React.useState<CustomAgent | null>(null);
  const [isAddingAgent, setIsAddingAgent] = React.useState(false);

  const detectAllAgents = React.useCallback(() => {
    setLoadingAgents(new Set(['all']));
    setCliStatus({});

    window.electronAPI.cli
      .detect(customAgents, { includeWsl: wslEnabled })
      .then((result) => {
        const statusMap: Record<string, AgentCliInfo> = {};
        for (const agent of result.agents) {
          statusMap[agent.id] = agent;
        }
        setCliStatus(statusMap);
        setLoadingAgents(new Set());
      })
      .catch(() => {
        setLoadingAgents(new Set());
      });
  }, [customAgents, wslEnabled]);

  React.useEffect(() => {
    detectAllAgents();
  }, [detectAllAgents]);

  const handleEnabledChange = (agentId: string, enabled: boolean) => {
    setAgentEnabled(agentId, enabled);
    if (!enabled && agentSettings[agentId]?.isDefault) {
      const allAgentIds = [...BUILTIN_AGENTS, ...customAgents.map((a) => a.id)];
      const firstEnabled = allAgentIds.find(
        (id) => id !== agentId && agentSettings[id]?.enabled && cliStatus?.[id]?.installed
      );
      if (firstEnabled) {
        setAgentDefault(firstEnabled);
      }
    }
  };

  const handleDefaultChange = (agentId: string) => {
    if (agentSettings[agentId]?.enabled && cliStatus?.[agentId]?.installed) {
      setAgentDefault(agentId);
    }
  };

  const handleAddAgent = (agent: Omit<CustomAgent, 'id'>) => {
    const id = `custom-${Date.now()}`;
    addCustomAgent({ ...agent, id });
    setIsAddingAgent(false);
  };

  const handleEditAgent = (agent: CustomAgent) => {
    updateCustomAgent(agent.id, agent);
    setEditingAgent(null);
  };

  const handleRemoveAgent = (id: string) => {
    removeCustomAgent(id);
  };

  const isRefreshing = loadingAgents.size > 0;

  // Get all agents including WSL variants
  const allAgentInfos = React.useMemo(() => {
    const infos: Array<{
      id: string;
      baseId: BuiltinAgentId;
      info: { name: string; description: string };
      cli?: AgentCliInfo;
    }> = [];

    for (const agentId of BUILTIN_AGENTS) {
      const baseInfo = BUILTIN_AGENT_INFO[agentId];
      const nativeCli = cliStatus[agentId];
      const wslCli = cliStatus[`${agentId}-wsl`];

      // Add native agent
      infos.push({ id: agentId, baseId: agentId, info: baseInfo, cli: nativeCli });

      // Add WSL agent if detected
      if (wslCli?.installed) {
        infos.push({
          id: `${agentId}-wsl`,
          baseId: agentId,
          info: { name: `${baseInfo.name}`, description: baseInfo.description },
          cli: wslCli,
        });
      }
    }

    return infos;
  }, [cliStatus]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Agent</h3>
          <p className="text-sm text-muted-foreground">
            {t('Configure available AI Agent CLI tools')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={detectAllAgents}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          'New sessions use the default agent. Long-press the plus to pick another enabled agent. Only Claude supports session persistence for now.'
        )}
      </p>

      {/* Builtin Agents */}
      <div className="space-y-3">
        {allAgentInfos.map(({ id: agentId, info, cli }) => {
          const isLoading = isRefreshing;
          const isInstalled = cli?.installed ?? false;
          const config = agentSettings[agentId];
          const canEnable = isInstalled;
          const canSetDefault = isInstalled && config?.enabled;

          return (
            <div
              key={agentId}
              className={cn(
                'flex items-center justify-between rounded-lg border p-4',
                !isLoading && !isInstalled && 'opacity-50'
              )}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{info.name}</span>
                  {!isLoading && cli?.version && (
                    <span className="text-xs text-muted-foreground">v{cli.version}</span>
                  )}
                  {!isLoading && cli?.environment === 'wsl' && (
                    <span className="whitespace-nowrap rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                      WSL
                    </span>
                  )}
                  {!isLoading && !isInstalled && (
                    <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                      {t('Not installed')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{info.description}</p>
              </div>

              <div className="flex items-center gap-6">
                {isLoading ? (
                  <div className="flex h-5 w-24 items-center justify-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{t('Enable')}</span>
                      <Switch
                        checked={config?.enabled && canEnable}
                        onCheckedChange={(checked) => handleEnabledChange(agentId, checked)}
                        disabled={!canEnable}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{t('Default')}</span>
                      <Switch
                        checked={config?.isDefault ?? false}
                        onCheckedChange={() => handleDefaultChange(agentId)}
                        disabled={!canSetDefault}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Agents Section */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">{t('Custom Agent')}</h3>
            <p className="text-sm text-muted-foreground">{t('Add custom CLI tools')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsAddingAgent(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('Add')}
          </Button>
        </div>

        {customAgents.length > 0 && (
          <div className="mt-4 space-y-3">
            {customAgents.map((agent) => {
              const cli = cliStatus[agent.id];
              const isLoading = loadingAgents.has(agent.id);
              const isInstalled = cli?.installed ?? false;
              const config = agentSettings[agent.id];
              const canEnable = isInstalled;
              const canSetDefault = isInstalled && config?.enabled;

              return (
                <div
                  key={agent.id}
                  className={cn(
                    'rounded-lg border p-4',
                    !isLoading && !isInstalled && 'opacity-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {agent.command}
                      </code>
                      {!isLoading && cli?.version && (
                        <span className="text-xs text-muted-foreground">v{cli.version}</span>
                      )}
                      {!isLoading && !isInstalled && (
                        <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          {t('Not installed')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditingAgent(agent)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveAgent(agent.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {agent.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{agent.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-6">
                    {isLoading ? (
                      <div className="flex h-5 w-24 items-center">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{t('Enable')}</span>
                          <Switch
                            checked={config?.enabled && canEnable}
                            onCheckedChange={(checked) => handleEnabledChange(agent.id, checked)}
                            disabled={!canEnable}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{t('Default')}</span>
                          <Switch
                            checked={config?.isDefault ?? false}
                            onCheckedChange={() => handleDefaultChange(agent.id)}
                            disabled={!canSetDefault}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {customAgents.length === 0 && !isAddingAgent && (
          <div className="mt-4 rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('No custom agents yet')}</p>
          </div>
        )}
      </div>

      {/* Add Agent Dialog */}
      <Dialog open={isAddingAgent} onOpenChange={setIsAddingAgent}>
        <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
          <div className="p-4">
            <DialogTitle className="text-base font-medium">{t('Add custom agent')}</DialogTitle>
            <AgentForm onSubmit={handleAddAgent} onCancel={() => setIsAddingAgent(false)} />
          </div>
        </DialogPopup>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
        <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
          <div className="p-4">
            <DialogTitle className="text-base font-medium">{t('Edit Agent')}</DialogTitle>
            {editingAgent && (
              <AgentForm
                agent={editingAgent}
                onSubmit={handleEditAgent}
                onCancel={() => setEditingAgent(null)}
              />
            )}
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

type AgentFormProps =
  | {
      agent: CustomAgent;
      onSubmit: (agent: CustomAgent) => void;
      onCancel: () => void;
    }
  | {
      agent?: undefined;
      onSubmit: (agent: Omit<CustomAgent, 'id'>) => void;
      onCancel: () => void;
    };

function AgentForm({ agent, onSubmit, onCancel }: AgentFormProps) {
  const { t } = useI18n();
  const [name, setName] = React.useState(agent?.name ?? '');
  const [command, setCommand] = React.useState(agent?.command ?? '');
  const [description, setDescription] = React.useState(agent?.description ?? '');

  const isValid = name.trim() && command.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const data = {
      name: name.trim(),
      command: command.trim(),
      description: description.trim() || undefined,
    };

    if (agent) {
      (onSubmit as (agent: CustomAgent) => void)({ ...agent, ...data });
    } else {
      (onSubmit as (agent: Omit<CustomAgent, 'id'>) => void)(data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="space-y-1">
        <label htmlFor="agent-name" className="text-sm font-medium">
          {t('Name')}
        </label>
        <Input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Agent"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="agent-command" className="text-sm font-medium">
          {t('Command')}
        </label>
        <Input
          id="agent-command"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="my-agent --arg1"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="agent-desc" className="text-sm font-medium">
          {t('Description')}{' '}
          <span className="font-normal text-muted-foreground">{t('(optional)')}</span>
        </label>
        <Input
          id="agent-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('Short description')}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!isValid}>
          {agent ? t('Save') : t('Add')}
        </Button>
      </div>
    </form>
  );
}

function IntegrationSettings() {
  const { t } = useI18n();
  const {
    claudeCodeIntegration,
    setClaudeCodeIntegration,
    commitMessageGenerator,
    setCommitMessageGenerator,
  } = useSettingsStore();
  const [bridgePort, setBridgePort] = React.useState<number | null>(null);

  const debounceOptions = React.useMemo(
    () =>
      [100, 200, 300, 500, 1000].map((value) => ({
        value,
        label: `${value}ms`,
      })),
    []
  );

  // Fetch bridge status on mount and when enabled changes
  React.useEffect(() => {
    if (claudeCodeIntegration.enabled) {
      window.electronAPI.mcp.getStatus().then((status) => {
        setBridgePort(status.port);
      });
    } else {
      setBridgePort(null);
    }
  }, [claudeCodeIntegration.enabled]);

  const handleEnabledChange = (checked: boolean) => {
    // Just update the settings - App.tsx useEffect will handle the bridge
    setClaudeCodeIntegration({ enabled: checked });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Claude Code Integration')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Connect to Claude Code CLI for enhanced IDE features')}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">{t('Enable Integration')}</span>
          <p className="text-xs text-muted-foreground">
            {t('Start WebSocket server for Claude Code connection')}
            {bridgePort && ` (Port: ${bridgePort})`}
          </p>
        </div>
        <Switch checked={claudeCodeIntegration.enabled} onCheckedChange={handleEnabledChange} />
      </div>

      {claudeCodeIntegration.enabled && (
        <div className="mt-4 space-y-4 border-t pt-4">
          {/* Selection Changed Debounce */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-4">
            <span className="text-sm font-medium">{t('Debounce Time')}</span>
            <div className="space-y-1.5">
              <Select
                value={String(claudeCodeIntegration.selectionChangedDebounce)}
                onValueChange={(v) =>
                  setClaudeCodeIntegration({ selectionChangedDebounce: Number(v) })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue>{claudeCodeIntegration.selectionChangedDebounce}ms</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {debounceOptions.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('Delay before sending selection changes to Claude Code')}
              </p>
            </div>
          </div>

          {/* At Mentioned Keybinding */}
          <div className="grid grid-cols-[140px_1fr] items-start gap-4">
            <span className="text-sm font-medium mt-2">{t('Mention Shortcut')}</span>
            <div className="space-y-1.5">
              <KeybindingInput
                value={claudeCodeIntegration.atMentionedKeybinding}
                onChange={(binding) => setClaudeCodeIntegration({ atMentionedKeybinding: binding })}
              />
              <p className="text-xs text-muted-foreground">
                {t('Send selected code range to Claude Code')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Commit Message Generator Section */}
      <div className="mt-6 border-t pt-6">
        <div>
          <h3 className="text-lg font-medium">{t('Commit Message Generator')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('Auto-generate commit messages using Claude')}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Enable Generator')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Generate commit messages with AI assistance')}
            </p>
          </div>
          <Switch
            checked={commitMessageGenerator.enabled}
            onCheckedChange={(checked) => setCommitMessageGenerator({ enabled: checked })}
          />
        </div>

        {commitMessageGenerator.enabled && (
          <div className="mt-4 space-y-4 border-t pt-4">
            {/* Max Diff Lines */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Max Diff Lines')}</span>
              <div className="space-y-1.5">
                <Input
                  type="number"
                  value={commitMessageGenerator.maxDiffLines}
                  onChange={(e) =>
                    setCommitMessageGenerator({ maxDiffLines: Number(e.target.value) || 1000 })
                  }
                  min={100}
                  max={10000}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  {t('Maximum number of diff lines to include')}
                </p>
              </div>
            </div>

            {/* Timeout */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Timeout')}</span>
              <div className="space-y-1.5">
                <Select
                  value={String(commitMessageGenerator.timeout)}
                  onValueChange={(v) => setCommitMessageGenerator({ timeout: Number(v) })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue>{commitMessageGenerator.timeout}s</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {[30, 60, 120, 180].map((sec) => (
                      <SelectItem key={sec} value={String(sec)}>
                        {sec}s
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">{t('Timeout in seconds')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
