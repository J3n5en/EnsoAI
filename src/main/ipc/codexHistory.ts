import type {
  CodexHistoryQuery,
  CodexHistoryResult,
  CodexLatestSessionQuery,
  CodexLatestSessionResult,
  CodexSessionListQuery,
  CodexSessionListResult,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import {
  findLatestCodexSession,
  getCodexHistory,
  initializeCodexHistoryIndex,
  listCodexSessions,
} from '../services/codex/CodexHistoryService';

let readyPromise: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (readyPromise) await readyPromise;
}

export function registerCodexHistoryHandlers(): void {
  readyPromise = initializeCodexHistoryIndex().catch((error: unknown) => {
    console.error('[CodexHistory IPC] Failed to initialize index:', error);
  });

  ipcMain.handle(
    IPC_CHANNELS.CODEX_HISTORY_GET,
    async (_event, query: CodexHistoryQuery): Promise<CodexHistoryResult> => {
      await ensureReady();
      return getCodexHistory(query);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CODEX_HISTORY_FIND_LATEST,
    async (_event, query: CodexLatestSessionQuery): Promise<CodexLatestSessionResult | null> => {
      await ensureReady();
      return findLatestCodexSession(query);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CODEX_HISTORY_LIST_SESSIONS,
    async (_event, query: CodexSessionListQuery): Promise<CodexSessionListResult> => {
      await ensureReady();
      return listCodexSessions(query);
    }
  );
}
