import { ChevronLeft, ChevronRight, Monitor, Moon, Sparkles, Sun, Terminal } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import {
  defaultDarkTheme,
  getThemeNames,
  getXtermTheme,
  type XtermTheme,
} from '@/lib/ghosttyTheme';
import { cn } from '@/lib/utils';
import { type FontWeight, type Theme, useSettingsStore } from '@/stores/settings';
import { fontWeightOptions } from './constants';

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

export function AppearanceSettings() {
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
    terminalBackgroundOpacity,
    setTerminalBackgroundOpacity,
    glowEffectEnabled,
    setGlowEffectEnabled,
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

      {/* Beta Features Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Beta Features')}</h3>
        <p className="text-sm text-muted-foreground">{t('Experimental features')}</p>
      </div>

      {/* Glow Effect Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-amber-500/20">
            <Sparkles className="h-4 w-4 text-green-500" />
          </div>
          <div>
            <p className="text-sm font-medium">{t('Glow Effect')}</p>
            <p className="text-xs text-muted-foreground">
              {t('Animated glow border for AI output states')}
            </p>
          </div>
        </div>
        <Switch checked={glowEffectEnabled} onCheckedChange={setGlowEffectEnabled} />
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

      {/* Background Opacity */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Opacity')}</span>
        <div className="flex items-center gap-3">
          <Slider
            value={[terminalBackgroundOpacity]}
            onValueChange={(values) => {
              const raw = Array.isArray(values) ? values[0] : values;
              const v = Math.max(0, Math.min(100, raw ?? 100));
              setTerminalBackgroundOpacity(v);
            }}
            min={0}
            max={100}
            step={1}
            className="flex-1"
          />
          <span className="w-12 text-right text-sm text-muted-foreground">
            {terminalBackgroundOpacity}%
          </span>
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
