import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useXterm terminal display options', () => {
  const source = fs.readFileSync(path.join(__dirname, '../useXterm.ts'), 'utf-8');

  it('keeps erased display content only when Windows compatibility is enabled', () => {
    expect(source).toContain('scrollOnEraseInDisplay: useWindowsConptyCompatibility');
  });

  it('passes Windows ConPTY compatibility setting to terminal creation', () => {
    expect(source).toContain('windowsConptyCompatibilityFixEnabled');
  });
});
