import { describe, expect, it } from 'vitest';
import {
  createWindowsConptyCompatibilityOptions,
  hasBundledConptyRuntime,
} from '../windowsConptyCompatibility';

describe('windowsConptyCompatibility', () => {
  it('requires both bundled ConPTY runtime files', () => {
    const existing = new Set(['C:\\runtime\\conpty.dll', 'C:\\runtime\\OpenConsole.exe']);
    expect(hasBundledConptyRuntime('C:\\runtime', (file) => existing.has(file))).toBe(true);
    expect(hasBundledConptyRuntime('C:\\missing', () => false)).toBe(false);
  });

  it('enables useConptyDll only when the user setting is enabled', () => {
    const enabled = createWindowsConptyCompatibilityOptions({
      platform: 'win32',
      settingEnabled: true,
      runtimeDir: 'C:\\runtime',
      fileExists: () => true,
    });
    expect(enabled.useConptyDll).toBe(true);

    const disabled = createWindowsConptyCompatibilityOptions({
      platform: 'win32',
      settingEnabled: false,
      runtimeDir: 'C:\\runtime',
      fileExists: () => true,
    });
    expect(disabled.useConptyDll).toBe(false);
  });

  it('keeps useConptyDll disabled by default', () => {
    const result = createWindowsConptyCompatibilityOptions({
      platform: 'win32',
      runtimeDir: 'C:\\runtime',
      fileExists: () => true,
    });
    expect(result.useConptyDll).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('disables useConptyDll when runtime files are missing', () => {
    const result = createWindowsConptyCompatibilityOptions({
      platform: 'win32',
      settingEnabled: true,
      runtimeDir: 'C:\\runtime',
      fileExists: () => false,
    });
    expect(result.useConptyDll).toBe(false);
    expect(result.reason).toBe('runtime-missing');
  });
});
