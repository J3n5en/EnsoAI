import type { FileEntry } from '@shared/types';
import { ArrowDown, ArrowUp, Copy, Minus, Plus, RefreshCw, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodexViewSessionButton } from '@/components/chat/CodexViewSessionButton';
import {
  TerminalSearchBar,
  type TerminalSearchBarRef,
} from '@/components/terminal/TerminalSearchBar';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toastManager } from '@/components/ui/toast';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useTerminalScrollToBottom } from '@/hooks/useTerminalScrollToBottom';
import { useXterm } from '@/hooks/useXterm';
import { useI18n } from '@/i18n';
import { Z_INDEX } from '@/lib/z-index';
import { type OutputState, useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

interface AgentTerminalProps {
  id?: string; // Terminal session ID (UI key)
  cwd?: string;
  sessionId?: string; // Claude session ID for --session-id/--resume (falls back to id)
  agentId?: string; // Agent ID (e.g., 'claude', 'codex', 'gemini')
  agentCommand?: string;
  customPath?: string; // custom absolute path to the agent CLI
  customArgs?: string; // additional arguments to pass to the agent
  environment?: 'native' | 'hapi' | 'happy';
  initialized?: boolean;
  activated?: boolean;
  isActive?: boolean;
  hasPendingCommand?: boolean; // Force terminal activation even when not visible
  initialPrompt?: string; // Initial prompt to pass as CLI argument (auto-execute)
  canMerge?: boolean; // whether merge option should be enabled (has multiple groups)
  /**
   * When provided, Enhanced Input open state is controlled by parent (e.g. AgentPanel store).
   * When omitted, AgentTerminal falls back to its own local state.
   */
  enhancedInputOpen?: boolean;
  onEnhancedInputOpenChange?: (open: boolean) => void;
  onInitialized?: () => void;
  onActivated?: () => void;
  /** Called when session is activated with the current line content (for session name fallback). */
  onActivatedWithFirstLine?: (line: string) => void;
  onExit?: () => void;
  onTerminalTitleChange?: (title: string) => void;
  onSplit?: () => void;
  onMerge?: () => void;
  onFocus?: () => void; // called when terminal is clicked/focused to activate the group
  onRegisterEnhancedInputSender?: (
    sessionId: string,
    sender: (content: string, imagePaths: string[]) => void
  ) => void;
  onUnregisterEnhancedInputSender?: (sessionId: string) => void;
}

const MIN_RUNTIME_FOR_AUTO_CLOSE = 10000; // 10 seconds
const MIN_OUTPUT_FOR_NOTIFICATION = 100; // Minimum chars to consider agent is doing work
const MIN_OUTPUT_FOR_INDICATOR = 200; // Minimum chars to show "outputting" indicator (higher to avoid noise)
const ACTIVITY_POLL_INTERVAL_MS = 1000; // Poll process activity every 1000ms
const IDLE_CONFIRMATION_COUNT = 2; // Require 2 consecutive idle polls (2 seconds) before marking as idle
const RECENT_OUTPUT_TIMEOUT_MS = 3000; // If output received within this time, consider still active
const MAX_CODEX_SESSION_CANDIDATES = 12;
const MAX_CODEX_TOOL_ARGUMENT_CHARS = 4000;
const MAX_CODEX_TOOL_OUTPUT_CHARS = 8000;
const MAX_CODEX_OUTPUT_PROBE_CHARS = 4000;
const MAX_CODEX_HISTORY_LINES = 40;
const MAX_CODEX_PROMPT_OBSERVATIONS = 4;
const MAX_CODEX_HISTORY_DAY_OFFSETS = [-1, 0, 1] as const;
const MAX_CODEX_VISIBLE_HISTORY_CANDIDATES = 10;
const CODEX_HISTORY_PANEL_WIDTH_CLASS = 'w-[38rem]';
const CODEX_HISTORY_SECTION_HEADER_CLASS = 'border-b border-border/60 px-3 py-2';
const CODEX_HISTORY_SELECT_ITEM_CLASS =
  'grid-cols-[0_minmax(0,1fr)] gap-0 rounded-md border px-3 py-2 ps-3 pe-3 data-highlighted:border-border/60 data-highlighted:bg-accent/60 [&_svg]:hidden';
const CODEX_HISTORY_SELECT_ITEM_IDLE_CLASS =
  'border-transparent hover:border-border/60 hover:bg-accent/60';
const CODEX_HISTORY_SELECT_ITEM_SELECTED_CLASS = 'border-primary/35 bg-accent text-foreground';
const CODEX_HISTORY_TITLE_SECTION_PREFIXES = [
  '# AGENTS.md instructions',
  '# Context from my IDE setup:',
  '## Code review guidelines:',
] as const;
const CODEX_HISTORY_TITLE_BLOCK_TAGS = [
  '<environment_context>',
  '<permissions instructions>',
  '<turn_aborted>',
  '<collaboration_mode>',
  '<skills_instructions>',
  '<INSTRUCTIONS>',
  '<user_action>',
] as const;
const CODEX_HISTORY_TITLE_NOISE_PATTERNS = [
  /^review the current code changes\b/i,
  /^you are acting as a reviewer\b/i,
  /^please review\b/i,
  /^user initiated a review task\b/i,
  /^下面开始代码审查/,
  /^请审查/,
] as const;
const CODEX_ESC_CR_NEWLINE = '\x1b\r';
const CODEX_RAW_OUTPUT_TOGGLE_SEQUENCE = '\x1br';
const CODEX_OPEN_TRANSCRIPT_SEQUENCE = '\x14';
const TERMINAL_PAGE_UP_SEQUENCE = '\x1b[5~';
const TERMINAL_PAGE_DOWN_SEQUENCE = '\x1b[6~';
const CODEX_WHEEL_STEP_THRESHOLD = 48;
const CODEX_WHEEL_THROTTLE_MS = 90;
const CODEX_WHEEL_RAW_RENDER_DELAY_MS = 140;
const CODEX_WHEEL_OVERLAY_PENDING_GRACE_MS = 1200;
const CODEX_WHEEL_NATIVE_SCROLL_PROBE_INTERVAL_MS = 120;
const CODEX_WHEEL_NATIVE_SCROLL_PROBE_TIMEOUT_MS = 420;
const CODEX_WHEEL_TRANSCRIPT_EXIT_CONFIRM_DELAY_MS = 160;
const CODEX_WHEEL_EXIT_TRANSCRIPT_SEQUENCE = 'q';
const CODEX_WHEEL_SCROLL_LINES = 3;
const OPENCODE_WHEEL_STEP_THRESHOLD = 48;
const OPENCODE_WHEEL_THROTTLE_MS = 90;

type CodexTranscriptEntryKind =
  | 'user'
  | 'assistant'
  | 'reasoning'
  | 'commentary'
  | 'tool-call'
  | 'tool-output';

interface CodexTranscriptEntry {
  kind: CodexTranscriptEntryKind;
  title: string;
  body: string;
  timestamp?: string;
  detail?: string;
}

interface CodexTranscriptState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: CodexTranscriptEntry[];
  copyText: string;
  error: string | null;
  sessionId: string | null;
  sessionFilePath: string | null;
  updatedAt: string | null;
}

interface CodexSessionMetaPayload {
  id?: string;
  timestamp?: string;
  cwd?: string;
}

interface CodexSessionMetaEnvelopePayload {
  meta?: CodexSessionMetaPayload;
}

interface CodexTranscriptDocument {
  entries: CodexTranscriptEntry[];
  copyText: string;
  meta: CodexSessionMetaPayload | null;
  diagnostics: {
    nonEmptyLineCount: number;
    invalidJsonLineCount: number;
  };
}

interface CodexBoundSession {
  sessionId: string;
  sessionFilePath: string;
  historyTs?: number;
}

interface CodexHistoryCandidate {
  sessionId: string | null;
  sessionFilePath: string;
  updatedAt: string | null;
  candidateTime: number;
  cwd: string | null;
  entryCount: number;
  sessionTitle?: string;
}

const EMPTY_CODEX_TRANSCRIPT_STATE: CodexTranscriptState = {
  status: 'idle',
  entries: [],
  copyText: '',
  error: null,
  sessionId: null,
  sessionFilePath: null,
  updatedAt: null,
};

const CODEX_TRANSCRIPT_OSC_REGEX =
  // biome-ignore lint/complexity/useRegexLiterals: ANSI escape sequences require constructor for clarity
  new RegExp('\x1b][^\x07]*(?:\x07|\x1b\\\\)', 'g');
// biome-ignore lint/complexity/useRegexLiterals: ANSI escape sequences require constructor for clarity
const CODEX_TRANSCRIPT_CSI_REGEX = new RegExp('\x1b[[0-?]*[ -/]*[@-~]', 'g');
// biome-ignore lint/complexity/useRegexLiterals: ANSI escape sequences require constructor for clarity
const CODEX_TRANSCRIPT_ESC_REGEX = new RegExp('\x1b[@-_]', 'g');

const CODEX_TRANSCRIPT_CARD_STYLES: Record<CodexTranscriptEntryKind, string> = {
  user: 'border-blue-500/25 bg-blue-500/5',
  assistant: 'border-emerald-500/25 bg-emerald-500/5',
  reasoning: 'border-orange-500/25 bg-orange-500/5',
  commentary: 'border-amber-500/25 bg-amber-500/5',
  'tool-call': 'border-fuchsia-500/25 bg-fuchsia-500/5',
  'tool-output': 'border-slate-500/25 bg-slate-500/5',
};

function stripAnsiForCodexTranscript(text: string): string {
  return text
    .replace(CODEX_TRANSCRIPT_OSC_REGEX, ' ')
    .replace(CODEX_TRANSCRIPT_CSI_REGEX, ' ')
    .replace(CODEX_TRANSCRIPT_ESC_REGEX, ' ');
}

