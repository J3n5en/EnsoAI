import { rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { CodexLatestSessionResult, CodexSessionListItem } from '@shared/types';
import sqlite3 from 'sqlite3';
import type { CodexSessionMetadata } from './CodexHistoryMetadata';
import { normalizeCwd } from './CodexHistoryMetadata';

const BUSY_TIMEOUT_MS = 3000;

export interface CodexIndexListQuery {
  cwd?: string;
  maxSessions?: number;
}

export interface CodexIndexLatestQuery {
  cwd?: string;
  startedAfter?: number;
}

interface SessionRow {
  session_id: string;
  file_path: string;
  cwd: string | null;
  title: string | null;
  model: string | null;
  model_provider: string | null;
  timestamp: string | null;
  modified_at_ms: number;
}

interface LatestSessionRow {
  session_id: string;
  file_path: string;
}

interface FilePathRow {
  file_path: string;
}

interface StateRow {
  value: string;
}

export interface CodexIndexedFileFingerprint {
  fileMtimeMs: number;
  fileSize: number;
}

interface IndexedFileFingerprintRow {
  file_path: string;
  file_mtime_ms: number;
  file_size: number;
}

function dbRun(database: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    database.run(sql, params, (error: Error | null) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function dbGet<T>(
  database: sqlite3.Database,
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error: Error | null, row: T | undefined) => {
      if (error) return reject(error);
      resolve(row);
    });
  });
}

function dbAll<T>(database: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error: Error | null, rows: T[]) => {
      if (error) return reject(error);
      resolve(rows ?? []);
    });
  });
}

