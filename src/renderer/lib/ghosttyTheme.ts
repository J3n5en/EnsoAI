// Ghostty theme utilities - uses pre-generated themes JSON

import terminalThemes from '@/data/terminal-themes.json';

export interface GhosttyTheme {
  name: string;
  palette: string[]; // 16 colors (0-15)
  background: string;
  foreground: string;
  cursorColor: string;
  cursorText: string;
  selectionBackground: string;
  selectionForeground: string;
}

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// Type for the imported themes
const themes = terminalThemes as Record<string, GhosttyTheme>;

// Get all theme names sorted alphabetically
export function getThemeNames(): string[] {
  return Object.keys(themes).sort((a, b) => a.localeCompare(b));
}

// Get a specific theme by name
export function getTheme(name: string): GhosttyTheme | undefined {
  return themes[name];
}

// Convert GhosttyTheme to xterm.js ITheme format
export function ghosttyToXterm(theme: GhosttyTheme): XtermTheme {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursorColor,
    cursorAccent: theme.cursorText,
    selectionBackground: theme.selectionBackground,
    selectionForeground: theme.selectionForeground,
    black: theme.palette[0],
    red: theme.palette[1],
    green: theme.palette[2],
    yellow: theme.palette[3],
    blue: theme.palette[4],
    magenta: theme.palette[5],
    cyan: theme.palette[6],
    white: theme.palette[7],
    brightBlack: theme.palette[8],
    brightRed: theme.palette[9],
    brightGreen: theme.palette[10],
    brightYellow: theme.palette[11],
    brightBlue: theme.palette[12],
    brightMagenta: theme.palette[13],
    brightCyan: theme.palette[14],
    brightWhite: theme.palette[15],
  };
}

// Get xterm theme by name
export function getXtermTheme(name: string): XtermTheme | undefined {
  const theme = getTheme(name);
  return theme ? ghosttyToXterm(theme) : undefined;
}

// Default dark theme for fallback
export const defaultDarkTheme: XtermTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

// Default light theme for fallback
export const defaultLightTheme: XtermTheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
};

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColorWithAlpha(color: string): RGBA | null {
  const c = color.trim();

  if (c === 'transparent') return null;

  const hex6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
  if (hex6) {
    return {
      r: Number.parseInt(hex6[1], 16),
      g: Number.parseInt(hex6[2], 16),
      b: Number.parseInt(hex6[3], 16),
      a: 1,
    };
  }

  const hex3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
  if (hex3) {
    return {
      r: Number.parseInt(hex3[1] + hex3[1], 16),
      g: Number.parseInt(hex3[2] + hex3[2], 16),
      b: Number.parseInt(hex3[3] + hex3[3], 16),
      a: 1,
    };
  }

  const hex8 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
  if (hex8) {
    return {
      r: Number.parseInt(hex8[1], 16),
      g: Number.parseInt(hex8[2], 16),
      b: Number.parseInt(hex8[3], 16),
      a: Number.parseInt(hex8[4], 16) / 255,
    };
  }

  const rgbaMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(c);
  if (rgbaMatch) {
    return {
      r: Number.parseInt(rgbaMatch[1], 10),
      g: Number.parseInt(rgbaMatch[2], 10),
      b: Number.parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] ? Number.parseFloat(rgbaMatch[4]) : 1,
    };
  }

  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const rgba = parseColorWithAlpha(hex);
  return rgba ? { r: rgba.r, g: rgba.g, b: rgba.b } : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
}

function mixColors(color1: string, color2: string, weight: number): string {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  if (!c1 || !c2) return color1;
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(c1.r * (1 - w) + c2.r * w, c1.g * (1 - w) + c2.g * w, c1.b * (1 - w) + c2.b * w);
}

