import log from 'electron-log/renderer.js';

/**
 * Update renderer logging configuration
 * Called by settings store after rehydration to sync with user preferences
 */
export function updateRendererLogging(
  enabled: boolean,
  level: 'error' | 'warn' | 'info' | 'debug'
): void {
  // Control IPC transport level to reduce unnecessary IPC messages
  // When disabled, only send errors; when enabled, use configured level
  log.transports.ipc.level = enabled ? level : 'error';
}
