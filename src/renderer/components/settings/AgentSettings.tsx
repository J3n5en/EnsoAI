import type { AgentCliInfo, BuiltinAgentId, CustomAgent } from '@shared/types';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

// System agents (claude uses embedded CLI, others need detection)
const SYSTEM_AGENTS: BuiltinAgentId[] = ['claude', 'codex', 'droid', 'gemini', 'auggie', 'cursor'];

export function AgentSettings() {
  const {
    agentSettings,
    customAgents,
    wslEnabled,
    hapiSettings,
    setAgentEnabled,
    setAgentDefault,
    addCustomAgent,
    updateCustomAgent,
    removeCustomAgent,
  } = useSettingsStore();
  const { t } = useI18n();

  // Embedded CLI info (for Claude)
  const [embeddedCli, setEmbeddedCli] = React.useState<{
    available: boolean;
    version?: string;
  } | null>(null);

  // System agents detection status (not auto-detected)
  const [cliStatus, setCliStatus] = React.useState<Record<string, AgentCliInfo>>({});
  const [loadingAgents, setLoadingAgents] = React.useState<Set<string>>(new Set());
  const [editingAgent, setEditingAgent] = React.useState<CustomAgent | null>(null);
  const [isAddingAgent, setIsAddingAgent] = React.useState(false);

  // Get embedded CLI info on mount
  React.useEffect(() => {
    window.electronAPI.cli.getEmbeddedCliPath().then((result) => {
      setEmbeddedCli({ available: result.available, version: result.version });
    });
  }, []);

  // Detect a single agent
  const detectAgent = React.useCallback(
    (agentId: string, customAgent?: CustomAgent) => {
      setLoadingAgents((prev) => new Set(prev).add(agentId));

      window.electronAPI.cli
        .detectOne(agentId, customAgent, { includeWsl: wslEnabled })
        .then((result) => {
          setCliStatus((prev) => ({
            ...prev,
            [result.id]: result,
          }));
          setLoadingAgents((prev) => {
            const next = new Set(prev);
            next.delete(agentId);
            return next;
          });
        })
        .catch(() => {
          setLoadingAgents((prev) => {
            const next = new Set(prev);
            next.delete(agentId);
            return next;
          });
        });
    },
    [wslEnabled]
  );

  // Detect all system agents (excluding claude which uses embedded CLI)
  const detectAllAgents = React.useCallback(() => {
    const agentIds = [
      ...SYSTEM_AGENTS.filter((id) => id !== 'claude'),
      ...customAgents.map((a) => a.id),
    ];
    setLoadingAgents(new Set(agentIds));

    window.electronAPI.cli
      .detect(customAgents, { includeWsl: wslEnabled, forceRefresh: true })
      .then((result) => {
        const statusMap: Record<string, AgentCliInfo> = {};
        for (const agent of result.agents) {
          // Skip claude - it uses embedded CLI
          if (agent.id !== 'claude') {
            statusMap[agent.id] = agent;
          }
        }
        setCliStatus(statusMap);
        setLoadingAgents(new Set());
      })
      .catch(() => {
        setLoadingAgents(new Set());
      });
  }, [customAgents, wslEnabled]);

  const handleEnabledChange = (agentId: string, enabled: boolean) => {
    setAgentEnabled(agentId, enabled);
    if (!enabled && agentSettings[agentId]?.isDefault) {
      // If disabling default agent, find another enabled agent to be default
      const allAgentIds = ['claude', ...SYSTEM_AGENTS, ...customAgents.map((a) => a.id)];
      const firstEnabled = allAgentIds.find((id) => {
        if (id === agentId) return false;
        if (!agentSettings[id]?.enabled) return false;
        // Claude is always available via embedded CLI
        if (id === 'claude') return embeddedCli?.available;
        return cliStatus?.[id]?.installed;
      });
      if (firstEnabled) {
        setAgentDefault(firstEnabled);
      }
    }
  };

  const handleDefaultChange = (agentId: string) => {
    if (!agentSettings[agentId]?.enabled) return;

    // Claude is always available via embedded CLI
    if (agentId === 'claude') {
      if (embeddedCli?.available) {
        setAgentDefault(agentId);
      }
      return;
    }

    if (cliStatus?.[agentId]?.installed) {
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
    window.electronAPI.happy.checkGlobal(false).then((result) => {
      setHappyGlobal(result);
    });
  }, []);

  // Get Hapi agents (virtual agents that use hapi wrapper)
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
      // For claude, check embedded CLI; for others, check system CLI
      const isAvailable =
        agentId === 'claude' ? embeddedCli?.available : cliStatus[agentId]?.installed;

      if (isAvailable) {
        infos.push({
          id: `${agentId}-hapi`,
          baseId: agentId,
          info: { name: `${baseInfo.name}`, description: baseInfo.description },
          cli: {
            id: `${agentId}-hapi`,
            name: baseInfo.name,
            command: agentId,
            installed: true,
            version: agentId === 'claude' ? embeddedCli?.version : cliStatus[agentId]?.version,
            isBuiltin: true,
            environment: 'hapi',
          },
        });
      }
    }

    return infos;
  }, [cliStatus, hapiSettings.enabled, embeddedCli]);

  // Get Happy agents (virtual agents that use happy wrapper)
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
      // For claude, check embedded CLI; for others, check system CLI
      const isAvailable =
        agentId === 'claude' ? embeddedCli?.available : cliStatus[agentId]?.installed;

      if (isAvailable) {
        infos.push({
          id: `${agentId}-happy`,
          baseId: agentId,
          info: { name: `${baseInfo.name}`, description: baseInfo.description },
          cli: {
            id: `${agentId}-happy`,
            name: baseInfo.name,
            command: agentId,
            installed: true,
            version: agentId === 'claude' ? embeddedCli?.version : cliStatus[agentId]?.version,
            isBuiltin: true,
            environment: 'happy',
          },
        });
      }
    }

    return infos;
  }, [cliStatus, happyGlobal.installed, hapiSettings.happyEnabled, embeddedCli]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Agent</h3>
          <p className="text-sm text-muted-foreground">
            {t('Configure available AI Agent CLI tools')}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          'New sessions use the default agent. Long-press the plus to pick another enabled agent. Only Claude supports session persistence for now.'
        )}
      </p>

      {/* System Agents Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-medium">{t('System Agents')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('Detect CLI tools installed on your system')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={detectAllAgents}
            disabled={loadingAgents.size > 0}
          >
            <Search className={cn('mr-1 h-3 w-3', loadingAgents.size > 0 && 'animate-pulse')} />
            {t('Detect All')}
          </Button>
        </div>

        <div className="space-y-2">
          {SYSTEM_AGENTS.map((agentId) => {
            const info = BUILTIN_AGENT_INFO[agentId];
            const cli = cliStatus[agentId];
            const isLoading = loadingAgents.has(agentId);
            const config = agentSettings[agentId];

            // Claude uses embedded CLI, others need detection
            const isClaude = agentId === 'claude';
            const isDetected = isClaude ? embeddedCli !== null : cli !== undefined;
            const isInstalled = isClaude
              ? (embeddedCli?.available ?? false)
              : (cli?.installed ?? false);
            const version = isClaude ? embeddedCli?.version : cli?.version;
            const canEnable = isInstalled;
            const canSetDefault = isInstalled && config?.enabled;

            return (
              <div
                key={agentId}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-3 py-2',
                  isDetected && !isInstalled && 'opacity-50'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{info.name}</span>
                    {isClaude ? (
                      // Claude: show embedded CLI status
                      embeddedCli === null ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      ) : embeddedCli.available ? (
                        <>
                          {embeddedCli.version && (
                            <span className="text-xs text-muted-foreground">
                              v{embeddedCli.version}
                            </span>
                          )}
                          <span className="whitespace-nowrap rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-600 dark:text-green-400">
                            {t('Built-in')}
                          </span>
                        </>
                      ) : (
                        <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          {t('Not available')}
                        </span>
                      )
                    ) : // Other agents: show detection status
                    isLoading ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    ) : isDetected ? (
                      <>
                        {version && (
                          <span className="text-xs text-muted-foreground">v{version}</span>
                        )}
                        {cli?.environment === 'wsl' && (
                          <span className="whitespace-nowrap rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                            WSL
                          </span>
                        )}
                        {!isInstalled && (
                          <span
                            className={cn(
                              'whitespace-nowrap rounded px-1.5 py-0.5 text-xs',
                              cli?.timedOut
                                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                : 'bg-destructive/10 text-destructive'
                            )}
                          >
                            {cli?.timedOut ? t('Timed out') : t('Not installed')}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {t('Not detected')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Show Detect button only for non-claude agents that haven't been detected */}
                  {!isClaude && !isDetected && !isLoading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => detectAgent(agentId)}
                    >
                      <Search className="mr-1 h-3 w-3" />
                      {t('Detect')}
                    </Button>
                  )}
                  {!isClaude && isLoading ? (
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
              const isLoading = loadingAgents.has(agent.id);
              const isDetected = cli !== undefined;
              const isInstalled = cli?.installed ?? false;
              const config = agentSettings[agent.id];
              const canEnable = isInstalled;
              const canSetDefault = isInstalled && config?.enabled;

              return (
                <div
                  key={agent.id}
                  className={cn(
                    'rounded-lg border px-3 py-2',
                    isDetected && !isInstalled && 'opacity-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-medium text-sm">{agent.name}</span>
                      <code className="rounded bg-muted px-1 py-0.5 text-xs truncate">
                        {agent.command}
                      </code>
                      {isLoading ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      ) : isDetected ? (
                        <>
                          {cli?.version && (
                            <span className="text-xs text-muted-foreground">v{cli.version}</span>
                          )}
                          {!isInstalled && (
                            <span
                              className={cn(
                                'whitespace-nowrap rounded px-1.5 py-0.5 text-xs',
                                cli?.timedOut
                                  ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                  : 'bg-destructive/10 text-destructive'
                              )}
                            >
                              {cli?.timedOut ? t('Timed out') : t('Not installed')}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {t('Not detected')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isDetected && !isLoading && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => detectAgent(agent.id, agent)}
                        >
                          <Search className="mr-1 h-3 w-3" />
                          {t('Detect')}
                        </Button>
                      )}
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
