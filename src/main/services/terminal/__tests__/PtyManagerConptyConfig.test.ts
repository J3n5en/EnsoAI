import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PtyManager Windows ConPTY compatibility wiring', () => {
  const source = fs.readFileSync(path.join(__dirname, '../PtyManager.ts'), 'utf-8');

  it('imports Windows ConPTY compatibility helper', () => {
    expect(source).toContain('createWindowsConptyCompatibilityOptions');
  });

  it('passes useConptyDll to node-pty spawn options', () => {
    expect(source).toContain('useConptyDll');
    expect(source).toContain('windowsConptyCompatibility.useConptyDll');
  });

  it('retries without bundled ConPTY when spawn fails', () => {
    expect(source).toContain('Retrying without bundled ConPTY');
  });
});
