import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@/stores/settings';

// Agent display names and commands (same as SessionBar)
const AGENT_INFO: Record<string, { name: string; command: string }> = {
  claude: { name: 'Claude', command: 'claude' },
  codex: { name: 'Codex', command: 'codex' },
  droid: { name: 'Droid', command: 'droid' },
  gemini: { name: 'Gemini', command: 'gemini' },
  auggie: { name: 'Auggie', command: 'auggie' },
  cursor: { name: 'Cursor', command: 'cursor-agent' },
  opencode: { name: 'OpenCode', command: 'opencode' },
};

export interface ResolvedAgent {
  agentId: string;
  name: string;
  command: string;
  isDefault: boolean;
  environment: 'native' | 'hapi' | 'happy';
  customPath?: string;
  customArgs?: string;
}

/** Resolve an agentId into display name, command, environment, and custom settings */
export function resolveAgent(
  agentId: string,
  agentSettings: Record<
    string,
    { enabled?: boolean; isDefault?: boolean; customPath?: string; customArgs?: string }
  >,
  customAgents: { id: string; name: string; command: string }[]
): ResolvedAgent {
  const isHapi = agentId.endsWith('-hapi');
  const isHappy = agentId.endsWith('-happy');
  const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

  const customAgent = customAgents.find((a) => a.id === baseId);
  const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? baseId;
  const command = customAgent?.command ?? AGENT_INFO[baseId]?.command ?? 'claude';
  const name = isHapi ? `${baseName} (Hapi)` : isHappy ? `${baseName} (Happy)` : baseName;
  const environment = isHapi ? 'hapi' : isHappy ? 'happy' : 'native';
  const isDefault = !!agentSettings[agentId]?.isDefault;
  const config = agentSettings[baseId];

  return {
    agentId,
    name,
    command,
    isDefault,
    environment,
    customPath: config?.customPath,
    customArgs: config?.customArgs,
  };
}

/** Hook that returns the list of enabled & installed agents, sorted with default first */
export function useEnabledAgents(): ResolvedAgent[] {
  const { agentSettings, agentDetectionStatus, customAgents, hapiSettings } = useSettingsStore();
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    const next = new Set<string>();

    for (const id of enabledAgentIds) {
      if (agentSettings[id]?.isDefault) {
        next.add(id);
        continue;
      }
      if (id.endsWith('-hapi')) {
        if (!hapiSettings.enabled) continue;
        const baseId = id.slice(0, -5);
        if (agentDetectionStatus[baseId]?.installed) next.add(id);
        continue;
      }
      if (id.endsWith('-happy')) {
        const baseId = id.slice(0, -6);
        if (agentDetectionStatus[baseId]?.installed) next.add(id);
        continue;
      }
      if (agentDetectionStatus[id]?.installed) next.add(id);
    }

    setInstalledAgents(next);
  }, [agentSettings, agentDetectionStatus, hapiSettings.enabled]);

  return useMemo(() => {
    const ids = Object.keys(agentSettings).filter((id) => {
      if (!agentSettings[id]?.enabled || !installedAgents.has(id)) return false;
      if (id.endsWith('-hapi') && !hapiSettings.enabled) return false;
      return true;
    });

    return ids
      .map((id) => resolveAgent(id, agentSettings, customAgents))
      .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  }, [agentSettings, customAgents, installedAgents, hapiSettings.enabled]);
}
