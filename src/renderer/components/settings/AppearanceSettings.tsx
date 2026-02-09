import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  Monitor,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  Terminal,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Switch } from "@/components/ui/switch";
import { dispatchBackgroundRefresh } from "@/components/layout/BackgroundLayer";
import { useI18n } from "@/i18n";
import {
  defaultDarkTheme,
  getThemeNames,
  getXtermTheme,
  type XtermTheme,
} from "@/lib/ghosttyTheme";
import { cn } from "@/lib/utils";
import {
  type FontWeight,
  type Theme,
  useSettingsStore,
} from "@/stores/settings";
import { fontWeightOptions } from "./constants";

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
    { id: "prompt1", text: "$ ", color: theme.green },
    { id: "cmd1", text: "ls -la", color: theme.foreground },
    { id: "nl1", text: "\n" },
    { id: "perm1", text: "drwxr-xr-x  ", color: theme.blue },
    { id: "meta1", text: "5 user staff  160 Dec 23 ", color: theme.foreground },
    { id: "dir1", text: "Documents", color: theme.cyan },
    { id: "nl2", text: "\n" },
    { id: "perm2", text: "-rw-r--r--  ", color: theme.foreground },
    { id: "meta2", text: "1 user staff 2048 Dec 22 ", color: theme.foreground },
    { id: "file1", text: "config.json", color: theme.yellow },
    { id: "nl3", text: "\n" },
    { id: "perm3", text: "-rwxr-xr-x  ", color: theme.foreground },
    { id: "meta3", text: "1 user staff  512 Dec 21 ", color: theme.foreground },
    { id: "file2", text: "script.sh", color: theme.green },
    { id: "nl4", text: "\n\n" },
    { id: "prompt2", text: "$ ", color: theme.green },
    { id: "cmd2", text: 'echo "Hello, World!"', color: theme.foreground },
    { id: "nl5", text: "\n" },
    { id: "output1", text: "Hello, World!", color: theme.magenta },
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
        segment.text === "\n" ? (
          <br key={segment.id} />
        ) : segment.text === "\n\n" ? (
          <React.Fragment key={segment.id}>
            <br />
            <br />
          </React.Fragment>
        ) : (
          <span key={segment.id} style={{ color: segment.color }}>
            {segment.text}
          </span>
        ),
      )}
      <span
        className="inline-block w-2 h-4 animate-pulse"
        style={{ backgroundColor: theme.cursor }}
      />
    </div>
  );
}

function FavoriteButton({
  isFavorite,
  onClick,
  className,
  ariaLabel,
}: {
  isFavorite: boolean;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={isFavorite}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      className={cn("p-1 hover:text-red-500 transition-colors", className)}
    >
      {isFavorite ? (
        <Heart className="h-4 w-4 fill-red-500 text-red-500" />
      ) : (
        <Heart className="h-4 w-4" />
      )}
    </button>
  );
}

