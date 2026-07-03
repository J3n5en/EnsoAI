import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useSourceControl idle-aware polling', () => {
  const source = fs.readFileSync(path.join(__dirname, '../useSourceControl.ts'), 'utf-8');

  it('should define active and idle intervals for file changes', () => {
    expect(source).toContain('FILE_CHANGES_ACTIVE_MS = 5000');
    expect(source).toContain('FILE_CHANGES_IDLE_MS = 30000');
    expect(source).toContain('FILE_CHANGES_IDLE_THRESHOLD');
  });

  it('should define active and idle intervals for file diff', () => {
    expect(source).toContain('FILE_DIFF_ACTIVE_MS = 2000');
    expect(source).toContain('FILE_DIFF_IDLE_MS = 15000');
    expect(source).toContain('FILE_DIFF_IDLE_THRESHOLD');
  });

  it('should track unchanged count to switch to idle polling', () => {
    expect(source).toContain('unchangedCountRef');
  });

  it('should use idle interval when threshold is reached', () => {
    expect(source).toContain('unchangedCountRef.current >= FILE_CHANGES_IDLE_THRESHOLD');
    expect(source).toContain('unchangedCountRef.current >= FILE_DIFF_IDLE_THRESHOLD');
  });

  it('should reset counter when data changes', () => {
    const resetMatches = source.match(/unchangedCountRef\.current = 0/g);
    expect(resetMatches).not.toBeNull();
    expect(resetMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
