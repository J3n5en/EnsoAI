const WINDOWS_11_25H2_MIN_BUILD = 26200;

export function shouldEnableWindowsConptyCompatibility(
  platform: string,
  osRelease: string
): boolean {
  if (platform !== 'win32') return false;

  const build = Number.parseInt(osRelease.split('.')[2] ?? '', 10);
  return Number.isFinite(build) && build < WINDOWS_11_25H2_MIN_BUILD;
}
