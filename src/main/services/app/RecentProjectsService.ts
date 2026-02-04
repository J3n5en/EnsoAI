import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RecentEditorProject } from '@shared/types';
import sqlite3 from 'sqlite3';

// Cache with TTL (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;
// SQLite busy timeout (ms) - wait for locks instead of failing immediately
const BUSY_TIMEOUT_MS = 3000;
// Limit entries per editor to balance history completeness vs memory/performance
// 50 entries covers typical usage (~1 month of active projects for most users)
const MAX_ENTRIES_PER_EDITOR = 50;

let cachedProjects: RecentEditorProject[] | null = null;
let cacheTimestamp = 0;
let refreshPromise: Promise<RecentEditorProject[]> | null = null;

interface EditorConfig {
  name: string;
  bundleId: string;
  configDir: string;
}

const EDITOR_CONFIGS: EditorConfig[] = [
  { name: 'VS Code', bundleId: 'com.microsoft.VSCode', configDir: 'Code' },
  {
    name: 'VS Code Insiders',
    bundleId: 'com.microsoft.VSCodeInsiders',
    configDir: 'Code - Insiders',
  },
  { name: 'VSCodium', bundleId: 'com.vscodium', configDir: 'VSCodium' },
  { name: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92', configDir: 'Cursor' },
  { name: 'Windsurf', bundleId: 'com.codeium.windsurf', configDir: 'Windsurf' },
];

/**
 * Get the state.vscdb path for an editor based on platform.
 */
function getStoragePath(configDir: string): string {
  const home = homedir();
  const subPath = ['User', 'globalStorage', 'state.vscdb'];

  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', configDir, ...subPath);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, configDir, ...subPath);
  }
  return join(home, '.config', configDir, ...subPath);
}

/**
 * Convert file:// URI to filesystem path.
 */
function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith('file://')) return null;
  try {
    const fsPath = decodeURIComponent(new URL(uri).pathname);
    // Windows: remove leading slash from /C:/path
    return process.platform === 'win32' && fsPath.startsWith('/') ? fsPath.slice(1) : fsPath;
  } catch {
    return null;
  }
}

/**
 * Check if path exists.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read recent projects from an editor's state.vscdb database.
 */
async function readEditorProjects(editor: EditorConfig): Promise<RecentEditorProject[]> {
  const dbPath = getStoragePath(editor.configDir);
  if (!(await pathExists(dbPath))) return [];

  try {
    const row = await new Promise<{ value: string } | undefined>((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) return reject(err);
        db.configure('busyTimeout', BUSY_TIMEOUT_MS);
        db.get(
          'SELECT value FROM ItemTable WHERE key = ?',
          ['history.recentlyOpenedPathsList'],
          (queryErr, row: { value: string } | undefined) => {
            db.close((closeErr) => {
              if (closeErr) {
                console.warn(`[RecentProjects] Failed to close database ${dbPath}:`, closeErr);
              }
              if (queryErr) return reject(queryErr);
              resolve(row);
            });
          }
        );
      });
    });

    if (!row?.value) return [];

    const data = JSON.parse(row.value) as { entries?: Array<{ folderUri?: unknown }> };
    // Limit entries to prevent performance issues with large history
    const entries = (data.entries || []).slice(0, MAX_ENTRIES_PER_EDITOR);

    // Extract valid paths from entries
    const paths = entries
      .map((e) => (typeof e.folderUri === 'string' ? fileUriToPath(e.folderUri) : null))
      .filter((p): p is string => p !== null);

    // Batch check existence
    const existsResults = await Promise.all(paths.map(pathExists));

    return paths
      .filter((_, i) => existsResults[i])
      .map((path) => ({ path, editorName: editor.name, editorBundleId: editor.bundleId }));
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.warn(`[RecentProjects] Invalid JSON in ${editor.name} database`);
    } else {
      const code = (err as NodeJS.ErrnoException)?.code;
      console.warn(
        `[RecentProjects] Failed to read from ${editor.name}: ${code || 'unknown error'}`
      );
    }
    return [];
  }
}

/**
 * Normalize path for deduplication (case-insensitive on Windows/macOS).
 */
function normalizePathForDedup(path: string): string {
  return process.platform === 'linux' ? path : path.toLowerCase();
}

/**
 * Fetch and deduplicate projects from all editors.
 */
async function fetchRecentProjects(): Promise<RecentEditorProject[]> {
  const results = await Promise.all(EDITOR_CONFIGS.map(readEditorProjects));
  const seen = new Set<string>();

  return results.flat().filter((project) => {
    const key = normalizePathForDedup(project.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Get recent projects with TTL cache and stale-while-revalidate.
 */
export async function getRecentProjects(): Promise<RecentEditorProject[]> {
  const now = Date.now();
  const isCacheValid = cachedProjects && now - cacheTimestamp < CACHE_TTL_MS;

  // Cache hit
  if (isCacheValid) return cachedProjects!;

  // Already refreshing - wait for it
  if (refreshPromise) return refreshPromise;

  // Start refresh
  refreshPromise = fetchRecentProjects()
    .then((projects) => {
      cachedProjects = projects;
      cacheTimestamp = Date.now();
      return projects;
    })
    .catch((err) => {
      console.error('[RecentProjects] Failed to fetch recent projects:', err);
      return cachedProjects ?? [];
    })
    .finally(() => {
      refreshPromise = null;
    });

  // Return stale cache if available, otherwise wait
  return cachedProjects ?? refreshPromise;
}
