import type { AgentMetadata } from '@shared/types';

export const BUILTIN_AGENTS: AgentMetadata[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic Claude AI Assistant',
    icon: 'claude',
    binary: 'claude',
    capabilities: {
      chat: true,
      codeEdit: true,
      terminal: true,
      fileRead: true,
      fileWrite: true,
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI Codex CLI',
    icon: 'codex',
    binary: 'codex',
    capabilities: {
      chat: true,
      codeEdit: true,
      terminal: true,
      fileRead: true,
      fileWrite: true,
    },
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini CLI',
    icon: 'gemini',
    binary: 'gemini',
    capabilities: {
      chat: true,
      codeEdit: true,
      terminal: false,
      fileRead: true,
      fileWrite: false,
    },
  },
  {
    id: 'pi',
    name: 'Pi',
    description: 'Pi Coding Agent CLI',
    icon: 'pi',
    binary: 'pi',
    capabilities: {
      chat: true,
      codeEdit: true,
      terminal: true,
      fileRead: true,
      fileWrite: true,
    },
  },
];

export class AgentRegistry {
  private agents: Map<string, AgentMetadata>;

  constructor(builtinAgents: AgentMetadata[] = BUILTIN_AGENTS) {
    this.agents = new Map(builtinAgents.map((a) => [a.id, a]));
  }

  list(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }

  get(id: string): AgentMetadata | undefined {
    return this.agents.get(id);
  }

  register(agent: AgentMetadata): void {
    this.agents.set(agent.id, agent);
  }

  unregister(id: string): void {
    this.agents.delete(id);
  }
}
