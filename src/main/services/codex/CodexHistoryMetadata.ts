import { createReadStream, type Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { extractCodexSessionIdFromPath } from './CodexHistoryParser';

const SESSION_TITLE_MAX_LENGTH = 160;
const YIELD_AFTER_LINES = 200;

export interface ParseCodexSessionMetadataInput {
  filePath: string;
  content: string;
  fileStat: Pick<Stats, 'birthtimeMs' | 'ctimeMs' | 'mtimeMs' | 'size'>;
}

export interface CodexSessionMetadata {
  sessionId: string;
  filePath: string;
  cwdValues: string[];
  cwdNormalizedValues: string[];
  createdAtMs: number;
  modifiedAtMs: number;
  fileMtimeMs: number;
  fileSize: number;
  cwd?: string;
  originator?: string;
  sessionSource?: string;
  title?: string;
  timestamp?: string;
  model?: string;
  modelProvider?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function normalizeCwd(value: string): string {
  const slashNormalized = value.trim().replace(/\\/g, '/');
  const wslMatch = slashNormalized.match(/^\/\/wsl(?:\.localhost|\$)\/[^/]+(\/.*)?$/i);
  const wslPath = wslMatch ? wslMatch[1] || '/' : null;
  const normalized = wslPath === '/' ? wslPath : (wslPath ?? slashNormalized).replace(/\/+$/, '');
  if (wslPath !== null || (normalized.startsWith('/') && !normalized.startsWith('//'))) {
    return normalized;
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function extractCwdValues(record: Record<string, unknown>): string[] {
  const payload = asRecord(record.payload);
  const session = asRecord(record.session);
  const payloadSession = asRecord(payload?.session);
  const metadata = asRecord(record.metadata) ?? asRecord(payload?.metadata);
  const values = [
    record.cwd,
    record.workingDirectory,
    payload?.cwd,
    payload?.workingDirectory,
    session?.cwd,
    payloadSession?.cwd,
    metadata?.cwd,
  ];

  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function extractFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  const payload = asRecord(record.payload);
  const session = asRecord(record.session);
  const payloadSession = asRecord(payload?.session);
  const metadata = asRecord(record.metadata) ?? asRecord(payload?.metadata);
  const values = [record, payload, session, payloadSession, metadata].flatMap((source) =>
    keys.map((key) => source?.[key])
  );
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function extractMetadataSessionId(record: Record<string, unknown>): string | undefined {
  const explicitSessionId = extractFirstString(record, ['session_id']);
  if (explicitSessionId) return explicitSessionId;

  return record.type === 'session_meta'
    ? extractFirstString(record, ['sessionId', 'id'])
    : undefined;
}

function extractSessionOriginator(record: Record<string, unknown>): string | undefined {
  return record.type === 'session_meta' ? extractFirstString(record, ['originator']) : undefined;
}

function extractSessionSource(record: Record<string, unknown>): string | undefined {
  return record.type === 'session_meta' ? extractFirstString(record, ['source']) : undefined;
}

function collectTextValues(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) output.push(text);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTextValues(item, output);
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  for (const key of ['text', 'content', 'message', 'payload', 'items']) {
    if (key in record) collectTextValues(record[key], output);
  }
}

function normalizeSessionTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isGeneratedUserText(text: string): boolean {
  return (
    text.startsWith('# AGENTS.md instructions') ||
    text.startsWith('<environment_context>') ||
    text.startsWith('<turn_aborted>') ||
    text.startsWith('<user_action>')
  );
}

function extractTitleValue(record: Record<string, unknown>): string | undefined {
  const payload = asRecord(record.payload);
  const role = record.role ?? payload?.role;
  if (role !== 'user') return undefined;

  const textParts: string[] = [];
  collectTextValues(record.content, textParts);
  collectTextValues(payload?.content, textParts);

  const title = normalizeSessionTitle([...new Set(textParts)].join(' '));
  if (!title || isGeneratedUserText(title)) return undefined;

  return title.length > SESSION_TITLE_MAX_LENGTH
    ? `${title.slice(0, SESSION_TITLE_MAX_LENGTH).trim()}...`
    : title;
}

function parseTimestampMs(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? time : null;
}

export function extractCodexSessionCreatedAtFromPath(filePath: string): number | null {
  const filename = path.basename(filePath);
  const match = filename.match(
    /rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-[0-9a-f-]{36}\.jsonl$/i
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  if (!year || !month || !day || !hour || !minute || !second) return null;

  const [yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] = [
    year,
    month,
    day,
    hour,
    minute,
    second,
  ].map(Number);
  if (
    yearValue === undefined ||
    monthValue === undefined ||
    dayValue === undefined ||
    hourValue === undefined ||
    minuteValue === undefined ||
    secondValue === undefined
  ) {
    return null;
  }

  // rollout 文件名记录的是本地时间；构造后逐项核对，避免无效日期被自动修正。
  const createdAt = new Date(
    yearValue,
    monthValue - 1,
    dayValue,
    hourValue,
    minuteValue,
    secondValue
  );
  if (
    createdAt.getFullYear() !== yearValue ||
    createdAt.getMonth() !== monthValue - 1 ||
    createdAt.getDate() !== dayValue ||
    createdAt.getHours() !== hourValue ||
    createdAt.getMinutes() !== minuteValue ||
    createdAt.getSeconds() !== secondValue
  ) {
    return null;
  }
  return createdAt.getTime();
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

interface CodexSessionMetadataAccumulator {
  cwdValues: string[];
  metadataSessionId?: string;
  originator?: string;
  sessionSource?: string;
  timestamp?: string;
  title?: string;
  model?: string;
  modelProvider?: string;
}

function createMetadataAccumulator(
  baseMetadata?: CodexSessionMetadata
): CodexSessionMetadataAccumulator {
  return {
    cwdValues: [...(baseMetadata?.cwdValues ?? [])],
    metadataSessionId: baseMetadata?.sessionId,
    originator: baseMetadata?.originator,
    sessionSource: baseMetadata?.sessionSource,
    timestamp: baseMetadata?.timestamp,
    title: baseMetadata?.title,
    model: baseMetadata?.model,
    modelProvider: baseMetadata?.modelProvider,
  };
}

function consumeMetadataLine(accumulator: CodexSessionMetadataAccumulator, line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const record = asRecord(JSON.parse(trimmed) as unknown);
    if (!record) return;

    accumulator.cwdValues.push(...extractCwdValues(record));
    accumulator.metadataSessionId ??= extractMetadataSessionId(record);
    accumulator.originator ??= extractSessionOriginator(record);
    accumulator.sessionSource ??= extractSessionSource(record);
    accumulator.timestamp ??= extractFirstString(record, ['timestamp']);
    accumulator.model ??= extractFirstString(record, ['model']);
    accumulator.modelProvider ??= extractFirstString(record, ['model_provider', 'modelProvider']);
    accumulator.title ??= extractTitleValue(record);
  } catch {
    // Codex jsonl 里可能存在不完整行，这里只跳过坏行。
  }
}

function buildCodexSessionMetadata(
  filePath: string,
  fileStat: Pick<Stats, 'birthtimeMs' | 'ctimeMs' | 'mtimeMs' | 'size'>,
  accumulator: CodexSessionMetadataAccumulator
): CodexSessionMetadata | null {
  const sessionId = extractCodexSessionIdFromPath(filePath) ?? accumulator.metadataSessionId;
  if (!sessionId) return null;

  const cwdValues = uniqueValues(accumulator.cwdValues);
  const cwdNormalizedValues = uniqueValues(cwdValues.map(normalizeCwd));
  const createdAtMs =
    parseTimestampMs(accumulator.timestamp) ??
    extractCodexSessionCreatedAtFromPath(filePath) ??
    fileStat.birthtimeMs ??
    fileStat.ctimeMs;

  const metadata: CodexSessionMetadata = {
    sessionId,
    filePath,
    cwdValues,
    cwdNormalizedValues,
    createdAtMs,
    modifiedAtMs: fileStat.mtimeMs,
    fileMtimeMs: fileStat.mtimeMs,
    fileSize: fileStat.size,
  };
  if (cwdValues[0]) metadata.cwd = cwdValues[0];
  if (accumulator.originator) metadata.originator = accumulator.originator;
  if (accumulator.sessionSource) metadata.sessionSource = accumulator.sessionSource;
  if (accumulator.title) metadata.title = accumulator.title;
  if (accumulator.timestamp) metadata.timestamp = accumulator.timestamp;
  if (accumulator.model) metadata.model = accumulator.model;
  if (accumulator.modelProvider) metadata.modelProvider = accumulator.modelProvider;
  return metadata;
}

export function parseCodexSessionMetadata({
  filePath,
  content,
  fileStat,
}: ParseCodexSessionMetadataInput): CodexSessionMetadata | null {
  const accumulator = createMetadataAccumulator();

  for (const line of content.split(/\r?\n/)) {
    consumeMetadataLine(accumulator, line);
  }

  return buildCodexSessionMetadata(filePath, fileStat, accumulator);
}

interface MetadataSnapshotResult {
  metadata: CodexSessionMetadata | null;
  changedDuringRead: boolean;
}

function yieldToMainProcess(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function readMetadataSnapshot(
  filePath: string,
  startByte = 0,
  baseMetadata?: CodexSessionMetadata
): Promise<MetadataSnapshotResult> {
  const fileStat = await stat(filePath);
  const accumulator = createMetadataAccumulator(baseMetadata);

  if (fileStat.size > startByte) {
    const input = createReadStream(filePath, {
      encoding: 'utf8',
      start: startByte,
      end: fileStat.size - 1,
    });
    const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
    let lineCount = 0;
    try {
      for await (const line of lines) {
        consumeMetadataLine(accumulator, line);
        lineCount += 1;
        if (lineCount % YIELD_AFTER_LINES === 0) await yieldToMainProcess();
      }
    } finally {
      lines.close();
    }
  }

  const afterRead = await stat(filePath);
  return {
    metadata: buildCodexSessionMetadata(filePath, fileStat, accumulator),
    changedDuringRead: afterRead.size !== fileStat.size || afterRead.mtimeMs !== fileStat.mtimeMs,
  };
}

export async function readCodexSessionMetadata(
  filePath: string
): Promise<CodexSessionMetadata | null> {
  let snapshot = await readMetadataSnapshot(filePath);
  if (snapshot.changedDuringRead) snapshot = await readMetadataSnapshot(filePath);
  return snapshot.metadata;
}

export async function readCodexSessionMetadataFrom(
  filePath: string,
  startByte: number,
  baseMetadata: CodexSessionMetadata
): Promise<CodexSessionMetadata | null> {
  let snapshot = await readMetadataSnapshot(filePath, startByte, baseMetadata);
  if (!snapshot.changedDuringRead) return snapshot.metadata;

  const latestStat = await stat(filePath);
  if (latestStat.size < startByte) return readCodexSessionMetadata(filePath);

  snapshot = await readMetadataSnapshot(filePath, startByte, baseMetadata);
  return snapshot.metadata;
}
