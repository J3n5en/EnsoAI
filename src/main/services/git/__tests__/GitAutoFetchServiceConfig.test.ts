import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GitAutoFetchService configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, '../GitAutoFetchService.ts'), 'utf-8');

  it('should use 5 minute base interval', () => {
    expect(source).toContain('FETCH_INTERVAL_MS = 5 * 60 * 1000');
  });

  it('should have a 15 minute idle interval', () => {
    expect(source).toContain('FETCH_IDLE_INTERVAL_MS = 15 * 60 * 1000');
  });

  it('should use 2 minute minimum focus interval', () => {
    expect(source).toContain('MIN_FOCUS_INTERVAL_MS = 2 * 60 * 1000');
  });

  it('should track consecutive no-change count for adaptive scheduling', () => {
    expect(source).toContain('consecutiveNoChange');
    expect(source).toContain('IDLE_FETCH_THRESHOLD');
  });

  it('should use setTimeout instead of setInterval for adaptive scheduling', () => {
    expect(source).toContain('scheduleNextFetch');
    expect(source).not.toMatch(/this\.intervalId = setInterval/);
  });

  it('should use clearTimeout instead of clearInterval', () => {
    expect(source).toContain('clearTimeout(this.intervalId)');
    expect(source).not.toContain('clearInterval(this.intervalId)');
  });
});
