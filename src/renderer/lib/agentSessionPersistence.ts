import { normalizeCliSessionId } from './cliSessionId';

interface PersistableAgentSession {
  agentCommand: string;
  activated?: boolean;
  cliSessionId?: string;
}

export function isPersistableAgentSession(session: PersistableAgentSession): boolean {
  if (session.agentCommand?.startsWith('claude')) return session.activated === true;
  if (session.agentCommand !== 'codex' || session.cliSessionId === undefined) return false;
  return Boolean(normalizeCliSessionId(session.cliSessionId));
}

export function filterPersistableAgentSessions<T extends PersistableAgentSession>(
  sessions: T[]
): T[] {
  const claimedCodexSessionIds = new Set<string>();
  const persistableSessions: T[] = [];

  for (const session of sessions) {
    if (!isPersistableAgentSession(session)) continue;
    if (session.agentCommand !== 'codex') {
      persistableSessions.push(session);
      continue;
    }

    const cliSessionId = normalizeCliSessionId(session.cliSessionId ?? '');
    if (!cliSessionId || claimedCodexSessionIds.has(cliSessionId)) continue;
    claimedCodexSessionIds.add(cliSessionId);
    persistableSessions.push(
      session.cliSessionId === cliSessionId ? session : { ...session, cliSessionId }
    );
  }

  return persistableSessions;
}
