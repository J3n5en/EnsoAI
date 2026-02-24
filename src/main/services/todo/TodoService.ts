import { join } from 'node:path';
import { app } from 'electron';
import sqlite3 from 'sqlite3';

const BUSY_TIMEOUT_MS = 3000;

export interface TodoTaskRow {
  id: string;
  repo_path: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  order: number;
  created_at: number;
  updated_at: number;
}

type DbCallback<T> = (err: Error | null, result: T) => void;

function getDbPath(): string {
  return join(app.getPath('userData'), 'todo.db');
}

let db: sqlite3.Database | null = null;

function getDb(): sqlite3.Database {
  if (!db) {
    throw new Error('[TodoService] Database not initialized. Call initialize() first.');
  }
  return db;
}

/** Promisify db.run */
function dbRun(database: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    database.run(sql, params, (err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/** Promisify db.all */
function dbAll<T>(database: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) return reject(err);
      resolve(rows ?? []);
    });
  });
}

/** Promisify db.exec */
function dbExec(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    database.exec(sql, (err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/** Convert a DB row to the frontend TodoTask shape */
function rowToTask(row: TodoTaskRow): {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  order: number;
} {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    order: row.order,
  };
}

export async function initialize(): Promise<void> {
  const dbPath = getDbPath();

  await new Promise<void>((resolve, reject) => {
    db = new sqlite3.Database(
      dbPath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (err) => {
        if (err) return reject(err);
        db!.configure('busyTimeout', BUSY_TIMEOUT_MS);
        resolve();
      }
    );
  });

  await dbExec(
    db!,
    `
    CREATE TABLE IF NOT EXISTS tasks (
      id            TEXT PRIMARY KEY,
      repo_path     TEXT NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      priority      TEXT NOT NULL DEFAULT 'medium',
      status        TEXT NOT NULL DEFAULT 'todo',
      "order"       INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_repo_status ON tasks(repo_path, status);
    `
  );

  console.log('[TodoService] Database initialized at', dbPath);
}

export async function getTasks(repoPath: string): Promise<ReturnType<typeof rowToTask>[]> {
  const rows = await dbAll<TodoTaskRow>(
    getDb(),
    'SELECT * FROM tasks WHERE repo_path = ? ORDER BY status, "order"',
    [repoPath]
  );
  return rows.map(rowToTask);
}

export async function addTask(
  repoPath: string,
  task: {
    id: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    order: number;
    createdAt: number;
    updatedAt: number;
  }
): Promise<ReturnType<typeof rowToTask>> {
  await dbRun(
    getDb(),
    `INSERT INTO tasks (id, repo_path, title, description, priority, status, "order", created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      repoPath,
      task.title,
      task.description,
      task.priority,
      task.status,
      task.order,
      task.createdAt,
      task.updatedAt,
    ]
  );

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    order: task.order,
  };
}

export async function updateTask(
  repoPath: string,
  taskId: string,
  updates: { title?: string; description?: string; priority?: string; status?: string }
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(repoPath, taskId);

  await dbRun(
    getDb(),
    `UPDATE tasks SET ${fields.join(', ')} WHERE repo_path = ? AND id = ?`,
    values
  );
}

export async function deleteTask(repoPath: string, taskId: string): Promise<void> {
  await dbRun(getDb(), 'DELETE FROM tasks WHERE repo_path = ? AND id = ?', [repoPath, taskId]);
}

export async function moveTask(
  repoPath: string,
  taskId: string,
  newStatus: string,
  newOrder: number
): Promise<void> {
  const now = Date.now();
  await dbRun(
    getDb(),
    'UPDATE tasks SET status = ?, "order" = ?, updated_at = ? WHERE repo_path = ? AND id = ?',
    [newStatus, newOrder, now, repoPath, taskId]
  );
}

export async function reorderTasks(
  repoPath: string,
  status: string,
  orderedIds: string[]
): Promise<void> {
  const database = getDb();
  const now = Date.now();

  await dbRun(database, 'BEGIN TRANSACTION');
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await dbRun(
        database,
        'UPDATE tasks SET "order" = ?, updated_at = ? WHERE repo_path = ? AND id = ? AND status = ?',
        [i, now, repoPath, orderedIds[i], status]
      );
    }
    await dbRun(database, 'COMMIT');
  } catch (err) {
    await dbRun(database, 'ROLLBACK').catch(() => {});
    throw err;
  }
}

export async function migrateFromLocalStorage(boardsJson: string): Promise<void> {
  const boards = JSON.parse(boardsJson) as Record<
    string,
    { tasks: Array<{ id: string; title: string; description: string; priority: string; status: string; createdAt: number; updatedAt: number; order: number }> }
  >;

  const database = getDb();
  await dbRun(database, 'BEGIN TRANSACTION');

  try {
    for (const [repoPath, board] of Object.entries(boards)) {
      if (!board?.tasks) continue;
      for (const task of board.tasks) {
        await dbRun(
          database,
          `INSERT OR IGNORE INTO tasks (id, repo_path, title, description, priority, status, "order", created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            repoPath,
            task.title,
            task.description ?? '',
            task.priority ?? 'medium',
            task.status ?? 'todo',
            task.order ?? 0,
            task.createdAt ?? Date.now(),
            task.updatedAt ?? Date.now(),
          ]
        );
      }
    }
    await dbRun(database, 'COMMIT');
    console.log('[TodoService] Migration from localStorage completed');
  } catch (err) {
    await dbRun(database, 'ROLLBACK').catch(() => {});
    throw err;
  }
}

export function close(): void {
  if (db) {
    db.close((err) => {
      if (err) console.warn('[TodoService] Failed to close database:', err);
    });
    db = null;
  }
}
