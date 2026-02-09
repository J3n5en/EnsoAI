import { spawn } from 'node:child_process';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';
import { getProxyEnvVars } from '../proxy/ProxyConfig';
import { getEnhancedPath } from '../terminal/PtyManager';
import { withSafeDirectoryEnv } from './safeDirectory';

export function decodeBuffer(buffer: Buffer): string {
  if (buffer.length === 0) return '';
  const detected = jschardet.detect(buffer);
  const encoding = detected?.encoding || 'utf-8';
  return iconv.decode(buffer, encoding);
}

export function gitShowBuffer(workdir: string, ref: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    const proc = spawn('git', ['show', ref], {
      cwd: workdir,
      windowsHide: true,
      env: withSafeDirectoryEnv(
        {
          ...process.env,
          ...getProxyEnvVars(),
          PATH: getEnhancedPath(),
        },
        workdir
      ),
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolve(Buffer.alloc(0));
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    proc.on('error', () => {
      resolve(Buffer.alloc(0));
    });
  });
}

export async function gitShow(workdir: string, ref: string): Promise<string> {
  const buffer = await gitShowBuffer(workdir, ref);
  return decodeBuffer(buffer);
}
