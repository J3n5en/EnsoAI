import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RemotePlatform } from '@shared/types';
import { app } from 'electron';
import pkg from '../../../../package.json';
import { REMOTE_SERVER_VERSION } from './RemoteHelperSource';

export type RemoteRuntimeArch = 'x64' | 'arm64';
export type RemoteRuntimeArchiveKind = 'tar.gz';

export interface RemoteRuntimeAsset {
  platform: RemotePlatform;
  arch: RemoteRuntimeArch;
  archiveName: string;
  checksum?: string;
  checksumFileName?: string;
  kind: RemoteRuntimeArchiveKind;
  nodeVersion: string;
  url: string;
  checksumUrl?: string;
}

export const MANAGED_REMOTE_NODE_VERSION = '20.19.0';
export const MANAGED_REMOTE_RUNTIME_DIR = '.ensoai/remote-runtime';

const GITHUB_RELEASE_TAG = `v${pkg.version}`;
const GITHUB_RELEASE_ASSET_BASE_URL = `https://github.com/J3n5en/EnsoAI/releases/download/${GITHUB_RELEASE_TAG}`;
const REMOTE_RUNTIME_DEV_SCRIPT = join(process.cwd(), 'scripts', 'build-remote-runtime-bundle.mjs');

function buildManagedLinuxRuntimeArchiveName(arch: RemoteRuntimeArch): string {
  return `enso-remote-runtime-v${REMOTE_SERVER_VERSION}-node-v${MANAGED_REMOTE_NODE_VERSION}-linux-${arch}.tar.gz`;
}

function buildReleaseAssetUrl(fileName: string): string {
  return `${GITHUB_RELEASE_ASSET_BASE_URL}/${fileName}`;
}

const REMOTE_RUNTIME_ARCHIVES: Record<string, Omit<RemoteRuntimeAsset, 'url'>> = {
  'linux-arm64': {
    platform: 'linux',
    arch: 'arm64',
    archiveName: buildManagedLinuxRuntimeArchiveName('arm64'),
    checksumFileName: `${buildManagedLinuxRuntimeArchiveName('arm64')}.sha256`,
    kind: 'tar.gz',
    nodeVersion: MANAGED_REMOTE_NODE_VERSION,
  },
  'linux-x64': {
    platform: 'linux',
    arch: 'x64',
    archiveName: buildManagedLinuxRuntimeArchiveName('x64'),
    checksumFileName: `${buildManagedLinuxRuntimeArchiveName('x64')}.sha256`,
    kind: 'tar.gz',
    nodeVersion: MANAGED_REMOTE_NODE_VERSION,
  },
};

function getRuntimeCacheRoot(): string {
  return join(app.getPath('userData'), 'remote-runtime-cache');
}

function getLocalRuntimeAssetCandidates(fileName: string): string[] {
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, 'remote-runtime', fileName),
        join(app.getAppPath(), 'resources', 'remote-runtime', fileName),
      ]
    : [
        join(process.cwd(), 'resources', 'remote-runtime', fileName),
        join(process.cwd(), 'dist', 'remote-runtime', fileName),
      ];

  return [...new Set(candidates)];
}

function resolveLocalRuntimeAssetPath(fileName: string): {
  path: string | null;
  candidates: string[];
} {
  const candidates = getLocalRuntimeAssetCandidates(fileName);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { path: candidate, candidates };
    }
  }

  return {
    path: null,
    candidates,
  };
}

