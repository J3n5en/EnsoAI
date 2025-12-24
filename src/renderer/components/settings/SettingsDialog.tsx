import type { AgentCliInfo, BuiltinAgentId, CustomAgent } from '@shared/types';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Keyboard,
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
import {
  defaultDarkTheme,
  getThemeNames,
  getXtermTheme,
  type XtermTheme,
} from '@/lib/ghosttyTheme';
import { cn } from '@/lib/utils';
import {
  type FontWeight,
  type TerminalKeybinding,
  type TerminalRenderer,
  type Theme,
  useSettingsStore,
} from '@/stores/settings';

type SettingsCategory = 'appearance' | 'keybindings' | 'agent';

const categories: Array<{ id: SettingsCategory; icon: React.ElementType; label: string }> = [
  { id: 'appearance', icon: Palette, label: '外观' },
  { id: 'keybindings', icon: Keyboard, label: '快捷键' },
  { id: 'agent', icon: Bot, label: 'Agent' },
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
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="text-lg font-medium">设置</DialogTitle>
        </div>
        <div className="flex min-h-[400px]">
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
            {activeCategory === 'keybindings' && <KeybindingsSettings />}
            {activeCategory === 'agent' && <AgentSettings />}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

const themeModeOptions: {
  value: Theme;
  icon: React.ElementType;
  label: string;
  description: string;
}[] = [
  { value: 'light', icon: Sun, label: '浅色', description: '明亮的界面主题' },
  { value: 'dark', icon: Moon, label: '深色', description: '护眼的暗色主题' },
  { value: 'system', icon: Monitor, label: '跟随系统', description: '自动适配系统主题' },
  { value: 'sync-terminal', icon: Terminal, label: '同步终端', description: '跟随终端配色方案' },
];

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
    terminalRenderer,
    setTerminalRenderer,
  } = useSettingsStore();

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
        <h3 className="text-lg font-medium">模式</h3>
        <p className="text-sm text-muted-foreground">选择界面的深浅模式</p>
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
        <h3 className="text-lg font-medium">终端</h3>
        <p className="text-sm text-muted-foreground">自定义终端外观</p>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <p className="text-sm font-medium">预览</p>
        <TerminalPreview
          theme={previewTheme}
          fontSize={localFontSize}
          fontFamily={localFontFamily}
          fontWeight={terminalFontWeight}
        />
      </div>

      {/* Theme Selector */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">配色</span>
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
        <span className="text-sm font-medium">字体</span>
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
        <span className="text-sm font-medium">字号</span>
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

      {/* Renderer */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">渲染器</span>
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
            {terminalRenderer === 'canvas' ? '兼容性好，推荐' : '性能更高，可能有花屏问题'}
          </p>
          <p className="text-xs text-muted-foreground">更改后需新建终端或重启应用才能生效</p>
        </div>
      </div>
    </div>
  );
}

const rendererOptions: { value: TerminalRenderer; label: string }[] = [
  { value: 'canvas', label: 'Canvas' },
  { value: 'webgl', label: 'WebGL' },
];

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

