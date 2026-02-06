export type BuiltinAgentId =
  | 'claude'
  | 'codex'
  | 'droid'
  | 'gemini'
  | 'auggie'
  | 'cursor'
  | 'opencode';

export type AgentEnvironment = 'native' | 'hapi' | 'happy';

export interface AgentCliInfo {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  isBuiltin: boolean;
  environment?: AgentEnvironment;
  /** Detection timed out - status unknown */
  timedOut?: boolean;
}

export interface CustomAgent {
  id: string;
  name: string;
  command: string;
  description?: string;
}

export interface AgentCliStatus {
  agents: AgentCliInfo[];
}

export interface CliDetectDebugLog {
  level: 'debug' | 'warn';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}
