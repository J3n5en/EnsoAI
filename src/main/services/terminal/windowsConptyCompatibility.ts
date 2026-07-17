import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

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
  settingEnabled?: boolean;
  runtimeDir?: string;
  fileExists?: (file: string) => boolean;
}

export function createWindowsConptyCompatibilityOptions({
  platform = process.platform,
  settingEnabled,
  runtimeDir = nodePtyBundledConptyRuntimeDir(),
  fileExists = existsSync,
}: WindowsConptyCompatibilityInput = {}): { useConptyDll: boolean; reason: string } {
  const enabled = settingEnabled === true;

  if (!enabled) return { useConptyDll: false, reason: 'disabled' };
  if (platform !== 'win32') return { useConptyDll: false, reason: 'non-windows' };

  if (!hasBundledConptyRuntime(runtimeDir, fileExists)) {
    return { useConptyDll: false, reason: 'runtime-missing' };
  }

  return { useConptyDll: true, reason: 'enabled' };
}