// KeybindingInput component for capturing keyboard shortcuts
function KeybindingInput({
  value,
  onChange,
}: {
  value: TerminalKeybinding;
  onChange: (binding: TerminalKeybinding) => void;
}) {
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

    // Record exactly what the user pressed
    const newBinding: TerminalKeybinding = {
      key: e.key.toLowerCase(),
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
      >
        {isRecording ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Keyboard className="h-4 w-4" />
            按下快捷键...
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
  } = useSettingsStore();

  return (
    <div className="space-y-6">
      {/* Main Tab Switching */}
      <div>
        <h3 className="text-lg font-medium">主标签切换</h3>
        <p className="text-sm text-muted-foreground mb-4">
          设置全局主标签切换快捷键 (macOS 上是 Cmd,Windows 上是 Win 键)
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">切换到 Agent</span>
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
            <span className="text-sm">切换到 File</span>
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
            <span className="text-sm">切换到 Terminal</span>
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
        <h3 className="text-lg font-medium">Agent Session</h3>
        <p className="text-sm text-muted-foreground mb-4">设置 Agent session 管理快捷键</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">新建 Session</span>
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
            <span className="text-sm">关闭 Session</span>
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
            <span className="text-sm">下一个 Session</span>
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
            <span className="text-sm">上一个 Session</span>
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
        <h3 className="text-lg font-medium">终端</h3>
        <p className="text-sm text-muted-foreground mb-4">设置终端快捷键</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">新建标签</span>
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
            <span className="text-sm">关闭标签</span>
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
            <span className="text-sm">下一个标签</span>
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
            <span className="text-sm">上一个标签</span>
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
            <span className="text-sm">清除终端</span>
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
    setAgentEnabled,
    setAgentDefault,
    addCustomAgent,
    updateCustomAgent,
    removeCustomAgent,
  } = useSettingsStore();
  const [cliStatus, setCliStatus] = React.useState<Record<string, AgentCliInfo>>({});
  const [loadingAgents, setLoadingAgents] = React.useState<Set<string>>(new Set());
  const [editingAgent, setEditingAgent] = React.useState<CustomAgent | null>(null);
  const [isAddingAgent, setIsAddingAgent] = React.useState(false);

  const detectAllAgents = React.useCallback(() => {
    const allAgentIds = [...BUILTIN_AGENTS, ...customAgents.map((a) => a.id)];
    setLoadingAgents(new Set(allAgentIds));

    // Detect each agent individually
    for (const agentId of BUILTIN_AGENTS) {
      window.electronAPI.cli.detectOne(agentId).then((result) => {
        setCliStatus((prev) => ({ ...prev, [agentId]: result }));
        setLoadingAgents((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
      });
    }

    for (const agent of customAgents) {
      window.electronAPI.cli.detectOne(agent.id, agent).then((result) => {
        setCliStatus((prev) => ({ ...prev, [agent.id]: result }));
        setLoadingAgents((prev) => {
          const next = new Set(prev);
          next.delete(agent.id);
          return next;
        });
      });
    }
  }, [customAgents]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Agent</h3>
          <p className="text-sm text-muted-foreground">配置可用的 AI Agent CLI 工具</p>
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
        新建会话使用默认 Agent，长按加号可选择其他已启用的 Agent。目前仅 Claude 支持会话持久化。
      </p>

      {/* Builtin Agents */}
      <div className="space-y-3">
        {BUILTIN_AGENTS.map((agentId) => {
          const info = BUILTIN_AGENT_INFO[agentId];
          const cli = cliStatus[agentId];
          const isLoading = loadingAgents.has(agentId);
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
                  {!isLoading && !isInstalled && (
                    <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                      未安装
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
                      <span className="text-sm text-muted-foreground">启用</span>
                      <Switch
                        checked={config?.enabled && canEnable}
                        onCheckedChange={(checked) => handleEnabledChange(agentId, checked)}
                        disabled={!canEnable}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">默认</span>
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
            <h3 className="text-lg font-medium">自定义 Agent</h3>
            <p className="text-sm text-muted-foreground">添加自定义 CLI 工具</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsAddingAgent(true)}>
            <Plus className="mr-1 h-4 w-4" />
            添加
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
                          未安装
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
                          <span className="text-sm text-muted-foreground">启用</span>
                          <Switch
                            checked={config?.enabled && canEnable}
                            onCheckedChange={(checked) => handleEnabledChange(agent.id, checked)}
                            disabled={!canEnable}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">默认</span>
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
            <p className="text-sm text-muted-foreground">暂无自定义 Agent</p>
          </div>
        )}
      </div>

      {/* Add Agent Dialog */}
      <Dialog open={isAddingAgent} onOpenChange={setIsAddingAgent}>
        <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
          <div className="p-4">
            <DialogTitle className="text-base font-medium">添加自定义 Agent</DialogTitle>
            <AgentForm onSubmit={handleAddAgent} onCancel={() => setIsAddingAgent(false)} />
          </div>
        </DialogPopup>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
        <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
          <div className="p-4">
            <DialogTitle className="text-base font-medium">编辑 Agent</DialogTitle>
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
          名称
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
          命令
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
          描述 <span className="font-normal text-muted-foreground">(可选)</span>
        </label>
        <Input
          id="agent-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="简短描述"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" size="sm" disabled={!isValid}>
          {agent ? '保存' : '添加'}
        </Button>
      </div>
    </form>
  );
}
