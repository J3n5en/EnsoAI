import type { ChildProcess } from 'node:child_process';
import { spawn, spawnSync } from 'node:child_process';
import type {
  AIProvider,
  ClaudeModelId,
  CodexModelId,
  CursorModelId,
  GeminiModelId,
  ModelId,
  ReasoningEffort,
} from '@shared/types';
import { getEnvForCommand, getShellForCommand } from '../../utils/shell';

export type { AIProvider, ModelId, ReasoningEffort } from '@shared/types';

export interface CLISpawnOptions {
  provider: AIProvider;
  model: ModelId;
  prompt: string;
  cwd: string;
  reasoningEffort?: ReasoningEffort;
  outputFormat?: 'json' | 'stream-json';
  timeout?: number;
  disallowedTools?: string[];
  sessionId?: string; // Support --session-id
  preserveSession?: boolean; // Whether to preserve session
}

export interface CLISpawnResult {
  proc: ChildProcess;
  kill: () => void;
}

function buildClaudeArgs(options: CLISpawnOptions): string[] {
  const args = [
    '-p',
    '--output-format',
    options.outputFormat ?? 'json',
    '--model',
    options.model as ClaudeModelId,
  ];

  // Support session ID for preserving conversation
  if (options.sessionId) {
    args.push('--session-id', options.sessionId);
  }

  // Only disable session persistence if not preserving
  if (!options.preserveSession) {
    args.push('--no-session-persistence');
  }

  if (options.disallowedTools?.length) {
    args.push('--disallowedTools', options.disallowedTools.join(' '));
  }

  if (options.outputFormat === 'stream-json') {
    args.push('--verbose', '--include-partial-messages');
  }

  return args;
}

function buildCodexArgs(options: CLISpawnOptions): string[] {
  const args = ['exec', '-m', options.model as CodexModelId];

  if (options.reasoningEffort) {
    args.push('-c', `reasoning_effort="${options.reasoningEffort}"`);
  }

  // Codex reads prompt from stdin when not provided as argument
  return args;
}

function buildGeminiArgs(options: CLISpawnOptions): string[] {
  const args = [
    '-o',
    options.outputFormat ?? 'json',
    '-m',
    options.model as GeminiModelId,
    '--yolo', // Auto-accept to avoid interactive prompts
  ];

  // Gemini uses positional prompt, but we'll use stdin for consistency
  return args;
}

/**
 * Build args for Cursor CLI (agent). Prompt is passed via stdin; -p enables non-interactive mode.
 *
 * Limitations (vs Claude CLI): Cursor CLI does not support --no-session-persistence,
 * --session-id, or --disallowedTools. When used for code review, the Cursor agent may
 * attempt to modify files or run git commands; callers that pass disallowedTools will
 * see a console warning that the option is ignored.
 */
function buildCursorArgs(options: CLISpawnOptions): string[] {
  if (options.disallowedTools?.length) {
    console.warn(
      '[providers] Cursor CLI does not support --disallowedTools; option ignored. ' +
        'Agent may modify files or run git commands during code review.'
    );
  }

  const args = [
    '-p',
    '--output-format',
    options.outputFormat ?? 'json',
    '--model',
    options.model as CursorModelId,
  ];

  return args;
}

export function spawnCLI(options: CLISpawnOptions): CLISpawnResult {
  const { shell, args: shellArgs } = getShellForCommand();
  const env = getEnvForCommand();

  let cliCommand: string;
  let cliArgs: string[];

  switch (options.provider) {
    case 'claude-code':
      cliCommand = 'claude';
      cliArgs = buildClaudeArgs(options);
      break;
    case 'codex-cli':
      cliCommand = 'codex';
      cliArgs = buildCodexArgs(options);
      break;
    case 'gemini-cli':
      cliCommand = 'gemini';
      cliArgs = buildGeminiArgs(options);
      break;
    case 'cursor-cli':
      cliCommand = 'agent';
      cliArgs = buildCursorArgs(options);
      break;
    default:
      cliCommand = 'claude';
      cliArgs = buildClaudeArgs(options);
  }

  const fullCommand = `${cliCommand} ${cliArgs.join(' ')}`;

  const proc = spawn(shell, [...shellArgs, fullCommand], {
    cwd: options.cwd,
    env: env as NodeJS.ProcessEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32', // Create new process group on Unix
  });

  // Handle stdin errors to prevent EPIPE crashes
  proc.stdin.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
      console.error(`[ai-providers] stdin error:`, err.message);
    }
  });

  // Write prompt to stdin
  proc.stdin.write(options.prompt);
  proc.stdin.end();

  return {
    proc,
    kill: () => {
      if (!proc.pid) return;
      try {
        if (process.platform === 'win32') {
          // Windows: use taskkill to kill process tree
          spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
        } else {
          // Unix: kill the entire process group (negative PID)
          process.kill(-proc.pid, 'SIGKILL');
        }
      } catch {
        // Process may have already exited
      }
    },
  };
}