function dbExec(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    database.exec(sql, (error: Error | null) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function closeDatabase(database: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    database.close((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

export class CodexHistoryIndexStore {
  private database: sqlite3.Database | null = null;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly dbPath: string) {}

  async initialize(): Promise<void> {
    try {
      this.database = await this.openDatabase();
      await this.createSchema();
    } catch (error) {
      console.warn('[CodexHistoryIndexStore] 数据库初始化失败，正在创建新索引：', error);
      await this.close().catch((closeError: unknown) => {
        console.warn('[CodexHistoryIndexStore] 关闭失败的数据库时出错：', closeError);
      });
      await this.recoverFromCorruption();
      this.database = await this.openDatabase();
      await this.createSchema();
    }
  }

  async close(): Promise<void> {
    await this.waitForPendingWrites();
    if (!this.database) return;
    const database = this.database;
    this.database = null;
    await closeDatabase(database);
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeTail.then(operation);
    this.writeTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async waitForPendingWrites(): Promise<void> {
    await this.writeTail;
  }

  async upsertSession(record: CodexSessionMetadata): Promise<void> {
    return this.enqueueWrite(async () => {
      const database = this.getDatabase();
      await dbRun(database, 'BEGIN TRANSACTION');
      try {
        await this.writeSession(database, record);
        await dbRun(database, 'COMMIT');
      } catch (error) {
        await dbRun(database, 'ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }

  async upsertSessions(records: CodexSessionMetadata[]): Promise<void> {
    if (records.length === 0) return;

    return this.enqueueWrite(async () => {
      const database = this.getDatabase();
      await dbRun(database, 'BEGIN TRANSACTION');
      try {
        for (const record of records) await this.writeSession(database, record);
        await dbRun(database, 'COMMIT');
      } catch (error) {
        await dbRun(database, 'ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const database = this.getDatabase();
      await dbRun(database, 'BEGIN TRANSACTION');
      try {
        await dbRun(
          database,
          'DELETE FROM codex_session_cwds WHERE session_id IN (SELECT session_id FROM codex_sessions WHERE file_path = ?)',
          [filePath]
        );
        await dbRun(database, 'DELETE FROM codex_sessions WHERE file_path = ?', [filePath]);
        await dbRun(database, 'COMMIT');
      } catch (error) {
        await dbRun(database, 'ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }

  async deleteMissingFiles(filePaths: Set<string>): Promise<void> {
    const paths = [...filePaths];
    const condition =
      paths.length === 0 ? '' : ` WHERE file_path NOT IN (${paths.map(() => '?').join(', ')})`;
    const childCondition =
      paths.length === 0 ? '' : ` WHERE file_path NOT IN (${paths.map(() => '?').join(', ')})`;

    return this.enqueueWrite(async () => {
      const database = this.getDatabase();
      await dbRun(database, 'BEGIN TRANSACTION');
      try {
        await dbRun(
          database,
          `DELETE FROM codex_session_cwds WHERE session_id IN (SELECT session_id FROM codex_sessions${childCondition})`,
          paths
        );
        await dbRun(database, `DELETE FROM codex_sessions${condition}`, paths);
        await dbRun(database, 'COMMIT');
      } catch (error) {
        await dbRun(database, 'ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }

  async listSessions(query: CodexIndexListQuery): Promise<CodexSessionListItem[]> {
    await this.waitForPendingWrites();
    const database = this.getDatabase();
    const params: unknown[] = [];
    let sql = `SELECT sessions.session_id, sessions.file_path, sessions.cwd, sessions.title,
      sessions.model, sessions.model_provider, sessions.timestamp, sessions.modified_at_ms
      FROM codex_sessions AS sessions`;

    if (query.cwd) {
      sql +=
        ' INNER JOIN codex_session_cwds AS cwd_rows ON cwd_rows.session_id = sessions.session_id WHERE cwd_rows.cwd_normalized = ?';
      params.push(normalizeCwd(query.cwd));
    }

    sql += ' ORDER BY sessions.modified_at_ms DESC';
    if (query.maxSessions !== undefined) {
      sql += ' LIMIT ?';
      params.push(Math.max(0, query.maxSessions));
    }

    const rows = await dbAll<SessionRow>(database, sql, params);
    return rows.map((row) => ({
      sessionId: row.session_id,
      filePath: row.file_path,
      ...(row.cwd ? { cwd: row.cwd } : {}),
      ...(row.title ? { title: row.title } : {}),
      ...(row.model ? { model: row.model } : {}),
      ...(row.model_provider ? { modelProvider: row.model_provider } : {}),
      ...(row.timestamp ? { timestamp: row.timestamp } : {}),
      modifiedAt: row.modified_at_ms,
    }));
  }

  async findLatest(query: CodexIndexLatestQuery): Promise<CodexLatestSessionResult | null> {
    await this.waitForPendingWrites();
    const database = this.getDatabase();
    const conditions: string[] = ['sessions.created_at_ms >= ?'];
    const params: unknown[] = [query.startedAfter ?? 0];
    let sql = 'SELECT sessions.session_id, sessions.file_path FROM codex_sessions AS sessions';

    if (query.cwd) {
      sql +=
        ' INNER JOIN codex_session_cwds AS cwd_rows ON cwd_rows.session_id = sessions.session_id';
      conditions.push('cwd_rows.cwd_normalized = ?');
      params.push(normalizeCwd(query.cwd));
    }

    sql += ` WHERE ${conditions.join(' AND ')} ORDER BY sessions.created_at_ms DESC LIMIT 1`;
    const row = await dbGet<LatestSessionRow>(database, sql, params);
    return row ? { sessionId: row.session_id, filePath: row.file_path } : null;
  }

  async getSessionFilePath(sessionId: string): Promise<string | null> {
    await this.waitForPendingWrites();
    const row = await dbGet<FilePathRow>(
      this.getDatabase(),
      'SELECT file_path FROM codex_sessions WHERE session_id = ?',
      [sessionId]
    );
    return row?.file_path ?? null;
  }

  async getState(key: string): Promise<string | null> {
    await this.waitForPendingWrites();
    const row = await dbGet<StateRow>(
      this.getDatabase(),
      'SELECT value FROM codex_index_state WHERE key = ?',
      [key]
    );
    return row?.value ?? null;
  }

  async setState(key: string, value: string): Promise<void> {
    return this.enqueueWrite(() =>
      dbRun(
        this.getDatabase(),
        `INSERT INTO codex_index_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value]
      )
    );
  }

  async getFileFingerprints(): Promise<Map<string, CodexIndexedFileFingerprint>> {
    await this.waitForPendingWrites();
    const rows = await dbAll<IndexedFileFingerprintRow>(
      this.getDatabase(),
      'SELECT file_path, file_mtime_ms, file_size FROM codex_sessions'
    );
    return new Map(
      rows.map((row) => [
        row.file_path,
        { fileMtimeMs: row.file_mtime_ms, fileSize: row.file_size },
      ])
    );
  }

  private getDatabase(): sqlite3.Database {
    if (!this.database) {
      throw new Error('[CodexHistoryIndexStore] 数据库尚未初始化，请先调用 initialize()。');
    }
    return this.database;
  }

  private openDatabase(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      const database = new sqlite3.Database(
        this.dbPath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        (error) => {
          if (error) return reject(error);
          database.configure('busyTimeout', BUSY_TIMEOUT_MS);
          resolve(database);
        }
      );
    });
  }

  private async createSchema(): Promise<void> {
    await dbExec(
      this.getDatabase(),
      `CREATE TABLE IF NOT EXISTS codex_sessions (
        session_id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        cwd TEXT,
        title TEXT,
        model TEXT,
        model_provider TEXT,
        timestamp TEXT,
        created_at_ms INTEGER NOT NULL,
        modified_at_ms INTEGER NOT NULL,
        file_mtime_ms INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        last_indexed_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS codex_session_cwds (
        session_id TEXT NOT NULL,
        cwd_normalized TEXT NOT NULL,
        PRIMARY KEY (session_id, cwd_normalized)
      );
      CREATE TABLE IF NOT EXISTS codex_index_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_codex_sessions_modified ON codex_sessions(modified_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_codex_sessions_created ON codex_sessions(created_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_codex_sessions_file_path ON codex_sessions(file_path);
      CREATE INDEX IF NOT EXISTS idx_codex_session_cwds_cwd ON codex_session_cwds(cwd_normalized, session_id);
      CREATE INDEX IF NOT EXISTS idx_codex_session_cwds_session ON codex_session_cwds(session_id);`
    );
  }

  private async writeSession(
    database: sqlite3.Database,
    record: CodexSessionMetadata
  ): Promise<void> {
    // 同一事务内更新主记录和 cwd 映射，避免查询到半完成的数据。
    await dbRun(
      database,
      `INSERT INTO codex_sessions (
        session_id, file_path, cwd, title, model, model_provider, timestamp,
        created_at_ms, modified_at_ms, file_mtime_ms, file_size, last_indexed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        file_path = excluded.file_path,
        cwd = excluded.cwd,
        title = excluded.title,
        model = excluded.model,
        model_provider = excluded.model_provider,
        timestamp = excluded.timestamp,
        created_at_ms = excluded.created_at_ms,
        modified_at_ms = excluded.modified_at_ms,
        file_mtime_ms = excluded.file_mtime_ms,
        file_size = excluded.file_size,
        last_indexed_at_ms = excluded.last_indexed_at_ms`,
      [
        record.sessionId,
        record.filePath,
        record.cwd ?? null,
        record.title ?? null,
        record.model ?? null,
        record.modelProvider ?? null,
        record.timestamp ?? null,
        record.createdAtMs,
        record.modifiedAtMs,
        record.fileMtimeMs,
        record.fileSize,
        Date.now(),
      ]
    );
    await dbRun(database, 'DELETE FROM codex_session_cwds WHERE session_id = ?', [
      record.sessionId,
    ]);
    for (const cwd of new Set(record.cwdNormalizedValues)) {
      await dbRun(
        database,
        'INSERT INTO codex_session_cwds (session_id, cwd_normalized) VALUES (?, ?)',
        [record.sessionId, cwd]
      );
    }
  }

  private async recoverFromCorruption(): Promise<void> {
    const corruptedPath = path.join(
      path.dirname(this.dbPath),
      `codex-history-index.corrupt-${Date.now()}.db`
    );

    try {
      await rename(this.dbPath, corruptedPath);
    } catch (renameError) {
      console.warn('[CodexHistoryIndexStore] 无法重命名损坏的数据库，将删除原文件：', renameError);
      await unlink(this.dbPath).catch((unlinkError: unknown) => {
        const code =
          unlinkError instanceof Error && 'code' in unlinkError ? unlinkError.code : undefined;
        if (code !== 'ENOENT') throw unlinkError;
      });
    }
  }
}
