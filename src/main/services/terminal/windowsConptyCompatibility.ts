import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { release } from 'node:os';
import path from 'node:path';
import { shouldEnableWindowsConptyCompatibility } from '@shared/utils/windowsConpty';

const require = createRequire(import.meta.url);

export function nodePtyBundledConptyRuntimeDir(): string {
  const nodePtyEntry = require.resolve('node-pty');
  const runtimeDir = path.join(path.dirname(nodePtyEntry), '..', 'build', 'Release', 'conpty');
  return runtimeDir.replace('app.asar', 'app.asar.unpacked');
}

export function hasBundledConptyRuntime(
  runtimeDir: string,
  fileExists: (file: string) => boolean = existsSync
): boolean {
  return (
    fileExists(path.join(runtimeDir, 'conpty.dll')) &&
    fileExists(path.join(runtimeDir, 'OpenConsole.exe'))
  );
}

export interface WindowsConptyCompatibilityInput {
  platform?: NodeJS.Platform;
  osRelease?: string;
  settingEnabled?: boolean;
  runtimeDir?: string;
  fileExists?: (file: string) => boolean;
}

export function createWindowsConptyCompatibilityOptions({
  platform = process.platform,
  osRelease = release(),
  settingEnabled,
  runtimeDir,
  fileExists = existsSync,
}: WindowsConptyCompatibilityInput = {}): { useConptyDll: boolean; reason: string } {
  if (platform !== 'win32') return { useConptyDll: false, reason: 'non-windows' };

  const enabled = settingEnabled ?? shouldEnableWindowsConptyCompatibility(platform, osRelease);
  if (!enabled) {
    return {
      useConptyDll: false,
      reason: settingEnabled === false ? 'disabled' : 'not-recommended',
    };
  }

  if (!hasBundledConptyRuntime(runtimeDir ?? nodePtyBundledConptyRuntimeDir(), fileExists)) {
    return { useConptyDll: false, reason: 'runtime-missing' };
  }

  return { useConptyDll: true, reason: settingEnabled === true ? 'enabled' : 'recommended' };
}