function normalizeCodexTranscriptText(text: string): string {
  return stripAnsiForCodexTranscript(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normalizeCodexMatchingText(text: string): string {
  return normalizeCodexTranscriptText(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

function stringifyCodexValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatCodexStructuredText(value: unknown): string {
  const raw = stringifyCodexValue(value).trim();
  if (!raw) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function truncateCodexTranscriptText(text: string, maxChars: number): string {
  const normalized = normalizeCodexTranscriptText(text);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trimEnd()}\n\n[...trimmed ${normalized.length - maxChars} chars]`;
}

function extractCodexPlainTextChunks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('text' in item) || typeof item.text !== 'string') {
      return [];
    }
    const text = normalizeCodexTranscriptText(item.text);
    return text ? [text] : [];
  });
}

function buildCodexTranscriptDetail(
  fields: Array<[label: string, value: unknown]>
): string | undefined {
  const parts = fields.flatMap(([label, value]) => {
    if (value === undefined || value === null) {
      return [];
    }

    const text = normalizeCodexTranscriptText(String(value));
    return text ? [`${label}: ${text}`] : [];
  });

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function formatCodexToolCallBody(value: unknown): string {
  return truncateCodexTranscriptText(
    formatCodexStructuredText(value) || 'No arguments.',
    MAX_CODEX_TOOL_ARGUMENT_CHARS
  );
}

function formatCodexToolOutputBody(value: unknown): string {
  const plainText = extractCodexPlainTextChunks(value);
  return truncateCodexTranscriptText(
    plainText.length > 0 ? plainText.join('\n\n') : stringifyCodexValue(value),
    MAX_CODEX_TOOL_OUTPUT_CHARS
  );
}

function formatCodexReasoningBody(payload: Record<string, unknown>): string {
  const sections: string[] = [];
  const summaryTexts = extractCodexPlainTextChunks(payload.summary);
  const contentTexts = extractCodexPlainTextChunks(payload.content);

  if (summaryTexts.length > 0) {
    sections.push(summaryTexts.join('\n\n'));
  }
  if (contentTexts.length > 0) {
    sections.push(contentTexts.join('\n\n'));
  }

  return sections.length > 0
    ? truncateCodexTranscriptText(sections.join('\n\n'), MAX_CODEX_TOOL_OUTPUT_CHARS)
    : '';
}

function formatCodexLocalShellActionBody(action: unknown): string {
  if (!action || typeof action !== 'object') {
    return formatCodexStructuredText(action) || 'No arguments.';
  }

  const command =
    'command' in action && Array.isArray(action.command)
      ? action.command
          .map((part) => (typeof part === 'string' ? part : stringifyCodexValue(part)))
          .filter(Boolean)
      : [];
  const workingDirectory =
    'working_directory' in action && typeof action.working_directory === 'string'
      ? action.working_directory
      : null;
  const timeoutMs =
    'timeout_ms' in action && action.timeout_ms !== undefined ? action.timeout_ms : null;
  const user = 'user' in action && typeof action.user === 'string' ? action.user : null;
  const envKeys =
    'env' in action && action.env && typeof action.env === 'object'
      ? Object.keys(action.env as Record<string, unknown>).filter(Boolean)
      : [];

  const lines: string[] = [];
  if (command.length > 0) {
    lines.push(command.join(' '));
  }
  if (workingDirectory) {
    lines.push(`cwd: ${workingDirectory}`);
  }
  if (timeoutMs !== null) {
    lines.push(`timeout_ms: ${String(timeoutMs)}`);
  }
  if (user) {
    lines.push(`user: ${user}`);
  }
  if (envKeys.length > 0) {
    lines.push(`env: ${envKeys.join(', ')}`);
  }

  return normalizeCodexTranscriptText(lines.join('\n')) || formatCodexStructuredText(action);
}

function formatCodexWebSearchActionBody(action: unknown): string {
  if (!action || typeof action !== 'object') {
    return formatCodexStructuredText(action) || 'No arguments.';
  }

  const actionType = 'type' in action && typeof action.type === 'string' ? action.type : 'other';
  const query = 'query' in action && typeof action.query === 'string' ? action.query.trim() : '';
  const queries =
    'queries' in action && Array.isArray(action.queries)
      ? action.queries
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  const url = 'url' in action && typeof action.url === 'string' ? action.url.trim() : '';
  const pattern =
    'pattern' in action && typeof action.pattern === 'string' ? action.pattern.trim() : '';

  const lines: string[] = [`action: ${actionType}`];
  if (query) {
    lines.push(`query: ${query}`);
  }
  if (queries.length > 0) {
    lines.push(`queries: ${queries.join(' | ')}`);
  }
  if (url) {
    lines.push(`url: ${url}`);
  }
  if (pattern) {
    lines.push(`pattern: ${pattern}`);
  }

  return normalizeCodexTranscriptText(lines.join('\n')) || formatCodexStructuredText(action);
}

function formatCodexImageGenerationBody(payload: Record<string, unknown>): string {
  const revisedPrompt =
    typeof payload.revised_prompt === 'string'
      ? normalizeCodexTranscriptText(payload.revised_prompt)
      : '';
  const result =
    typeof payload.result === 'string' ? normalizeCodexTranscriptText(payload.result) : '';

  const sections: string[] = [];
  if (revisedPrompt) {
    sections.push(`revised_prompt:\n${revisedPrompt}`);
  }
  if (result) {
    sections.push(`result:\n${result}`);
  }

  return formatCodexToolCallBody(sections.join('\n\n') || 'No arguments.');
}

function formatCodexCompactionBody(payload: Record<string, unknown>): string {
  const encryptedContent =
    typeof payload.encrypted_content === 'string'
      ? normalizeCodexTranscriptText(payload.encrypted_content)
      : '';

  if (!encryptedContent) {
    return 'Compaction event preserved in transcript.';
  }

  return truncateCodexTranscriptText(
    `Compaction event preserved in transcript.\n\nencrypted_content:\n${encryptedContent}`,
    MAX_CODEX_TOOL_ARGUMENT_CHARS
  );
}

function appendCodexTranscriptEntriesFromResponseItem(
  entries: CodexTranscriptEntry[],
  payload: Record<string, unknown>,
  timestamp?: string
): void {
  switch (payload.type) {
    case 'message': {
      const role = typeof payload.role === 'string' ? payload.role : '';
      if (role === 'developer' || role === 'system') {
        break;
      }

      const body = extractCodexMessageText(payload.content);
      if (!body) {
        break;
      }

      if (role === 'user') {
        entries.push({ kind: 'user', title: 'User', body, timestamp });
        break;
      }

      if (payload.phase === 'commentary') {
        entries.push({ kind: 'commentary', title: 'Commentary', body, timestamp });
        break;
      }

      entries.push({ kind: 'assistant', title: 'Assistant', body, timestamp });
      break;
    }
    case 'reasoning': {
      const body = formatCodexReasoningBody(payload);
      if (!body) {
        break;
      }

      entries.push({ kind: 'reasoning', title: 'Reasoning', body, timestamp });
      break;
    }
    case 'local_shell_call': {
      const body = formatCodexToolCallBody(formatCodexLocalShellActionBody(payload.action));
      entries.push({
        kind: 'tool-call',
        title: 'Tool Call · shell',
        body,
        detail: buildCodexTranscriptDetail([
          ['call_id', typeof payload.call_id === 'string' ? payload.call_id : null],
          ['status', payload.status],
        ]),
        timestamp,
      });
      break;
    }
    case 'function_call': {
      const name = typeof payload.name === 'string' ? payload.name : 'tool';
      const namespace = typeof payload.namespace === 'string' ? payload.namespace : '';
      const displayName = namespace ? `${namespace}.${name}` : name;
      const body = formatCodexToolCallBody(payload.arguments);
      entries.push({
        kind: 'tool-call',
        title: `Tool Call · ${displayName}`,
        body,
        detail: buildCodexTranscriptDetail([
          ['call_id', typeof payload.call_id === 'string' ? payload.call_id : null],
        ]),
        timestamp,
      });
      break;
    }
    case 'tool_search_call': {
      const body = formatCodexToolCallBody(payload.arguments);
      entries.push({
        kind: 'tool-call',
        title: 'Tool Call · search',
        body,
        detail: buildCodexTranscriptDetail([
          ['call_id', payload.call_id],
          ['execution', payload.execution],
          ['status', payload.status],
        ]),
        timestamp,
      });
      break;
    }
    case 'web_search_call': {
      const body = formatCodexToolCallBody(formatCodexWebSearchActionBody(payload.action));
      entries.push({
        kind: 'tool-call',
        title: 'Tool Call · web_search',
        body,
        detail: buildCodexTranscriptDetail([['status', payload.status]]),
        timestamp,
      });
      break;
    }
    case 'image_generation_call': {
      const body = formatCodexImageGenerationBody(payload);
      entries.push({
        kind: 'tool-call',
        title: 'Tool Call · image_generation',
        body,
        detail: buildCodexTranscriptDetail([
          ['id', payload.id],
          ['status', payload.status],
        ]),
        timestamp,
      });
      break;
    }
    case 'compaction': {
      entries.push({
        kind: 'commentary',
        title: 'Commentary',
        body: formatCodexCompactionBody(payload),
        detail: 'compaction',
        timestamp,
      });
      break;
    }
    case 'custom_tool_call': {
      const name = typeof payload.name === 'string' ? payload.name : 'custom_tool';
      const body = formatCodexToolCallBody(payload.input);
      entries.push({
        kind: 'tool-call',
        title: `Tool Call · ${name}`,
        body,
        detail: buildCodexTranscriptDetail([
          ['call_id', typeof payload.call_id === 'string' ? payload.call_id : null],
          ['status', payload.status],
        ]),
        timestamp,
      });
      break;
    }
    case 'function_call_output': {
      const output = formatCodexToolOutputBody(payload.output);
      if (!output) {
        break;
      }
      entries.push({
        kind: 'tool-output',
        title: 'Tool Output',
        body: output,
        detail: buildCodexTranscriptDetail([
          ['call_id', typeof payload.call_id === 'string' ? payload.call_id : null],
        ]),
        timestamp,
      });
      break;
    }
    case 'tool_search_output': {
      const output = formatCodexToolOutputBody(payload.tools);
      if (!output) {
        break;
      }
      entries.push({
        kind: 'tool-output',
        title: 'Tool Output · search',
        body: output,
        detail: buildCodexTranscriptDetail([
          ['call_id', payload.call_id],
          ['execution', payload.execution],
          ['status', payload.status],
        ]),
        timestamp,
      });
      break;
    }
    case 'custom_tool_call_output': {
      const output = formatCodexToolOutputBody(payload.output);
      if (!output) {
        break;
      }
      entries.push({
        kind: 'tool-output',
        title: 'Tool Output · custom',
        body: output,
        detail: buildCodexTranscriptDetail([
          ['call_id', typeof payload.call_id === 'string' ? payload.call_id : null],
        ]),
        timestamp,
      });
      break;
    }
  }
}

function formatCodexTimestamp(timestamp?: string): string | undefined {
  if (!timestamp) {
    return undefined;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

function normalizePathForComparison(path?: string): string {
  let normalized = (path ?? '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');

  if (window.electronAPI.env.platform === 'win32') {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

function joinCodexPath(separator: string, ...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.replace(/[\\/]+$/g, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')
    )
    .join(separator);
}

function stripAnsiForCodexProbe(text: string): string {
  return stripAnsiForCodexTranscript(text);
}

function extractCodexSessionIdFromProbe(text: string): string | null {
  const match = text.match(/(?:session id|session_id)\s*[:=]\s*([0-9a-f-]{20,})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function isCodexScaffoldMessage(text: string): boolean {
  const trimmed = text.trim();
  return (
    CODEX_HISTORY_TITLE_SECTION_PREFIXES.some((prefix) => trimmed.startsWith(prefix)) ||
    CODEX_HISTORY_TITLE_BLOCK_TAGS.some((tag) => trimmed.startsWith(tag))
  );
}

function stripLeadingCodexScaffold(text: string): string {
  const normalized = normalizeCodexTranscriptText(text);
  if (!normalized) {
    return '';
  }

  const lines = normalized.split(/\r?\n/);
  let startIndex = 0;

  while (startIndex < lines.length) {
    const line = lines[startIndex]?.trim() ?? '';
    if (!line) {
      startIndex += 1;
      continue;
    }

    if (line.startsWith('<image name=')) {
      startIndex += 1;
      continue;
    }

    const blockTag = CODEX_HISTORY_TITLE_BLOCK_TAGS.find((tag) => line.startsWith(tag));
    if (blockTag) {
      const closingTag = blockTag.replace('<', '</');
      startIndex += 1;
      while (startIndex < lines.length) {
        const currentLine = lines[startIndex]?.trim() ?? '';
        startIndex += 1;
        if (currentLine.startsWith(closingTag)) {
          break;
        }
      }
      continue;
    }

    if (CODEX_HISTORY_TITLE_SECTION_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      startIndex += 1;
      while (startIndex < lines.length) {
        const currentLine = lines[startIndex]?.trim() ?? '';
        if (!currentLine) {
          startIndex += 1;
          break;
        }
        if (
          currentLine.startsWith('<image name=') ||
          CODEX_HISTORY_TITLE_SECTION_PREFIXES.some((prefix) => currentLine.startsWith(prefix)) ||
          CODEX_HISTORY_TITLE_BLOCK_TAGS.some((tag) => currentLine.startsWith(tag))
        ) {
          break;
        }
        startIndex += 1;
      }
      continue;
    }

    break;
  }

  return lines.slice(startIndex).join('\n').trim();
}

function extractCodexHistoryTitle(text: string): string | null {
  const cleanedText = stripLeadingCodexScaffold(text);
  if (!cleanedText) {
    return null;
  }

  const cleanedLines = cleanedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith('<image name='));

  if (cleanedLines.length === 0) {
    return null;
  }

  const collapsed = cleanedLines.join(' ').replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return null;
  }
  if (isCodexScaffoldMessage(collapsed)) {
    return null;
  }
  if (CODEX_HISTORY_TITLE_NOISE_PATTERNS.some((pattern) => pattern.test(collapsed))) {
    return null;
  }
  if (collapsed.length < 4 && !/[\u4e00-\u9fff]/.test(collapsed)) {
    return null;
  }

  return collapsed.slice(0, 60);
}

function findCodexHistoryTitle(entries: CodexTranscriptEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.kind !== 'user') {
      continue;
    }
    const title = extractCodexHistoryTitle(entry.body);
    if (title) {
      return title;
    }
  }
  return undefined;
}

function extractCodexMessageText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  const chunks = content.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('text' in item) || typeof item.text !== 'string') {
      return [];
    }
    const normalized = stripLeadingCodexScaffold(item.text);
    return normalized ? [normalized] : [];
  });

  return chunks.join('\n\n').trim();
}

function buildCodexTranscriptCopyText(
  entries: CodexTranscriptEntry[],
  meta: CodexSessionMetaPayload | null,
  filePath: string,
  translate?: (key: string) => string,
  locale?: string
): string {
  const t = translate ?? ((key: string) => key);
  const lines = [t('Codex Session Record')];

  if (meta?.id) {
    lines.push(`${t('Session')}: ${meta.id}`);
  }
  if (filePath) {
    lines.push(`${t('File')}: ${filePath}`);
  }

  lines.push('');

  for (const entry of entries) {
    const headerParts = [formatCodexTranscriptEntryTitle(entry, t, locale)];
    if (entry.timestamp) {
      headerParts.push(entry.timestamp);
    }
    lines.push(`[${headerParts.join(' · ')}]`);
    if (entry.detail) {
      lines.push(entry.detail);
    }
    lines.push(formatCodexTranscriptEntryBody(entry, t), '');
  }

  return lines.join('\n').trim();
}

function formatCodexTranscriptEntryTitle(
  entry: CodexTranscriptEntry,
  translate?: (key: string) => string,
  locale?: string
): string {
  const t = translate ?? ((key: string) => key);

  switch (entry.kind) {
    case 'user':
      return t('User');
    case 'assistant':
      return locale === 'zh' ? t('Assistant') : t('Agent');
    case 'reasoning':
      return t('Reasoning');
    case 'commentary':
      return t('Commentary');
    case 'tool-output': {
      const prefix = 'Tool Output · ';
      if (entry.title.startsWith(prefix)) {
        return `${t('Tool Output')} · ${entry.title.slice(prefix.length)}`;
      }
      if (entry.title === 'Tool Output') {
        return t('Tool Output');
      }
      return entry.title;
    }
    case 'tool-call': {
      const prefix = 'Tool Call · ';
      if (entry.title.startsWith(prefix)) {
        return `${t('Tool Call')} · ${entry.title.slice(prefix.length)}`;
      }
      if (entry.title === 'Tool Call') {
        return t('Tool Call');
      }
      return entry.title;
    }
    default:
      return entry.title;
  }
}

function formatCodexTranscriptEntryBody(
  entry: CodexTranscriptEntry,
  translate?: (key: string) => string
): string {
  const t = translate ?? ((key: string) => key);
  if (entry.body === 'No arguments.') {
    return t('No arguments.');
  }
  return entry.body;
}

function hasRenderableCodexTranscript(document: CodexTranscriptDocument): boolean {
  return Boolean(document.meta) || document.entries.length > 0;
}

function isCodexTranscriptInvalid(document: CodexTranscriptDocument): boolean {
  return (
    document.diagnostics.nonEmptyLineCount > 0 &&
    document.diagnostics.invalidJsonLineCount > 0 &&
    !hasRenderableCodexTranscript(document)
  );
}

function scoreCodexPromptObservationForTranscript(
  document: CodexTranscriptDocument,
  observations: string[]
): number {
  if (observations.length === 0) {
    return 0;
  }

  const userBodies = document.entries
    .filter((entry) => entry.kind === 'user')
    .map((entry) => normalizeCodexMatchingText(entry.body))
    .filter(Boolean);

  if (userBodies.length === 0) {
    return 0;
  }

  let bestScore = 0;

  observations.forEach((observation, index) => {
    const normalizedObservation = normalizeCodexMatchingText(observation);
    if (!normalizedObservation) {
      return;
    }

    const recencyWeight = Math.max(1, observations.length - index) * 100;
    userBodies.forEach((body, bodyIndex) => {
      let score = 0;
      if (body === normalizedObservation) {
        score = recencyWeight + 60;
      } else if (body.startsWith(normalizedObservation) || normalizedObservation.startsWith(body)) {
        score = recencyWeight + 40;
      } else if (body.includes(normalizedObservation) || normalizedObservation.includes(body)) {
        score = recencyWeight + 20;
      }

      if (score > 0 && bodyIndex === userBodies.length - 1) {
        score += 5;
      }

      if (score > bestScore) {
        bestScore = score;
      }
    });
  });

  return bestScore;
}

function extractRecentCodexHistoryRecords(
  content: string
): Array<{ sessionId: string; ts?: number }> {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const recent = lines.slice(-MAX_CODEX_HISTORY_LINES).reverse();
  const records: Array<{ sessionId: string; ts?: number }> = [];

  for (const line of recent) {
    try {
      const record = JSON.parse(line) as { session_id?: string; ts?: number };
      if (!record.session_id || records.some((item) => item.sessionId === record.session_id)) {
        continue;
      }
      records.push({ sessionId: record.session_id, ts: record.ts });
    } catch {}
  }

  return records;
}

async function readLatestCodexHistoryTimestamp(historyPath: string): Promise<number | null> {
  try {
    if (!(await window.electronAPI.file.exists(historyPath))) {
      return null;
    }
    const { content } = await window.electronAPI.file.read(historyPath);
    const latest = extractRecentCodexHistoryRecords(content).find(
      (record) => typeof record.ts === 'number'
    );
    return latest?.ts ?? null;
  } catch {
    return null;
  }
}

function buildCodexSessionDayPaths(codexHome: string, timestampSeconds?: number): string[] {
  const baseDate = timestampSeconds ? new Date(timestampSeconds * 1000) : new Date();
  const paths: string[] = [];

  for (const offset of MAX_CODEX_HISTORY_DAY_OFFSETS) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + offset);
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const path = joinCodexPath(
      window.electronAPI.env.platform === 'win32' ? '\\' : '/',
      codexHome,
      'sessions',
      year,
      month,
      day
    );
    if (!paths.includes(path)) {
      paths.push(path);
    }
  }

  return paths;
}

async function listCodexDirectorySafely(dirPath: string): Promise<FileEntry[]> {
  try {
    return await window.electronAPI.file.list(dirPath);
  } catch {
    return [];
  }
}

function extractCodexSessionMetaPayload(
  payload: Record<string, unknown>
): CodexSessionMetaPayload | null {
  const metaCandidate =
    'meta' in payload && payload.meta && typeof payload.meta === 'object'
      ? (payload.meta as CodexSessionMetaEnvelopePayload['meta'])
      : payload;

  if (!metaCandidate || typeof metaCandidate !== 'object') {
    return null;
  }

  return {
    id: typeof metaCandidate.id === 'string' ? metaCandidate.id : undefined,
    timestamp: typeof metaCandidate.timestamp === 'string' ? metaCandidate.timestamp : undefined,
    cwd: typeof metaCandidate.cwd === 'string' ? metaCandidate.cwd : undefined,
  };
}

function parseCodexTranscriptDocument(content: string, filePath: string): CodexTranscriptDocument {
  const entries: CodexTranscriptEntry[] = [];
  let meta: CodexSessionMetaPayload | null = null;
  const diagnostics = {
    nonEmptyLineCount: 0,
    invalidJsonLineCount: 0,
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    diagnostics.nonEmptyLineCount += 1;

    let record: {
      timestamp?: string;
      type?: string;
      payload?: Record<string, unknown>;
    };
    try {
      record = JSON.parse(line) as {
        timestamp?: string;
        type?: string;
        payload?: Record<string, unknown>;
      };
    } catch {
      diagnostics.invalidJsonLineCount += 1;
      continue;
    }

    if (record.type === 'session_meta' && record.payload) {
      meta = extractCodexSessionMetaPayload(record.payload);
      continue;
    }

    if (!record.payload) {
      continue;
    }

    const timestamp = formatCodexTimestamp(record.timestamp);
    if (record.type === 'response_item') {
      appendCodexTranscriptEntriesFromResponseItem(entries, record.payload, timestamp);
      continue;
    }

    if (record.type === 'compacted') {
      const replacementHistory = Array.isArray(record.payload.replacement_history)
        ? record.payload.replacement_history
        : [];
      const compactedEntries: CodexTranscriptEntry[] = [];

      replacementHistory.forEach((item) => {
        if (!item || typeof item !== 'object') {
          return;
        }
        appendCodexTranscriptEntriesFromResponseItem(
          compactedEntries,
          item as Record<string, unknown>
        );
      });

      const compactionMessage =
        typeof record.payload.message === 'string'
          ? normalizeCodexTranscriptText(record.payload.message)
          : '';

      entries.length = 0;
      entries.push(...compactedEntries);

      if (entries.length === 0 && compactionMessage) {
        entries.push({
          kind: 'commentary',
          title: 'Commentary',
          body: compactionMessage,
          detail: 'compacted history',
          timestamp,
        });
      }
    }
  }

  return {
    entries,
    copyText: buildCodexTranscriptCopyText(entries, meta, filePath),
    meta,
    diagnostics,
  };
}

function scoreCodexHistoryRecordForSession(
  record: { sessionId: string; ts?: number },
  sessionAnchorTime: number
): number {
  if (!record.ts) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.abs(record.ts * 1000 - sessionAnchorTime);
}

function getCodexTranscriptCandidateTime(
  parsed: CodexTranscriptDocument,
  candidate: FileEntry
): number {
  if (parsed.meta?.timestamp) {
    const parsedTime = Date.parse(parsed.meta.timestamp);
    if (Number.isFinite(parsedTime)) {
      return parsedTime;
    }
  }
  return candidate.modifiedAt;
}

function _pickBetterCodexTranscriptCandidate(
  current: {
    entry: FileEntry;
    parsed: CodexTranscriptDocument;
    candidateTime: number;
  } | null,
  next: {
    entry: FileEntry;
    parsed: CodexTranscriptDocument;
    candidateTime: number;
  },
  sessionAnchorTime: number
): {
  entry: FileEntry;
  parsed: CodexTranscriptDocument;
  candidateTime: number;
} {
  if (!current) {
    return next;
  }

  const currentDistance = Math.abs(current.candidateTime - sessionAnchorTime);
  const nextDistance = Math.abs(next.candidateTime - sessionAnchorTime);
  if (nextDistance < currentDistance) {
    return next;
  }
  if (nextDistance === currentDistance && next.candidateTime > current.candidateTime) {
    return next;
  }
  return current;
}

function pickBetterCodexTranscriptMatch(
  current: {
    entry: FileEntry;
    parsed: CodexTranscriptDocument;
    candidateTime: number;
    promptScore: number;
    observedSessionIdMatch: boolean;
  } | null,
  next: {
    entry: FileEntry;
    parsed: CodexTranscriptDocument;
    candidateTime: number;
    promptScore: number;
    observedSessionIdMatch: boolean;
  },
  sessionAnchorTime: number
): {
  entry: FileEntry;
  parsed: CodexTranscriptDocument;
  candidateTime: number;
  promptScore: number;
  observedSessionIdMatch: boolean;
} {
  if (!current) {
    return next;
  }

  if (next.observedSessionIdMatch !== current.observedSessionIdMatch) {
    return next.observedSessionIdMatch ? next : current;
  }

  if (next.promptScore !== current.promptScore) {
    return next.promptScore > current.promptScore ? next : current;
  }

  const currentDistance = Math.abs(current.candidateTime - sessionAnchorTime);
  const nextDistance = Math.abs(next.candidateTime - sessionAnchorTime);
  if (nextDistance < currentDistance) {
    return next;
  }
  if (nextDistance === currentDistance && next.candidateTime > current.candidateTime) {
    return next;
  }
  return current;
}

export function AgentTerminal({
  id,
  cwd,
  sessionId,
  agentId = 'claude',
  agentCommand = 'claude',
  customPath,
  customArgs,
  environment = 'native',
  initialized,
  activated,
  isActive = false,
  hasPendingCommand = false,
  initialPrompt,
  canMerge = false,
  enhancedInputOpen: externalEnhancedInputOpen,
  onEnhancedInputOpenChange,
  onInitialized,
  onActivated,
  onActivatedWithFirstLine,
  onExit,
  onTerminalTitleChange,
  onSplit,
  onMerge,
  onFocus,
  onRegisterEnhancedInputSender,
  onUnregisterEnhancedInputSender,
}: AgentTerminalProps) {
  const { t, locale } = useI18n();
  const baseAgentId = useMemo(() => {
    if (agentId.endsWith('-hapi')) {
      return agentId.slice(0, -5);
    }
    if (agentId.endsWith('-happy')) {
      return agentId.slice(0, -6);
    }
    return agentId;
  }, [agentId]);
  const isCodexAgent = baseAgentId === 'codex';
  const isOpenCodeAgent = baseAgentId === 'opencode';
  const isWindows10 = useMemo(() => {
    if (window.electronAPI?.env?.platform !== 'win32') {
      return false;
    }
    const release = window.electronAPI?.env?.osRelease ?? '';
    const [majorText = '', minorText = '', buildText = ''] = release.split('.');
    const major = Number.parseInt(majorText, 10);
    const minor = Number.parseInt(minorText, 10);
    const build = Number.parseInt(buildText, 10);

    if (major !== 10 || minor !== 0 || !Number.isFinite(build)) {
      return false;
    }

    return build < 22000;
  }, []);
  const {
    agentNotificationEnabled,
    agentNotificationDelay,
    agentNotificationEnterDelay,
    hapiSettings,
    shellConfig,
    claudeCodeIntegration,
    glowEffectEnabled,
    codexWheelScrollPatchEnabled,
    openCodeWheelScrollPatchEnabled,
    codexSessionViewer,
  } = useSettingsStore();

  // Track if hapi is globally installed (cached in main process)
  const [hapiGlobalInstalled, setHapiGlobalInstalled] = useState<boolean | null>(null);

  // Resolved shell for command execution
  const [resolvedShell, setResolvedShell] = useState<{
    shell: string;
    execArgs: string[];
  } | null>(null);

  // Resolve shell configuration on mount and when shellConfig changes
  useEffect(() => {
    window.electronAPI.shell.resolveForCommand(shellConfig).then(setResolvedShell);
  }, [shellConfig]);

  // Check hapi global installation on mount (only for hapi environment)
  useEffect(() => {
    if (environment === 'hapi') {
      window.electronAPI.hapi.checkGlobal(false).then((status) => {
        setHapiGlobalInstalled(status.installed);
      });
    }
  }, [environment]);
  const outputBufferRef = useRef('');
  const codexWheelDeltaRef = useRef(0);
  const codexWheelLastDispatchRef = useRef(0);
  const codexWheelAutoRawModeRef = useRef(false);
  const codexWheelPendingScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codexWheelOverlayPendingRef = useRef(false);
  const codexWheelOverlayActiveRef = useRef(false);
  const codexWheelOverlayRequestedAtRef = useRef(0);
  const codexWheelNativeProbePendingRef = useRef(false);
  const codexWheelExitConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codexWheelSuppressNativeScrollRef = useRef(false);
  const openCodeWheelDeltaRef = useRef(0);
  const openCodeWheelLastDispatchRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);
  const hasActivatedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Delay after Enter before arming idle monitor.
  const isWaitingForIdleRef = useRef(false); // Wait for idle notification; enabled after substantial output.
  const pendingIdleMonitorRef = useRef(false); // Pending idle monitor; enabled after Enter.
  const dataSinceEnterRef = useRef(0); // Track output volume since last Enter.
  const currentTitleRef = useRef<string>(''); // Terminal title from OSC escape sequence.
  const tmuxSessionNameRef = useRef<string | null>(null); // Tmux session name for cleanup.
  const codexSessionStartedAtRef = useRef<number | null>(isCodexAgent ? Date.now() : null);
  const codexTranscriptRequestIdRef = useRef(0);
  const boundCodexSessionRef = useRef<CodexBoundSession | null>(null);
  const codexHistoryBaselineTsRef = useRef<number | null>(null);
  const codexHistoryBaselinePromiseRef = useRef<Promise<number | null> | null>(null);
  const codexObservedSessionIdRef = useRef<string | null>(null);
  const codexOutputProbeBufferRef = useRef('');
  const codexPromptObservationsRef = useRef<string[]>([]);

  // Output state tracking for global store
  const outputStateRef = useRef<OutputState>('idle');
  const isMonitoringOutputRef = useRef(false); // Only monitor after user presses Enter
  const outputSinceEnterRef = useRef(0); // Track output volume since Enter for indicator
  const lastOutputTimeRef = useRef(0); // Track last output timestamp for idle detection
  const activityPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveIdleCountRef = useRef(0); // Count consecutive idle polls
  const ptyIdRef = useRef<string | null>(null); // Store PTY ID for activity checks
  const isActiveRef = useRef(isActive); // Track latest isActive value for interval callback
  const lastCommandWasSlashCommand = useRef(false); // Track if last command was a slash command
  const setOutputState = useAgentSessionsStore((s) => s.setOutputState);
  const markSessionActive = useAgentSessionsStore((s) => s.markSessionActive);
  const clearRuntimeState = useAgentSessionsStore((s) => s.clearRuntimeState);

  const terminalSessionId = id ?? sessionId;
  const resumeSessionId = sessionId ?? id;

  // Use external control if provided, otherwise use local state.
  // IMPORTANT: `externalEnhancedInputOpen` can be false, so we must check `undefined` rather than truthiness.
  const [localEnhancedInputOpen, setLocalEnhancedInputOpen] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [codexTranscriptState, setCodexTranscriptState] = useState<CodexTranscriptState>(
    EMPTY_CODEX_TRANSCRIPT_STATE
  );
  const [codexHistoryCandidates, setCodexHistoryCandidates] = useState<CodexHistoryCandidate[]>([]);
  const [selectedCodexHistoryPath, setSelectedCodexHistoryPath] = useState<string>('auto');
  const [currentCodexSessionSnapshot, setCurrentCodexSessionSnapshot] = useState<{
    updatedAt: string | null;
    entryCount: number;
  }>({
    updatedAt: null,
    entryCount: 0,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldApplyCodexInitialScrollRef = useRef(false);
  const [_showCodexScrollToTop, setShowCodexScrollToTop] = useState(false);
  const [_showCodexScrollToBottom, setShowCodexScrollToBottom] = useState(false);

  // Filter entries based on settings
  const filteredEntries = useMemo(() => {
    if (codexSessionViewer.entryFilter === 'explain-reply') {
      return codexTranscriptState.entries.filter(
        (entry) =>
          entry.kind === 'user' || entry.kind === 'commentary' || entry.kind === 'assistant'
      );
    }
    return codexTranscriptState.entries;
  }, [codexTranscriptState.entries, codexSessionViewer.entryFilter]);

  const codexTranscriptTitleFontSize = codexSessionViewer.fontSize + 1;
  const codexTranscriptMetaFontSize = Math.max(11, codexSessionViewer.fontSize - 1);
  const codexTranscriptLineHeight = Math.max(18, Math.round(codexSessionViewer.fontSize * 1.6));
  const currentCodexSessionLabel = locale === 'zh' ? '当前对话' : 'Current Session';

  const isExternallyControlled = externalEnhancedInputOpen !== undefined;
  const enhancedInputOpen = isExternallyControlled
    ? externalEnhancedInputOpen
    : localEnhancedInputOpen;
  const setEnhancedInputOpen = useCallback(
    (open: boolean) => {
      if (isExternallyControlled) {
        onEnhancedInputOpenChange?.(open);
        return;
      }
      setLocalEnhancedInputOpen(open);
    },
    [isExternallyControlled, onEnhancedInputOpenChange]
  );

  // Keep isActiveRef in sync with isActive prop
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const resetCodexTranscriptBinding = useCallback(() => {
    codexSessionStartedAtRef.current = Date.now();
    codexTranscriptRequestIdRef.current += 1;
    boundCodexSessionRef.current = null;
    codexHistoryBaselineTsRef.current = null;
    codexObservedSessionIdRef.current = null;
    codexOutputProbeBufferRef.current = '';
    codexPromptObservationsRef.current = [];
    setCodexTranscriptState(EMPTY_CODEX_TRANSCRIPT_STATE);
    setCurrentCodexSessionSnapshot((previous) => ({
      ...previous,
      updatedAt: null,
      entryCount: 0,
    }));

    const baselinePromise = (async () => {
      const homeDir = window.electronAPI.env.HOME || (await window.electronAPI.app.getPath('home'));
      const separator = window.electronAPI.env.platform === 'win32' ? '\\' : '/';
      const historyPath = joinCodexPath(separator, homeDir, '.codex', 'history.jsonl');
      return readLatestCodexHistoryTimestamp(historyPath);
    })();
    codexHistoryBaselinePromiseRef.current = baselinePromise;

    void baselinePromise.then((baselineTs) => {
      if (codexHistoryBaselinePromiseRef.current === baselinePromise) {
        codexHistoryBaselineTsRef.current = baselineTs;
      }
    });
  }, []);

  useEffect(() => {
    if (!isCodexAgent) {
      return;
    }
    resetCodexTranscriptBinding();
    return () => {
      codexHistoryBaselinePromiseRef.current = null;
    };
  }, [isCodexAgent, resetCodexTranscriptBinding]);

  const listRecentCodexSessionFiles = useCallback(async (): Promise<FileEntry[]> => {
    const homeDir = window.electronAPI.env.HOME || (await window.electronAPI.app.getPath('home'));
    const separator = window.electronAPI.env.platform === 'win32' ? '\\' : '/';
    const sessionsRoot = joinCodexPath(separator, homeDir, '.codex', 'sessions');
    const candidateFiles = new Map<string, FileEntry>();
    const visitedDirs = new Set<string>();
    const pendingDirs = [sessionsRoot];

    while (pendingDirs.length > 0) {
      const currentDir = pendingDirs.pop();
      if (!currentDir || visitedDirs.has(currentDir)) {
        continue;
      }
      visitedDirs.add(currentDir);

      const entries = await listCodexDirectorySafely(currentDir);
      if (entries.length === 0) {
        continue;
      }

      const directories = entries
        .filter((entry) => entry.isDirectory)
        .sort((a, b) => b.name.localeCompare(a.name));
      pendingDirs.push(...directories.map((entry) => entry.path));

      entries
        .filter((entry) => !entry.isDirectory && entry.name.endsWith('.jsonl'))
        .forEach((entry) => {
          candidateFiles.set(entry.path, entry);
        });
    }

    return [...candidateFiles.values()]
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, MAX_CODEX_SESSION_CANDIDATES);
  }, []);

  const buildCodexTranscriptStateFromParsed = useCallback(
    (
      parsed: CodexTranscriptDocument,
      sessionFilePath: string,
      fallbackSessionId?: string | null,
      fallbackUpdatedAt?: string | null
    ): CodexTranscriptState => ({
      status: 'ready',
      entries: parsed.entries,
      copyText: buildCodexTranscriptCopyText(
        parsed.entries,
        parsed.meta,
        sessionFilePath,
        t,
        locale
      ),
      error: null,
      sessionId: parsed.meta?.id ?? fallbackSessionId ?? null,
      sessionFilePath,
      updatedAt: formatCodexTimestamp(parsed.meta?.timestamp) ?? fallbackUpdatedAt ?? null,
    }),
    [locale, t]
  );

  const loadCodexHistoryCandidates = useCallback(async (): Promise<CodexHistoryCandidate[]> => {
    if (!isCodexAgent) {
      setCodexHistoryCandidates([]);
      return [];
    }

    const normalizedCwd = normalizePathForComparison(cwd);
    const candidates = await listRecentCodexSessionFiles();
    const nextCandidates: CodexHistoryCandidate[] = [];

    for (const candidate of candidates) {
      try {
        const { content } = await window.electronAPI.file.read(candidate.path);
        const parsed = parseCodexTranscriptDocument(content, candidate.path);
        if (isCodexTranscriptInvalid(parsed)) {
          continue;
        }

        const parsedCwd = normalizePathForComparison(parsed.meta?.cwd);
        if (normalizedCwd && parsedCwd && parsedCwd !== normalizedCwd) {
          continue;
        }

        nextCandidates.push({
          sessionId: parsed.meta?.id ?? candidate.name.replace(/\.jsonl$/, ''),
          sessionFilePath: candidate.path,
          updatedAt:
            formatCodexTimestamp(parsed.meta?.timestamp) ??
            formatCodexTimestamp(new Date(candidate.modifiedAt).toISOString()) ??
            null,
          candidateTime: getCodexTranscriptCandidateTime(parsed, candidate),
          cwd: parsed.meta?.cwd ?? null,
          entryCount: parsed.entries.length,
          sessionTitle: findCodexHistoryTitle(parsed.entries),
        });
      } catch {}
    }

    nextCandidates.sort((left, right) => right.candidateTime - left.candidateTime);
    setCodexHistoryCandidates(nextCandidates);
    return nextCandidates;
  }, [cwd, isCodexAgent, listRecentCodexSessionFiles]);

  const loadCodexTranscript = useCallback(
    async ({
      silent = false,
      sessionFilePath,
    }: {
      silent?: boolean;
      sessionFilePath?: string;
    } = {}): Promise<CodexTranscriptState | null> => {
      if (!isCodexAgent) {
        return null;
      }

      const requestId = ++codexTranscriptRequestIdRef.current;
      if (!silent) {
        setCodexTranscriptState((previous) => ({
          ...previous,
          status: 'loading',
          error: null,
        }));
      }

      try {
        const homeDir =
          window.electronAPI.env.HOME || (await window.electronAPI.app.getPath('home'));
        const separator = window.electronAPI.env.platform === 'win32' ? '\\' : '/';
        const codexHome = joinCodexPath(separator, homeDir, '.codex');
        const _sessionsRoot = joinCodexPath(separator, codexHome, 'sessions');
        const historyPath = joinCodexPath(separator, codexHome, 'history.jsonl');
        const sessionAnchorTime =
          startTimeRef.current ?? codexSessionStartedAtRef.current ?? Date.now();
        const historyBaselineTs =
          codexHistoryBaselineTsRef.current ??
          (codexHistoryBaselinePromiseRef.current
            ? await codexHistoryBaselinePromiseRef.current
            : null);
        if (requestId !== codexTranscriptRequestIdRef.current) {
          return null;
        }
        const normalizedCwd = normalizePathForComparison(cwd);
        let boundSession = boundCodexSessionRef.current;
        const observedSessionId = codexObservedSessionIdRef.current;
        const promptObservations = codexPromptObservationsRef.current;
        let invalidBoundSessionPath: string | null = null;
        const commitTranscriptState = (nextState: CodexTranscriptState): CodexTranscriptState => {
          if (requestId === codexTranscriptRequestIdRef.current) {
            setCodexTranscriptState(nextState);
          }
          return nextState;
        };
        const commitCurrentSessionState = (
          nextState: CodexTranscriptState
        ): CodexTranscriptState => {
          const committedState = commitTranscriptState(nextState);
          if (requestId === codexTranscriptRequestIdRef.current) {
            setCurrentCodexSessionSnapshot((previous) => ({
              ...previous,
              updatedAt: committedState.updatedAt,
              entryCount: committedState.entries.length,
            }));
          }
          return committedState;
        };
        const buildEmptyTranscriptState = (): CodexTranscriptState => ({
          ...EMPTY_CODEX_TRANSCRIPT_STATE,
          status: 'ready',
          sessionId: observedSessionId,
        });

        if (sessionFilePath) {
          const { content } = await window.electronAPI.file.read(sessionFilePath);
          if (requestId !== codexTranscriptRequestIdRef.current) {
            return null;
          }

          const parsed = parseCodexTranscriptDocument(content, sessionFilePath);
          const parsedCwd = normalizePathForComparison(parsed.meta?.cwd);
          if (normalizedCwd && parsedCwd && parsedCwd !== normalizedCwd) {
            throw new Error(t('Selected Codex session does not match the current workspace.'));
          }
          if (isCodexTranscriptInvalid(parsed)) {
            throw new Error(t('Failed to load Codex session record.'));
          }

          return commitTranscriptState(
            buildCodexTranscriptStateFromParsed(
              parsed,
              sessionFilePath,
              parsed.meta?.id ??
                sessionFilePath
                  .split(/[\\/]/)
                  .pop()
                  ?.replace(/\.jsonl$/, '') ??
                null
            )
          );
        }

        if (boundSession && observedSessionId && boundSession.sessionId !== observedSessionId) {
          invalidBoundSessionPath = boundSession.sessionFilePath;
          boundCodexSessionRef.current = null;
          boundSession = null;
        }

        if (boundSession) {
          try {
            const { content } = await window.electronAPI.file.read(boundSession.sessionFilePath);
            if (requestId !== codexTranscriptRequestIdRef.current) {
              return null;
            }

            const parsed = parseCodexTranscriptDocument(content, boundSession.sessionFilePath);
            const parsedCwd = normalizePathForComparison(parsed.meta?.cwd);
            if (normalizedCwd && parsedCwd && parsedCwd !== normalizedCwd) {
              throw new Error(
                t('Bound Codex session record does not match the current workspace.')
              );
            }
            if (isCodexTranscriptInvalid(parsed)) {
              throw new Error(t('Failed to load Codex session record.'));
            }

            const nextState = buildCodexTranscriptStateFromParsed(
              parsed,
              boundSession.sessionFilePath,
              boundSession.sessionId,
              codexTranscriptState.updatedAt
            );

            return commitCurrentSessionState(nextState);
          } catch {
            invalidBoundSessionPath = boundSession.sessionFilePath;
            boundCodexSessionRef.current = null;
          }
        }

        let recentHistoryRecords: Array<{ sessionId: string; ts?: number }> = [];
        if (await window.electronAPI.file.exists(historyPath)) {
          const { content } = await window.electronAPI.file.read(historyPath);
          recentHistoryRecords = extractRecentCodexHistoryRecords(content).sort((left, right) => {
            const preferredDiff =
              Number(right.sessionId === observedSessionId) -
              Number(left.sessionId === observedSessionId);
            if (preferredDiff !== 0) {
              return preferredDiff;
            }
            const baselineDiff =
              Number(typeof right.ts === 'number' && right.ts > (historyBaselineTs ?? -Infinity)) -
              Number(typeof left.ts === 'number' && left.ts > (historyBaselineTs ?? -Infinity));
            if (baselineDiff !== 0) {
              return baselineDiff;
            }
            const distanceDiff =
              scoreCodexHistoryRecordForSession(left, sessionAnchorTime) -
              scoreCodexHistoryRecordForSession(right, sessionAnchorTime);
            if (distanceDiff !== 0) {
              return distanceDiff;
            }
            return (right.ts ?? 0) - (left.ts ?? 0);
          });
        }

        const recentHistoryRecordsAfterBaseline =
          historyBaselineTs === null
            ? recentHistoryRecords
            : recentHistoryRecords.filter(
                (record) =>
                  record.sessionId === observedSessionId ||
                  (typeof record.ts === 'number' && record.ts > historyBaselineTs)
              );
        const hasCurrentSessionEvidence =
          observedSessionId !== null || promptObservations.length > 0;
        const shouldAvoidOlderTranscriptFallback =
          historyBaselineTs !== null && hasCurrentSessionEvidence;
        const prioritizedHistoryRecords = shouldAvoidOlderTranscriptFallback
          ? recentHistoryRecordsAfterBaseline
          : recentHistoryRecords;

        if (
          historyBaselineTs !== null &&
          !hasCurrentSessionEvidence &&
          recentHistoryRecordsAfterBaseline.length === 0
        ) {
          return commitCurrentSessionState(buildEmptyTranscriptState());
        }

        if (shouldAvoidOlderTranscriptFallback && recentHistoryRecordsAfterBaseline.length === 0) {
          return commitCurrentSessionState(buildEmptyTranscriptState());
        }

        let exactMatch: {
          entry: FileEntry;
          parsed: CodexTranscriptDocument;
          candidateTime: number;
          promptScore: number;
          observedSessionIdMatch: boolean;
        } | null = null;

        for (const historyRecord of prioritizedHistoryRecords) {
          const dayPaths = buildCodexSessionDayPaths(codexHome, historyRecord.ts);
          let exactCandidate: FileEntry | null = null;

          for (const dayPath of dayPaths) {
            const dayFiles = await listCodexDirectorySafely(dayPath);
            if (dayFiles.length === 0) {
              continue;
            }
            exactCandidate =
              dayFiles.find(
                (candidate) =>
                  !candidate.isDirectory &&
                  candidate.path !== invalidBoundSessionPath &&
                  candidate.path.endsWith(`${historyRecord.sessionId}.jsonl`)
              ) ?? null;
            if (exactCandidate) {
              break;
            }
          }

          if (!exactCandidate) {
            continue;
          }
          try {
            const { content } = await window.electronAPI.file.read(exactCandidate.path);
            if (requestId !== codexTranscriptRequestIdRef.current) {
              return null;
            }

            const parsed = parseCodexTranscriptDocument(content, exactCandidate.path);
            const parsedCwd = normalizePathForComparison(parsed.meta?.cwd);
            if (normalizedCwd && parsedCwd && parsedCwd !== normalizedCwd) {
              continue;
            }
            if (isCodexTranscriptInvalid(parsed)) {
              continue;
            }
            const candidateSessionId = parsed.meta?.id ?? historyRecord.sessionId;
            exactMatch = pickBetterCodexTranscriptMatch(
              exactMatch,
              {
                entry: exactCandidate,
                parsed,
                candidateTime: getCodexTranscriptCandidateTime(parsed, exactCandidate),
                promptScore: scoreCodexPromptObservationForTranscript(parsed, promptObservations),
                observedSessionIdMatch:
                  observedSessionId !== null && candidateSessionId === observedSessionId,
              },
              sessionAnchorTime
            );
          } catch {}
        }

        if (exactMatch) {
          const nextState = buildCodexTranscriptStateFromParsed(
            exactMatch.parsed,
            exactMatch.entry.path,
            exactMatch.entry.name.replace(/\.jsonl$/, ''),
            formatCodexTimestamp(new Date(exactMatch.entry.modifiedAt).toISOString()) ?? null
          );
          boundCodexSessionRef.current = {
            sessionId: nextState.sessionId ?? exactMatch.entry.name.replace(/\.jsonl$/, ''),
            sessionFilePath: exactMatch.entry.path,
          };

          return commitCurrentSessionState(nextState);
        }

        const candidates = await listRecentCodexSessionFiles();
        if (requestId !== codexTranscriptRequestIdRef.current) {
          return null;
        }
        if (candidates.length === 0) {
          return commitCurrentSessionState(buildEmptyTranscriptState());
        }

        let preferredFallbackMatch: {
          entry: FileEntry;
          parsed: CodexTranscriptDocument;
          candidateTime: number;
          promptScore: number;
          observedSessionIdMatch: boolean;
        } | null = null;
        let recentFallbackMatch: {
          entry: FileEntry;
          parsed: CodexTranscriptDocument;
          candidateTime: number;
          promptScore: number;
          observedSessionIdMatch: boolean;
        } | null = null;
        let fallbackMatch: {
          entry: FileEntry;
          parsed: CodexTranscriptDocument;
          candidateTime: number;
          promptScore: number;
          observedSessionIdMatch: boolean;
        } | null = null;

        for (const candidate of candidates) {
          if (candidate.path === invalidBoundSessionPath) {
            continue;
          }
          try {
            const { content } = await window.electronAPI.file.read(candidate.path);
            if (requestId !== codexTranscriptRequestIdRef.current) {
              return null;
            }

            const parsed = parseCodexTranscriptDocument(content, candidate.path);
            const parsedCwd = normalizePathForComparison(parsed.meta?.cwd);
            if (normalizedCwd && parsedCwd !== normalizedCwd) {
              continue;
            }
            if (isCodexTranscriptInvalid(parsed)) {
              continue;
            }

            const candidateTime = getCodexTranscriptCandidateTime(parsed, candidate);
            const candidateSessionId = parsed.meta?.id ?? candidate.name.replace(/\.jsonl$/, '');
            const nextMatch = {
              entry: candidate,
              parsed,
              candidateTime,
              promptScore: scoreCodexPromptObservationForTranscript(parsed, promptObservations),
              observedSessionIdMatch:
                observedSessionId !== null && candidateSessionId === observedSessionId,
            };

            if (observedSessionId && candidate.path.endsWith(`${observedSessionId}.jsonl`)) {
              preferredFallbackMatch = nextMatch;
              break;
            }

            if (historyBaselineTs !== null && candidateTime > historyBaselineTs * 1000) {
              recentFallbackMatch = pickBetterCodexTranscriptMatch(
                recentFallbackMatch,
                nextMatch,
                sessionAnchorTime
              );
            }
            fallbackMatch = pickBetterCodexTranscriptMatch(
              fallbackMatch,
              nextMatch,
              sessionAnchorTime
            );
          } catch {}
        }

        const selectedFallbackMatch = shouldAvoidOlderTranscriptFallback
          ? (preferredFallbackMatch ?? recentFallbackMatch)
          : (preferredFallbackMatch ?? recentFallbackMatch ?? fallbackMatch);

        if (!selectedFallbackMatch) {
          return commitCurrentSessionState(buildEmptyTranscriptState());
        }

        const nextState = buildCodexTranscriptStateFromParsed(
          selectedFallbackMatch.parsed,
          selectedFallbackMatch.entry.path,
          selectedFallbackMatch.entry.name.replace(/\.jsonl$/, ''),
          formatCodexTimestamp(new Date(selectedFallbackMatch.entry.modifiedAt).toISOString()) ??
            null
        );
        boundCodexSessionRef.current = {
          sessionId:
            nextState.sessionId ?? selectedFallbackMatch.entry.name.replace(/\.jsonl$/, ''),
          sessionFilePath: selectedFallbackMatch.entry.path,
        };

        return commitCurrentSessionState(nextState);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('Failed to load Codex session record.');
        const nextState: CodexTranscriptState = silent
          ? {
              ...codexTranscriptState,
              error: message,
            }
          : {
              ...EMPTY_CODEX_TRANSCRIPT_STATE,
              status: 'error',
              error: message,
            };

        if (requestId === codexTranscriptRequestIdRef.current) {
          setCodexTranscriptState(nextState);
        }

        return nextState;
      }
    },
    [
      buildCodexTranscriptStateFromParsed,
      codexTranscriptState,
      cwd,
      isCodexAgent,
      listRecentCodexSessionFiles,
      t,
    ]
  );

  const loadSelectedCodexTranscript = useCallback(
    (options: { silent?: boolean; selectedPath?: string | null } = {}) => {
      const selectedPath =
        options.selectedPath !== undefined
          ? options.selectedPath
          : selectedCodexHistoryPath === 'auto'
            ? null
            : selectedCodexHistoryPath;
      return loadCodexTranscript({
        silent: options.silent,
        sessionFilePath: selectedPath ?? undefined,
      });
    },
    [loadCodexTranscript, selectedCodexHistoryPath]
  );

  const codexHistoryOptions = useMemo(() => {
    const options = [...codexHistoryCandidates];
    if (
      codexTranscriptState.sessionFilePath &&
      !options.some((item) => item.sessionFilePath === codexTranscriptState.sessionFilePath)
    ) {
      options.unshift({
        sessionId: codexTranscriptState.sessionId,
        sessionFilePath: codexTranscriptState.sessionFilePath,
        updatedAt: codexTranscriptState.updatedAt,
        candidateTime: codexTranscriptState.updatedAt
          ? Date.parse(codexTranscriptState.updatedAt)
          : Number.MAX_SAFE_INTEGER,
        cwd: cwd ?? null,
        entryCount: codexTranscriptState.entries.length,
        sessionTitle: findCodexHistoryTitle(codexTranscriptState.entries),
      });
    }
    return options;
  }, [codexHistoryCandidates, codexTranscriptState, cwd]);

  const selectedCodexHistoryCandidate = useMemo(
    () =>
      selectedCodexHistoryPath === 'auto'
        ? null
        : (codexHistoryOptions.find((item) => item.sessionFilePath === selectedCodexHistoryPath) ??
          null),
    [codexHistoryOptions, selectedCodexHistoryPath]
  );

  const codexHistorySelectLabel = useMemo(() => {
    if (selectedCodexHistoryPath === 'auto') {
      return currentCodexSessionLabel;
    }
    return (
      selectedCodexHistoryCandidate?.sessionTitle ??
      selectedCodexHistoryCandidate?.sessionId?.slice(0, 8) ??
      t('History Session')
    );
  }, [currentCodexSessionLabel, selectedCodexHistoryCandidate, selectedCodexHistoryPath, t]);

  const visibleCodexHistoryCandidates = useMemo(() => {
    const recent = codexHistoryCandidates.slice(0, MAX_CODEX_VISIBLE_HISTORY_CANDIDATES);
    if (selectedCodexHistoryPath === 'auto' || !selectedCodexHistoryCandidate) {
      return recent;
    }
    if (
      recent.some(
        (candidate) => candidate.sessionFilePath === selectedCodexHistoryCandidate.sessionFilePath
      )
    ) {
      return recent;
    }
    return [
      selectedCodexHistoryCandidate,
      ...recent.slice(0, Math.max(0, MAX_CODEX_VISIBLE_HISTORY_CANDIDATES - 1)),
    ];
  }, [codexHistoryCandidates, selectedCodexHistoryCandidate, selectedCodexHistoryPath]);

  const openCodexTranscript = useCallback(() => {
    shouldApplyCodexInitialScrollRef.current = true;
    setSelectedCodexHistoryPath('auto');
    setIsTranscriptOpen(true);
    onFocus?.();
    void loadCodexHistoryCandidates();
    void loadCodexTranscript();
  }, [loadCodexHistoryCandidates, loadCodexTranscript, onFocus]);

  const handleCodexTranscriptOpenChange = useCallback((open: boolean) => {
    setIsTranscriptOpen(open);
    if (!open) {
      setSelectedCodexHistoryPath('auto');
    }
  }, []);

  const handleCodexHistoryChange = useCallback(
    (value: string | null) => {
      const nextValue = value ?? 'auto';
      shouldApplyCodexInitialScrollRef.current = true;
      setSelectedCodexHistoryPath(nextValue);
      void loadCodexTranscript({
        sessionFilePath: nextValue === 'auto' ? undefined : nextValue,
      });
    },
    [loadCodexTranscript]
  );

  const handleReloadCodexTranscript = useCallback(async () => {
    const refreshedCandidates = await loadCodexHistoryCandidates();
    if (selectedCodexHistoryPath !== 'auto') {
      const stillExists = refreshedCandidates.some(
        (item) => item.sessionFilePath === selectedCodexHistoryPath
      );
      if (!stillExists) {
        setSelectedCodexHistoryPath('auto');
        await loadCodexTranscript();
        return;
      }
    }
    await loadSelectedCodexTranscript();
  }, [
    loadCodexHistoryCandidates,
    loadCodexTranscript,
    loadSelectedCodexTranscript,
    selectedCodexHistoryPath,
  ]);

  // Apply initial scroll position when dialog opens or content loads
  useEffect(() => {
    if (!isTranscriptOpen || !contentRef.current) return;
    if (codexTranscriptState.status !== 'ready') return;
    if (!shouldApplyCodexInitialScrollRef.current) return;

    const container = contentRef.current;
    if (codexSessionViewer.initialAnchor === 'end') {
      const lastEntry = container.querySelector('section:last-of-type');
      if (lastEntry instanceof HTMLElement) {
        lastEntry.scrollIntoView({ block: 'start' });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      container.scrollTop = 0;
    }
    shouldApplyCodexInitialScrollRef.current = false;
  }, [isTranscriptOpen, codexTranscriptState.status, codexSessionViewer.initialAnchor]);

  // Auto refresh logic with silent mode
  useEffect(() => {
    if (!isTranscriptOpen) return;
    if (!codexSessionViewer.enabled || !codexSessionViewer.autoRefresh) return;
    if (selectedCodexHistoryPath !== 'auto') return;

    const container = contentRef.current;
    if (!container) return;

    const interval = setInterval(() => {
      void loadSelectedCodexTranscript({ silent: true }).then(() => {
        // Auto refresh behaves like terminal follow mode: always keep the latest entries in view.
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }, codexSessionViewer.autoRefreshIntervalMs);

    return () => clearInterval(interval);
  }, [
    isTranscriptOpen,
    codexSessionViewer.enabled,
    codexSessionViewer.autoRefresh,
    codexSessionViewer.autoRefreshIntervalMs,
    loadSelectedCodexTranscript,
    selectedCodexHistoryPath,
  ]);

  // Track scroll position for jump buttons
  useEffect(() => {
    if (!codexSessionViewer.showJumpButtons) {
      setShowCodexScrollToTop(false);
      setShowCodexScrollToBottom(false);
      return;
    }

    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrollable = scrollHeight > clientHeight;
      setShowCodexScrollToTop(isScrollable && scrollTop > 30);
      setShowCodexScrollToBottom(isScrollable && scrollHeight - scrollTop - clientHeight > 30);
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check

    return () => container.removeEventListener('scroll', handleScroll);
  }, [codexSessionViewer.showJumpButtons]);

  const handleScrollToTop = useCallback(() => {
    useSettingsStore.getState().setCodexSessionViewerAutoRefresh(false);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, []);

  const handleScrollToBottomCodex = useCallback(() => {
    useSettingsStore.getState().setCodexSessionViewerAutoRefresh(false);
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, []);

  const copyCodexTranscript = useCallback(async () => {
    const transcript = await loadSelectedCodexTranscript();
    if (!transcript?.copyText) {
      return;
    }
    await navigator.clipboard.writeText(transcript.copyText);
  }, [loadSelectedCodexTranscript]);

  // Copy single entry content
  const copyEntryContent = useCallback(
    async (entry: CodexTranscriptEntry) => {
      try {
        const content = formatCodexTranscriptEntryBody(entry, t);
        await navigator.clipboard.writeText(content);
        toastManager.add({
          title: t('Copied'),
          description: t('Content copied to clipboard'),
          type: 'success',
          timeout: 2000,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toastManager.add({
          title: t('Copy failed'),
          description: message || t('Failed to copy content'),
          type: 'error',
          timeout: 3000,
        });
      }
    },
    [t]
  );

  // Helper to update output state (with ref tracking to avoid unnecessary store updates)
  const updateOutputState = useCallback(
    (newState: OutputState) => {
      if (!terminalSessionId) return;
      if (outputStateRef.current === newState) return;
      outputStateRef.current = newState;
      // Use isActiveRef.current to get latest value (important for interval callbacks)
      setOutputState(terminalSessionId, newState, isActiveRef.current);

      // Hide enhanced input when agent starts running (hideWhileRunning mode)
      if (
        newState === 'outputting' &&
        agentId === 'claude' &&
        claudeCodeIntegration.enhancedInputEnabled &&
        claudeCodeIntegration.enhancedInputAutoPopup === 'hideWhileRunning'
      ) {
        onEnhancedInputOpenChange?.(false);
      }
    },
    [terminalSessionId, setOutputState, agentId, claudeCodeIntegration, onEnhancedInputOpenChange]
  );

  // Mark session as active when user is viewing it
  useEffect(() => {
    if (isActive && terminalSessionId) {
      markSessionActive(terminalSessionId);
    }
  }, [isActive, terminalSessionId, markSessionActive]);

  // Activity state setter - used by startActivityPolling and handleData/handleCustomKey
  const setActivityState = useWorktreeActivityStore((s) => s.setActivityState);
  const getActivityState = useWorktreeActivityStore((s) => s.getActivityState);

  // Start polling for process activity
  const startActivityPolling = useCallback(() => {
    // Clear any existing interval
    if (activityPollIntervalRef.current) {
      clearInterval(activityPollIntervalRef.current);
    }
    consecutiveIdleCountRef.current = 0;

    activityPollIntervalRef.current = setInterval(async () => {
      if (!ptyIdRef.current || !isMonitoringOutputRef.current) {
        // Stop polling if no PTY or not monitoring
        if (activityPollIntervalRef.current) {
          clearInterval(activityPollIntervalRef.current);
          activityPollIntervalRef.current = null;
        }
        return;
      }

      try {
        const hasProcessActivity = await window.electronAPI.terminal.getActivity(ptyIdRef.current);
        const now = Date.now();
        const hasRecentOutput = now - lastOutputTimeRef.current < RECENT_OUTPUT_TIMEOUT_MS;

        if (hasProcessActivity || hasRecentOutput) {
          // Process is active OR has recent output, reset idle counter
          consecutiveIdleCountRef.current = 0;
          // If we have enough output, show the indicator
          if (outputSinceEnterRef.current > MIN_OUTPUT_FOR_INDICATOR) {
            updateOutputState('outputting');
            // Activity state is now managed by Hook notifications only
          }
        } else {
          // Process is idle AND no recent output
          consecutiveIdleCountRef.current++;
          // Only mark as idle after several consecutive idle polls
          if (consecutiveIdleCountRef.current >= IDLE_CONFIRMATION_COUNT) {
            updateOutputState('idle');
            isMonitoringOutputRef.current = false;

            // Activity state is now managed by Hook notifications only

            // Stop polling when confirmed idle
            if (activityPollIntervalRef.current) {
              clearInterval(activityPollIntervalRef.current);
              activityPollIntervalRef.current = null;
            }
          }
        }
      } catch {
        // Error checking activity, ignore
      }
    }, ACTIVITY_POLL_INTERVAL_MS);
  }, [updateOutputState]);

  // Stop polling for process activity
  const stopActivityPolling = useCallback(() => {
    if (activityPollIntervalRef.current) {
      clearInterval(activityPollIntervalRef.current);
      activityPollIntervalRef.current = null;
    }
  }, []);

  // Cleanup runtime state on unmount
  useEffect(() => {
    return () => {
      if (terminalSessionId) {
        clearRuntimeState(terminalSessionId);
      }
      stopActivityPolling();
    };
  }, [terminalSessionId, clearRuntimeState, stopActivityPolling]);

  // Cleanup tmux session on unmount
  useEffect(() => {
    return () => {
      if (tmuxSessionNameRef.current) {
        window.electronAPI.tmux.killSession(tmuxSessionNameRef.current);
      }
    };
  }, []);

  // Build command with session args
  const { command, env } = useMemo(() => {
    // Wait for shell config to be resolved
    if (!resolvedShell) {
      return { command: undefined, env: undefined };
    }

    // Use custom path if provided, otherwise use agentCommand
    const effectiveCommand = customPath || agentCommand;

    const supportsSession = agentCommand?.startsWith('claude') || agentCommand === 'cursor-agent';
    // Only Claude CLI supports --ide; Cursor CLI does not (errors with "unknown option '--ide'")
    const supportIde = agentCommand?.startsWith('claude');
    const effectiveSessionId = resumeSessionId;

    // Build agent args: cursor-agent and initialized claude use --resume; otherwise --session-id
    let agentArgs: string[] = [];
    if (supportsSession && effectiveSessionId) {
      if (agentCommand === 'cursor-agent' || initialized) {
        agentArgs = ['--resume', effectiveSessionId];
      } else {
        agentArgs = ['--session-id', effectiveSessionId];
      }
    }

    if (supportIde) {
      agentArgs.push('--ide');
    }

    // Append custom args if provided
    if (customArgs) {
      agentArgs.push(customArgs);
    }

    // Append initial prompt as CLI positional argument (for auto-execute)
    // Most CLI agents (claude, codex, gemini, etc.) accept a prompt as trailing argument
    if (initialPrompt) {
      const isWindows = window.electronAPI?.env?.platform === 'win32';

      if (isWindows) {
        // Windows: use double quotes with PowerShell/cmd compatible escaping
        // Escape: backslashes (double them), double quotes (backslash), backticks (PowerShell)
        const escaped = initialPrompt
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/`/g, '``')
          .replace(/%/g, '%%') // cmd variable expansion
          .replace(/\$/g, '`$') // PowerShell variable expansion
          .replace(/\n/g, ' '); // Replace newlines with spaces for Windows
        agentArgs.push(`"${escaped}"`);
      } else {
        // Unix: use $'...' ANSI-C quoting syntax (bash/zsh compatible)
        // This handles: backslashes, single quotes, and newlines
        const escaped = initialPrompt
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(/\n/g, '\\n');
        agentArgs.push(`$'${escaped}'`);
      }
    }

    const isWindows = window.electronAPI?.env?.platform === 'win32';
    let envVars: Record<string, string> | undefined;

    // Hapi environment: run through hapi (global) or npx @twsxtd/hapi with CLI_API_TOKEN
    if (environment === 'hapi') {
      // Wait for hapi global check to complete - return undefined to delay terminal init
      if (hapiGlobalInstalled === null) {
        return { command: undefined, env: undefined };
      }

      // Use global 'hapi' command if installed, otherwise use npx
      const hapiPrefix = hapiGlobalInstalled ? 'hapi' : 'npx -y @twsxtd/hapi';
      // claude is default for hapi, so omit agent name for claude
      const hapiArgs = agentCommand?.startsWith('claude') ? '' : effectiveCommand;
      const hapiCommand = `${hapiPrefix} ${hapiArgs} ${agentArgs.join(' ')}`.trim();

      // Pass CLI_API_TOKEN from hapiSettings
      if (hapiSettings.cliApiToken) {
        envVars = { CLI_API_TOKEN: hapiSettings.cliApiToken };
      }

      return {
        command: {
          shell: resolvedShell.shell,
          args: [...resolvedShell.execArgs, hapiCommand],
        },
        env: envVars,
      };
    }

    // Happy environment: run through 'happy' command
    // claude -> happy (claude is default), codex -> happy codex
    if (environment === 'happy') {
      const happyArgs = agentCommand?.startsWith('claude') ? '' : effectiveCommand;
      const happyCommand = `happy ${happyArgs} ${agentArgs.join(' ')}`.trim();

      return {
        command: {
          shell: resolvedShell.shell,
          args: [...resolvedShell.execArgs, happyCommand],
        },
        env: envVars,
      };
    }

    // Safe: all interpolated values (effectiveCommand, agentArgs, tmuxSessionName) are
    // derived from internal app config / controlled constants, not from arbitrary user input.
    const fullCommand = `${effectiveCommand} ${agentArgs.join(' ')}`.trim();
    const shellName = resolvedShell.shell.toLowerCase();

    // Determine if tmux wrapping should be applied
    const isClaude = agentCommand?.startsWith('claude') ?? false;
    const shouldUseTmux = claudeCodeIntegration.tmuxEnabled && isClaude && !isWindows;

    // Build tmux session name from terminal session ID
    const tmuxSessionName =
      shouldUseTmux && terminalSessionId
        ? `enso-${terminalSessionId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
        : null;
    tmuxSessionNameRef.current = tmuxSessionName;

    // Wrap command in tmux if enabled
    let finalCommand = fullCommand;
    if (tmuxSessionName) {
      const escaped = fullCommand.replace(/'/g, "'\\''");
      finalCommand = `env -u TMUX tmux -L enso -f /dev/null new-session -A -s ${tmuxSessionName} '${escaped}'`;
    }

    // WSL: detect from shell name (wsl.exe)
    if (shellName.includes('wsl') && isWindows) {
      // Use -e to run command directly, sh -lc loads login profile
      // exec $SHELL replaces with user's shell (zsh/bash/etc.)
      const escapedCommand = finalCommand.replace(/"/g, '\\"');
      return {
        command: {
          shell: 'wsl.exe',
          args: ['-e', 'sh', '-lc', `exec "$SHELL" -ilc "${escapedCommand}"`],
        },
        env: envVars,
      };
    }

    // PowerShell: wrap command in script block to preserve argument structure
    // Without this, PowerShell interprets args like --session-id as its own parameters
    if (shellName.includes('powershell') || shellName.includes('pwsh')) {
      return {
        command: {
          shell: resolvedShell.shell,
          args: [...resolvedShell.execArgs, `& { ${finalCommand} }`],
        },
        env: envVars,
      };
    }

    // Native environment: use user's configured shell
    return {
      command: {
        shell: resolvedShell.shell,
        args: [...resolvedShell.execArgs, finalCommand],
      },
      env: envVars,
    };
  }, [
    agentCommand,
    customPath,
    customArgs,
    initialPrompt,
    resumeSessionId,
    initialized,
    environment,
    hapiSettings.cliApiToken,
    hapiGlobalInstalled,
    resolvedShell,
    claudeCodeIntegration.tmuxEnabled,
    terminalSessionId,
  ]);

  // Handle exit with auto-close logic
  const handleExit = useCallback(() => {
    const runtime = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    const isSessionNotFound = outputBufferRef.current.includes(
      'No conversation found with session ID'
    );

    if (runtime >= MIN_RUNTIME_FOR_AUTO_CLOSE || isSessionNotFound) {
      onExit?.();
    }
    // Quick exit without session error - keep tab open for debugging
  }, [onExit]);

  // Track output for error detection and idle notification
  const handleData = useCallback(
    (data: string) => {
      // Start timer on first data
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      if (isCodexAgent) {
        const probeChunk = stripAnsiForCodexProbe(data);
        if (probeChunk) {
          codexOutputProbeBufferRef.current = (
            codexOutputProbeBufferRef.current + probeChunk
          ).slice(-MAX_CODEX_OUTPUT_PROBE_CHARS);
          const observedSessionId = extractCodexSessionIdFromProbe(
            codexOutputProbeBufferRef.current
          );
          if (observedSessionId) {
            codexObservedSessionIdRef.current = observedSessionId;
          }
        }
      }

      // Mark as initialized on first data
      if (!hasInitializedRef.current && !initialized) {
        hasInitializedRef.current = true;
        onInitialized?.();
      }

      // Buffer output for error detection
      outputBufferRef.current += data;
      if (outputBufferRef.current.length > 1000) {
        outputBufferRef.current = outputBufferRef.current.slice(-500);
      }

      // Track output volume since last Enter
      dataSinceEnterRef.current += data.length;

      // === Output state tracking for UI indicator ===
      // Only track when we're monitoring (after user pressed Enter)
      if (isMonitoringOutputRef.current) {
        outputSinceEnterRef.current += data.length;
        lastOutputTimeRef.current = Date.now(); // Track last output time for idle detection

        // Update to 'outputting' once we have substantial output after Enter
        if (outputSinceEnterRef.current > MIN_OUTPUT_FOR_INDICATOR) {
          updateOutputState('outputting');
          // Note: Activity state 'running' is set by handleCustomKey (on Enter) and
          // startActivityPolling (during polling), so no need to set it here
        }
        // Note: The transition to 'idle' is handled by process activity polling
        // (startActivityPolling), not by a simple timeout
      }

      // Only arm idle monitoring after receiving substantial output
      // This prevents notifications from simple prompt echoes
      if (
        pendingIdleMonitorRef.current &&
        dataSinceEnterRef.current > MIN_OUTPUT_FOR_NOTIFICATION
      ) {
        isWaitingForIdleRef.current = true;
        pendingIdleMonitorRef.current = false;
      }

      const stopHookEnabledForSession =
        claudeCodeIntegration.stopHookEnabled && agentCommand.startsWith('claude');

      if (!agentNotificationEnabled || !isWaitingForIdleRef.current || stopHookEnabledForSession)
        return;

      // Clear existing idle timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      // Set new idle timer - notify when agent stops outputting
      idleTimerRef.current = setTimeout(() => {
        if (isWaitingForIdleRef.current) {
          // Stop waiting after sending the notification, wait for next Enter.
          isWaitingForIdleRef.current = false;
          // Use terminal title as body, fall back to project name.
          const projectName = cwd?.split('/').pop() || 'Unknown';
          const notificationBody = currentTitleRef.current || projectName;
          if (!terminalSessionId) return;
          window.electronAPI.notification.show({
            title: t('{{command}} completed', { command: agentCommand }),
            body: notificationBody,
            sessionId: terminalSessionId,
          });
        }
      }, agentNotificationDelay * 1000);
    },
    [
      initialized,
      onInitialized,
      agentCommand,
      cwd,
      agentNotificationEnabled,
      agentNotificationDelay,
      claudeCodeIntegration.stopHookEnabled,
      isCodexAgent,
      terminalSessionId,
      t,
      updateOutputState,
    ]
  );

  // Handle terminal title changes (OSC escape sequences)
  const handleTitleChange = useCallback(
    (title: string) => {
      currentTitleRef.current = title;
      onTerminalTitleChange?.(title);
    },
    [onTerminalTitleChange]
  );

  // Codex 终端单独处理换行快捷键，其他 agent 继续走原来的 LF。
  // Also detect Enter key press to mark session as activated
  // biome-ignore lint/correctness/useExhaustiveDependencies: terminal is accessed via try-catch for safety and defined after this callback
  const handleCustomKey = useCallback(
    (event: KeyboardEvent, ptyId: string, getCurrentLine?: () => string | null) => {
      // Codex 在嵌入式终端里对裸 LF 和 CSI-u 改造 Enter 兼容不稳。
      // 这里按 Claude terminal-setup 常用方案发送 ESC+CR，让 Codex 按 Alt+Enter 路径插入换行。
      if (isCodexAgent && event.type === 'keydown') {
        const mayAffectOverlayState =
          event.key === 'q' ||
          event.key === 'Escape' ||
          codexWheelOverlayActiveRef.current ||
          codexWheelOverlayPendingRef.current;
        const overlayVisible = mayAffectOverlayState ? syncCodexOverlayState() : false;
        if (overlayVisible) {
          if (event.key === 'q' && !event.ctrlKey && !event.altKey && !event.metaKey) {
            codexWheelOverlayActiveRef.current = false;
            codexWheelOverlayPendingRef.current = false;
            codexWheelAutoRawModeRef.current = false;
            codexWheelOverlayRequestedAtRef.current = 0;
            clearCodexWheelPendingScroll();
            scheduleCodexTranscriptExitConfirmation();
          }
        }
        if (event.key === 'Enter' && event.shiftKey) {
          window.electronAPI.terminal.write(ptyId, CODEX_ESC_CR_NEWLINE);
          return false;
        }
        if (event.key === 'Enter' && event.altKey && !event.ctrlKey && !event.metaKey) {
          window.electronAPI.terminal.write(ptyId, CODEX_ESC_CR_NEWLINE);
          return false;
        }
        if (event.ctrlKey && !event.altKey && !event.metaKey) {
          if (event.code === 'KeyJ' || event.key === 'j' || event.key === 'J') {
            window.electronAPI.terminal.write(ptyId, CODEX_ESC_CR_NEWLINE);
            return false;
          }
          if (event.code === 'KeyM' || event.key === 'm' || event.key === 'M') {
            window.electronAPI.terminal.write(ptyId, CODEX_ESC_CR_NEWLINE);
            return false;
          }
        }
      }

      // 非 Codex 终端保留原来的 LF 兜底，避免影响其他 agent 的输入习惯。
      if (event.key === 'Enter' && event.shiftKey) {
        if (event.type === 'keydown') {
          window.electronAPI.terminal.write(ptyId, '\x0a');
        }
        return false;
      }

      // Only handle keydown events for other logic
      if (event.type !== 'keydown') return true;

      // Handle Ctrl+G to toggle enhanced input (only for Claude)
      if (event.ctrlKey && event.code === 'KeyG' && agentId === 'claude') {
        if (claudeCodeIntegration.enhancedInputEnabled) {
          setEnhancedInputOpen(!enhancedInputOpen);
          return false; // Block the key event only when enhanced input is enabled
        }
        // When enhanced input is disabled, let the event pass through to terminal
      }

      // Detect Enter key press (without modifiers) to activate session and start idle monitoring
      // Skip if IME is composing (e.g. selecting Chinese characters)
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.isComposing
      ) {
        const submittedLine = getCurrentLine?.()?.trim() ?? '';
        const submittedSlashCommand =
          submittedLine.match(/^\/([^\s]+)/)?.[1]?.toLowerCase() ?? null;

        // First Enter activates the session; optionally pass current line for session name.
        if (!hasActivatedRef.current && !activated) {
          hasActivatedRef.current = true;
          onActivated?.();
          if (getCurrentLine && onActivatedWithFirstLine) {
            if (submittedLine) onActivatedWithFirstLine(submittedLine);
          }
        }
        // Reset output counter.
        dataSinceEnterRef.current = 0;

        // Detect if user entered a slash command (like /clear, /help, etc.)
        // These commands don't trigger Claude and should quickly return to idle
        let isSlashCommand = false;
        if (terminal) {
          try {
            const cursorY = terminal.buffer.active.cursorY;
            const line = terminal.buffer.active.getLine(cursorY);
            if (line) {
              const lineText = line.translateToString().trim();
              isSlashCommand = lineText.startsWith('/');
              lastCommandWasSlashCommand.current = isSlashCommand;
            }
          } catch {
            // Ignore errors reading terminal buffer
          }
        }

        if (
          isCodexAgent &&
          submittedSlashCommand &&
          ['clear', 'fork', 'new', 'resume'].includes(submittedSlashCommand)
        ) {
          resetCodexTranscriptBinding();
        }

        if (isCodexAgent && submittedLine && !isSlashCommand) {
          codexPromptObservationsRef.current = [
            ...codexPromptObservationsRef.current,
            submittedLine,
          ].slice(-MAX_CODEX_PROMPT_OBSERVATIONS);
        }

        // Activity state is now managed by Hook notifications (PreToolUse, Stop, AskUserQuestion)
        // Enter event no longer sets activity state to avoid conflicts with other terminals

        if (terminalSessionId && glowEffectEnabled) {
          isMonitoringOutputRef.current = true;
          outputSinceEnterRef.current = 0;
          ptyIdRef.current = ptyId;
          startActivityPolling();
        }

        // Clear any existing enter delay timer.
        if (enterDelayTimerRef.current) {
          clearTimeout(enterDelayTimerRef.current);
          enterDelayTimerRef.current = null;
        }
        // If enter delay is configured, wait before arming idle monitor.
        if (agentNotificationEnterDelay > 0) {
          enterDelayTimerRef.current = setTimeout(() => {
            pendingIdleMonitorRef.current = true;
            enterDelayTimerRef.current = null;
          }, agentNotificationEnterDelay * 1000);
        } else {
          // No delay - arm idle monitor immediately.
          pendingIdleMonitorRef.current = true;
        }
        return true; // Let Enter through normally
      }

      // User is typing - cancel idle notification and enter delay timer
      if (
        (isWaitingForIdleRef.current ||
          pendingIdleMonitorRef.current ||
          enterDelayTimerRef.current) &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        isWaitingForIdleRef.current = false;
        pendingIdleMonitorRef.current = false;
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        if (enterDelayTimerRef.current) {
          clearTimeout(enterDelayTimerRef.current);
          enterDelayTimerRef.current = null;
        }
      }

      return true;
    },
    [
      activated,
      onActivated,
      onActivatedWithFirstLine,
      agentNotificationEnterDelay,
      startActivityPolling,
      terminalSessionId,
      glowEffectEnabled,
      cwd,
      setActivityState,
      agentId,
      claudeCodeIntegration.enhancedInputEnabled,
      enhancedInputOpen,
      setEnhancedInputOpen,
      getActivityState,
      isCodexAgent,
      resetCodexTranscriptBinding,
      // Note: terminal is excluded as it's defined after this callback
      // and accessed via try-catch for safety
    ]
  );

  // Wait for shell config and hapi check to complete before activating terminal
  const effectiveIsActive = useMemo(() => {
    if (!resolvedShell) {
      return false;
    }
    if (environment === 'hapi' && hapiGlobalInstalled === null) {
      return false;
    }
    // Force activation when there's a pending command (auto-execute)
    return isActive || hasPendingCommand;
  }, [environment, hapiGlobalInstalled, isActive, resolvedShell, hasPendingCommand]);

  const {
    containerRef,
    isLoading,
    settings,
    findNext,
    findPrevious,
    clearSearch,
    terminal,
    clear,
    refreshRenderer,
    write,
  } = useXterm({
    cwd,
    command,
    env,
    isActive: effectiveIsActive,
    onExit: handleExit,
    onData: handleData,
    onCustomKey: handleCustomKey,
    onTitleChange: handleTitleChange,
    onSplit,
    onMerge,
    canMerge,
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchBarRef = useRef<TerminalSearchBarRef>(null);

  // Mirror the side effects that used to live in EnhancedInput.onOpenChange:
  // - Treat opening EnhancedInput as active user interaction (reset idle timers)
  // - Restore terminal focus when EnhancedInput closes so Ctrl+G works without a click
  const prevEnhancedInputOpenRef = useRef(enhancedInputOpen);
  useEffect(() => {
    const prev = prevEnhancedInputOpenRef.current;
    if (prev === enhancedInputOpen) return;
    prevEnhancedInputOpenRef.current = enhancedInputOpen;

    if (enhancedInputOpen) {
      isWaitingForIdleRef.current = false;
      pendingIdleMonitorRef.current = false;

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      if (enterDelayTimerRef.current) {
        clearTimeout(enterDelayTimerRef.current);
        enterDelayTimerRef.current = null;
      }
      return;
    }

    requestAnimationFrame(() => terminal?.focus());
  }, [enhancedInputOpen, terminal]);
  const { showScrollToBottom, handleScrollToBottom } = useTerminalScrollToBottom(terminal);

  // Register write and focus functions to global store for external access
  const { register, unregister } = useTerminalWriteStore();
  useEffect(() => {
    if (!terminalSessionId || !write) return;

    register(terminalSessionId, write, () => terminal?.focus());
    return () => unregister(terminalSessionId);
  }, [terminalSessionId, write, terminal, register, unregister]);

  // Handle Cmd+F / Ctrl+F
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyF') {
        e.preventDefault();
        if (isSearchOpen) {
          searchBarRef.current?.focus();
        } else {
          setIsSearchOpen(true);
        }
      }
      // Ctrl+G is now handled in handleCustomKey
    },
    [isSearchOpen]
  );

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();
      onFocus?.();

      const menuItems = [
        ...(isCodexAgent
          ? [
              { id: 'history', label: t('View Session') },
              {
                id: 'copy-history',
                label: t('Copy Session'),
              },
              { id: 'separator-history', label: '', type: 'separator' as const },
            ]
          : []),
        { id: 'split', label: t('Split Agent') },
        ...(canMerge ? [{ id: 'merge', label: t('Merge Agent') }] : []),
        { id: 'separator-0', label: '', type: 'separator' as const },
        { id: 'clear', label: t('Clear terminal') },
        { id: 'refresh', label: t('Refresh terminal') },
        { id: 'separator-1', label: '', type: 'separator' as const },
        { id: 'copy', label: t('Copy'), disabled: !terminal?.hasSelection() },
        { id: 'paste', label: t('Paste') },
        { id: 'selectAll', label: t('Select all') },
        ...(tmuxSessionNameRef.current
          ? [
              { id: 'separator-2', label: '', type: 'separator' as const },
              {
                id: 'copyTmuxRestore',
                label: t('Copy tmux restore command'),
              },
            ]
          : []),
      ];

      const selectedId = await window.electronAPI.contextMenu.show(menuItems);

      if (!selectedId) return;

      switch (selectedId) {
        case 'history':
          openCodexTranscript();
          break;
        case 'copy-history':
          copyCodexTranscript();
          break;
        case 'split':
          onSplit?.();
          break;
        case 'merge':
          onMerge?.();
          break;
        case 'clear':
          clear();
          break;
        case 'refresh':
          refreshRenderer();
          break;
        case 'copy':
          if (terminal?.hasSelection()) {
            const selection = terminal.getSelection();
            navigator.clipboard.writeText(selection);
          }
          break;
        case 'paste':
          navigator.clipboard.readText().then((text) => {
            terminal?.paste(text);
          });
          break;
        case 'selectAll':
          terminal?.selectAll();
          break;
        case 'copyTmuxRestore':
          if (tmuxSessionNameRef.current) {
            const restoreCmd = `tmux -L enso attach-session -t ${tmuxSessionNameRef.current}`;
            navigator.clipboard.writeText(restoreCmd);
          }
          break;
      }
    },
    [
      terminal,
      clear,
      refreshRenderer,
      t,
      isCodexAgent,
      openCodexTranscript,
      copyCodexTranscript,
      onSplit,
      canMerge,
      onMerge,
      onFocus,
    ]
  );

  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleKeyDown]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [handleContextMenu, containerRef]);

  const clearCodexWheelPendingScroll = useCallback(() => {
    if (codexWheelPendingScrollTimerRef.current) {
      clearTimeout(codexWheelPendingScrollTimerRef.current);
      codexWheelPendingScrollTimerRef.current = null;
    }
  }, []);

  const clearCodexWheelExitConfirmTimer = useCallback(() => {
    if (codexWheelExitConfirmTimerRef.current) {
      clearTimeout(codexWheelExitConfirmTimerRef.current);
      codexWheelExitConfirmTimerRef.current = null;
    }
  }, []);

  const getCodexViewportSnapshot = useCallback(() => {
    const activeBuffer = terminal?.buffer.active;
    const viewportY = activeBuffer?.viewportY ?? 0;
    const baseY = activeBuffer?.baseY ?? 0;
    const bufferType = activeBuffer?.type ?? 'normal';
    return {
      viewportY,
      baseY,
      bufferType,
      atBottom: viewportY >= baseY,
    };
  }, [terminal]);

  const getCodexVisibleScreenText = useCallback(() => {
    if (!terminal) {
      return '';
    }

    const activeBuffer = terminal.buffer.active;
    const startLine = activeBuffer.viewportY;
    const endLine = Math.max(startLine, startLine + terminal.rows - 1);
    const lines: string[] = [];

    for (let lineIndex = startLine; lineIndex <= endLine; lineIndex += 1) {
      const line = activeBuffer.getLine(lineIndex);
      if (!line) {
        continue;
      }
      lines.push(line.translateToString());
    }

    return normalizeCodexMatchingText(lines.join('\n'));
  }, [terminal]);

  const detectCodexTranscriptOverlay = useCallback(() => {
    const screenText = getCodexVisibleScreenText();
    const hasHeader = /\/\s*t\s*r\s*a\s*n\s*s\s*c\s*r\s*i\s*p\s*t\s*\//.test(screenText);
    const hasQuitHint = screenText.includes('q to quit');
    const hasPagerHint = screenText.includes('pgup/pgdn to page');
    return {
      visible: hasHeader || (hasQuitHint && hasPagerHint),
      hasHeader,
      hasQuitHint,
      hasPagerHint,
    };
  }, [getCodexVisibleScreenText]);

  const detectCodexTranscriptBottom = useCallback(() => {
    const screenText = getCodexVisibleScreenText();
    const bottomMatch = screenText.match(/(\d{1,3})%/g);
    if (!bottomMatch || bottomMatch.length === 0) {
      return {
        atBottom: false,
        percent: null as number | null,
      };
    }

    const lastPercentText = bottomMatch[bottomMatch.length - 1];
    const percent = Number.parseInt(lastPercentText.replace('%', ''), 10);
    if (!Number.isFinite(percent)) {
      return {
        atBottom: false,
        percent: null as number | null,
      };
    }

    return {
      atBottom: percent >= 100,
      percent,
    };
  }, [getCodexVisibleScreenText]);

  const detectCodexNativeScrollState = useCallback(
    (snapshot?: ReturnType<typeof getCodexViewportSnapshot>, overlayVisible = false) => {
      const nextSnapshot = snapshot ?? getCodexViewportSnapshot();
      return {
        active:
          !overlayVisible && !codexWheelSuppressNativeScrollRef.current && nextSnapshot.baseY > 0,
      };
    },
    [getCodexViewportSnapshot]
  );

  const restoreCodexInitialViewport = useCallback(() => {
    codexWheelAutoRawModeRef.current = false;
    codexWheelSuppressNativeScrollRef.current = true;
    if (!terminal) {
      return;
    }
    terminal.scrollToBottom();
    terminal.focus();
  }, [terminal]);

  const syncCodexOverlayState = useCallback(() => {
    const detection = detectCodexTranscriptOverlay();
    if (detection.visible) {
      codexWheelOverlayActiveRef.current = true;
      codexWheelOverlayPendingRef.current = false;
      codexWheelAutoRawModeRef.current = false;
      return true;
    }

    const withinPendingGrace =
      codexWheelOverlayPendingRef.current &&
      Date.now() - codexWheelOverlayRequestedAtRef.current < CODEX_WHEEL_OVERLAY_PENDING_GRACE_MS;

    if (withinPendingGrace) {
      return codexWheelOverlayActiveRef.current;
    }

    codexWheelOverlayActiveRef.current = false;
    codexWheelOverlayPendingRef.current = false;
    codexWheelOverlayRequestedAtRef.current = 0;
    return false;
  }, [detectCodexTranscriptOverlay]);

  const scheduleCodexTranscriptExitConfirmation = useCallback(() => {
    clearCodexWheelExitConfirmTimer();
    codexWheelExitConfirmTimerRef.current = setTimeout(() => {
      codexWheelExitConfirmTimerRef.current = null;
      const overlayVisible = syncCodexOverlayState();
      if (!overlayVisible) {
        restoreCodexInitialViewport();
      }
    }, CODEX_WHEEL_TRANSCRIPT_EXIT_CONFIRM_DELAY_MS);
  }, [clearCodexWheelExitConfirmTimer, restoreCodexInitialViewport, syncCodexOverlayState]);

  const scheduleCodexNativeScrollProbe = useCallback(
    (
      onReady: (snapshot: ReturnType<typeof getCodexViewportSnapshot>) => void,
      onFallback: () => void
    ) => {
      codexWheelNativeProbePendingRef.current = true;
      const startedAt = Date.now();

      const poll = () => {
        const overlayVisible = syncCodexOverlayState();
        const snapshot = getCodexViewportSnapshot();
        const nativeScrollState = detectCodexNativeScrollState(snapshot, overlayVisible);

        if (nativeScrollState.active) {
          codexWheelNativeProbePendingRef.current = false;
          onReady(snapshot);
          return;
        }

        if (Date.now() - startedAt >= CODEX_WHEEL_NATIVE_SCROLL_PROBE_TIMEOUT_MS) {
          codexWheelNativeProbePendingRef.current = false;
          onFallback();
          return;
        }

        codexWheelPendingScrollTimerRef.current = setTimeout(
          poll,
          CODEX_WHEEL_NATIVE_SCROLL_PROBE_INTERVAL_MS
        );
      };

      codexWheelPendingScrollTimerRef.current = setTimeout(
        poll,
        CODEX_WHEEL_NATIVE_SCROLL_PROBE_INTERVAL_MS
      );
    },
    [detectCodexNativeScrollState, getCodexViewportSnapshot, syncCodexOverlayState]
  );

  const toggleCodexRawOutputMode = useCallback(
    (enabled: boolean) => {
      if (!write) {
        return;
      }
      terminal?.focus();
      write(CODEX_RAW_OUTPUT_TOGGLE_SEQUENCE);
      codexWheelAutoRawModeRef.current = enabled;
    },
    [terminal, write]
  );

  const openCodexTranscriptOverlay = useCallback(() => {
    if (!write) {
      return;
    }
    terminal?.focus();
    write(CODEX_OPEN_TRANSCRIPT_SEQUENCE);
    codexWheelOverlayRequestedAtRef.current = Date.now();
    codexWheelOverlayPendingRef.current = true;
    codexWheelOverlayActiveRef.current = true;
  }, [terminal, write]);

  const restoreCodexRawOutputMode = useCallback(() => {
    if (!codexWheelAutoRawModeRef.current) {
      return;
    }
    toggleCodexRawOutputMode(false);
  }, [toggleCodexRawOutputMode]);

  const scrollCodexViewport = useCallback(
    (direction: 'up' | 'down') => {
      if (!terminal) {
        return;
      }

      const lines = direction === 'up' ? -CODEX_WHEEL_SCROLL_LINES : CODEX_WHEEL_SCROLL_LINES;
      terminal.scrollLines(lines);
      const snapshot = getCodexViewportSnapshot();

      if (direction === 'down' && codexWheelAutoRawModeRef.current && snapshot.atBottom) {
        toggleCodexRawOutputMode(false);
      }
    },
    [getCodexViewportSnapshot, terminal, toggleCodexRawOutputMode]
  );

  const resetCodexWheelState = useCallback(() => {
    clearCodexWheelPendingScroll();
    clearCodexWheelExitConfirmTimer();
    codexWheelDeltaRef.current = 0;
    codexWheelAutoRawModeRef.current = false;
    codexWheelOverlayPendingRef.current = false;
    codexWheelOverlayActiveRef.current = false;
    codexWheelOverlayRequestedAtRef.current = 0;
    codexWheelNativeProbePendingRef.current = false;
    codexWheelSuppressNativeScrollRef.current = false;
  }, [clearCodexWheelExitConfirmTimer, clearCodexWheelPendingScroll]);

  // Handle external file drop (from OS file manager, VS Code, etc.)
  const terminalWrapperRef = useFileDrop<HTMLDivElement>({
    cwd,
    onDrop: useCallback(
      (paths: string[]) => {
        if (paths.length > 0 && write) {
          write(paths.map((p) => `@${p}`).join(' '));
          terminal?.focus();
        }
      },
      [write, terminal]
    ),
  });

  useEffect(() => {
    const wrapper = terminalWrapperRef.current;
    if (!wrapper || !isOpenCodeAgent || !write || !isWindows10 || !openCodeWheelScrollPatchEnabled)
      return;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.deltaY === 0) {
        return;
      }
      if (terminal?.hasSelection()) {
        return;
      }

      if (
        openCodeWheelDeltaRef.current !== 0 &&
        Math.sign(openCodeWheelDeltaRef.current) !== Math.sign(event.deltaY)
      ) {
        openCodeWheelDeltaRef.current = 0;
      }
      openCodeWheelDeltaRef.current += event.deltaY;
      const direction =
        openCodeWheelDeltaRef.current <= -OPENCODE_WHEEL_STEP_THRESHOLD
          ? 'up'
          : openCodeWheelDeltaRef.current >= OPENCODE_WHEEL_STEP_THRESHOLD
            ? 'down'
            : null;

      if (!direction) {
        event.preventDefault();
        return;
      }

      const now = Date.now();
      if (now - openCodeWheelLastDispatchRef.current < OPENCODE_WHEEL_THROTTLE_MS) {
        event.preventDefault();
        return;
      }

      openCodeWheelLastDispatchRef.current = now;
      openCodeWheelDeltaRef.current = 0;
      terminal?.focus();
      write(direction === 'up' ? TERMINAL_PAGE_UP_SEQUENCE : TERMINAL_PAGE_DOWN_SEQUENCE);
      event.preventDefault();
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      wrapper.removeEventListener('wheel', handleWheel, true);
      openCodeWheelDeltaRef.current = 0;
    };
  }, [
    isOpenCodeAgent,
    isWindows10,
    openCodeWheelScrollPatchEnabled,
    terminal,
    terminalWrapperRef,
    write,
  ]);

  useEffect(() => {
    if (!isCodexAgent) {
      return;
    }
    return () => {
      clearCodexWheelPendingScroll();
      codexWheelDeltaRef.current = 0;
      codexWheelAutoRawModeRef.current = false;
      codexWheelOverlayPendingRef.current = false;
      codexWheelOverlayActiveRef.current = false;
      codexWheelOverlayRequestedAtRef.current = 0;
      codexWheelSuppressNativeScrollRef.current = false;
    };
  }, [clearCodexWheelPendingScroll, isCodexAgent]);

  useEffect(() => {
    const wrapper = terminalWrapperRef.current;
    if (!wrapper || !isCodexAgent || !write || !codexWheelScrollPatchEnabled) return;

    // Codex 主视图不直接支持宿主终端那种滚轮回看。
    // 这里按两种屏幕状态分别处理：
    // 1. alternate screen 覆盖层：发 PageUp/PageDown 给 Codex 自己处理。
    // 2. normal screen 主视图：自动切 raw output，再用 xterm 本地 scrollback 滚动。
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.deltaY === 0) {
        return;
      }
      if (terminal?.hasSelection()) {
        return;
      }

      if (
        codexWheelDeltaRef.current !== 0 &&
        Math.sign(codexWheelDeltaRef.current) !== Math.sign(event.deltaY)
      ) {
        codexWheelDeltaRef.current = 0;
      }
      codexWheelDeltaRef.current += event.deltaY;

      const direction =
        codexWheelDeltaRef.current <= -CODEX_WHEEL_STEP_THRESHOLD
          ? 'up'
          : codexWheelDeltaRef.current >= CODEX_WHEEL_STEP_THRESHOLD
            ? 'down'
            : null;

      if (!direction) {
        event.preventDefault();
        return;
      }

      const now = Date.now();
      if (now - codexWheelLastDispatchRef.current < CODEX_WHEEL_THROTTLE_MS) {
        event.preventDefault();
        return;
      }

      codexWheelLastDispatchRef.current = now;
      codexWheelDeltaRef.current = 0;

      const overlayVisible = syncCodexOverlayState();
      const snapshot = getCodexViewportSnapshot();
      const nativeScrollState = detectCodexNativeScrollState(snapshot, overlayVisible);

      if (overlayVisible) {
        codexWheelOverlayPendingRef.current = false;
        clearCodexWheelPendingScroll();
        codexWheelNativeProbePendingRef.current = false;
        if (direction === 'down') {
          const bottomState = detectCodexTranscriptBottom();
          if (bottomState.atBottom) {
            terminal?.focus();
            write(CODEX_WHEEL_EXIT_TRANSCRIPT_SEQUENCE);
            codexWheelOverlayActiveRef.current = false;
            codexWheelOverlayPendingRef.current = false;
            codexWheelOverlayRequestedAtRef.current = 0;
            codexWheelAutoRawModeRef.current = false;
            codexWheelSuppressNativeScrollRef.current = true;
            scheduleCodexTranscriptExitConfirmation();
            event.preventDefault();
            return;
          }
        }
        terminal?.focus();
        write(direction === 'up' ? TERMINAL_PAGE_UP_SEQUENCE : TERMINAL_PAGE_DOWN_SEQUENCE);
        event.preventDefault();
        return;
      }

      if (nativeScrollState.active) {
        clearCodexWheelPendingScroll();
        scrollCodexViewport(direction);
        event.preventDefault();
        return;
      }

      if (direction === 'up') {
        codexWheelSuppressNativeScrollRef.current = false;
        if (!codexWheelAutoRawModeRef.current) {
          clearCodexWheelPendingScroll();
          toggleCodexRawOutputMode(true);
          codexWheelPendingScrollTimerRef.current = setTimeout(() => {
            codexWheelPendingScrollTimerRef.current = null;
            scheduleCodexNativeScrollProbe(
              () => {
                scrollCodexViewport('up');
              },
              () => {
                // 如果切到 raw output 后 scrollback 仍然为空，退回 Codex 自己的 transcript overlay。
                // 这说明当前版本的 Codex 没把历史真正写进宿主终端缓冲区。
                if (!codexWheelOverlayPendingRef.current) {
                  restoreCodexRawOutputMode();
                  openCodexTranscriptOverlay();
                }
              }
            );
          }, CODEX_WHEEL_RAW_RENDER_DELAY_MS);
        } else {
          if (codexWheelNativeProbePendingRef.current) {
            event.preventDefault();
            return;
          }
          if (syncCodexOverlayState()) {
            clearCodexWheelPendingScroll();
            terminal?.focus();
            write(TERMINAL_PAGE_UP_SEQUENCE);
          } else if (!codexWheelOverlayPendingRef.current) {
            restoreCodexRawOutputMode();
            openCodexTranscriptOverlay();
          }
        }
        event.preventDefault();
        return;
      }

      if (codexWheelAutoRawModeRef.current || !snapshot.atBottom) {
        clearCodexWheelPendingScroll();
        if (syncCodexOverlayState()) {
          terminal?.focus();
          write(TERMINAL_PAGE_DOWN_SEQUENCE);
        }
        event.preventDefault();
      }
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      wrapper.removeEventListener('wheel', handleWheel, true);
      resetCodexWheelState();
    };
  }, [
    clearCodexWheelPendingScroll,
    detectCodexNativeScrollState,
    detectCodexTranscriptBottom,
    getCodexViewportSnapshot,
    isCodexAgent,
    openCodexTranscriptOverlay,
    resetCodexWheelState,
    restoreCodexRawOutputMode,
    scheduleCodexNativeScrollProbe,
    scheduleCodexTranscriptExitConfirmation,
    scrollCodexViewport,
    syncCodexOverlayState,
    terminal,
    terminalWrapperRef,
    toggleCodexRawOutputMode,
    codexWheelScrollPatchEnabled,
    write,
  ]);

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  // Handle click to activate group
  const handleClick = useCallback(() => {
    if (!isActive) {
      onFocus?.();
    }
  }, [isActive, onFocus]);

  // Handle enhanced input send
  const handleEnhancedInputSend = useCallback(
    async (content: string, imagePaths: string[]) => {
      if (!write || !terminalSessionId) return;

      let message = content;

      if (imagePaths.length > 0) {
        const escapedPaths = imagePaths.map((p) => (p.includes(' ') ? `"${p}"` : p));
        message += `\n\n${escapedPaths.join(' ')}`;
      }

      // For multi-line content (images), write raw bracketed paste markers
      // to PTY directly. Avoids xterm's terminal.paste() which converts
      // \n→\r and breaks multi-image payloads.
      if (isCodexAgent && content.trim()) {
        codexPromptObservationsRef.current = [...codexPromptObservationsRef.current, message].slice(
          -MAX_CODEX_PROMPT_OBSERVATIONS
        );
      }

      const hasInternalNewlines = message.includes('\n');
      if (hasInternalNewlines) {
        write(`\x1b[200~${message}\x1b[201~`);
      } else {
        write(message);
      }

      const delay = imagePaths.length > 0 ? 800 : hasInternalNewlines ? 300 : 30;
      setTimeout(() => write('\r'), delay);

      terminal?.focus();
    },
    [isCodexAgent, write, terminalSessionId, terminal]
  );

  useEffect(() => {
    if (!terminalSessionId) return;
    onRegisterEnhancedInputSender?.(terminalSessionId, handleEnhancedInputSend);
    return () => {
      onUnregisterEnhancedInputSender?.(terminalSessionId);
    };
  }, [
    terminalSessionId,
    handleEnhancedInputSend,
    onRegisterEnhancedInputSender,
    onUnregisterEnhancedInputSender,
  ]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: click is for focus activation
    <div
      ref={terminalWrapperRef}
      className="relative h-full w-full"
      style={{ backgroundColor: settings.theme.background, contain: 'strict' }}
      onClick={handleClick}
    >
      <div ref={containerRef} className="h-full w-full" />
      <TerminalSearchBar
        ref={searchBarRef}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onFindNext={findNext}
        onFindPrevious={findPrevious}
        onClearSearch={clearSearch}
        theme={settings.theme}
      />
      {isCodexAgent && codexSessionViewer.enabled && (
        <CodexViewSessionButton
          containerRef={terminalWrapperRef}
          isTranscriptOpen={isTranscriptOpen}
          onClick={openCodexTranscript}
        />
      )}
      <Dialog open={isTranscriptOpen} onOpenChange={handleCodexTranscriptOpenChange}>
        <DialogPopup
          className="max-w-none"
          style={{
            height: `min(${codexSessionViewer.modalHeight}vh, calc(100vh - 80px))`,
            width: `min(${codexSessionViewer.modalWidth}px, calc(100vw - 80px))`,
            maxHeight: 'calc(100vh - 80px)',
            maxWidth: 'calc(100vw - 80px)',
          }}
        >
          <DialogHeader>
            <div className="flex flex-wrap items-start gap-3 pr-10">
              <DialogTitle className="shrink-0 pt-0.5">{t('Codex Session')}</DialogTitle>

              {/* Toolbar */}
              <div className="flex min-w-0 flex-1 basis-[24rem] flex-wrap items-start gap-2">
                {/* More Settings Popover */}
                <div className="order-3 ml-auto shrink-0">
                  <Popover>
                    <PopoverTrigger
                      className={buttonVariants({
                        size: 'sm',
                        variant: 'ghost',
                        className: 'h-7 w-7 p-0',
                      })}
                      title={t('More settings')}
                    >
                      <span className="sr-only">{t('More settings')}</span>
                      <Settings className="h-3 w-3" />
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-80"
                      side="bottom"
                      align="end"
                      zIndex={Z_INDEX.DROPDOWN_IN_MODAL}
                    >
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-3">{t('Refresh Settings')}</h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{t('Auto Refresh')}</span>
                              <Switch
                                checked={codexSessionViewer.autoRefresh}
                                onCheckedChange={(checked) => {
                                  useSettingsStore
                                    .getState()
                                    .setCodexSessionViewerAutoRefresh(checked);
                                }}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <span className="text-sm">{t('Refresh Interval')}</span>
                              <Select
                                value={String(codexSessionViewer.autoRefreshIntervalMs)}
                                onValueChange={(v) => {
                                  useSettingsStore
                                    .getState()
                                    .setCodexSessionViewerAutoRefreshInterval(Number(v));
                                }}
                                disabled={!codexSessionViewer.autoRefresh}
                              >
                                <SelectTrigger className="w-full" size="sm">
                                  <SelectValue>
                                    {codexSessionViewer.autoRefreshIntervalMs === 2000
                                      ? t('2 seconds')
                                      : codexSessionViewer.autoRefreshIntervalMs === 3000
                                        ? t('3 seconds')
                                        : t('5 seconds')}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectPopup
                                  zIndex={Z_INDEX.DROPDOWN_IN_MODAL}
                                  alignItemWithTrigger={false}
                                >
                                  <SelectItem value="2000">{t('2 seconds')}</SelectItem>
                                  <SelectItem value="3000">{t('3 seconds')}</SelectItem>
                                  <SelectItem value="5000">{t('5 seconds')}</SelectItem>
                                </SelectPopup>
                              </Select>
                            </div>
                          </div>
                        </div>

                        <div className="border-t pt-3">
                          <h4 className="text-sm font-medium mb-3">{t('Display Options')}</h4>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <span className="text-sm">{t('Initial Position')}</span>
                              <Select
                                value={codexSessionViewer.initialAnchor}
                                onValueChange={(v) => {
                                  useSettingsStore
                                    .getState()
                                    .setCodexSessionViewerInitialAnchor(v as 'end' | 'start');
                                }}
                              >
                                <SelectTrigger className="w-full" size="sm">
                                  <SelectValue>
                                    {codexSessionViewer.initialAnchor === 'end'
                                      ? t('Scroll to Bottom')
                                      : t('Scroll to Top')}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectPopup
                                  zIndex={Z_INDEX.DROPDOWN_IN_MODAL}
                                  alignItemWithTrigger={false}
                                >
                                  <SelectItem value="end">{t('Scroll to Bottom')}</SelectItem>
                                  <SelectItem value="start">{t('Scroll to Top')}</SelectItem>
                                </SelectPopup>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{t('Jump Buttons')}</span>
                              <Switch
                                checked={codexSessionViewer.showJumpButtons}
                                onCheckedChange={(checked) => {
                                  useSettingsStore
                                    .getState()
                                    .setCodexSessionViewerShowJumpButtons(checked);
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="border-t pt-3">
                          <h4 className="text-sm font-medium mb-3">{t('Window Settings')}</h4>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-sm">{t('Window Height')}</span>
                                <span className="text-xs text-muted-foreground">
                                  {codexSessionViewer.modalHeight}vh
                                </span>
                              </div>
                              <Slider
                                value={[codexSessionViewer.modalHeight]}
                                onValueChange={(vals) => {
                                  useSettingsStore
                                    .getState()
                                    .setCodexSessionViewerModalHeight(
                                      Array.isArray(vals) ? (vals[0] ?? 80) : vals
                                    );
                                }}
                                min={60}
                                max={95}
                                step={5}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-sm">{t('Window Width')}</span>
                                <span className="text-xs text-muted-foreground">
                                  {codexSessionViewer.modalWidth}px
                                </span>
                              </div>
                              <Slider
                                value={[codexSessionViewer.modalWidth]}
                                onValueChange={(vals) => {
                                  useSettingsStore
                                    .getState()
                                    .setCodexSessionViewerModalWidth(
                                      Array.isArray(vals) ? (vals[0] ?? 1200) : vals
                                    );
                                }}
                                min={800}
                                max={1400}
                                step={50}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Font Size Controls */}
                <div className="order-4 my-0.5 flex shrink-0 items-center overflow-hidden rounded-md border border-input bg-background/60">
                  <button
                    type="button"
                    className="flex h-5.5 w-5.5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => {
                      const newSize = Math.max(11, codexSessionViewer.fontSize - 1);
                      useSettingsStore.getState().setCodexSessionViewerFontSize(newSize);
                    }}
                    title={t('Decrease font size')}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="min-w-[2.35rem] border-x border-input bg-muted/15 px-1 text-center text-[10px] leading-[22px] font-medium tabular-nums text-foreground/75">
                    {codexSessionViewer.fontSize}
                  </span>
                  <button
                    type="button"
                    className="flex h-5.5 w-5.5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => {
                      const newSize = Math.min(16, codexSessionViewer.fontSize + 1);
                      useSettingsStore.getState().setCodexSessionViewerFontSize(newSize);
                    }}
                    title={t('Increase font size')}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Content Filter */}
                <div className="order-1 min-w-0 flex-1 basis-[20rem]">
                  <Select value={selectedCodexHistoryPath} onValueChange={handleCodexHistoryChange}>
                    <SelectTrigger
                      className="h-7 min-w-0 w-full sm:max-w-80"
                      size="sm"
                      title={codexHistorySelectLabel}
                    >
                      <SelectValue>{codexHistorySelectLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup
                      zIndex={Z_INDEX.DROPDOWN_IN_MODAL}
                      align="start"
                      alignItemWithTrigger={false}
                      sideOffset={8}
                      className={`${CODEX_HISTORY_PANEL_WIDTH_CLASS} p-0`}
                    >
                      <SelectItem
                        value="auto"
                        className={`${CODEX_HISTORY_SELECT_ITEM_CLASS} ${
                          selectedCodexHistoryPath === 'auto'
                            ? CODEX_HISTORY_SELECT_ITEM_SELECTED_CLASS
                            : CODEX_HISTORY_SELECT_ITEM_IDLE_CLASS
                        }`}
                      >
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-medium"
                            title={currentCodexSessionLabel}
                          >
                            {currentCodexSessionLabel}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {(currentCodexSessionSnapshot.updatedAt ?? t('Pending match')) +
                              ' · ' +
                              t('Entries') +
                              ': ' +
                              String(currentCodexSessionSnapshot.entryCount)}
                          </div>
                        </div>
                      </SelectItem>
                      {(codexHistoryCandidates.length > 0 || selectedCodexHistoryCandidate) && (
                        <SelectSeparator />
                      )}
                      {(codexHistoryCandidates.length > 0 || selectedCodexHistoryCandidate) && (
                        <div className={CODEX_HISTORY_SECTION_HEADER_CLASS}>
                          <div className="text-sm font-medium">
                            {locale === 'zh' ? '最近 10 个会话' : 'Recent 10 Sessions'}
                          </div>
                        </div>
                      )}
                      {codexHistoryCandidates.length === 0 && (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                          {locale === 'zh' ? '暂无历史会话。' : 'No history sessions.'}
                        </div>
                      )}
                      {visibleCodexHistoryCandidates.map((candidate) => {
                        const itemTitle =
                          candidate.sessionTitle ??
                          candidate.sessionId?.slice(0, 8) ??
                          t('Unknown');
                        const itemMeta =
                          (candidate.updatedAt ?? t('Unknown')) +
                          ' · ' +
                          t('Entries') +
                          ': ' +
                          String(candidate.entryCount);
                        const isSelected = selectedCodexHistoryPath === candidate.sessionFilePath;
                        return (
                          <SelectItem
                            key={candidate.sessionFilePath}
                            value={candidate.sessionFilePath}
                            className={`${CODEX_HISTORY_SELECT_ITEM_CLASS} ${
                              isSelected
                                ? CODEX_HISTORY_SELECT_ITEM_SELECTED_CLASS
                                : CODEX_HISTORY_SELECT_ITEM_IDLE_CLASS
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium" title={itemTitle}>
                                {itemTitle}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {itemMeta}
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectPopup>
                  </Select>
                </div>

                <div className="order-5 shrink-0">
                  <Select
                    value={codexSessionViewer.entryFilter}
                    onValueChange={(v) =>
                      useSettingsStore
                        .getState()
                        .setCodexSessionViewerEntryFilter(v as 'full' | 'explain-reply')
                    }
                  >
                    <SelectTrigger className="h-7 w-32" size="sm">
                      <SelectValue>
                        {codexSessionViewer.entryFilter === 'full'
                          ? t('Full Display')
                          : t('Compact Mode')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup zIndex={Z_INDEX.DROPDOWN_IN_MODAL} alignItemWithTrigger={false}>
                      <SelectItem value="full">{t('Full Display')}</SelectItem>
                      <SelectItem value="explain-reply">{t('Compact Mode')}</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 px-6 pt-1 pb-1">
            <div className="relative flex h-full min-h-0 flex-col gap-3">
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <div>
                  {`${t('Viewing')}: ${
                    selectedCodexHistoryPath === 'auto'
                      ? t('Current Session')
                      : t('History Session')
                  }`}
                </div>
                <div>{`${t('Session')}: ${codexTranscriptState.sessionId ?? t('Pending match')}`}</div>
                <div>{`${t('Updated')}: ${codexTranscriptState.updatedAt ?? t('Unknown')}`}</div>
                <div className="truncate">
                  {`${t('File')}: ${codexTranscriptState.sessionFilePath ?? t('Not resolved yet')}`}
                </div>
                {selectedCodexHistoryCandidate && (
                  <div>{`${t('Entries')}: ${selectedCodexHistoryCandidate.entryCount}`}</div>
                )}
              </div>

              <div
                ref={contentRef}
                className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60 bg-background/60 p-3"
                style={{ fontSize: `${codexSessionViewer.fontSize}px` }}
              >
                {codexTranscriptState.status === 'loading' && (
                  <div
                    className="text-muted-foreground"
                    style={{ fontSize: `${codexSessionViewer.fontSize}px` }}
                  >
                    {t('Loading Codex session record...')}
                  </div>
                )}

                {codexTranscriptState.status === 'error' && (
                  <div
                    className="text-destructive"
                    style={{ fontSize: `${codexSessionViewer.fontSize}px` }}
                  >
                    {codexTranscriptState.error ?? t('Failed to load Codex session record.')}
                  </div>
                )}

                {codexTranscriptState.status !== 'loading' &&
                  codexTranscriptState.status !== 'error' &&
                  codexTranscriptState.entries.length === 0 && (
                    <div
                      className="text-muted-foreground"
                      style={{ fontSize: `${codexSessionViewer.fontSize}px` }}
                    >
                      {t('No readable Codex session record was found yet.')}
                    </div>
                  )}

                {filteredEntries.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {filteredEntries.map((entry, index) => (
                      <section
                        key={`${entry.kind}-${entry.timestamp ?? 'no-time'}-${index}`}
                        className={`group relative rounded-md border px-3 pt-2 pr-10 pb-8 ${CODEX_TRANSCRIPT_CARD_STYLES[entry.kind]}`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div
                            className="font-medium"
                            style={{ fontSize: `${codexTranscriptTitleFontSize}px` }}
                          >
                            {formatCodexTranscriptEntryTitle(entry, t, locale)}
                          </div>
                          {entry.timestamp && (
                            <div
                              className="text-muted-foreground"
                              style={{ fontSize: `${codexTranscriptMetaFontSize}px` }}
                            >
                              {entry.timestamp}
                            </div>
                          )}
                        </div>
                        {entry.detail && (
                          <div
                            className="mb-2 text-muted-foreground"
                            style={{ fontSize: `${codexTranscriptMetaFontSize}px` }}
                          >
                            {entry.detail}
                          </div>
                        )}
                        <pre
                          className="select-text whitespace-pre-wrap break-words font-mono"
                          style={{
                            fontSize: `${codexSessionViewer.fontSize}px`,
                            lineHeight: `${codexTranscriptLineHeight}px`,
                          }}
                        >
                          {formatCodexTranscriptEntryBody(entry, t)}
                        </pre>
                        <button
                          type="button"
                          onClick={() => copyEntryContent(entry)}
                          className="absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded border border-border/50 bg-background/80 text-muted-foreground opacity-60 backdrop-blur-sm transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-within:opacity-100"
                          title={t('Copy')}
                          aria-label={t('Copy')}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter variant="bare" className="flex-row items-center">
            {/* Left: Reload */}
            <Button variant="outline" size="sm" onClick={() => void handleReloadCodexTranscript()}>
              {t('Reload')}
            </Button>

            {/* Center: Navigation + Copy */}
            <div className="flex flex-1 items-center justify-center gap-2">
              {codexSessionViewer.showJumpButtons && (
                <div className="flex items-center overflow-hidden rounded-md border border-input divide-x divide-input">
                  <button
                    type="button"
                    onClick={handleScrollToTop}
                    title={t('Scroll to top')}
                    className="flex h-7 items-center gap-1 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ArrowUp className="h-3 w-3" />
                    <span>{t('Scroll to top')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      useSettingsStore
                        .getState()
                        .setCodexSessionViewerAutoRefresh(!codexSessionViewer.autoRefresh);
                    }}
                    title={t('Toggle auto refresh')}
                    aria-pressed={codexSessionViewer.autoRefresh}
                    className={`flex h-7 items-center gap-1 px-2.5 text-xs transition-colors ${
                      codexSessionViewer.autoRefresh
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${codexSessionViewer.autoRefresh ? 'animate-spin' : ''}`}
                    />
                    <span>{t('Auto Refresh')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleScrollToBottomCodex}
                    title={t('Scroll to bottom')}
                    className="flex h-7 items-center gap-1 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ArrowDown className="h-3 w-3" />
                    <span>{t('Scroll to bottom')}</span>
                  </button>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={copyCodexTranscript}>
                {t('Copy')}
              </Button>
            </div>

            {/* Right: Close */}
            <Button size="sm" onClick={() => setIsTranscriptOpen(false)}>
              {t('Close')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      {showScrollToBottom && (
        <button
          type="button"
          onClick={handleScrollToBottom}
          className="absolute bottom-12 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/80 text-primary-foreground shadow-lg transition-all hover:bg-primary hover:scale-105 active:scale-95"
          title={t('Scroll to bottom')}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
      {(isLoading ||
        !resolvedShell ||
        (environment === 'hapi' && hapiGlobalInstalled === null)) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: settings.theme.foreground, opacity: 0.5 }}
            />
            <span style={{ color: settings.theme.foreground, opacity: 0.5 }} className="text-sm">
              {t('Loading {{agent}}...', { agent: agentCommand })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
