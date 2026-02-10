import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main.js';

// Guard to ensure initialization happens only once
let initialized = false;

/**
 * Clean up old log files
 * Removes log files older than the specified number of days
 */
function cleanupOldLogs(daysToKeep: number = 30): void {
  try {
    const logDir = app.getPath('logs');
    const files = fs.readdirSync(logDir);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000; // Convert days to milliseconds

    for (const file of files) {
      // Only process ensoai log files (including .old.log from size rotation)
      if (file.startsWith('ensoai-') && file.endsWith('.log')) {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up old log file: ${file}`);
        }
      }
    }
  } catch (error) {
    // Silently fail - don't break app if log cleanup fails
    console.error('Failed to clean up old logs:', error);
  }
}

/**
 * Initialize logger with configuration
 * @param enabled - Whether logging is enabled (defaults to false, only errors logged)
 * @param level - Log level to use when enabled
 */
export function initLogger(
  enabled: boolean = false,
  level: 'error' | 'warn' | 'info' | 'debug' = 'info'
): void {
  // One-time initialization: setup log file path, format, and hijack console
  if (!initialized) {
    // Set log file path with daily rotation (YYYY-MM-DD format)
    log.transports.file.resolvePathFn = () => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const fileName = `ensoai-${year}-${month}-${day}.log`;
      return path.join(app.getPath('logs'), fileName);
    };

    // Configure log file rotation (backup mechanism if daily log exceeds 10MB)
    log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB

    // Configure log format
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

    // Initialize and hijack console methods - all console.log/warn/error become log
    log.initialize({ preload: true });
    Object.assign(console, log.functions);

    // Clean up old log files (keep last 30 days)
    cleanupOldLogs(30);

    initialized = true;
  }

  // Configure log levels based on settings (can be called multiple times)
  if (enabled) {
    log.transports.file.level = level;
    log.transports.console.level = level;
  } else {
    // When disabled, only log errors
    log.transports.file.level = 'error';
    log.transports.console.level = 'error';
  }
}

export default log;
