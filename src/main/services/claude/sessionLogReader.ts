import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TASK_COMPLETION_MARKER } from '@shared/types/agent';

// Re-export for convenience
export { TASK_COMPLETION_MARKER };

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
 */
function cwdToProjectDir(cwd: string): string {
  // Claude uses the path with leading slash replaced by dash, and remaining slashes as dashes
  return `-${cwd.replace(/^\//, '').replace(/\//g, '-')}`;
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
 * Read the last N assistant text messages from a session log file
 * Returns empty array if file doesn't exist or on error
 */
export function readLastAssistantMessages(
  cwd: string,
  sessionId: string,
  count: number = 3
): string[] {
  const logPath = getSessionLogPath(cwd, sessionId);

  try {
    const fileContent = fs.readFileSync(logPath, 'utf-8');
    const lines = fileContent.trim().split('\n');
    const messages: string[] = [];

    // Read from end to get most recent messages
    for (let i = lines.length - 1; i >= 0 && messages.length < count; i--) {
      try {
        const entry: SessionLogEntry = JSON.parse(lines[i]);

        if (entry.type === 'assistant' && entry.message?.content) {
          // Extract text content from the message
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
    // File doesn't exist or can't be read - return empty array
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
