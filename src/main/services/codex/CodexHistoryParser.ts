import path from 'node:path';
import type { CodexHistoryMessage, CodexHistoryRole } from '@shared/types';

const VISIBLE_ROLES = new Set<CodexHistoryRole>(['user', 'assistant']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function normalizeRole(value: unknown): CodexHistoryRole | null {
  if (typeof value !== 'string') return null;
  return VISIBLE_ROLES.has(value as CodexHistoryRole) ? (value as CodexHistoryRole) : null;
}

function collectText(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) output.push(text);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, output);
    }
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  for (const key of ['text', 'content', 'message', 'payload', 'items']) {
    if (key in record) {
      collectText(record[key], output);
    }
  }
}

function extractRole(record: Record<string, unknown>): CodexHistoryRole | null {
  return (
    normalizeRole(record.role) ??
    normalizeRole(asRecord(record.payload)?.role) ??
    normalizeRole(asRecord(record.message)?.role)
  );
}

function extractMessage(
  record: Record<string, unknown>,
  index: number
): CodexHistoryMessage | null {
  const role = extractRole(record);
  if (!role) return null;

  const textParts: string[] = [];
  collectText(record.content, textParts);
  collectText(record.message, textParts);
  collectText(record.payload, textParts);

  const text = [...new Set(textParts)].join('\n').trim();
  if (!text) return null;
  if (role === 'user' && isGeneratedUserText(text)) return null;

  const timestamp = typeof record.timestamp === 'string' ? record.timestamp : undefined;
  return { id: `${timestamp ?? 'line'}-${index}`, role, text, timestamp };
}

function isGeneratedUserText(text: string): boolean {
  const normalized = text.trim();
  return (
    normalized.startsWith('# AGENTS.md instructions') ||
    normalized.startsWith('<environment_context>') ||
    normalized.startsWith('<turn_aborted>') ||
    normalized.startsWith('<user_action>')
  );
}

function parseCodexHistoryLine(line: string, index: number): CodexHistoryMessage | null {
  const normalized = line.trim();
  if (!normalized) return null;

  try {
    const parsed = JSON.parse(normalized) as unknown;
    const record = asRecord(parsed);
    return record ? extractMessage(record, index) : null;
  } catch {
    // Codex jsonl 里可能混入不完整行，历史面板只跳过坏行。
    return null;
  }
}

export function parseCodexHistoryJsonl(
  content: string,
  maxMessages = 500
): { messages: CodexHistoryMessage[]; truncated: boolean } {
  const messages: CodexHistoryMessage[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const message = parseCodexHistoryLine(lines[i] ?? '', i);
    if (!message) continue;

    if (messages.length >= maxMessages) {
      return { messages, truncated: true };
    }
    messages.push(message);
  }

  return { messages, truncated: false };
}

export async function parseCodexHistoryLines(
  lines: AsyncIterable<string>,
  maxMessages = 500
): Promise<{ messages: CodexHistoryMessage[]; truncated: boolean }> {
  const messages: CodexHistoryMessage[] = [];
  let lineIndex = 0;

  for await (const line of lines) {
    const message = parseCodexHistoryLine(line, lineIndex);
    lineIndex += 1;
    if (!message) continue;

    // 多读一条有效消息只为判断是否截断，确认后立即停止消费文件流。
    if (messages.length >= maxMessages) {
      return { messages, truncated: true };
    }
    messages.push(message);
  }

  return { messages, truncated: false };
}

export function extractCodexSessionIdFromPath(filePath: string): string | null {
  const filename = path.basename(filePath);
  const match = filename.match(
    /rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f-]{36})\.jsonl$/i
  );
  return match?.[1] ?? null;
}
