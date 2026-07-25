export interface AgentCliInvocationInput {
  agentCommand: string;
  initialized?: boolean;
  uiSessionId?: string;
  cliSessionId?: string;
  customPath?: string;
  customArgs?: string;
}

export interface AgentCliInvocation {
  executable: string;
  args: string[];
}

export function buildAgentCliInvocation({
  agentCommand,
  initialized,
  uiSessionId,
  cliSessionId,
  customPath,
  customArgs,
}: AgentCliInvocationInput): AgentCliInvocation {
  const executable = customPath || agentCommand;
  const sessionId = cliSessionId || uiSessionId;
  const args: string[] = [];

  if (agentCommand === 'codex') {
    if (initialized && cliSessionId) {
      args.push('resume', '--no-alt-screen', cliSessionId);
    }
  } else if (agentCommand === 'cursor-agent') {
    if (sessionId) {
      args.push('--resume', sessionId);
    }
  } else if (agentCommand.startsWith('claude')) {
    if (sessionId) {
      if (initialized) {
        args.push('--resume', sessionId);
      } else {
        args.push('--session-id', sessionId);
      }
    }
    args.push('--ide');
  }

  if (customArgs) {
    args.push(customArgs);
  }

  return { executable, args };
}
