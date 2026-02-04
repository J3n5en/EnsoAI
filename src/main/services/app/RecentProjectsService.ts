import { existsSync, statSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RecentEditorProject } from '@shared/types';
import Database from 'better-sqlite3';

// Cache with TTL (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedProjects: RecentEditorProject[] | null = null;
let cacheTimestamp = 0;
let refreshPromise: Promise<RecentEditorProject[]> | null = null;

interface EditorConfig {
  name: string;
  bundleId: string;
  configDir: string; // Directory name inside Application Support/config
}

// Editor configurations for supported VS Code-like editors
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
 * Get the storage path for a given editor config based on platform.
 */
function getStoragePath(editor: EditorConfig): string {
  const home = homedir();
  const platform = process.platform;

  if (platform === 'darwin') {
    return join(
      home,
      'Library',
      'Application Support',
      editor.configDir,
      'User',
      'globalStorage',
      'state.vscdb'
    );
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, editor.configDir, 'User', 'globalStorage', 'state.vscdb');
  } else {
    // Linux
    return join(home, '.config', editor.configDir, 'User', 'globalStorage', 'state.vscdb');
  }
}

/**
 * Check if a path exists (async).
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
 * Database read is sync (better-sqlite3), but wrapped in async for path checks.
 */
async function readEditorProjects(editor: EditorConfig): Promise<RecentEditorProject[]> {
  const dbPath = getStoragePath(editor);

  if (!(await pathExists(dbPath))) {
    return [];
  }

  try {
    // Open database in readonly mode to prevent lock conflicts
    // fileMustExist ensures we don't create an empty database if file was removed
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    try {
      // Query the ItemTable for history.recentlyOpenedPathsList
      const row = db
        .prepare("SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'")
        .get() as { value: string } | undefined;

      if (!row || !row.value) {
        return [];
      }

      const data = JSON.parse(row.value);
      const entries = data.entries || [];
      const projects: RecentEditorProject[] = [];

      // Collect all paths first, then batch check existence
      const candidates: { path: string; editor: EditorConfig }[] = [];

      for (const entry of entries) {
        // Only process folder URIs (not files or remote)
        const folderUri = entry.folderUri;
        if (!folderUri || typeof folderUri !== 'string') {
          continue;
        }

        // Only handle file:// protocol
        if (!folderUri.startsWith('file://')) {
          continue;
        }

        try {
          // Convert file URI to filesystem path
          const url = new URL(folderUri);
          const fsPath = decodeURIComponent(url.pathname);

          // On Windows, remove leading slash from /C:/path
          const normalizedPath =
            process.platform === 'win32' && fsPath.startsWith('/') ? fsPath.slice(1) : fsPath;

          candidates.push({ path: normalizedPath, editor });
        } catch {
          // Skip invalid URIs
        }
      }

      // Batch check path existence in parallel
      const existsResults = await Promise.all(candidates.map((c) => pathExists(c.path)));

      for (let i = 0; i < candidates.length; i++) {
        if (existsResults[i]) {
          projects.push({
            path: candidates[i].path,
            editorName: editor.name,
            editorBundleId: editor.bundleId,
          });
        }
      }

      return projects;
    } finally {
      db.close();
    }
  } catch {
    // Silently skip editors that fail (not installed, locked, etc.)
    return [];
  }
}

/**
 * Normalize path for case-insensitive comparison on Windows/macOS.
 * Linux filesystems are case-sensitive, so no normalization is needed there.
 */
function normalizePathForDedup(inputPath: string): string {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return inputPath.toLowerCase();
  }
  return inputPath;
}

/**
 * Internal function to fetch and deduplicate projects from all editors.
 */
async function fetchRecentProjects(): Promise<RecentEditorProject[]> {
  // Read from all editors in parallel
  const results = await Promise.all(EDITOR_CONFIGS.map((editor) => readEditorProjects(editor)));

  const seenPaths = new Set<string>();
  const allProjects: RecentEditorProject[] = [];

  for (const projects of results) {
    for (const project of projects) {
      // Deduplicate across editors (case-insensitive on Windows/macOS)
      const normalizedPath = normalizePathForDedup(project.path);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        allProjects.push(project);
      }
    }
  }

  return allProjects;
}

/**
 * Get recent projects from all supported editors.
 * Results are deduplicated by path (first occurrence wins).
 * Uses TTL cache (5 min) with stale-while-revalidate pattern.
 */
export async function getRecentProjects(): Promise<RecentEditorProject[]> {
  const now = Date.now();
  const isCacheValid = cachedProjects && now - cacheTimestamp < CACHE_TTL_MS;

  // Cache hit - return immediately
  if (isCacheValid) {
    return cachedProjects!;
  }

  // Cache stale but exists - return stale data and refresh in background
  if (cachedProjects && !refreshPromise) {
    refreshPromise = fetchRecentProjects()
      .then((projects) => {
        cachedProjects = projects;
        cacheTimestamp = Date.now();
        return projects;
      })
      .finally(() => {
        refreshPromise = null;
      });
    return cachedProjects;
  }

  // No cache or already refreshing - wait for fresh data
  if (refreshPromise) {
    return refreshPromise;
  }

  // First load - fetch and cache
  refreshPromise = fetchRecentProjects()
    .then((projects) => {
      cachedProjects = projects;
      cacheTimestamp = Date.now();
      return projects;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * Validate a local path for use as a repository.
 */
export function validateLocalPath(path: string): {
  exists: boolean;
  isDirectory: boolean;
  isGitRepo: boolean;
} {
  if (!existsSync(path)) {
    return { exists: false, isDirectory: false, isGitRepo: false };
  }

  try {
    const stats = statSync(path);
    const isDirectory = stats.isDirectory();
    const isGitRepo = isDirectory && existsSync(join(path, '.git'));

    return { exists: true, isDirectory, isGitRepo };
  } catch {
    return { exists: false, isDirectory: false, isGitRepo: false };
  }
}
