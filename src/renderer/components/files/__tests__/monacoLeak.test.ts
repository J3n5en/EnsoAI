import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Monaco addCommand registry leak prevention', () => {
  it('EditorArea should not use addCommand (leaks into shared registry)', () => {
    const source = fs.readFileSync(path.join(__dirname, '../EditorArea.tsx'), 'utf-8');
    const lines = source.split('\n');
    const addCommandCalls = lines.filter(
      (line) =>
        line.includes('.addCommand(') &&
        !line.trimStart().startsWith('//') &&
        !line.trimStart().startsWith('*')
    );
    expect(addCommandCalls).toHaveLength(0);
  });

  it('DiffViewer should not use addCommand (leaks into shared registry)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../source-control/DiffViewer.tsx'),
      'utf-8'
    );
    const lines = source.split('\n');
    const addCommandCalls = lines.filter(
      (line) =>
        line.includes('.addCommand(') &&
        !line.trimStart().startsWith('//') &&
        !line.trimStart().startsWith('*')
    );
    expect(addCommandCalls).toHaveLength(0);
  });

  it('EditorArea should use onKeyDown for search shortcut with proper disposal', () => {
    const source = fs.readFileSync(path.join(__dirname, '../EditorArea.tsx'), 'utf-8');
    expect(source).toContain('searchDisposable');
    expect(source).toContain('searchDisposable.dispose()');
  });
});
