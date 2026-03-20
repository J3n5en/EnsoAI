import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { TASK_COMPLETION_MARKER } from '@shared/types/agent';

/**
 * Get the Claude projects directory path
 */
function getClaudeProjectsDir(): string {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(claudeDir, 'projects');
}

/**
 * Convert a working directory path to Claude's project directory format
 * e.g., "/Users/foo/project" -> "-Users-foo-project"
 * Windows: "C:\Users\foo\project" -> "-C-Users-foo-project"
 */
function cwdToProjectDir(cwd: string): string {
  // Normalize path separators for cross-platform compatibility
  const normalized = cwd.replace(/\\/g, '/');
  // Remove leading slash, replace colons (Windows drive letters), replace slashes with dashes
  return `-${normalized.replace(/^\//, '').replace(/:/g, '').replace(/\//g, '-')}`;
}

/**
 * Get the session log file path for a given working directory and session ID
 */
export function getSessionLogPath(cwd: string, sessionId: string): string {
  const projectsDir = getClaudeProjectsDir();
  const projectDir = cwdToProjectDir(cwd);
  return path.join(projectsDir, projectDir, `${sessionId}.jsonl`);
}

interface SessionLogEntry {
  type: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

/**
 * Read the last N lines from a file by reading a small tail chunk.
 * Avoids loading the entire file into memory.
 */
async function readTailLines(filePath: string, lineCount: number): Promise<string[]> {
  const CHUNK_SIZE = 8 * 1024; // 8KB per read, enough for ~3 JSONL lines
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const fileSize = stat.size;
    if (fileSize === 0) return [];

    let collected = '';
    let position = fileSize;

    while (position > 0) {
      const readSize = Math.min(CHUNK_SIZE, position);
      position -= readSize;
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, position);
      collected = buffer.toString('utf-8') + collected;

      // +1 to account for a possible trailing newline
      const lines = collected.split('\n').filter((l) => l.trim());
      if (lines.length >= lineCount) {
        return lines.slice(-lineCount);
      }
    }

    return collected.split('\n').filter((l) => l.trim());
  } finally {
    await handle.close();
  }
}

/**
 * Read the last N assistant text messages from a session log file
 * Returns empty array if file doesn't exist or on error
 */
export async function readLastAssistantMessages(
  cwd: string,
  sessionId: string,
  count: number = 3
): Promise<string[]> {
  const logPath = getSessionLogPath(cwd, sessionId);

  try {
    // Read more lines than needed since not every line is an assistant message
    const tailLines = await readTailLines(logPath, count * 10);
    const messages: string[] = [];

    // Read from end to get most recent messages
    for (let i = tailLines.length - 1; i >= 0 && messages.length < count; i--) {
      try {
        const entry: SessionLogEntry = JSON.parse(tailLines[i]);

        if (entry.type === 'assistant' && entry.message?.content) {
          const textContent = entry.message.content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text)
            .join('\n');

          if (textContent.trim()) {
            messages.unshift(textContent);
          }
        }
      } catch {
        // Skip malformed entries
      }
    }

    return messages;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      console.error('[SessionLogReader] Failed to read session log:', error);
    }
    return [];
  }
}

/**
 * Check if task completion marker exists in the messages
 */
export function checkTaskCompletion(messages: string[]): {
  completed: boolean;
} {
  const combinedText = messages.join('\n');
  return { completed: combinedText.includes(TASK_COMPLETION_MARKER) };
}
