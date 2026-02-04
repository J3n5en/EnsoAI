import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RecentEditorProject } from '@shared/types';
import Database from 'better-sqlite3';

// Permanent cache - only cleared when app closes
let cachedProjects: RecentEditorProject[] | null = null;

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
 * Read recent projects from an editor's state.vscdb database.
 */
function readEditorProjects(editor: EditorConfig): RecentEditorProject[] {
  const dbPath = getStoragePath(editor);

  if (!existsSync(dbPath)) {
    return [];
  }

  try {
    // Open database in readonly mode to prevent lock conflicts
    const db = new Database(dbPath, { readonly: true });

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

          // Verify path exists
          if (existsSync(normalizedPath)) {
            projects.push({
              path: normalizedPath,
              editorName: editor.name,
              editorBundleId: editor.bundleId,
            });
          }
        } catch {
          // Skip invalid URIs
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
 * Get recent projects from all supported editors.
 * Results are deduplicated by path (first occurrence wins).
 * Uses permanent in-memory cache (cleared only when app closes).
 */
export function getRecentProjects(): RecentEditorProject[] {
  // Return cached data if available
  if (cachedProjects) {
    return cachedProjects;
  }

  const seenPaths = new Set<string>();
  const allProjects: RecentEditorProject[] = [];

  for (const editor of EDITOR_CONFIGS) {
    const projects = readEditorProjects(editor);

    for (const project of projects) {
      // Deduplicate across editors
      if (!seenPaths.has(project.path)) {
        seenPaths.add(project.path);
        allProjects.push(project);
      }
    }
  }

  // Store in permanent cache
  cachedProjects = allProjects;

  return allProjects;
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
