import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PtyManager Windows helper wiring', () => {
  const source = fs.readFileSync(path.join(__dirname, '../PtyManager.ts'), 'utf-8');

  it('keeps the existing Windows ConPTY compatibility decision', () => {
    expect(source).toContain('createWindowsConptyCompatibilityOptions');
  });

  it('routes Windows retries through the helper client', () => {
    expect(source).toContain('createWindowsPtyWithFallback');
    expect(source).toContain('windowsConptyCompatibility.useConptyDll');
  });

  it('does not load the node-pty runtime at module startup', () => {
    expect(source).toContain("import type { IPty } from 'node-pty'");
    expect(source).not.toContain("import * as pty from 'node-pty'");
    expect(source).toContain("() => import('node-pty')");
  });
});
