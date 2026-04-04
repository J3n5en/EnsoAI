export interface ExternalSessionRecord {
  id: string;
  backendSessionId?: string;
  sessionId?: string;
  name: string;
  displayName: string;
  agentId: string;
  agentCommand: string;
  repoPath: string;
  cwd: string;
  projectName: string;
  groupId: string | null;
  terminalTitle?: string;
  isGroupActive: boolean;
  isSessionActive: boolean;
  displayOrder: number;
  updatedAt: number;
}

export interface ExternalSessionSnapshot {
  sessions: ExternalSessionRecord[];
  syncedAt: number;
}

export interface ExternalSessionFocusPayload {
  sessionId: string;
  cwd: string;
  groupId: string | null;
}

export interface ExternalSessionApiItem extends ExternalSessionRecord {
  windowId: number;
}
