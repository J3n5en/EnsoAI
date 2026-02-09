import { useEffect } from 'react';

/**
 * Module-level singleton guard for macOS traffic lights (red/yellow/green buttons).
 *
 * Hides traffic lights when any modal is open AND window is NOT fullscreen.
 * Uses ref-counting so multiple concurrent modals work correctly.
 *
 * The fullscreen listener is initialized lazily on first acquire and lives for
 * the entire application lifetime (single Electron window, destroyed with the
 * process). In HMR scenarios the old listener is properly removed before
 * re-initialisation to avoid duplicate subscriptions.
 *
 * NOTE: This guard only works for controlled Dialog/AlertDialog (with explicit
 * `open` prop). Uncontrolled usage (without `open`) will not trigger the guard.
 *
 * KNOWN LIMITATION: If a component unmounts abnormally (e.g. error boundary
 * catches during unmount) without calling releaseTrafficLightsGuard, the
 * guardCount will leak and traffic lights may remain hidden until the next
 * HMR reset or page reload. A global recovery mechanism is not implemented
 * as this is an unlikely edge case in practice.
 */
let guardCount = 0;
let currentlyHidden = false;
let isFullScreen = false;
let listenerInitialized = false;
let cleanupFullScreenListener: (() => void) | null = null;

function resetModuleState() {
  guardCount = 0;
  currentlyHidden = false;
  isFullScreen = false;
  listenerInitialized = false;
  if (cleanupFullScreenListener) {
    cleanupFullScreenListener();
    cleanupFullScreenListener = null;
  }
}

function syncVisibility() {
  const shouldHide = guardCount > 0 && !isFullScreen;
  if (shouldHide === currentlyHidden) return;
  currentlyHidden = shouldHide;
  window.electronAPI?.window.setTrafficLightsVisible(!shouldHide);
}

function initFullScreenListener() {
  if (listenerInitialized) return;
  listenerInitialized = true;

  window.electronAPI?.window
    .isFullScreen()
    .then((fs) => {
      isFullScreen = fs;
      syncVisibility();
    })
    .catch(() => {
      // IPC call may fail if the window is being destroyed; safe to ignore.
    });

  cleanupFullScreenListener =
    window.electronAPI?.window.onFullScreenChange((fs) => {
      isFullScreen = fs;
      syncVisibility();
    }) ?? null;
}

export function acquireTrafficLightsGuard() {
  if (window.electronAPI?.env.platform !== 'darwin') return;
  initFullScreenListener();
  guardCount++;
  syncVisibility();
}

export function releaseTrafficLightsGuard() {
  if (window.electronAPI?.env.platform !== 'darwin') return;
  guardCount = Math.max(0, guardCount - 1);
  syncVisibility();
}

/**
 * Hook: hide macOS traffic lights while `open` is true.
 * Automatically called by Dialog/AlertDialog root wrappers.
 */
export function useTrafficLightsGuard(open: boolean) {
  useEffect(() => {
    if (!open) return;
    acquireTrafficLightsGuard();
    return () => releaseTrafficLightsGuard();
  }, [open]);
}

// Reset module state during HMR to avoid stale guard counts and duplicate listeners
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (currentlyHidden) {
      window.electronAPI?.window.setTrafficLightsVisible(true);
    }
    resetModuleState();
  });
}
