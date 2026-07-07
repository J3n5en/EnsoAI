import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AgentTerminal activity polling configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, '../AgentTerminal.tsx'), 'utf-8');

  it('should use exponential backoff constants instead of fixed interval', () => {
    expect(source).toContain('ACTIVITY_POLL_INITIAL_MS = 1000');
    expect(source).toContain('ACTIVITY_POLL_MAX_MS = 8000');
    expect(source).not.toContain('ACTIVITY_POLL_INTERVAL_MS = 1000');
  });

  it('should use setTimeout-based recursive scheduling instead of setInterval', () => {
    expect(source).toContain('scheduleNext');
    expect(source).toContain('activityPollDelayRef');
    expect(source).not.toMatch(/activityPollIntervalRef\.current = setInterval/);
  });

  it('should implement exponential backoff with max cap', () => {
    expect(source).toContain('activityPollDelayRef.current * 2');
    expect(source).toContain('ACTIVITY_POLL_MAX_MS');
  });

  it('should reset backoff when activity is detected', () => {
    expect(source).toContain('activityPollDelayRef.current = ACTIVITY_POLL_INITIAL_MS');
  });

  it('should use clearTimeout for cleanup instead of clearInterval', () => {
    expect(source).toContain('clearTimeout(activityPollIntervalRef.current)');
  });
});
