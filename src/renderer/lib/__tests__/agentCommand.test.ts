import { describe, expect, it } from 'vitest';
import { buildAgentCliInvocation } from '../agentCommand';

describe('buildAgentCliInvocation', () => {
  it('builds Codex resume command with no-alt-screen when cliSessionId exists', () => {
    expect(
      buildAgentCliInvocation({
        agentCommand: 'codex',
        initialized: true,
        uiSessionId: 'ui-1',
        cliSessionId: '01996abf-bc87-7e80-9909-3a86a414f7e8',
      })
    ).toEqual({
      executable: 'codex',
      args: ['resume', '--no-alt-screen', '01996abf-bc87-7e80-9909-3a86a414f7e8'],
    });
  });

  it('does not use --last when Codex session id is missing', () => {
    expect(
      buildAgentCliInvocation({
        agentCommand: 'codex',
        initialized: true,
        uiSessionId: 'ui-1',
      })
    ).toEqual({ executable: 'codex', args: [] });
  });

  it('appends custom args to Codex resume command', () => {
    expect(
      buildAgentCliInvocation({
        agentCommand: 'codex',
        initialized: true,
        uiSessionId: 'ui-1',
        cliSessionId: '01996abf-bc87-7e80-9909-3a86a414f7e8',
        customArgs: '-c model="gpt-5.5"',
      })
    ).toEqual({
      executable: 'codex',
      args: [
        'resume',
        '--no-alt-screen',
        '01996abf-bc87-7e80-9909-3a86a414f7e8',
        '-c model="gpt-5.5"',
      ],
    });
  });

  it('keeps Claude resume behavior', () => {
    expect(
      buildAgentCliInvocation({
        agentCommand: 'claude',
        initialized: true,
        uiSessionId: 'ui-1',
        cliSessionId: 'claude-session',
      })
    ).toEqual({ executable: 'claude', args: ['--resume', 'claude-session', '--ide'] });
  });

  it('keeps Cursor resume behavior', () => {
    expect(
      buildAgentCliInvocation({
        agentCommand: 'cursor-agent',
        initialized: true,
        uiSessionId: 'ui-1',
      })
    ).toEqual({ executable: 'cursor-agent', args: ['--resume', 'ui-1'] });
  });
});
