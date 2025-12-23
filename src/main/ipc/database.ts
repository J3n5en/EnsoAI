import { join } from 'node:path';
import { IPC_CHANNELS } from '@shared/types';
import { app, ipcMain } from 'electron';
import { DatabaseService } from '../services/database/DatabaseService';

let db: DatabaseService | null = null;

function getDatabase(): DatabaseService {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'aizen.db');
    db = new DatabaseService(dbPath);
  }
  return db;
}

export function registerDatabaseHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DB_QUERY, async (_, sql: string, params?: unknown[]) => {
    const database = getDatabase();
    return database.query(sql, params);
  });

  ipcMain.handle(IPC_CHANNELS.DB_EXECUTE, async (_, sql: string, params?: unknown[]) => {
    const database = getDatabase();
    return database.execute(sql, params);
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_PATH, async (_, name: string) => {
    return app.getPath(name as any);
  });
}
