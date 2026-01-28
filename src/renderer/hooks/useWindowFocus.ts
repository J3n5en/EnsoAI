import { useSyncExternalStore } from 'react';

const IDLE_THRESHOLD_MS = 90 * 1000; // 90 秒无用户活动视为空闲

let isWindowFocused = !document.hidden;
let isIdle = false;
let idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
let _lastUserActivityTs = Date.now();
const listeners = new Set<() => void>();

let cachedSnapshot = { isWindowFocused, isIdle };

function updateSnapshot() {
  cachedSnapshot = { isWindowFocused, isIdle };
}

function notifyListeners() {
  updateSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function resetIdleTimer() {
  _lastUserActivityTs = Date.now();

  if (idleTimeoutId) {
    clearTimeout(idleTimeoutId);
  }

  if (isIdle) {
    isIdle = false;
    notifyListeners();
  }

  // 只在窗口聚焦时启动空闲检测
  if (isWindowFocused) {
    idleTimeoutId = setTimeout(() => {
      isIdle = true;
      notifyListeners();
    }, IDLE_THRESHOLD_MS);
  }
}

function handleUserActivity() {
  resetIdleTimer();
}

function handleVisibilityChange() {
  const wasFocused = isWindowFocused;
  isWindowFocused = !document.hidden;

  if (isWindowFocused && !wasFocused) {
    // 窗口重新获得焦点，重置空闲状态
    resetIdleTimer();
  } else if (!isWindowFocused && wasFocused) {
    // 窗口失焦，立即进入空闲状态
    if (idleTimeoutId) {
      clearTimeout(idleTimeoutId);
      idleTimeoutId = null;
    }
    isIdle = true;
    notifyListeners();
  }
}

function handleWindowFocus() {
  if (!isWindowFocused) {
    isWindowFocused = true;
    resetIdleTimer();
  }
}

function handleWindowBlur() {
  if (isWindowFocused) {
    isWindowFocused = false;
    if (idleTimeoutId) {
      clearTimeout(idleTimeoutId);
      idleTimeoutId = null;
    }
    isIdle = true;
    notifyListeners();
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);

  // 监听用户活动事件
  const userActivityEvents = ['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart'];
  for (const event of userActivityEvents) {
    window.addEventListener(event, handleUserActivity, { passive: true });
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot() {
  return cachedSnapshot;
}

const serverSnapshot = { isWindowFocused: true, isIdle: false };
function getServerSnapshot() {
  return serverSnapshot;
}

export function useWindowFocus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useShouldPoll() {
  const { isIdle } = useWindowFocus();
  return !isIdle;
}
