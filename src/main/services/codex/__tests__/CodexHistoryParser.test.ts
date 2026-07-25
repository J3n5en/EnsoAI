import { describe, expect, it } from 'vitest';
import { extractCodexSessionIdFromPath, parseCodexHistoryJsonl } from '../CodexHistoryParser';

describe('CodexHistoryParser', () => {
  it('extracts readable messages from common Codex jsonl shapes', () => {
    const content = [
      JSON.stringify({
        timestamp: '2026-07-17T10:00:00.000Z',
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hello codex' }],
      }),
      JSON.stringify({
        timestamp: '2026-07-17T10:00:01.000Z',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'hello user' }],
      }),
      JSON.stringify({
        timestamp: '2026-07-17T10:00:02.000Z',
        type: 'event',
        payload: {
          role: 'assistant',
          message: { content: 'nested assistant text' },
        },
      }),
    ].join('\n');

    const result = parseCodexHistoryJsonl(content);

    expect(result.truncated).toBe(false);
    expect(result.messages.map((m) => `${m.role}:${m.text}`)).toEqual([
      'user:hello codex',
      'assistant:hello user',
      'assistant:nested assistant text',
    ]);
  });

  it('skips invalid and unreadable lines', () => {
    const content = ['not-json', JSON.stringify({ type: 'metrics', count: 1 })].join('\n');
    expect(parseCodexHistoryJsonl(content).messages).toEqual([]);
  });

  it('hides generated prompt and tool wrapper content from readable history', () => {
    const content = [
      JSON.stringify({
        timestamp: '2026-07-17T10:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '# AGENTS.md instructions\n<INSTRUCTIONS>' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-17T10:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: '<environment_context>ignored</environment_context>' },
          ],
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-17T10:00:02.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: '<user_action><action>review</action></user_action>' },
          ],
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-17T10:00:03.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: 'hidden system prompt' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-17T10:00:04.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '真正的问题' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-17T10:00:05.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Codex 回答' }],
        },
      }),
    ].join('\n');

    expect(parseCodexHistoryJsonl(content).messages.map((m) => `${m.role}:${m.text}`)).toEqual([
      'user:真正的问题',
      'assistant:Codex 回答',
    ]);
  });

  it('limits rendered messages', () => {
    const content = Array.from({ length: 3 }, (_, i) =>
      JSON.stringify({ role: 'user', content: `message ${i}` })
    ).join('\n');
    const result = parseCodexHistoryJsonl(content, 2);
    expect(result.truncated).toBe(true);
    expect(result.messages.map((m) => m.text)).toEqual(['message 0', 'message 1']);
  });

  it('extracts session id from rollout filename', () => {
    expect(
      extractCodexSessionIdFromPath(
        'C:/Users/me/.codex/sessions/2026/07/17/rollout-2026-07-17T10-00-00-01996abf-bc87-7e80-9909-3a86a414f7e8.jsonl'
      )
    ).toBe('01996abf-bc87-7e80-9909-3a86a414f7e8');
  });
});
