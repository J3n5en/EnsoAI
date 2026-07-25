import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../../../');

describe('PTY helper packaging', () => {
  it('declares pty-helper as an additional main entry', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'electron.vite.config.ts'), 'utf8');
    expect(source).toContain("'pty-helper'");
    expect(source).toContain('src/main/services/terminal/ptyHelper.ts');
  });

  it('unpacks the helper and node-pty runtime files', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'electron-builder.yml'), 'utf8');
    expect(source).toContain('out/main/pty-helper.js');
    expect(source).toContain('out/main/chunks/ptyHelperProtocol-*.js');
    expect(source).toContain('node_modules/node-pty/**');
  });
});
