import type { AgentCliInfo, BuiltinAgentId, CustomAgent } from '@shared/types';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { BUILTIN_AGENT_INFO, BUILTIN_AGENTS } from './constants';

type AgentFormProps =
  | {
      agent: CustomAgent;
      onSubmit: (agent: CustomAgent) => void;
      onCancel: () => void;
    }
  | {
      agent?: undefined;
      onSubmit: (agent: Omit<CustomAgent, 'id'>) => void;
      onCancel: () => void;
    };

function AgentForm({ agent, onSubmit, onCancel }: AgentFormProps) {
  const { t } = useI18n();
  const [name, setName] = React.useState(agent?.name ?? '');
  const [command, setCommand] = React.useState(agent?.command ?? '');
  const [description, setDescription] = React.useState(agent?.description ?? '');

  const isValid = name.trim() && command.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const data = {
      name: name.trim(),
      command: command.trim(),
      description: description.trim() || undefined,
    };

    if (agent) {
      (onSubmit as (agent: CustomAgent) => void)({ ...agent, ...data });
    } else {
      (onSubmit as (agent: Omit<CustomAgent, 'id'>) => void)(data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="space-y-1">
        <label htmlFor="agent-name" className="text-sm font-medium">
          {t('Name')}
        </label>
        <Input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Agent"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="agent-command" className="text-sm font-medium">
          {t('Command')}
        </label>
        <Input
          id="agent-command"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="my-agent --arg1"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="agent-desc" className="text-sm font-medium">
          {t('Description')}{' '}
          <span className="font-normal text-muted-foreground">{t('(optional)')}</span>
        </label>
        <Input
          id="agent-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('Short description')}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!isValid}>
          {agent ? t('Save') : t('Add')}
        </Button>
      </div>
    </form>
  );
}

export function AgentSettings() {
  const {
    agentSettings,
    customAgents,
    wslEnabled,
    hapiSettings,
    shellConfig,
    setAgentEnabled,
    setAgentDefault,
    addCustomAgent,
    updateCustomAgent,
    removeCustomAgent,
  } = useSettingsStore();
  const { t } = useI18n();
  const [cliStatus, setCliStatus] = React.useState<Record<string, AgentCliInfo>>({});
  const [loadingAgents, setLoadingAgents] = React.useState<Set<string>>(new Set());
  const [editingAgent, setEditingAgent] = React.useState<CustomAgent | null>(null);
  const [isAddingAgent, setIsAddingAgent] = React.useState(false);

  const detectAllAgents = React.useCallback(
    (forceRefresh = false) => {
      setLoadingAgents(new Set(['all']));
      if (forceRefresh) {
        setCliStatus({});
      }

      window.electronAPI.cli
        .detect(customAgents, { includeWsl: wslEnabled, forceRefresh })
        .then((result) => {
          const statusMap: Record<string, AgentCliInfo> = {};
          for (const agent of result.agents) {
            statusMap[agent.id] = agent;
          }
          setCliStatus(statusMap);
          setLoadingAgents(new Set());
        })
        .catch(() => {
          setLoadingAgents(new Set());
        });
    },
    [customAgents, wslEnabled]
  );

  React.useEffect(() => {
    detectAllAgents();
  }, [detectAllAgents]);

  const handleEnabledChange = (agentId: string, enabled: boolean) => {
    setAgentEnabled(agentId, enabled);
    if (!enabled && agentSettings[agentId]?.isDefault) {
      const allAgentIds = [...BUILTIN_AGENTS, ...customAgents.map((a) => a.id)];
      const firstEnabled = allAgentIds.find(
        (id) => id !== agentId && agentSettings[id]?.enabled && cliStatus?.[id]?.installed
      );
      if (firstEnabled) {
        setAgentDefault(firstEnabled);
      }
    }
  };

  const handleDefaultChange = (agentId: string) => {
    if (agentSettings[agentId]?.enabled && cliStatus?.[agentId]?.installed) {
      setAgentDefault(agentId);
    }
  };

  const handleAddAgent = (agent: Omit<CustomAgent, 'id'>) => {
    const id = `custom-${Date.now()}`;
    addCustomAgent({ ...agent, id });
    setIsAddingAgent(false);
  };

  const handleEditAgent = (agent: CustomAgent) => {
    updateCustomAgent(agent.id, agent);
    setEditingAgent(null);
  };

  const handleRemoveAgent = (id: string) => {
    removeCustomAgent(id);
  };

  const isRefreshing = loadingAgents.size > 0;

  // Hapi-supported agent IDs (only these can run through hapi)
  const HAPI_SUPPORTED_AGENTS: BuiltinAgentId[] = ['claude', 'codex', 'gemini'];

  // Happy-supported agent IDs (only these can run through happy)
  const HAPPY_SUPPORTED_AGENTS: BuiltinAgentId[] = ['claude', 'codex'];

  // Happy global installation status
  const [happyGlobal, setHappyGlobal] = React.useState<{
    installed: boolean;
    version?: string;
  }>({ installed: false });

  // Check happy global installation on mount
  React.useEffect(() => {
    window.electronAPI.happy.checkGlobal(false, shellConfig).then((result) => {
      setHappyGlobal(result);
    });
  }, [shellConfig]);

  // Get all agents including WSL and Hapi variants
  const allAgentInfos = React.useMemo(() => {
    const infos: Array<{
      id: string;
      baseId: BuiltinAgentId;
      info: { name: string; description: string };
      cli?: AgentCliInfo;
    }> = [];

    for (const agentId of BUILTIN_AGENTS) {
      const baseInfo = BUILTIN_AGENT_INFO[agentId];
      const nativeCli = cliStatus[agentId];
      const wslCli = cliStatus[`${agentId}-wsl`];

      // Add native agent
      infos.push({ id: agentId, baseId: agentId, info: baseInfo, cli: nativeCli });

      // Add WSL agent if detected
      if (wslCli?.installed) {
        infos.push({
          id: `${agentId}-wsl`,
          baseId: agentId,
          info: { name: `${baseInfo.name}`, description: baseInfo.description },
          cli: wslCli,
        });
      }
    }

    return infos;
  }, [cliStatus]);

  // Get Hapi agents (virtual agents that use hapi wrapper)
  // On Windows, CLI might be installed in WSL only, so check both native and WSL
  const hapiAgentInfos = React.useMemo(() => {
    if (!hapiSettings.enabled) return [];

    const infos: Array<{
      id: string;
      baseId: BuiltinAgentId;
      info: { name: string; description: string };
      cli?: AgentCliInfo;
    }> = [];

    for (const agentId of HAPI_SUPPORTED_AGENTS) {
      const baseInfo = BUILTIN_AGENT_INFO[agentId];
      const nativeCli = cliStatus[agentId];
      const wslCli = cliStatus[`${agentId}-wsl`];

      // Hapi agent is available if the base CLI is installed in native OR WSL
      const baseCli = nativeCli?.installed ? nativeCli : wslCli?.installed ? wslCli : null;
      if (baseCli) {
        infos.push({
          id: `${agentId}-hapi`,
          baseId: agentId,
          info: { name: `${baseInfo.name}`, description: baseInfo.description },
          cli: {
            ...baseCli,
            id: `${agentId}-hapi`,
            environment: 'hapi',
          },
        });
      }
    }

    return infos;
  }, [cliStatus, hapiSettings.enabled]);

  // Get Happy agents (virtual agents that use happy wrapper)
  // Only shown when happy is globally installed AND enabled in settings
  const happyAgentInfos = React.useMemo(() => {
    if (!happyGlobal.installed || !hapiSettings.happyEnabled) return [];

    const infos: Array<{
      id: string;
      baseId: BuiltinAgentId;
      info: { name: string; description: string };
      cli?: AgentCliInfo;
    }> = [];

    for (const agentId of HAPPY_SUPPORTED_AGENTS) {
      const baseInfo = BUILTIN_AGENT_INFO[agentId];
      const nativeCli = cliStatus[agentId];
      const wslCli = cliStatus[`${agentId}-wsl`];

      // Happy agent is available if the base CLI is installed in native OR WSL
      const baseCli = nativeCli?.installed ? nativeCli : wslCli?.installed ? wslCli : null;
      if (baseCli) {
        infos.push({
          id: `${agentId}-happy`,
          baseId: agentId,
          info: { name: `${baseInfo.name}`, description: baseInfo.description },
          cli: {
            ...baseCli,
            id: `${agentId}-happy`,
            environment: 'happy',
          },
        });
      }
    }

    return infos;
  }, [cliStatus, happyGlobal.installed, hapiSettings.happyEnabled]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Agent</h3>
          <p className="text-sm text-muted-foreground">
            {t('Configure available AI Agent CLI tools')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => detectAllAgents(true)}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          'New sessions use the default agent. Long-press the plus to pick another enabled agent. Only Claude supports session persistence for now.'
        )}
      </p>

      {/* Builtin Agents */}
      <div className="space-y-2">
        {allAgentInfos.map(({ id: agentId, info, cli }) => {
          const isLoading = isRefreshing;
          const isInstalled = cli?.installed ?? false;
          const config = agentSettings[agentId];
          const canEnable = isInstalled;
          const canSetDefault = isInstalled && config?.enabled;

          return (
            <div
              key={agentId}
              className={cn(
                'flex items-center justify-between rounded-lg border px-3 py-2',
                !isLoading && !isInstalled && 'opacity-50'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{info.name}</span>
                  {!isLoading && cli?.version && (
                    <span className="text-xs text-muted-foreground">v{cli.version}</span>
                  )}
                  {!isLoading && cli?.environment === 'wsl' && (
                    <span className="whitespace-nowrap rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                      WSL
                    </span>
                  )}
                  {!isLoading && !isInstalled && (
                    <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                      {t('Not installed')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {isLoading ? (
                  <div className="flex h-5 w-20 items-center justify-center">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{t('Enable')}</span>
                      <Switch
                        checked={config?.enabled && canEnable}
                        onCheckedChange={(checked) => handleEnabledChange(agentId, checked)}
                        disabled={!canEnable}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{t('Default')}</span>
                      <Switch
                        checked={config?.isDefault ?? false}
                        onCheckedChange={() => handleDefaultChange(agentId)}
                        disabled={!canSetDefault}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hapi Agents Section - shown when remote sharing is enabled */}
      {hapiSettings.enabled && hapiAgentInfos.length > 0 && (
        <div className="border-t pt-4">
          <div className="mb-3">
            <h3 className="text-base font-medium">{t('Hapi Agents')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('Agents available through remote sharing')}
            </p>
          </div>
          <div className="space-y-2">
            {hapiAgentInfos.map(({ id: agentId, info, cli }) => {
              const config = agentSettings[agentId];
              const canEnable = cli?.installed ?? false;
              const canSetDefault = canEnable && config?.enabled;

              return (
                <div
                  key={agentId}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{info.name}</span>
                      <span className="whitespace-nowrap rounded bg-orange-500/10 px-1.5 py-0.5 text-xs text-orange-600 dark:text-orange-400">
                        Hapi
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{t('Enable')}</span>
                      <Switch
                        checked={config?.enabled && canEnable}
                        onCheckedChange={(checked) => handleEnabledChange(agentId, checked)}
                        disabled={!canEnable}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{t('Default')}</span>
                      <Switch
                        checked={config?.isDefault ?? false}
                        onCheckedChange={() => handleDefaultChange(agentId)}
                        disabled={!canSetDefault}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Happy Agents Section - shown when happy is installed */}
      {happyAgentInfos.length > 0 && (
        <div className="border-t pt-4">
          <div className="mb-3">
            <h3 className="text-base font-medium">{t('Happy Agents')}</h3>
            <p className="text-xs text-muted-foreground">{t('Agents running through Happy')}</p>
          </div>
          <div className="space-y-2">
            {happyAgentInfos.map(({ id: agentId, info, cli }) => {
              const config = agentSettings[agentId];
              const canEnable = cli?.installed ?? false;
              const canSetDefault = canEnable && config?.enabled;

              return (
                <div
                  key={agentId}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{info.name}</span>
                      <span className="whitespace-nowrap rounded bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-600 dark:text-purple-400">
                        Happy
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{t('Enable')}</span>
                      <Switch
                        checked={config?.enabled && canEnable}
                        onCheckedChange={(checked) => handleEnabledChange(agentId, checked)}
                        disabled={!canEnable}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{t('Default')}</span>
                      <Switch
                        checked={config?.isDefault ?? false}
                        onCheckedChange={() => handleDefaultChange(agentId)}
                        disabled={!canSetDefault}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom Agents Section */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-medium">{t('Custom Agent')}</h3>
            <p className="text-xs text-muted-foreground">{t('Add custom CLI tools')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsAddingAgent(true)}>
            <Plus className="mr-1 h-3 w-3" />
            {t('Add')}
          </Button>
        </div>

        {customAgents.length > 0 && (
          <div className="space-y-2">
            {customAgents.map((agent) => {
              const cli = cliStatus[agent.id];
              const isLoading = isRefreshing;
              const isInstalled = cli?.installed ?? false;
              const config = agentSettings[agent.id];
              const canEnable = isInstalled;
              const canSetDefault = isInstalled && config?.enabled;

              return (
                <div
                  key={agent.id}
                  className={cn(
                    'rounded-lg border px-3 py-2',
                    !isLoading && !isInstalled && 'opacity-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-medium text-sm">{agent.name}</span>
                      <code className="rounded bg-muted px-1 py-0.5 text-xs truncate">
                        {agent.command}
                      </code>
                      {!isLoading && cli?.version && (
                        <span className="text-xs text-muted-foreground">v{cli.version}</span>
                      )}
                      {!isLoading && !isInstalled && (
                        <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          {t('Not installed')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {isLoading ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{t('Enable')}</span>
                            <Switch
                              checked={config?.enabled && canEnable}
                              onCheckedChange={(checked) => handleEnabledChange(agent.id, checked)}
                              disabled={!canEnable}
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{t('Default')}</span>
                            <Switch
                              checked={config?.isDefault ?? false}
                              onCheckedChange={() => handleDefaultChange(agent.id)}
                              disabled={!canSetDefault}
                            />
                          </div>
                          <div className="flex items-center gap-0.5 ml-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setEditingAgent(agent)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveAgent(agent.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {customAgents.length === 0 && !isAddingAgent && (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-xs text-muted-foreground">{t('No custom agents yet')}</p>
          </div>
        )}
      </div>

      {/* Add Agent Dialog */}
      <Dialog open={isAddingAgent} onOpenChange={setIsAddingAgent}>
        <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
          <div className="p-4">
            <DialogTitle className="text-base font-medium">{t('Add custom agent')}</DialogTitle>
            <AgentForm onSubmit={handleAddAgent} onCancel={() => setIsAddingAgent(false)} />
          </div>
        </DialogPopup>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
        <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
          <div className="p-4">
            <DialogTitle className="text-base font-medium">{t('Edit Agent')}</DialogTitle>
            {editingAgent && (
              <AgentForm
                agent={editingAgent}
                onSubmit={handleEditAgent}
                onCancel={() => setEditingAgent(null)}
              />
            )}
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
