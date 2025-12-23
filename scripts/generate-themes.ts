#!/usr/bin/env npx tsx
/**
 * Generate terminal themes JSON from ghostty-themes directory
 * Run: npx tsx scripts/generate-themes.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GHOSTTY_THEMES_PATH = path.join(__dirname, '../resources/ghostty-themes');
const OUTPUT_PATH = path.join(__dirname, '../src/renderer/data/terminal-themes.json');

interface ParsedTheme {
  name: string;
  palette: string[];
  background: string;
  foreground: string;
  cursorColor: string;
  cursorText: string;
  selectionBackground: string;
  selectionForeground: string;
}

function parseGhosttyTheme(content: string, name: string): ParsedTheme {
  const lines = content.split('\n');
  const palette: string[] = new Array(16).fill('#000000');
  let background = '#1e1e1e';
  let foreground = '#d4d4d4';
  let cursorColor = '#d4d4d4';
  let cursorText = '#1e1e1e';
  let selectionBackground = '#264f78';
  let selectionForeground = '#ffffff';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)\s*=\s*(.+)$/);
    if (!match) continue;

    const [, key, value] = match;
    const cleanKey = key.trim();
    const cleanValue = value.trim();

    if (cleanKey === 'palette') {
      const paletteMatch = cleanValue.match(/^(\d+)=(.+)$/);
      if (paletteMatch) {
        const index = Number.parseInt(paletteMatch[1], 10);
        if (index >= 0 && index < 16) {
          palette[index] = paletteMatch[2];
        }
      }
    } else if (cleanKey === 'background') {
      background = cleanValue;
    } else if (cleanKey === 'foreground') {
      foreground = cleanValue;
    } else if (cleanKey === 'cursor-color') {
      cursorColor = cleanValue;
    } else if (cleanKey === 'cursor-text') {
      cursorText = cleanValue;
    } else if (cleanKey === 'selection-background') {
      selectionBackground = cleanValue;
    } else if (cleanKey === 'selection-foreground') {
      selectionForeground = cleanValue;
    }
  }

  return {
    name,
    palette,
    background,
    foreground,
    cursorColor,
    cursorText,
    selectionBackground,
    selectionForeground,
  };
}

async function main() {
  console.log('Reading themes from:', GHOSTTY_THEMES_PATH);

  const files = fs.readdirSync(GHOSTTY_THEMES_PATH);
  const themes: Record<string, ParsedTheme> = {};

  for (const file of files) {
    if (file.startsWith('.')) continue;

    const filePath = path.join(GHOSTTY_THEMES_PATH, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    themes[file] = parseGhosttyTheme(content, file);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(themes, null, 2));

  console.log(`Generated ${Object.keys(themes).length} themes to:`, OUTPUT_PATH);
}

main().catch(console.error);
