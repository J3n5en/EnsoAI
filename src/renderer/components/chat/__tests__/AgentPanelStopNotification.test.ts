import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AgentPanel stop notification handling', () => {
  const source = fs.readFileSync(path.join(__dirname, '../AgentPanel.tsx'), 'utf-8');

  it('opens enhanced input with the matched UI session id', () => {
    const lookupIndex = source.indexOf('const session = findSessionByNotificationId(sessionId);');
    const notificationIndex = source.indexOf('// Send system notification', lookupIndex);
    const block = source.slice(lookupIndex, notificationIndex);

    expect(block).toContain('setEnhancedInputOpen(session.id, true);');
    expect(block).not.toContain('setEnhancedInputOpen(sessionId, true);');
  });
});
