export type SessionId = string;

type PauseToken = symbol;
const ENHANCED_INPUT_SELECTOR = '[data-enhanced-input-session-id]';

interface FocusLockState {
  locked: boolean;
  pauses: Set<PauseToken>;
}

const focusLockStates = new Map<SessionId, FocusLockState>();

function getOrCreateFocusLockState(sessionId: SessionId): FocusLockState {
  const existing = focusLockStates.get(sessionId);
  if (existing) return existing;

  const created: FocusLockState = {
    locked: false,
    pauses: new Set<PauseToken>(),
  };
  focusLockStates.set(sessionId, created);
  return created;
}

function cleanupFocusLockState(sessionId: SessionId): void {
  const state = focusLockStates.get(sessionId);
  if (!state) return;
  if (state.locked || state.pauses.size > 0) return;
  focusLockStates.delete(sessionId);
}

export function lockFocus(sessionId: SessionId): void {
  getOrCreateFocusLockState(sessionId).locked = true;
}

export function unlockFocus(sessionId: SessionId): void {
  const state = getOrCreateFocusLockState(sessionId);
  state.locked = false;
  state.pauses.clear();
  cleanupFocusLockState(sessionId);
}

export function isFocusLocked(sessionId: SessionId): boolean {
  const state = focusLockStates.get(sessionId);
  if (!state) return false;
  return state.locked && state.pauses.size === 0;
}

export function pauseFocusLock(sessionId: SessionId): () => void {
  const state = getOrCreateFocusLockState(sessionId);
  const token: PauseToken = Symbol('focus-pause');
  let released = false;

  state.pauses.add(token);

  return () => {
    if (released) return;
    released = true;

    const currentState = focusLockStates.get(sessionId);
    if (!currentState) return;

    currentState.pauses.delete(token);
    cleanupFocusLockState(sessionId);
  };
}

export async function withFocusPause<T>(
  sessionId: SessionId,
  fn: () => Promise<T> | T
): Promise<T> {
  const release = pauseFocusLock(sessionId);
  try {
    return await fn();
  } finally {
    release();
  }
}

function findEnhancedInputTarget(sessionId: SessionId): HTMLTextAreaElement | undefined {
  return Array.from(document.querySelectorAll<HTMLTextAreaElement>(ENHANCED_INPUT_SELECTOR)).find(
    (node) => node.dataset.enhancedInputSessionId === sessionId
  );
}

export function restoreFocus(sessionId: SessionId): boolean {
  const target = findEnhancedInputTarget(sessionId);

  if (!target) return false;

  requestAnimationFrame(() => {
    target.focus();
  });

  return true;
}

export function restoreFocusIfLocked(sessionId: SessionId): boolean {
  if (!isFocusLocked(sessionId)) return false;
  return restoreFocus(sessionId);
}
