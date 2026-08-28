import { describe, expect, it } from 'vitest';
import { customProtocolUriToPath, toCustomProtocolFileUrl } from '../fileUrl';

describe('custom protocol file URLs', () => {
  it('round-trips Windows drive paths', () => {
    const filePath = String.raw`C:\Users\test\Pictures\background image.webp`;
    const url = toCustomProtocolFileUrl(filePath, 'local-image');

    expect(url).toBe('local-image://c/Users/test/Pictures/background%20image.webp');
    expect(customProtocolUriToPath(url, 'local-image', 'win32')).toBe(filePath);
  });

  it('round-trips Windows UNC paths', () => {
    const filePath = String.raw`\\wsl.localhost\Ubuntu\home\test\background.png`;
    const url = toCustomProtocolFileUrl(filePath, 'local-image');

    expect(url).toBe('local-image://wsl.localhost/Ubuntu/home/test/background.png');
    expect(customProtocolUriToPath(url, 'local-image', 'win32')).toBe(filePath);
  });
});
