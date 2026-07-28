export type CodexHistoryRole = 'user' | 'assistant' | 'system' | 'tool';
export type CodexRuntime = 'native' | 'wsl';

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
  runtime?: CodexRuntime;
  wslDistro?: string;
}

export interface CodexLatestSessionQuery {
  cwd?: string;
  startedAfter?: number;
  excludeSessionIds?: string[];
  originator?: string;
  matchMode?: 'strict' | 'legacy-unique';
  runtime?: CodexRuntime;
  wslDistro?: string;
}

export interface CodexLatestSessionResult {
  sessionId: string;
  filePath: string;
  wslDistro?: string;
}

export interface CodexSessionListQuery {
  cwd?: string;
  maxSessions?: number;
  runtime?: CodexRuntime;
  wslDistro?: string;
}

export interface CodexSessionListItem {
  sessionId: string;
  filePath: string;
  modifiedAt: number;
  wslDistro?: string;
  cwd?: string;
  title?: string;
  timestamp?: string;
  model?: string;
  modelProvider?: string;
}

export interface CodexSessionListResult {
  sessions: CodexSessionListItem[];
  wslDistro?: string;
}

export interface CodexHistoryResult {
  sessionId: string | null;
  filePath: string | null;
  messages: CodexHistoryMessage[];
  truncated: boolean;
  error?: string;
}
