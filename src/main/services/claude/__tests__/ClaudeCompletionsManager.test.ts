import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ClaudeCompletionsManager watcher retry config', () => {
  it('should use 30 second retry interval instead of 2 seconds', () => {
    const source = fs.readFileSync(path.join(__dirname, '../ClaudeCompletionsManager.ts'), 'utf-8');

    expect(source).toContain('WATCHER_RETRY_INTERVAL_MS = 30000');
    expect(source).toContain('}, WATCHER_RETRY_INTERVAL_MS)');
  });

  it('should have a maximum retry count', () => {
    const source = fs.readFileSync(path.join(__dirname, '../ClaudeCompletionsManager.ts'), 'utf-8');

    expect(source).toContain('WATCHER_MAX_RETRIES');
    expect(source).toContain('watcherRetryCount > WATCHER_MAX_RETRIES');
  });
});
