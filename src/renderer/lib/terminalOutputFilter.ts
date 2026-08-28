// biome-ignore lint/complexity/useRegexLiterals: string form avoids control characters in the regex literal
const OSC_BACKGROUND_COLOR_REGEX = new RegExp(
  String.raw`\x1b\]11;(?!\?)[^\x07\x1b]*(?:\x07|\x1b\\)`,
  'g'
);
// biome-ignore lint/complexity/useRegexLiterals: string form avoids control characters in the regex literal
const INCOMPLETE_OSC_BACKGROUND_REGEX = new RegExp(String.raw`(?:\x1b\]11;[^\x07\x1b]*|\x1b)$`);
const RGB_COLOR_REGEX =
  /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i;
const HEX_COLOR_REGEX = /^#([\da-f]{3,8})$/i;
const TERMINAL_BACKGROUND_ATTRIBUTE = 'data-ensoai-terminal-background';
const TERMINAL_BACKGROUND_VARIABLE = '--ensoai-terminal-background';

type ParsedRgb = { r: number; g: number; b: number; alpha: number; key: string };

function parseRgbColor(value: string): ParsedRgb | null {
  const match = value.match(RGB_COLOR_REGEX);
  if (!match) return null;

  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
  return {
    r: Number.parseInt(match[1], 10),
    g: Number.parseInt(match[2], 10),
    b: Number.parseInt(match[3], 10),
    alpha,
    key: `${match[1]},${match[2]},${match[3]}`,
  };
}

function parseCssColor(value: string): ParsedRgb | null {
  const rgb = parseRgbColor(value.trim());
  if (rgb) return rgb;

  const match = value.trim().match(HEX_COLOR_REGEX);
  if (!match) return null;

  const hex = match[1];
  const expanded = hex.length <= 4 ? [...hex].map((digit) => `${digit}${digit}`).join('') : hex;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  const hasAlpha = expanded.length === 8;
  const alpha = hasAlpha ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
  return {
    r,
    g,
    b,
    alpha,
    key: `${r},${g},${b}`,
  };
}

function colorChroma(color: ParsedRgb): number {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function colorLuminance(color: ParsedRgb): number {
  return (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
}

/** Remove terminal-wide background changes while preserving ANSI cell colors. */
export function stripTerminalWideBackgroundColors(data: string): string {
  return data.replace(OSC_BACKGROUND_COLOR_REGEX, '');
}

/**
 * Make non-base ANSI cell backgrounds translucent without changing foreground colors.
 * Grok paints its base surface into every cell; that color is left transparent while
 * diff and selection colors remain visible through the workspace image.
 */
export function softenTerminalDomBackgrounds(root: HTMLElement, opacity = 0.35): () => void {
  const marked = new Set<HTMLElement>();
  const inlineBackgrounds = new WeakMap<HTMLElement, string>();
  const style = document.createElement('style');
  style.textContent = `
    [${TERMINAL_BACKGROUND_ATTRIBUTE}="base"] {
      background-color: transparent !important;
    }
    [${TERMINAL_BACKGROUND_ATTRIBUTE}="soft"] {
      background-color: var(${TERMINAL_BACKGROUND_VARIABLE}) !important;
    }
  `;
  root.prepend(style);

  const clearMarker = (element: HTMLElement) => {
    element.removeAttribute(TERMINAL_BACKGROUND_ATTRIBUTE);
    element.style.removeProperty(TERMINAL_BACKGROUND_VARIABLE);
  };

  const soften = () => {
    // Remove only the overlay markers. Inline xterm colors stay untouched, so the
    // original color can be measured again without flashing an opaque frame.
    for (const element of marked) {
      clearMarker(element);
      inlineBackgrounds.delete(element);
    }
    marked.clear();

    const elements = [...root.querySelectorAll<HTMLElement>('.xterm-rows > div, .xterm-rows span')];
    const backgrounds = elements.map((element) => {
      const inlineValue = element.style.getPropertyValue('background-color');
      const color =
        parseCssColor(inlineValue) ?? parseCssColor(getComputedStyle(element).backgroundColor);
      return { element, color, inlineValue };
    });
    const counts = new Map<string, { color: ParsedRgb; count: number }>();

    for (const { color } of backgrounds) {
      if (!color || color.alpha < 1) continue;
      const entry = counts.get(color.key);
      if (entry) {
        entry.count += 1;
      } else {
        counts.set(color.key, { color, count: 1 });
      }
    }

    const baseBackground = [...counts.values()]
      .filter(
        ({ color, count }) => count > 1 && colorLuminance(color) < 120 && colorChroma(color) < 40
      )
      .sort((a, b) => b.count - a.count)[0]?.color;

    for (const { element, color, inlineValue } of backgrounds) {
      if (element.classList.contains('xterm-cursor') || !color || color.alpha < 1) continue;

      inlineBackgrounds.set(element, inlineValue);
      if (baseBackground && color.key === baseBackground.key) {
        element.setAttribute(TERMINAL_BACKGROUND_ATTRIBUTE, 'base');
      } else {
        element.style.setProperty(
          TERMINAL_BACKGROUND_VARIABLE,
          `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`
        );
        element.setAttribute(TERMINAL_BACKGROUND_ATTRIBUTE, 'soft');
      }
      marked.add(element);
    }
  };

  // MutationObserver callbacks run before the next paint. Processing directly avoids
  // a requestAnimationFrame gap in which newly rendered cells can show their base fill.
  soften();
  const observer = new MutationObserver((records) => {
    const shouldSoften = records.some((record) => {
      if (record.type !== 'attributes') return true;
      if (record.attributeName === TERMINAL_BACKGROUND_ATTRIBUTE) return false;
      if (record.attributeName !== 'style') return true;

      const element = record.target;
      if (!(element instanceof HTMLElement)) return true;
      const inlineBackground = element.style.getPropertyValue('background-color');
      return inlineBackgrounds.has(element)
        ? inlineBackground !== inlineBackgrounds.get(element)
        : inlineBackground.length > 0;
    });
    if (shouldSoften) soften();
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });

  return () => {
    observer.disconnect();
    for (const element of marked) {
      clearMarker(element);
    }
    marked.clear();
    style.remove();
  };
}

export interface TerminalBackgroundFilter {
  process: (data: string) => string;
  flush: () => string;
  reset: () => void;
}

export function createTerminalBackgroundFilter(): TerminalBackgroundFilter {
  let carry = '';

  return {
    process(data) {
      const combined = carry + data;
      carry = '';

      const incompleteMatch = combined.match(INCOMPLETE_OSC_BACKGROUND_REGEX);
      const completeData = incompleteMatch
        ? combined.slice(0, combined.length - incompleteMatch[0].length)
        : combined;

      if (incompleteMatch) {
        carry = incompleteMatch[0];
      }

      return stripTerminalWideBackgroundColors(completeData);
    },
    flush() {
      carry = '';
      return '';
    },
    reset() {
      carry = '';
    },
  };
}
