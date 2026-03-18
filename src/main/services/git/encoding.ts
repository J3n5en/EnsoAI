import iconv from 'iconv-lite';
import { isBinaryFile } from 'isbinaryfile';
import jschardet from 'jschardet';
import { spawnGit } from './runtime';

export function decodeBuffer(buffer: Buffer): string {
  if (buffer.length === 0) return '';
  const detected = jschardet.detect(buffer);
  const encoding = detected?.encoding || 'utf-8';
  return iconv.decode(buffer, encoding);
}

/**
 * Detect if a file is binary by checking the file on disk or its git content.
 * Tries disk file first; on ENOENT falls back to git content inspection.
 * Returns false (text) on any detection failure.
 */
export async function detectBinaryFile(
  filePath: string,
  gitWorkdir: string,
  gitRef: string
): Promise<boolean> {
  try {
    return await isBinaryFile(filePath);
  } catch (err: unknown) {
    // File not on disk (deleted/renamed), fall through to git content
    if (
      !(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')
    ) {
      return false;
    }
  }
  try {
    const buffer = await gitShowBuffer(gitWorkdir, gitRef);
    if (buffer.length === 0) return false;
    return await isBinaryFile(buffer, buffer.length);
  } catch {
    return false;
  }
}

export function gitShowBuffer(workdir: string, ref: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    const proc = spawnGit(workdir, ['show', ref], {
      cwd: workdir,
      windowsHide: true,
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
