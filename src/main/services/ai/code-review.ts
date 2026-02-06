import type { ChildProcess } from 'node:child_process';
import { execSync } from 'node:child_process';
import type { AIProvider, ModelId, ReasoningEffort } from '@shared/types';
import { spawnCLI, stripAnsi } from './providers';

export interface CodeReviewOptions {
  workdir: string;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  language: string;
  reviewId: string;
  sessionId?: string; // Support session preservation for "Continue Conversation"
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

interface ActiveReview {
  proc: ChildProcess;
  kill: () => void;
}

const activeReviews = new Map<string, ActiveReview>();

function runGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function getDefaultBranch(workdir: string): string {
  const ref = runGit('git symbolic-ref refs/remotes/origin/HEAD', workdir);
  if (ref) {
    const match = ref.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) {
      return match[1];
    }
  }
  return 'main';
}

function buildPrompt(gitDiff: string, gitLog: string, language: string): string {
  return `Always reply in ${language}. You are performing a code review on the changes in the current branch.


## Code Review Instructions

The entire git diff for this branch has been provided below, as well as a list of all commits made to this branch.

**CRITICAL: EVERYTHING YOU NEED IS ALREADY PROVIDED BELOW.** The complete git diff and full commit history are included in this message.

**DO NOT run git diff, git log, git status, or ANY other git commands.** All the information you need to perform this review is already here.

When reviewing the diff:
1. **Focus on logic and correctness** - Check for bugs, edge cases, and potential issues.
2. **Consider readability** - Is the code clear and maintainable? Does it follow best practices in this repository?
3. **Evaluate performance** - Are there obvious performance concerns or optimizations that could be made?
4. **Assess test coverage** - Does the repository have testing patterns? If so, are there adequate tests for these changes?
5. **Ask clarifying questions** - Ask the user for clarification if you are unsure about the changes or need more context.
6. **Don't be overly pedantic** - Nitpicks are fine, but only if they are relevant issues within reason.

In your output:
- Provide a summary overview of the general code quality.
- Present the identified issues in a table with the columns: index (1, 2, etc.), line number(s), code, issue, and potential solution(s).
- If no issues are found, briefly state that the code meets best practices.

## Full Diff

**REMINDER: Output directly, DO NOT output, provide feedback, or ask questions via tools, DO NOT use any tools to fetch git information.** Simply read the diff and commit history that follow.

${gitDiff || '(No diff available)'}

## Commit History

${gitLog || '(No commit history available)'}`;
}

// Stream JSON parser for Claude's stream-json output
class ClaudeStreamParser {
  private buffer = '';
  private hasReceivedStreamEvents = false;

  parse(data: string): string[] {
    this.buffer += data;
    const chunks: string[] = [];

    // Try to parse complete JSON objects from buffer
    let searchStart = 0;
    while (searchStart < this.buffer.length) {
      const jsonStart = this.buffer.indexOf('{', searchStart);
      if (jsonStart === -1) break;

      // Find matching closing brace
      let depth = 0;
      let inString = false;
      let isEscaped = false;
      let jsonEnd = -1;

      for (let i = jsonStart; i < this.buffer.length; i++) {
        const char = this.buffer[i];

        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (char === '\\') {
          isEscaped = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (inString) continue;

        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            jsonEnd = i;
            break;
          }
        }
      }

      if (jsonEnd === -1) {
        // Incomplete JSON, wait for more data
        break;
      }

      const jsonStr = this.buffer.slice(jsonStart, jsonEnd + 1);
      searchStart = jsonEnd + 1;

      try {
        const obj = JSON.parse(jsonStr);
        // Extract text content from various message types
        if (obj.type === 'stream_event' && obj.event?.type === 'content_block_delta') {
          // Claude stream-json format: {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
          const text = obj.event.delta?.text;
          if (text) {
            this.hasReceivedStreamEvents = true;
            chunks.push(text);
          }
        } else if (obj.type === 'assistant' && obj.message?.content) {
          // Skip if we already received stream events (avoid duplicate content)
          if (!this.hasReceivedStreamEvents) {
            for (const block of obj.message.content) {
              if (block.type === 'text' && block.text) {
                chunks.push(block.text);
              }
            }
          }
        } else if (obj.type === 'content_block_delta' && obj.delta?.text) {
          chunks.push(obj.delta.text);
        } else if (obj.type === 'text' && obj.text) {
          chunks.push(obj.text);
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Keep unparsed portion in buffer
    this.buffer = this.buffer.slice(searchStart);

    return chunks;
  }
}

// NDJSON parser for Gemini's stream-json output (one JSON per line)
class GeminiStreamParser {
  private buffer = '';

  parse(data: string): string[] {
    this.buffer += data;
    const chunks: string[] = [];

    // Split by newlines and process complete lines
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;

      try {
        const obj = JSON.parse(trimmed);
        // Gemini stream-json format: {"type":"message","role":"assistant","content":"...","delta":true}
        if (obj.type === 'message' && obj.role === 'assistant' && obj.content) {
          chunks.push(obj.content);
        }
      } catch {
        // Invalid JSON line, skip
      }
    }

    return chunks;
  }
}

// Codex output parser (non-streaming, parse at end)
function parseCodexOutput(output: string): string {
  const cleaned = stripAnsi(output).trim();
  if (!cleaned) return '';

  // Codex exec outputs plain text result
  // Try to extract meaningful content
  const lines = cleaned.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip metadata lines
    if (trimmed.startsWith('Session') || trimmed.startsWith('Loaded') || trimmed.startsWith('{')) {
      // Try to parse as JSON
      if (trimmed.startsWith('{')) {
        try {
          const obj = JSON.parse(trimmed);
          if (obj.result || obj.text || obj.content || obj.message) {
            result.push(obj.result || obj.text || obj.content || obj.message);
            continue;
          }
        } catch {
          // Not JSON, include as-is if it looks like content
        }
      }
      continue;
    }
    result.push(trimmed);
  }