function ThemeCombobox({
  value,
  onValueChange,
  themes,
  favoriteThemes,
  onToggleFavorite,
  onThemeHover,
  showFavoritesOnly,
  onShowFavoritesOnlyChange,
  showEmptyFavoritesHint,
}: {
  value: string;
  onValueChange: (value: string | null) => void;
  themes: string[];
  favoriteThemes: string[];
  onToggleFavorite: (theme: string) => void;
  onThemeHover?: (theme: string) => void;
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: (checked: boolean) => void;
  showEmptyFavoritesHint?: boolean;
}) {
  const { t } = useI18n();
  // 使用内部值与外部值解耦，防止悬停时下拉框关闭
  const [internalValue, setInternalValue] = React.useState(value);
  const [search, setSearch] = React.useState(value);
  const [isOpen, setIsOpen] = React.useState(false);
  const hoverTimeoutRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const listRef = React.useRef<HTMLDivElement>(null);
  const originalValueRef = React.useRef<string>(value);
  const explicitSelectionRef = React.useRef(false);

  // 性能优化：使用 Set 替代数组查找
  const favoriteSet = React.useMemo(
    () => new Set(favoriteThemes),
    [favoriteThemes],
  );

  // 仅在下拉框关闭时同步外部值
  React.useEffect(() => {
    if (!isOpen) {
      setInternalValue(value);
      setSearch(value);
    }
  }, [value, isOpen]);

  const filteredThemes = React.useMemo(() => {
    if (!search || search === internalValue) return themes;
    const query = search.toLowerCase();
    return themes.filter((name) => name.toLowerCase().includes(query));
  }, [themes, search, internalValue]);

  const handleValueChange = (newValue: string | null) => {
    if (newValue) {
      explicitSelectionRef.current = true;
      setInternalValue(newValue);
      setSearch(newValue);
    }
    onValueChange(newValue);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      originalValueRef.current = value;
      explicitSelectionRef.current = false;
      setInternalValue(value);
      setSearch(value);
    } else {
      // 关闭时如果没有显式选择，恢复原始主题
      if (!explicitSelectionRef.current) {
        onThemeHover?.(originalValueRef.current);
      }
    }
  };

  const handleItemMouseEnter = (themeName: string) => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      onThemeHover?.(themeName);
    }, 50);
  };

  const handleItemMouseLeave = () => {
    clearTimeout(hoverTimeoutRef.current);
  };

  // 键盘导航处理 - 使用捕获阶段监听，确保在输入框处理之前捕获事件
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // 使用 requestAnimationFrame 确保 Combobox 完成高亮状态更新后再查询
        requestAnimationFrame(() => {
          const highlighted =
            listRef.current?.querySelector("[data-highlighted]");
          if (highlighted) {
            const themeName = highlighted.getAttribute("data-value");
            if (themeName) {
              onThemeHover?.(themeName);
            }
          }
        });
      }
    };

    // 使用 capture: true 在捕获阶段监听，确保事件不会被输入框拦截
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, onThemeHover]);

  React.useEffect(() => {
    return () => {
      clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  return (
    <Combobox<string>
      value={internalValue}
      onValueChange={handleValueChange}
      inputValue={search}
      onInputValueChange={setSearch}
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <div className="relative">
        <ComboboxInput placeholder={t("Search themes...")} />
        <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <Checkbox
            id="show-favorites-only-inner"
            checked={showFavoritesOnly}
            onCheckedChange={(checked) =>
              onShowFavoritesOnlyChange(checked === true)
            }
            onClick={(e) => e.stopPropagation()}
          />
          <label
            htmlFor="show-favorites-only-inner"
            className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {t("Show favorites only")}
          </label>
        </div>
      </div>
      <ComboboxPopup>
        <ComboboxList ref={listRef}>
          {filteredThemes.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {showEmptyFavoritesHint
                ? t(
                    "No favorite themes yet. Click the heart icon to add favorites.",
                  )
                : t("No themes found")}
            </div>
          )}
          {filteredThemes.map((name) => (
            <ComboboxItem
              key={name}
              value={name}
              data-value={name}
              onMouseEnter={() => handleItemMouseEnter(name)}
              onMouseLeave={handleItemMouseLeave}
              endAddon={
                <FavoriteButton
                  isFavorite={favoriteSet.has(name)}
                  onClick={() => onToggleFavorite(name)}
                  ariaLabel={
                    favoriteSet.has(name)
                      ? t("Remove from favorites")
                      : t("Add to favorites")
                  }
                />
              }
            >
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
    glowEffectEnabled,
    setGlowEffectEnabled,
    backgroundImageEnabled,
    setBackgroundImageEnabled,
    backgroundImagePath,
    setBackgroundImagePath,
    backgroundUrlPath,
    setBackgroundUrlPath,
    backgroundFolderPath,
    setBackgroundFolderPath,
    backgroundSourceType,
    setBackgroundSourceType,
    backgroundRandomEnabled,
    setBackgroundRandomEnabled,
    backgroundRandomInterval,
    setBackgroundRandomInterval,
    backgroundOpacity,
    setBackgroundOpacity,
    backgroundBlur,
    setBackgroundBlur,
    backgroundBrightness,
    setBackgroundBrightness,
    backgroundSaturation,
    setBackgroundSaturation,
    backgroundSizeMode,
    setBackgroundSizeMode,
    favoriteTerminalThemes,
    toggleFavoriteTerminalTheme,
  } = useSettingsStore();
  const { t } = useI18n();

  const themeModeOptions: {
    value: Theme;
    icon: React.ElementType;
    label: string;
    description: string;
  }[] = [
    {
      value: "light",
      icon: Sun,
      label: t("Light"),
      description: t("Bright theme"),
    },
    {
      value: "dark",
      icon: Moon,
      label: t("Dark"),
      description: t("Eye-friendly dark theme"),
    },
    {
      value: "system",
      icon: Monitor,
      label: t("System"),
      description: t("Follow system theme"),
    },
    {
      value: "sync-terminal",
      icon: Terminal,
      label: t("Sync terminal theme"),
      description: t("Match terminal color scheme"),
    },
  ];

  // Local state for inputs
  const [localFontSize, setLocalFontSize] = React.useState(globalFontSize);
  const [localFontFamily, setLocalFontFamily] =
    React.useState(globalFontFamily);
  const [showFavoritesOnly, setShowFavoritesOnly] = React.useState(false);
  const [bgSettingsOpen, setBgSettingsOpen] = React.useState(false);

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

  // Display themes based on favorites filter
  const displayThemes = React.useMemo(() => {
    if (!showFavoritesOnly) {
      return themeNames;
    }
    const favorites = themeNames.filter((name) =>
      favoriteTerminalThemes.includes(name),
    );
    // 当前选中的非收藏配色临时显示在列表第1位
    if (!favoriteTerminalThemes.includes(terminalTheme)) {
      return [terminalTheme, ...favorites];
    }
    return favorites;
  }, [themeNames, showFavoritesOnly, favoriteTerminalThemes, terminalTheme]);

  const showEmptyFavoritesHint =
    showFavoritesOnly && favoriteTerminalThemes.length === 0;

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
    const list = showFavoritesOnly ? displayThemes : themeNames;
    const idx = list.indexOf(terminalTheme);
    const newIndex = idx <= 0 ? list.length - 1 : idx - 1;
    setTerminalTheme(list[newIndex]);
  };

  const handleNextTheme = () => {
    const list = showFavoritesOnly ? displayThemes : themeNames;
    const idx = list.indexOf(terminalTheme);
    const newIndex = idx >= list.length - 1 ? 0 : idx + 1;
    setTerminalTheme(list[newIndex]);
  };

  const handleSelectFile = async () => {
    const path = await window.electronAPI.dialog.openFile({
      filters: [
        {
          name: "Media",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "gif",
            "webp",
            "bmp",
            "svg",
            "mp4",
            "webm",
            "ogg",
            "mov",
          ],
        },
      ],
    });
    if (path) {
      setBackgroundImagePath(path);
      setBackgroundSourceType("file");
    }
  };

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.dialog.openDirectory();
    if (path) {
      setBackgroundFolderPath(path);
      setBackgroundSourceType("folder");
    }
  };

  // Active path based on current source type
  const activePath =
    backgroundSourceType === "folder"
      ? backgroundFolderPath
      : backgroundSourceType === "url"
        ? backgroundUrlPath
        : backgroundImagePath;
  const setActivePath =
    backgroundSourceType === "folder"
      ? setBackgroundFolderPath
      : backgroundSourceType === "url"
        ? setBackgroundUrlPath
        : setBackgroundImagePath;

  return (
    <div className="space-y-6">
      {/* Theme Mode Section */}
      <div>
        <h3 className="text-lg font-medium">{t("Theme mode")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("Choose interface theme")}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {themeModeOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors",
              theme === option.value
                ? "border-primary bg-accent text-accent-foreground"
                : "border-transparent bg-muted/50 hover:bg-muted",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                theme === option.value
                  ? "bg-accent-foreground/20 text-accent-foreground"
                  : "bg-muted",
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
        <h3 className="text-lg font-medium">{t("Beta Features")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("Experimental features")}
        </p>
      </div>

      {/* Glow Effect Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-amber-500/20">
            <Sparkles className="h-4 w-4 text-green-500" />
          </div>
          <div>
            <p className="text-sm font-medium">{t("Glow Effect")}</p>
            <p className="text-xs text-muted-foreground">
              {t("Animated glow border for AI output states")}
            </p>
          </div>
        </div>
        <Switch
          checked={glowEffectEnabled}
          onCheckedChange={setGlowEffectEnabled}
        />
      </div>

      {/* Background Image Settings */}
      <Collapsible
        open={bgSettingsOpen}
        onOpenChange={setBgSettingsOpen}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20">
              <ImageIcon className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("Background Image")}</p>
              <p className="text-xs text-muted-foreground">
                {t("Custom background image for the workspace")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Switch
              checked={backgroundImageEnabled}
              onCheckedChange={setBackgroundImageEnabled}
            />
            <CollapsibleTrigger
              className={cn(
                "inline-flex items-center justify-center h-8 w-8 rounded-md",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
              )}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  bgSettingsOpen ? "rotate-180" : "",
                )}
              />
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="space-y-4 pl-12">
          {/* Source Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("Source Type")}</label>
            <Select
              value={backgroundSourceType}
              onValueChange={(v) =>
                setBackgroundSourceType(v as "file" | "folder" | "url")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="file">{t("Image / Video File")}</SelectItem>
                <SelectItem value="folder">{t("Folder (Random)")}</SelectItem>
                <SelectItem value="url">{t("URL (Auto Refresh)")}</SelectItem>
              </SelectPopup>
            </Select>
          </div>

          {/* Source Path */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("Source Path")}</label>
            <div className="flex gap-2">
              <Input
                value={activePath}
                onChange={(e) => setActivePath(e.target.value)}
                placeholder={
                  backgroundSourceType === "folder"
                    ? t("Select a folder containing images or videos")
                    : backgroundSourceType === "url"
                      ? t("Paste remote image URL (http/https)")
                      : t("Local file path or URL")
                }
                className="flex-1"
              />
              <Button
                variant="outline"
                disabled={backgroundSourceType === "url"}
                onClick={
                  backgroundSourceType === "folder"
                    ? handleSelectFolder
                    : handleSelectFile
                }
              >
                {backgroundSourceType === "folder" ? (
                  <>
                    <FolderOpen className="h-4 w-4 mr-1.5" />
                    {t("Select Folder")}
                  </>
                ) : backgroundSourceType === "url" ? (
                  t("URL Mode")
                ) : (
                  t("Select File")
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={dispatchBackgroundRefresh}
                title={t("Refresh")}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Auto Random - available when source type is folder or URL */}
          {(() => {
            const canAutoRandom =
              backgroundSourceType === "folder" ||
              backgroundSourceType === "url";
            return (
              <Collapsible className="space-y-3">
                <CollapsibleTrigger
                  disabled={!canAutoRandom}
                  className={cn(
                    "flex items-center gap-1 text-sm transition-colors",
                    canAutoRandom
                      ? "text-muted-foreground hover:text-foreground cursor-pointer"
                      : "text-muted-foreground/40 cursor-not-allowed",
                  )}
                >
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  {t("Auto Random")}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pl-5">
                  {/* Enable toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm">{t("Enable")}</label>
                    <Switch
                      checked={backgroundRandomEnabled}
                      onCheckedChange={setBackgroundRandomEnabled}
                    />
                  </div>

                  {/* Interval */}
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm shrink-0">
                      {t("Interval (seconds)")}
                    </label>
                    <Input
                      type="number"
                      min={5}
                      max={86400}
                      value={backgroundRandomInterval}
                      onChange={(e) =>
                        setBackgroundRandomInterval(Number(e.target.value))
                      }
                      className="w-24"
                    />
                  </div>

                  {/* Source Directory */}
                  {backgroundSourceType === "folder" && (
                    <div className="space-y-1.5">
                      <label className="text-sm">{t("Source Directory")}</label>
                      <div className="flex gap-2">
                        <Input
                          value={backgroundFolderPath}
                          onChange={(e) =>
                            setBackgroundFolderPath(e.target.value)
                          }
                          placeholder={t("Select a folder")}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={handleSelectFolder}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Manual Refresh */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={dispatchBackgroundRefresh}
                    className="w-full"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    {t("Refresh")}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            );
          })()}

          {/* Opacity */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">{t("Opacity")}</label>
              <span className="text-sm text-muted-foreground">
                {Math.round(backgroundOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(backgroundOpacity * 100)}
              onChange={(e) =>
                setBackgroundOpacity(Number(e.target.value) / 100)
              }
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-input accent-primary"
            />
          </div>

          {/* Blur */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">{t("Blur")}</label>
              <span className="text-sm text-muted-foreground">
                {backgroundBlur}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={backgroundBlur}
              onChange={(e) => setBackgroundBlur(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-input accent-primary"
            />
          </div>

          {/* More - Brightness & Saturation */}
          <Collapsible className="space-y-3">
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              {t("More Options")}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4">
              {/* Brightness */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">
                    {t("Brightness")}
                  </label>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(backgroundBrightness * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(backgroundBrightness * 100)}
                  onChange={(e) =>
                    setBackgroundBrightness(Number(e.target.value) / 100)
                  }
                  className="w-full h-1 rounded-full appearance-none cursor-pointer bg-input accent-primary"
                />
              </div>

              {/* Saturation */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">
                    {t("Saturation")}
                  </label>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(backgroundSaturation * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(backgroundSaturation * 100)}
                  onChange={(e) =>
                    setBackgroundSaturation(Number(e.target.value) / 100)
                  }
                  className="w-full h-1 rounded-full appearance-none cursor-pointer bg-input accent-primary"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Size Mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("Size Mode")}</label>
            <Select
              value={backgroundSizeMode}
              onValueChange={(v) =>
                setBackgroundSizeMode(
                  v as "cover" | "contain" | "repeat" | "center",
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="contain">Contain</SelectItem>
                <SelectItem value="repeat">Repeat</SelectItem>
                <SelectItem value="center">Center</SelectItem>
              </SelectPopup>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Terminal Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t("Terminal")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("Terminal appearance")}
        </p>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("Preview")}</p>
        <TerminalPreview
          theme={previewTheme}
          fontSize={localFontSize}
          fontFamily={localFontFamily}
          fontWeight={terminalFontWeight}
        />
      </div>

      {/* Theme Selector */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t("Color scheme")}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevTheme}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <ThemeCombobox
              value={terminalTheme}
              onValueChange={handleThemeChange}
              themes={displayThemes}
              favoriteThemes={favoriteTerminalThemes}
              onToggleFavorite={toggleFavoriteTerminalTheme}
              onThemeHover={setTerminalTheme}
              showFavoritesOnly={showFavoritesOnly}
              onShowFavoritesOnlyChange={setShowFavoritesOnly}
              showEmptyFavoritesHint={showEmptyFavoritesHint}
            />
          </div>
          <Button variant="outline" size="icon" onClick={handleNextTheme}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Font Family */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t("Font")}</span>
        <Input
          value={localFontFamily}
          onChange={(e) => setLocalFontFamily(e.target.value)}
          onBlur={applyFontFamilyChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              applyFontFamilyChange();
              e.currentTarget.blur();
            }
          }}
          placeholder="JetBrains Mono, monospace"
        />
      </div>

      {/* Font Size */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t("Font size")}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={localFontSize}
            onChange={(e) => setLocalFontSize(Number(e.target.value))}
            onBlur={applyFontSizeChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
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
        <span className="text-sm font-medium">{t("Font weight")}</span>
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
        <span className="text-sm font-medium">{t("Bold font weight")}</span>
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
