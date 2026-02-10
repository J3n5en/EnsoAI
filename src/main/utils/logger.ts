import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main.js';

/**
 * Initialize logger with configuration
 * @param enabled - Whether logging is enabled (defaults to false, only errors logged)
 * @param level - Log level to use when enabled
 */
export function initLogger(
  enabled: boolean = false,
  level: 'error' | 'warn' | 'info' | 'debug' = 'info'
): void {
  // Set log file path
  const logPath = path.join(app.getPath('logs'), 'ensoai.log');
  log.transports.file.resolvePathFn = () => logPath;

  // Configure log levels based on settings
  if (enabled) {
    log.transports.file.level = level;
    log.transports.console.level = level;
  } else {
    // When disabled, only log errors
    log.transports.file.level = 'error';
    log.transports.console.level = 'error';
  }

  // Configure log file rotation
  log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB

  // Configure log format
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

  // Initialize and hijack console methods - all console.log/warn/error become log
  log.initialize({ preload: true });
  Object.assign(console, log.functions);
}

export default log;
