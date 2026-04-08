#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const outputRoot = join(repoRoot, 'dist', 'remote-runtime');

function parseArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function readConstant(relativePath, pattern) {
  const filePath = join(repoRoot, relativePath);
  return readFile(filePath, 'utf8').then((content) => {
    const match = content.match(pattern);
    if (!match?.[1]) {
      throw new Error(`Failed to resolve constant from ${relativePath}`);
    }
    return match[1];
  });
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'EnsoAI Remote Runtime Builder',
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, buffer);
}

async function ensureFileExists(filePath) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`Required file not found: ${filePath}`);
  }
}

async function main() {
  const arch = parseArg('arch');
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error('Usage: node scripts/build-remote-runtime-bundle.mjs --arch=x64|arm64');
  }

  if (process.platform !== 'linux') {
    throw new Error('Remote runtime bundle builder currently supports Linux runners only');
  }

  const [nodeVersion, serverVersion] = await Promise.all([
    readConstant(
      'src/main/services/remote/RemoteRuntimeAssets.ts',
      /MANAGED_REMOTE_NODE_VERSION = '([^']+)'/
    ),
    readConstant(
      'src/main/services/remote/RemoteHelperSource.ts',
      /REMOTE_SERVER_VERSION = '([^']+)'/
    ),
  ]);

  const nodeArchiveName = `node-v${nodeVersion}-linux-${arch}.tar.gz`;
  const nodeArchiveUrl = `https://nodejs.org/dist/v${nodeVersion}/${nodeArchiveName}`;
  const runtimeArchiveName = `enso-remote-runtime-v${serverVersion}-node-v${nodeVersion}-linux-${arch}.tar.gz`;

  const tempRoot = await mkdtemp(join(tmpdir(), `enso-remote-runtime-${arch}-`));
  const downloadPath = join(tempRoot, nodeArchiveName);
  const extractRoot = join(tempRoot, 'extract');
  const bundleRoot = join(tempRoot, 'bundle');
  const runtimeDir = join(bundleRoot, 'runtime');
  const nodeModulesDir = join(bundleRoot, 'node_modules');
  const nodePtySourceDir = join(repoRoot, 'node_modules', 'node-pty');
  const nodePtyDestDir = join(nodeModulesDir, 'node-pty');
  const nodeFolder = `node-v${nodeVersion}-linux-${arch}`;
  const archiveOutputPath = join(outputRoot, runtimeArchiveName);
  const checksumOutputPath = `${archiveOutputPath}.sha256`;

  try {
    await ensureFileExists(join(nodePtySourceDir, 'package.json'));
    await ensureFileExists(join(nodePtySourceDir, 'lib', 'index.js'));
    await ensureFileExists(join(nodePtySourceDir, 'build', 'Release', 'pty.node'));

    await mkdir(outputRoot, { recursive: true });
    await mkdir(extractRoot, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await mkdir(nodePtyDestDir, { recursive: true });

    await downloadFile(nodeArchiveUrl, downloadPath);
    await execFileAsync('tar', ['-xzf', downloadPath, '-C', extractRoot]);

    await cp(join(extractRoot, nodeFolder), join(runtimeDir, nodeFolder), {
      recursive: true,
      force: true,
    });

    await cp(join(nodePtySourceDir, 'package.json'), join(nodePtyDestDir, 'package.json'));
    await cp(join(nodePtySourceDir, 'lib'), join(nodePtyDestDir, 'lib'), {
      recursive: true,
      force: true,
    });
    await mkdir(join(nodePtyDestDir, 'build', 'Release'), { recursive: true });
    await cp(
      join(nodePtySourceDir, 'build', 'Release', 'pty.node'),
      join(nodePtyDestDir, 'build', 'Release', 'pty.node')
    );

    await execFileAsync('tar', ['-czf', archiveOutputPath, '-C', bundleRoot, '.']);
    const checksum = await sha256File(archiveOutputPath);
    await writeFile(checksumOutputPath, `${checksum}  ${runtimeArchiveName}\n`, 'utf8');

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        arch,
        nodeVersion,
        serverVersion,
        archive: archiveOutputPath,
        checksumFile: checksumOutputPath,
      })}\n`
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
