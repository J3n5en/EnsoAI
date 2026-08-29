// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createTerminalBackgroundFilter,
  softenTerminalDomBackgrounds,
  stripTerminalWideBackgroundColors,
} from '../terminalOutputFilter';

describe('stripTerminalWideBackgroundColors', () => {
  it('removes OSC 11 color changes but preserves OSC 11 queries', () => {
    const data = 'a\x1b]11;#111111\x1b\\b\x1b]11;?\x1b\\c';

    expect(stripTerminalWideBackgroundColors(data)).toBe('ab\x1b]11;?\x1b\\c');
  });
});

describe('softenTerminalDomBackgrounds', () => {
  it('softens diff backgrounds while leaving the repeated base surface transparent', async () => {
    const root = document.createElement('div');
    const style = document.createElement('style');
    style.textContent = `
      .xterm-bg-base { background-color: rgb(20, 20, 20); }
      .xterm-bg-insert { background-color: rgb(6, 56, 6); }
      .xterm-bg-delete { background-color: rgb(66, 14, 20); }
      .xterm-fg-code { color: rgb(122, 162, 247); }
    `;
    const rows = document.createElement('div');
    rows.className = 'xterm-rows';
    const row = document.createElement('div');
    const baseCells = Array.from({ length: 12 }, () => {
      const cell = document.createElement('span');
      cell.className = 'xterm-bg-base';
      cell.style.backgroundColor = '#141414';
      return cell;
    });
    const insertCell = document.createElement('span');
    insertCell.className = 'xterm-bg-insert xterm-fg-code';
    insertCell.style.backgroundColor = '#063806';
    const deleteCell = document.createElement('span');
    deleteCell.className = 'xterm-bg-delete';
    deleteCell.style.backgroundColor = '#420e14';
    row.append(...baseCells, insertCell, deleteCell);
    rows.appendChild(row);
    root.append(style, rows);
    document.body.appendChild(root);

    const cleanup = softenTerminalDomBackgrounds(root);

    expect(getComputedStyle(baseCells[0]).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(insertCell.style.getPropertyValue('--ensoai-terminal-background')).toBe(
      'rgba(6, 56, 6, 0.35)'
    );
    expect(deleteCell.style.getPropertyValue('--ensoai-terminal-background')).toBe(
      'rgba(66, 14, 20, 0.35)'
    );
    expect(getComputedStyle(insertCell).color).toBe('rgb(122, 162, 247)');

    cleanup();
    root.remove();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
});

describe('createTerminalBackgroundFilter', () => {
  it('handles OSC 11 sequences split across terminal data packets', () => {
    const filter = createTerminalBackgroundFilter();

    expect(filter.process('before\x1b]11;#111')).toBe('before');
    expect(filter.process('111\x1b\\after')).toBe('after');
  });

  it('drops an incomplete background color sequence when the terminal exits', () => {
    const filter = createTerminalBackgroundFilter();

    expect(filter.process('before\x1b]11;#111')).toBe('before');
    expect(filter.flush()).toBe('');
  });
});
