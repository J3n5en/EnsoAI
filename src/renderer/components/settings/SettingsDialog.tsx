import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type XtermTheme,
  defaultDarkTheme,
  getThemeNames,
  getXtermTheme,
} from '@/lib/ghosttyTheme';
import { cn } from '@/lib/utils';
import { type FontWeight, type Theme, useSettingsStore } from '@/stores/settings';
import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  Moon,
  Palette,
  Settings,
  Sun,
  Terminal,
} from 'lucide-react';
import * as React from 'react';

type SettingsCategory = 'appearance' | 'terminal';

const categories: Array<{ id: SettingsCategory; icon: React.ElementType; label: string }> = [
  { id: 'appearance', icon: Palette, label: '外观' },
  { id: 'terminal', icon: Terminal, label: '终端' },
];

interface SettingsDialogProps {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ trigger, open, onOpenChange }: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = React.useState<SettingsCategory>('appearance');

  // Controlled mode (open prop provided) doesn't need trigger
  const isControlled = open !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>自定义你的应用体验</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[400px] border-t">
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
            {activeCategory === 'appearance' && <AppearanceSettings />}
            {activeCategory === 'terminal' && <TerminalSettings />}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function AppearanceSettings() {
  const { theme, setTheme } = useSettingsStore();

  const themeOptions: Array<{
    value: Theme;
    icon: React.ElementType;
    label: string;
    description: string;
  }> = [
    { value: 'light', icon: Sun, label: '浅色', description: '明亮的界面主题' },
    { value: 'dark', icon: Moon, label: '深色', description: '护眼的暗色主题' },
    { value: 'system', icon: Monitor, label: '跟随系统', description: '自动适配系统主题' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">主题</h3>
        <p className="text-sm text-muted-foreground">选择你喜欢的界面主题</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {themeOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
              theme === option.value
                ? 'border-primary bg-accent'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                theme === option.value ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              <option.icon className="h-6 w-6" />
            </div>
            <span className="font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground text-center">{option.description}</span>
          </button>
        ))}
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

function TerminalSettings() {
  const {
    terminalTheme,
    setTerminalTheme,
    terminalFontSize,
    setTerminalFontSize,
    terminalFontFamily,
    setTerminalFontFamily,
    terminalFontWeight,
    setTerminalFontWeight,
    terminalFontWeightBold,
    setTerminalFontWeightBold,
  } = useSettingsStore();

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
      {/* Preview at top */}
      <div className="space-y-2">
        <p className="text-sm font-medium">预览</p>
        <TerminalPreview
          theme={previewTheme}
          fontSize={terminalFontSize}
          fontFamily={terminalFontFamily}
          fontWeight={terminalFontWeight}
        />
      </div>

      {/* Theme Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">终端主题</h3>
        <p className="text-sm text-muted-foreground">选择终端配色方案</p>
      </div>

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

      {/* Font Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">字体设置</h3>
        <p className="text-sm text-muted-foreground">自定义终端字体样式</p>
      </div>

      <div className="grid gap-4">
        {/* Font Family */}
        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
          <span className="text-sm font-medium">字体</span>
          <Input
            value={terminalFontFamily}
            onChange={(e) => setTerminalFontFamily(e.target.value)}
            placeholder="JetBrains Mono, monospace"
          />
        </div>

        {/* Font Size */}
        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
          <span className="text-sm font-medium">字号</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={terminalFontSize}
              onChange={(e) => setTerminalFontSize(Number(e.target.value))}
              min={8}
              max={32}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">px</span>
          </div>
        </div>

        {/* Font Weight */}
        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
          <span className="text-sm font-medium">字重</span>
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
          <span className="text-sm font-medium">粗体字重</span>
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
      <ComboboxInput placeholder="搜索主题..." />
      <ComboboxPopup>
        <ComboboxList>
          {filteredThemes.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">未找到主题</div>
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
