import { getXtermTheme, isTerminalThemeDark } from '@/lib/ghosttyTheme';
import { monaco } from './monacoSetup';

export const CUSTOM_THEME_NAME = 'enso-theme';

export interface MonacoThemeOptions {
  /** Whether a custom background image is active */
  backgroundImageEnabled?: boolean;
  /** Image-visibility value (0 = no image … 1 = full image).
   *  Panel overlay opacity = 1 - backgroundOpacity */
  backgroundOpacity?: number;
}

// Define Monaco theme from terminal theme
export function defineMonacoTheme(terminalThemeName: string, options: MonacoThemeOptions = {}) {
  const xtermTheme = getXtermTheme(terminalThemeName);
  if (!xtermTheme) return;

  const isDark = isTerminalThemeDark(terminalThemeName);
  const { backgroundImageEnabled = false } = options;

  // When a background image is active the editor must be fully transparent so
  // it doesn't add a colour layer on top of the parent containers' bg-background
  // (which already provides the correct semi-transparent overlay via CSS vars).
  // Using the terminal theme colour here would cause a visible colour mismatch
  // because it differs from the CSS --background variable used everywhere else.
  const editorBg = backgroundImageEnabled ? '#00000000' : xtermTheme.background;

  const gutterBg = backgroundImageEnabled ? '#00000000' : undefined;
  const minimapBg = backgroundImageEnabled ? '#00000000' : undefined;

  monaco.editor.defineTheme(CUSTOM_THEME_NAME, {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      // Basic tokens (Monaco native)
      { token: 'comment', foreground: xtermTheme.brightBlack.replace('#', '') },
      { token: 'keyword', foreground: xtermTheme.magenta.replace('#', '') },
      { token: 'string', foreground: xtermTheme.green.replace('#', '') },
      { token: 'number', foreground: xtermTheme.yellow.replace('#', '') },
      { token: 'type', foreground: xtermTheme.cyan.replace('#', '') },
      { token: 'function', foreground: xtermTheme.blue.replace('#', '') },
      { token: 'variable', foreground: xtermTheme.red.replace('#', '') },
      { token: 'constant', foreground: xtermTheme.brightYellow.replace('#', '') },
      // TextMate tokens (Shiki)
      { token: 'keyword.control', foreground: xtermTheme.magenta.replace('#', '') },
      { token: 'keyword.operator', foreground: xtermTheme.magenta.replace('#', '') },
      { token: 'storage.type', foreground: xtermTheme.magenta.replace('#', '') },
      { token: 'storage.modifier', foreground: xtermTheme.magenta.replace('#', '') },
      { token: 'entity.name.function', foreground: xtermTheme.blue.replace('#', '') },
      { token: 'entity.name.type', foreground: xtermTheme.cyan.replace('#', '') },
      { token: 'entity.name.tag', foreground: xtermTheme.red.replace('#', '') },
      { token: 'entity.other.attribute-name', foreground: xtermTheme.yellow.replace('#', '') },
      { token: 'variable.other', foreground: xtermTheme.foreground.replace('#', '') },
      { token: 'variable.parameter', foreground: xtermTheme.red.replace('#', '') },
      { token: 'support.function', foreground: xtermTheme.blue.replace('#', '') },
      { token: 'support.type', foreground: xtermTheme.cyan.replace('#', '') },
      { token: 'constant.language', foreground: xtermTheme.brightYellow.replace('#', '') },
      { token: 'constant.numeric', foreground: xtermTheme.yellow.replace('#', '') },
      { token: 'punctuation', foreground: xtermTheme.foreground.replace('#', '') },
      { token: 'punctuation.definition.tag', foreground: xtermTheme.brightBlack.replace('#', '') },
      { token: 'meta.brace', foreground: xtermTheme.foreground.replace('#', '') },
    ],
    colors: {
      'editor.background': editorBg,
      'editor.foreground': xtermTheme.foreground,
      'editor.selectionBackground': xtermTheme.selectionBackground,
      'editor.lineHighlightBackground': isDark
        ? `${xtermTheme.brightBlack}30`
        : `${xtermTheme.black}10`,
      'editorCursor.foreground': xtermTheme.cursor,
      'editorLineNumber.foreground': xtermTheme.brightBlack,
      'editorLineNumber.activeForeground': xtermTheme.foreground,
      'editorIndentGuide.background': isDark
        ? `${xtermTheme.brightBlack}40`
        : `${xtermTheme.black}20`,
      'editorIndentGuide.activeBackground': isDark
        ? `${xtermTheme.brightBlack}80`
        : `${xtermTheme.black}40`,
      // Transparent gutter / minimap when background image is active
      ...(gutterBg ? { 'editorGutter.background': gutterBg } : {}),
      ...(minimapBg ? { 'minimap.background': minimapBg } : {}),
    },
  });
}
