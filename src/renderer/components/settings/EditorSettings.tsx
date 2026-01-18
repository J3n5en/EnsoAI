import * as React from 'react';
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
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
  useSettingsStore,
} from '@/stores/settings';
import { AUTO_SAVE_DELAY_DEFAULT } from './constants';

export function EditorSettings() {
  const { editorSettings, setEditorSettings } = useSettingsStore();
  const { t } = useI18n();

  // Local state for font inputs
  const [localFontSize, setLocalFontSize] = React.useState(editorSettings.fontSize);
  const [localFontFamily, setLocalFontFamily] = React.useState(editorSettings.fontFamily);
  const [localLineHeight, setLocalLineHeight] = React.useState(editorSettings.lineHeight);
  const [localPaddingTop, setLocalPaddingTop] = React.useState(editorSettings.paddingTop);
  const [localPaddingBottom, setLocalPaddingBottom] = React.useState(editorSettings.paddingBottom);
  const [localAutoSaveDelay, setLocalAutoSaveDelay] = React.useState(editorSettings.autoSaveDelay);

  React.useEffect(() => {
    setLocalFontSize(editorSettings.fontSize);
  }, [editorSettings.fontSize]);

  React.useEffect(() => {
    setLocalFontFamily(editorSettings.fontFamily);
  }, [editorSettings.fontFamily]);

  React.useEffect(() => {
    setLocalLineHeight(editorSettings.lineHeight);
  }, [editorSettings.lineHeight]);

  React.useEffect(() => {
    setLocalPaddingTop(editorSettings.paddingTop);
  }, [editorSettings.paddingTop]);

  React.useEffect(() => {
    setLocalPaddingBottom(editorSettings.paddingBottom);
  }, [editorSettings.paddingBottom]);

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

  const applyLineHeightChange = React.useCallback(() => {
    const validLineHeight = Math.max(12, Math.min(60, localLineHeight || 20));
    if (validLineHeight !== localLineHeight) setLocalLineHeight(validLineHeight);
    if (validLineHeight !== editorSettings.lineHeight)
      setEditorSettings({ lineHeight: validLineHeight });
  }, [localLineHeight, editorSettings.lineHeight, setEditorSettings]);

  const applyPaddingTopChange = React.useCallback(() => {
    const validPadding = Math.max(0, Math.min(50, localPaddingTop || 12));
    if (validPadding !== localPaddingTop) setLocalPaddingTop(validPadding);
    if (validPadding !== editorSettings.paddingTop) setEditorSettings({ paddingTop: validPadding });
  }, [localPaddingTop, editorSettings.paddingTop, setEditorSettings]);

  const applyPaddingBottomChange = React.useCallback(() => {
    const validPadding = Math.max(0, Math.min(50, localPaddingBottom || 12));
    if (validPadding !== localPaddingBottom) setLocalPaddingBottom(validPadding);
    if (validPadding !== editorSettings.paddingBottom)
      setEditorSettings({ paddingBottom: validPadding });
  }, [localPaddingBottom, editorSettings.paddingBottom, setEditorSettings]);

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

      {/* Line Height */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Line height')}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={localLineHeight}
            onChange={(e) => setLocalLineHeight(Number(e.target.value))}
            onBlur={applyLineHeightChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyLineHeightChange();
                e.currentTarget.blur();
              }
            }}
            min={12}
            max={60}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">px</span>
        </div>
      </div>

      {/* Font Ligatures */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Font ligatures')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Enable font ligatures')}</p>
          <Switch
            checked={editorSettings.fontLigatures}
            onCheckedChange={(checked) => setEditorSettings({ fontLigatures: checked })}
          />
        </div>
      </div>

      {/* Spacing Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Spacing')}</h3>
        <p className="text-sm text-muted-foreground">{t('Editor padding settings')}</p>
      </div>

      {/* Padding Top */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Padding top')}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={localPaddingTop}
            onChange={(e) => setLocalPaddingTop(Number(e.target.value))}
            onBlur={applyPaddingTopChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyPaddingTopChange();
                e.currentTarget.blur();
              }
            }}
            min={0}
            max={50}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">px</span>
        </div>
      </div>

      {/* Padding Bottom */}
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Padding bottom')}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={localPaddingBottom}
            onChange={(e) => setLocalPaddingBottom(Number(e.target.value))}
            onBlur={applyPaddingBottomChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyPaddingBottomChange();
                e.currentTarget.blur();
              }
            }}
            min={0}
            max={50}
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
