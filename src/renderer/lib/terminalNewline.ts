type TerminalNewlineEvent = Pick<
  KeyboardEvent,
  'type' | 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'
>;

export interface TerminalNewlineResolution {
  handled: boolean;
  data: string | null;
}

export function resolveTerminalNewline(
  event: TerminalNewlineEvent,
  isCodexAgent: boolean
): TerminalNewlineResolution {
  const isShiftEnter =
    event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;

  if (!isShiftEnter) {
    return { handled: false, data: null };
  }

  if (event.type !== 'keydown') {
    return { handled: true, data: null };
  }

  return { handled: true, data: isCodexAgent ? '\x1b\r' : '\x0a' };
}