export function hexToRgba(color: string, opacity: number): string {
  const rgba = parseColorWithAlpha(color);
  if (!rgba) return color;
  const newAlpha = Math.max(0, Math.min(1, opacity / 100));
  const finalAlpha = rgba.a * newAlpha;
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${finalAlpha})`;
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isTerminalThemeDark(themeName: string): boolean {
  const theme = getXtermTheme(themeName);
  if (!theme) return true;
  return getLuminance(theme.background) < 0.5;
}

// Apply terminal theme colors to app CSS variables
// syncDarkMode: if true, toggle dark class based on terminal theme; if false, don't change it
export function applyTerminalThemeToApp(themeName: string, syncDarkMode = true): void {
  const theme = getXtermTheme(themeName);
  if (!theme) return;

  const root = document.documentElement;
  const isDark = getLuminance(theme.background) < 0.5;

  // Only toggle dark class if syncDarkMode is true
  if (syncDarkMode) {
    root.classList.toggle('dark', isDark);
  }

  // Base colors
  root.style.setProperty('--background', theme.background);
  root.style.setProperty('--foreground', theme.foreground);

  // Card - same as background or slightly different
  root.style.setProperty('--card', theme.background);
  root.style.setProperty('--card-foreground', theme.foreground);

  // Popover
  root.style.setProperty('--popover', theme.background);
  root.style.setProperty('--popover-foreground', theme.foreground);

  // Primary - use foreground as primary
  root.style.setProperty('--primary', theme.foreground);
  root.style.setProperty('--primary-foreground', theme.background);

  // Secondary - muted version of background
  const secondaryBg = isDark
    ? mixColors(theme.background, theme.brightBlack, 0.5)
    : mixColors(theme.background, theme.black, 0.1);
  root.style.setProperty('--secondary', secondaryBg);
  root.style.setProperty('--secondary-foreground', theme.foreground);

  // Muted
  const mutedBg = isDark
    ? mixColors(theme.background, theme.brightBlack, 0.4)
    : mixColors(theme.background, theme.black, 0.08);
  const mutedFg = isDark
    ? mixColors(theme.foreground, theme.background, 0.4)
    : mixColors(theme.foreground, theme.background, 0.3);
  root.style.setProperty('--muted', mutedBg);
  root.style.setProperty('--muted-foreground', mutedFg);

  // Accent - use blue mixed with background for softer appearance
  const accentColor = isDark ? theme.brightBlue : theme.blue;
  const softAccent = mixColors(theme.background, accentColor, 0.3);
  const isSoftAccentDark = getLuminance(softAccent) < 0.5;
  root.style.setProperty('--accent', softAccent);
  root.style.setProperty('--accent-foreground', isSoftAccentDark ? '#ffffff' : '#000000');

  // Semantic colors
  root.style.setProperty('--destructive', theme.red);
  root.style.setProperty('--destructive-foreground', '#ffffff');

  root.style.setProperty('--success', theme.green);
  root.style.setProperty('--success-foreground', '#ffffff');

  root.style.setProperty('--warning', theme.yellow);
  root.style.setProperty('--warning-foreground', isDark ? theme.background : '#000000');

  root.style.setProperty('--info', theme.blue);
  root.style.setProperty('--info-foreground', '#ffffff');

  // Border & input
  const borderColor = isDark
    ? mixColors(theme.background, theme.foreground, 0.15)
    : mixColors(theme.background, theme.foreground, 0.12);
  root.style.setProperty('--border', borderColor);
  root.style.setProperty('--input', borderColor);

  // Ring - accent based
  root.style.setProperty('--ring', isDark ? theme.brightBlue : theme.blue);
}

// Clear terminal theme colors from app (restore CSS defaults)
export function clearTerminalThemeFromApp(): void {
  const root = document.documentElement;
  const cssVars = [
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--popover',
    '--popover-foreground',
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--muted',
    '--muted-foreground',
    '--accent',
    '--accent-foreground',
    '--destructive',
    '--destructive-foreground',
    '--success',
    '--success-foreground',
    '--warning',
    '--warning-foreground',
    '--info',
    '--info-foreground',
    '--border',
    '--input',
    '--ring',
  ];

  for (const v of cssVars) {
    root.style.removeProperty(v);
  }
}
