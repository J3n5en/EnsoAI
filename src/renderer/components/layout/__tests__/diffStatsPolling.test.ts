import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Diff stats polling interval', () => {
  it('WorktreePanel should use 30 second interval instead of 10 seconds', () => {
    const source = fs.readFileSync(path.join(__dirname, '../WorktreePanel.tsx'), 'utf-8');
    expect(source).toContain('}, 30000)');
    expect(source).not.toContain('}, 10000)');
  });

  it('TreeSidebar should use 30 second interval instead of 10 seconds', () => {
    const source = fs.readFileSync(path.join(__dirname, '../TreeSidebar.tsx'), 'utf-8');
    expect(source).toContain('}, 30000)');
    expect(source).not.toContain('}, 10000)');
  });
});
