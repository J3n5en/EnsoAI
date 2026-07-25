import type { Session } from '@/components/chat/SessionBar';

type MatchableSession = Pick<Session, 'id' | 'sessionId' | 'cliSessionId'>;

export function matchesAgentSessionId(session: MatchableSession, id: string): boolean {
  return session.id === id || session.sessionId === id || session.cliSessionId === id;
}

export function findAgentSessionById<T extends MatchableSession>(
  sessions: T[],
  id: string
): T | undefined {
  return sessions.find((session) => matchesAgentSessionId(session, id));
}
