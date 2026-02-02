import type { TerminalKeybinding } from '@/stores/settings';

// Convert e.code to readable key name (handles Option key special chars on macOS)
export function codeToKey(code: string): string | null {
  // Digits
  if (code.startsWith('Digit')) return code.slice(5);
  // Letters
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  // Function keys
  if (/^F\d+$/.test(code)) return code;
  // Special keys mapping
  const specialKeys: Record<string, string> = {
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Backquote: '`',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Space: 'space',
    Enter: 'enter',
    Escape: 'escape',
    Tab: 'tab',
    Backspace: 'backspace',
    Delete: 'delete',
    ArrowUp: 'arrowup',
    ArrowDown: 'arrowdown',
    ArrowLeft: 'arrowleft',
    ArrowRight: 'arrowright',
    Home: 'home',
    End: 'end',
    PageUp: 'pageup',
    PageDown: 'pagedown',
  };
  return specialKeys[code] || null;
}

// Get the actual key from a keyboard event (using code to avoid Option key issues)
export function getKeyFromEvent(e: KeyboardEvent): string {
  return codeToKey(e.code) || e.key.toLowerCase();
}

// Check if a keyboard event matches a keybinding
export function matchesKeybinding(e: KeyboardEvent, binding: TerminalKeybinding): boolean {
  const key = getKeyFromEvent(e);
  const keyMatch = key.toLowerCase() === binding.key.toLowerCase();
  const ctrlMatch = binding.ctrl ? e.ctrlKey : !e.ctrlKey;
  const altMatch = binding.alt ? e.altKey : !e.altKey;
  const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey;
  const metaMatch = binding.meta ? e.metaKey : !e.metaKey;
  return keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;
}
