import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseQueryResult } from '@shared/types';
import Database from 'better-sqlite3';

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
  }

  private runMigrations(): void {
    // Create migrations table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Run initial migration
    const applied = this.db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r: any) => r.name);

    if (!applied.includes('001_initial')) {
      const migrationPath = join(__dirname, 'migrations/001_initial.sql');
      try {
        const sql = readFileSync(migrationPath, 'utf-8');
        this.db.exec(sql);
      } catch {
        // Migration file may not exist in dev, run inline
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id INTEGER NOT NULL,
            agent_id TEXT NOT NULL,
            messages TEXT NOT NULL DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
        `);
      }

      this.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run('001_initial');
    }
  }

  query<T = unknown>(sql: string, params?: unknown[]): DatabaseQueryResult<T> {
    const stmt = this.db.prepare(sql);
    const rows = params ? stmt.all(...params) : stmt.all();
    return { rows: rows as T[] };
  }

  execute(sql: string, params?: unknown[]): DatabaseQueryResult {
    const stmt = this.db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return {
      rows: [],
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  close(): void {
    this.db.close();
  }
}
