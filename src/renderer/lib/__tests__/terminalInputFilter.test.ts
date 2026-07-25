import { describe, expect, it } from 'vitest';
import { stripTerminalColorQueryResponses } from '../terminalInputFilter';

describe('stripTerminalColorQueryResponses', () => {
  it('removes OSC 10 and OSC 11 rgb responses terminated by ST', () => {
    const data = 'a\x1b]10;rgb:f8f8/f8f8/f2f2\x1b\\\x1b]11;rgb:2828/2a2a/3636\x1b\\b';

    expect(stripTerminalColorQueryResponses(data)).toBe('ab');
  });

  it('removes BEL terminated color responses', () => {
    expect(stripTerminalColorQueryResponses('\x1b]10;rgb:ffff/ffff/ffff\x07typed')).toBe('typed');
  });

  it('keeps normal input and unrelated OSC responses', () => {
    const data = 'hello\x1b]0;terminal title\x1b\\';

    expect(stripTerminalColorQueryResponses(data)).toBe(data);
  });
});
