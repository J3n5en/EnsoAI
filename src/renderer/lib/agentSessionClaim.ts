import { normalizeCliSessionId } from './cliSessionId';

interface CliSessionClaimable {
  id: string;
  cliSessionId?: string;
}

interface CliSessionClaimResult<T> {
  claimed: boolean;
  sessions: T[];
}

export function claimCliSessionIdInSessions<T extends CliSessionClaimable>(
  sessions: T[],
  sessionId: string,
  cliSessionId: string
): CliSessionClaimResult<T> {
  const normalizedCliSessionId = normalizeCliSessionId(cliSessionId);
  if (!normalizedCliSessionId) return { claimed: false, sessions };

  const target = sessions.find((session) => session.id === sessionId);
  if (!target) return { claimed: false, sessions };
  const targetCliSessionId = target.cliSessionId
    ? normalizeCliSessionId(target.cliSessionId)
    : undefined;
  if (targetCliSessionId === normalizedCliSessionId) {
    if (target.cliSessionId === normalizedCliSessionId) return { claimed: true, sessions };
    return {
      claimed: true,
      sessions: sessions.map((session) =>
        session.id === sessionId ? { ...session, cliSessionId: normalizedCliSessionId } : session
      ),
    };
  }

  const alreadyClaimed = sessions.some(
    (session) =>
      session.id !== sessionId &&
      session.cliSessionId !== undefined &&
      normalizeCliSessionId(session.cliSessionId) === normalizedCliSessionId
  );
  if (alreadyClaimed) return { claimed: false, sessions };

  return {
    claimed: true,
    sessions: sessions.map((session) =>
      session.id === sessionId ? { ...session, cliSessionId: normalizedCliSessionId } : session
    ),
  };
}