export interface ParsedCLIResult {
  success: boolean;
  text?: string;
  error?: string;
}

// ANSI escape code regex
// biome-ignore lint/complexity/useRegexLiterals: Using RegExp constructor to avoid control character lint error
const ANSI_REGEX = new RegExp(
  '[\\u001b\\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]',
  'g'
);

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

export function parseClaudeJsonOutput(stdout: string): ParsedCLIResult {
  try {
    let jsonStr = stripAnsi(stdout).trim();

    // Claude CLI 2.1.20 及更早版本输出 JSON 数组: [{init}, {assistant}, {result}]
    // Claude CLI 2.1.22+ 输出单个 JSON 对象: {result}
    if (jsonStr.startsWith('[')) {
      const arrayStart = jsonStr.indexOf('[');
      const arrayEnd = jsonStr.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        const arr = JSON.parse(jsonStr.slice(arrayStart, arrayEnd + 1));
        const resultObj = arr.find(
          (item: { type?: string; subtype?: string }) =>
            item.type === 'result' && item.subtype === 'success'
        );
        if (resultObj?.result) {
          return { success: true, text: resultObj.result };
        }
        const errorObj = arr.find((item: { type?: string }) => item.type === 'result');
        return { success: false, error: errorObj?.error || 'Unknown error' };
      }
    }

    // 单个 JSON 对象格式 (Claude CLI 2.1.22+)
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
    }

    const result = JSON.parse(jsonStr);

    if (result.type === 'result' && result.subtype === 'success' && result.result) {
      return { success: true, text: result.result };
    }

    return { success: false, error: result.error || 'Unknown error' };
  } catch {
    console.error('[ai-providers] Failed to parse Claude output:', stdout);
    return { success: false, error: 'Failed to parse response' };
  }
}

export function parseCodexOutput(stdout: string): ParsedCLIResult {
  // Codex outputs plain text or JSON depending on mode
  const cleaned = stripAnsi(stdout).trim();

  if (!cleaned) {
    return { success: false, error: 'Empty response' };
  }

  // Try to parse as JSON first
  try {
    const result = JSON.parse(cleaned);
    if (result.result || result.text || result.message) {
      return { success: true, text: result.result || result.text || result.message };
    }
  } catch {
    // Not JSON, treat as plain text
  }

  return { success: true, text: cleaned };
}

export function parseCursorOutput(stdout: string): ParsedCLIResult {
  // Cursor CLI uses same JSON result shape as Claude: type/result/subtype
  return parseClaudeJsonOutput(stdout);
}

export function parseGeminiJsonOutput(stdout: string): ParsedCLIResult {
  try {
    let jsonStr = stripAnsi(stdout).trim();

    // Gemini may output multiple JSON lines, find the result
    const lines = jsonStr.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const result = JSON.parse(trimmed);
          if (result.type === 'result' || result.content || result.text || result.response) {
            return {
              success: true,
              text: result.result || result.content || result.text || result.response,
            };
          }
        } catch {}
      }
    }

    // If no structured result found, try parsing the whole thing
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
      const result = JSON.parse(jsonStr);
      if (result.result || result.content || result.text || result.response) {
        return {
          success: true,
          text: result.result || result.content || result.text || result.response,
        };
      }
    }

    return { success: false, error: 'Unknown response format' };
  } catch {
    console.error('[ai-providers] Failed to parse Gemini output:', stdout);
    return { success: false, error: 'Failed to parse response' };
  }
}

export function parseCLIOutput(provider: AIProvider, stdout: string): ParsedCLIResult {
  switch (provider) {
    case 'claude-code':
      return parseClaudeJsonOutput(stdout);
    case 'codex-cli':
      return parseCodexOutput(stdout);
    case 'cursor-cli':
      return parseCursorOutput(stdout);
    case 'gemini-cli':
      return parseGeminiJsonOutput(stdout);
    default:
      return parseClaudeJsonOutput(stdout);
  }
}