  return result.join('\n') || cleaned;
}

export async function startCodeReview(options: CodeReviewOptions): Promise<void> {
  const {
    workdir,
    provider,
    model,
    reasoningEffort,
    language,
    reviewId,
    onChunk,
    onComplete,
    onError,
  } = options;

  const gitDiff = runGit('git --no-pager diff HEAD --submodule=diff', workdir);
  const defaultBranch = getDefaultBranch(workdir);
  let gitLog = runGit(`git --no-pager log origin/${defaultBranch}..HEAD --oneline`, workdir);
  if (!gitLog) {
    gitLog = runGit('git --no-pager log -10 --oneline', workdir);
  }

  if (!gitDiff && !gitLog) {
    onError('No changes to review');
    return;
  }

  const prompt = buildPrompt(gitDiff, gitLog, language);

  // Use stream-json for Claude, Cursor, and Gemini; json for Codex (doesn't support streaming well)
  const outputFormat = provider === 'codex-cli' ? 'json' : 'stream-json';

  const { proc, kill } = spawnCLI({
    provider,
    model,
    prompt,
    cwd: workdir,
    reasoningEffort,
    outputFormat,
    // Claude CLI honors this; Cursor CLI does not (see providers.buildCursorArgs). Cursor may edit/run git.
    disallowedTools: ['"Bash(git:*)"', 'Edit'],
    sessionId: options.sessionId, // Pass sessionId for session preservation
    preserveSession: !!options.sessionId, // Preserve session if sessionId is provided
  });

  activeReviews.set(reviewId, { proc, kill });

  const claudeParser = new ClaudeStreamParser();
  const geminiParser = new GeminiStreamParser();
  let fullOutput = '';

  proc.stdout?.on('data', (data) => {
    const dataStr = data.toString();
    fullOutput += dataStr;

    const cleaned = stripAnsi(dataStr);

    if (provider === 'claude-code' || provider === 'cursor-cli') {
      const chunks = claudeParser.parse(cleaned);
      for (const chunk of chunks) {
        onChunk(chunk);
      }
    } else if (provider === 'gemini-cli') {
      const chunks = geminiParser.parse(cleaned);
      for (const chunk of chunks) {
        onChunk(chunk);
      }
    }
  });

  proc.stderr?.on('data', (data) => {
    console.error(`[code-review] stderr:`, data.toString());
  });

  proc.on('close', (code) => {
    const review = activeReviews.get(reviewId);
    if (review) {
      // Kill the entire process tree to clean up any child processes (e.g., MCP servers)
      review.kill();
      activeReviews.delete(reviewId);
    }

    if (code !== 0) {
      onError(`Process exited with code ${code}`);
      return;
    }

    // For Codex, parse the full output at the end
    if (provider === 'codex-cli') {
      const result = parseCodexOutput(fullOutput);
      if (result) {
        onChunk(result);
      }
    }

    onComplete();
  });

  proc.on('error', (err) => {
    const review = activeReviews.get(reviewId);
    if (review) {
      review.kill();
      activeReviews.delete(reviewId);
    }
    console.error(`[code-review] Process error:`, err);
    onError(err.message);
  });
}

export function stopCodeReview(reviewId: string): void {
  const review = activeReviews.get(reviewId);
  if (review) {
    review.kill();
    activeReviews.delete(reviewId);
  }
}

export function stopAllCodeReviews(): void {
  for (const [reviewId, review] of activeReviews) {
    review.kill();
    activeReviews.delete(reviewId);
  }
}
