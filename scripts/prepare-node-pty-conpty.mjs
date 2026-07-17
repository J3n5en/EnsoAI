import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodePtyRoot = path.join(repoRoot, 'node_modules', 'node-pty');
const releaseDir = path.join(nodePtyRoot, 'build', 'Release');
const thirdPartyDir = path.join(nodePtyRoot, 'third_party', 'conpty');
const targetDir = path.join(releaseDir, 'conpty');

if (process.platform !== 'win32') {
  process.exit(0);
}

const archMap = {
  x64: 'win10-x64',
  arm64: 'win10-arm64',
};

const archFolder = archMap[os.arch()];
if (!archFolder) {
  console.warn(`[conpty] unsupported Windows arch: ${os.arch()}`);
  process.exit(0);
}

if (!existsSync(thirdPartyDir)) {
  throw new Error(`[conpty] missing node-pty third_party conpty dir: ${thirdPartyDir}`);
}

const versions = readdirSync(thirdPartyDir).sort().reverse();
const version = versions[0];
if (!version) {
  throw new Error(`[conpty] no bundled conpty version found in ${thirdPartyDir}`);
}

const sourceDir = path.join(thirdPartyDir, version, archFolder);
const files = ['conpty.dll', 'OpenConsole.exe'];
mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const source = path.join(sourceDir, file);
  const target = path.join(targetDir, file);
  if (!existsSync(source)) {
    throw new Error(`[conpty] missing source file: ${source}`);
  }
  copyFileSync(source, target);
  console.log(`[conpty] copied ${source} -> ${target}`);
}