function buildChecksumDownloadUrl(asset: Omit<RemoteRuntimeAsset, 'url'>): string | undefined {
  if (asset.checksumFileName) {
    return buildReleaseAssetUrl(asset.checksumFileName);
  }
  return undefined;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

async function fileHasExpectedChecksum(filePath: string, checksum: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  return (await sha256File(filePath)) === checksum;
}

async function readChecksumFile(filePath: string): Promise<string | null> {
  try {
    const raw = createReadStream(filePath, { encoding: 'utf8' });
    let content = '';
    for await (const chunk of raw) {
      content += chunk;
    }
    const match = content.trim().match(/^([a-f0-9]{64})\b/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function getHostLinuxRuntimeArch(): RemoteRuntimeArch | null {
  if (process.platform !== 'linux') {
    return null;
  }

  if (process.arch === 'x64' || process.arch === 'arm64') {
    return process.arch;
  }

  return null;
}

async function writeResponseBodyToFile(
  url: string,
  destinationPath: string,
  context?: {
    fileName: string;
    role: 'archive' | 'checksum';
    source: 'release' | 'nodejs';
  }
): Promise<void> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'EnsoAI Remote Runtime Installer',
    },
  });

  if (!response.ok || !response.body) {
    if (context?.source === 'release') {
      throw new Error(
        [
          'Failed to download remote runtime release asset.',
          `tag: ${GITHUB_RELEASE_TAG}`,
          `file: ${context.fileName}`,
          `kind: ${context.role}`,
          `status: ${response.status} ${response.statusText}`,
          `url: ${url}`,
        ].join('\n')
      );
    }

    throw new Error(
      [
        `Failed to download remote runtime archive: ${response.status} ${response.statusText}`,
        `url: ${url}`,
      ].join('\n')
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(destinationPath, Buffer.from(arrayBuffer));
}

async function runLocalCommand(
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: process.cwd(),
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
          reject(new Error(details || error.message));
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

async function buildLocalLinuxRuntimeBundle(arch: RemoteRuntimeArch): Promise<void> {
  if (!existsSync(REMOTE_RUNTIME_DEV_SCRIPT)) {
    throw new Error(`Remote runtime bundle builder not found: ${REMOTE_RUNTIME_DEV_SCRIPT}`);
  }

  const nodeExecutable = process.env.npm_node_execpath || process.execPath;
  await runLocalCommand(nodeExecutable, [REMOTE_RUNTIME_DEV_SCRIPT, `--arch=${arch}`]);
}

function createMissingDevelopmentLinuxRuntimeError(args: {
  asset: RemoteRuntimeAsset;
  bundleCandidates: string[];
  checksumCandidates: string[];
  cachePath: string;
  cacheChecksumPath: string | null;
  buildError?: Error;
}): Error {
  const hostArch = getHostLinuxRuntimeArch();
  const lines = [
    'Linux remote runtime bundle is not available in development mode.',
    `asset: ${args.asset.archiveName}`,
    `helperVersion: ${REMOTE_SERVER_VERSION}`,
    'local search paths:',
    ...args.bundleCandidates.map((candidate) => `- ${candidate}`),
  ];

  if (args.checksumCandidates.length > 0) {
    lines.push(
      'local checksum paths:',
      ...args.checksumCandidates.map((candidate) => `- ${candidate}`)
    );
  }

  lines.push(`cache archive: ${args.cachePath}`);
  if (args.cacheChecksumPath) {
    lines.push(`cache checksum: ${args.cacheChecksumPath}`);
  }

  if (hostArch && args.asset.arch === hostArch) {
    lines.push(
      `suggested command: node scripts/build-remote-runtime-bundle.mjs --arch=${args.asset.arch}`
    );
  } else {
    lines.push(
      `current host architecture: ${hostArch ?? process.arch}`,
      'cross-architecture Linux runtime bundles must be produced by CI or provided manually.'
    );
  }

  lines.push('Linux remote runtime release downloads are disabled in development mode.');

  if (args.buildError) {
    lines.push('local build failed:', args.buildError.message);
  }

  return new Error(lines.join('\n'));
}

async function resolveExpectedChecksum(
  asset: RemoteRuntimeAsset,
  checksumFilePath?: string | null
): Promise<string | null> {
  if (asset.checksum) {
    return asset.checksum;
  }

  if (!checksumFilePath) {
    return null;
  }

  return readChecksumFile(checksumFilePath);
}

export function getRemoteRuntimeAsset(
  platform: RemotePlatform,
  arch: RemoteRuntimeArch
): RemoteRuntimeAsset {
  const key = `${platform}-${arch}`;
  const asset = REMOTE_RUNTIME_ARCHIVES[key];
  if (!asset) {
    throw new Error(`Unsupported remote runtime target: ${key}`);
  }

  return {
    ...asset,
    url: buildReleaseAssetUrl(asset.archiveName),
    checksumUrl: buildChecksumDownloadUrl(asset),
  };
}

export async function ensureRemoteRuntimeAsset(
  platform: RemotePlatform,
  arch: RemoteRuntimeArch
): Promise<{
  asset: RemoteRuntimeAsset;
  localPath: string;
  source: 'bundle' | 'cache' | 'download';
}> {
  const asset = getRemoteRuntimeAsset(platform, arch);
  const resolveLocalBundle = async (): Promise<{
    path: string | null;
    checksumPath: string | null;
    bundleCandidates: string[];
    checksumCandidates: string[];
    checksum: string | null;
  }> => {
    const localBundle = resolveLocalRuntimeAssetPath(asset.archiveName);
    const localChecksum = asset.checksumFileName
      ? resolveLocalRuntimeAssetPath(asset.checksumFileName)
      : { path: null, candidates: [] };
    const checksum = await resolveExpectedChecksum(asset, localChecksum.path);

    return {
      path: localBundle.path,
      checksumPath: localChecksum.path,
      bundleCandidates: localBundle.candidates,
      checksumCandidates: localChecksum.candidates,
      checksum,
    };
  };

  let localBundle = await resolveLocalBundle();
  if (
    localBundle.path &&
    localBundle.checksum &&
    (await fileHasExpectedChecksum(localBundle.path, localBundle.checksum))
  ) {
    return {
      asset,
      localPath: localBundle.path,
      source: 'bundle',
    };
  }

  const cacheRoot = getRuntimeCacheRoot();
  await mkdir(cacheRoot, { recursive: true });
  const cachedPath = join(cacheRoot, asset.archiveName);
  const cachedChecksumPath = asset.checksumFileName
    ? join(cacheRoot, asset.checksumFileName)
    : null;

  let devBuildError: Error | undefined;
  if (!app.isPackaged && asset.platform === 'linux') {
    const hostArch = getHostLinuxRuntimeArch();
    if (hostArch && hostArch === asset.arch) {
      try {
        await buildLocalLinuxRuntimeBundle(asset.arch);
      } catch (error) {
        devBuildError = error instanceof Error ? error : new Error(String(error));
      }

      localBundle = await resolveLocalBundle();
      if (
        localBundle.path &&
        localBundle.checksum &&
        (await fileHasExpectedChecksum(localBundle.path, localBundle.checksum))
      ) {
        return {
          asset,
          localPath: localBundle.path,
          source: 'bundle',
        };
      }
    }
  }

  const cachedChecksum = await resolveExpectedChecksum(asset, cachedChecksumPath);
  if (cachedChecksum && (await fileHasExpectedChecksum(cachedPath, cachedChecksum))) {
    return {
      asset,
      localPath: cachedPath,
      source: 'cache',
    };
  }

  if (!app.isPackaged && asset.platform === 'linux') {
    throw createMissingDevelopmentLinuxRuntimeError({
      asset,
      bundleCandidates: localBundle.bundleCandidates,
      checksumCandidates: localBundle.checksumCandidates,
      cachePath: cachedPath,
      cacheChecksumPath: cachedChecksumPath ?? null,
      buildError: devBuildError,
    });
  }

  const tempPath = `${cachedPath}.download`;
  const tempChecksumPath = cachedChecksumPath ? `${cachedChecksumPath}.download` : null;
  await rm(tempPath, { force: true }).catch(() => {});
  if (tempChecksumPath) {
    await rm(tempChecksumPath, { force: true }).catch(() => {});
  }

  let expectedChecksum = asset.checksum;
  if (!expectedChecksum) {
    if (!asset.checksumUrl || !tempChecksumPath) {
      throw new Error(`Missing checksum source for remote runtime asset: ${asset.archiveName}`);
    }

    await writeResponseBodyToFile(asset.checksumUrl, tempChecksumPath, {
      fileName: asset.checksumFileName ?? asset.archiveName,
      role: 'checksum',
      source: 'release',
    });
    const downloadedChecksum = await readChecksumFile(tempChecksumPath);
    if (!downloadedChecksum) {
      await rm(tempChecksumPath, { force: true }).catch(() => {});
      throw new Error(`Invalid checksum file for remote runtime asset: ${asset.archiveName}`);
    }
    expectedChecksum = downloadedChecksum;
  }

  await writeResponseBodyToFile(asset.url, tempPath, {
    fileName: asset.archiveName,
    role: 'archive',
    source: 'release',
  });

  if (!(await fileHasExpectedChecksum(tempPath, expectedChecksum))) {
    await rm(tempPath, { force: true }).catch(() => {});
    if (tempChecksumPath) {
      await rm(tempChecksumPath, { force: true }).catch(() => {});
    }
    throw new Error(
      `Downloaded remote runtime archive failed checksum verification: ${asset.archiveName}`
    );
  }

  await rename(tempPath, cachedPath);
  if (tempChecksumPath && cachedChecksumPath) {
    await rename(tempChecksumPath, cachedChecksumPath);
  }
  return {
    asset,
    localPath: cachedPath,
    source: 'download',
  };
}
