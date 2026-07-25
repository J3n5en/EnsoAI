export type CodexHistoryRole = 'user' | 'assistant' | 'system' | 'tool';

export interface CodexHistoryMessage {
  id: string;
  role: CodexHistoryRole;
  text: string;
  timestamp?: string;
}

export interface CodexHistoryQuery {
  sessionId?: string;
  cwd?: string;
  startedAfter?: number;
  maxMessages?: number;
}

export interface CodexLatestSessionQuery {
  cwd?: string;
  startedAfter?: number;
}

export interface CodexLatestSessionResult {
  sessionId: string;
  filePath: string;
}

export interface CodexSessionListQuery {
  cwd?: string;
  maxSessions?: number;
}

export interface CodexSessionListItem {
  sessionId: string;
  filePath: string;
  modifiedAt: number;
  cwd?: string;
  title?: string;
  timestamp?: string;
  model?: string;
  modelProvider?: string;
}

export interface CodexSessionListResult {
  sessions: CodexSessionListItem[];
}

export interface CodexHistoryResult {
  sessionId: string | null;
  filePath: string | null;
  messages: CodexHistoryMessage[];
  truncated: boolean;
  error?: string;
}
