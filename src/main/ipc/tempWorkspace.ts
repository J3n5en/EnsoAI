import { constants } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type TempWorkspaceCheckResult,
  type TempWorkspaceCreateResult,
  type TempWorkspaceRemoveResult,
} from '@shared/types';
import { ipcMain } from 'electron';
import { GitService } from '../services/git/GitService';
import { stopWatchersInDirectory } from './files';
import { unregisterAuthorizedWorkdir } from './git';
import { ptyManager } from './terminal';

function expandHome(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return homedir();
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function formatTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function mapError(err: unknown, fallbackCode = 'UNKNOWN'): { code: string; message: string } {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: string }).code || fallbackCode);
    const message =
      err instanceof Error
        ? err.message
        : typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : String(err);
    return { code, message };
  }
  return { code: fallbackCode, message: err instanceof Error ? err.message : String(err) };
}

async function checkPathWritable(dirPath: string): Promise<TempWorkspaceCheckResult> {
  try {
    await mkdir(dirPath, { recursive: true });
    const testFile = path.join(dirPath, `.ensoai-permission-${Date.now()}.tmp`);
    await writeFile(testFile, 'test', { encoding: 'utf-8' });
    await access(testFile, constants.R_OK | constants.W_OK);
    await rm(testFile, { force: true });
    return { ok: true };
  } catch (err) {
    const { code, message } = mapError(err, 'EACCES');
    return { ok: false, code, message };
  }
}

export function registerTempWorkspaceHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TEMP_WORKSPACE_CHECK_PATH,
    async (_event, rawPath: string): Promise<TempWorkspaceCheckResult> => {
      const resolved = path.resolve(expandHome(rawPath));
      return checkPathWritable(resolved);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TEMP_WORKSPACE_CREATE,
    async (_event, rawBasePath?: string): Promise<TempWorkspaceCreateResult> => {
      try {
        const basePath = rawBasePath?.trim()
          ? path.resolve(expandHome(rawBasePath.trim()))
          : path.join(homedir(), 'ensoai', 'temporary');
        const baseCheck = await checkPathWritable(basePath);
        if (!baseCheck.ok) {
          return baseCheck;
        }

        const baseName = formatTimestamp();
        let folderName = baseName;
        let targetPath = path.join(basePath, folderName);
        let created = false;

        for (let i = 0; i < 50; i += 1) {
          try {
            await mkdir(targetPath);
            created = true;
            break;
          } catch (err) {
            const { code } = mapError(err);
            if (code !== 'EEXIST') {
              throw err;
            }
            folderName = `${baseName}-${i + 2}`;
            targetPath = path.join(basePath, folderName);
          }
        }

        // Final fallback for extreme collision cases
        if (!created) {
          const suffix = Math.random().toString(36).slice(2, 6);
          folderName = `${baseName}-${suffix}`;
          targetPath = path.join(basePath, folderName);
          await mkdir(targetPath);
        }

        const git = new GitService(targetPath);
        try {
          await git.init();
        } catch (err) {
          await rm(targetPath, { recursive: true, force: true });
          throw err;
        }

        return {
          ok: true,
          item: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            path: targetPath,
            folderName,
            title: folderName,
            createdAt: Date.now(),
          },
        };
      } catch (err) {
        const { code, message } = mapError(err, 'GIT_INIT_FAILED');
        return { ok: false, code, message };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TEMP_WORKSPACE_REMOVE,
    async (_event, dirPath: string): Promise<TempWorkspaceRemoveResult> => {
      try {
        await stopWatchersInDirectory(dirPath);
        ptyManager.destroyByWorkdir(dirPath);
        unregisterAuthorizedWorkdir(dirPath);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await rm(dirPath, { recursive: true, force: true });
        return { ok: true };
      } catch (err) {
        const { code, message } = mapError(err, 'REMOVE_FAILED');
        return { ok: false, code, message };
      }
    }
  );
}
