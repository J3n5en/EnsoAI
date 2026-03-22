import type { BuiltinAgentId, CustomAgent } from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { BUILTIN_AGENT_INFO, BUILTIN_AGENTS } from './constants';

const itemVariants = {
  initial: { opacity: 0, height: 0, marginBottom: 0 },
  animate: { opacity: 1, height: 'auto', marginBottom: 8 },
  exit: { opacity: 0, height: 0, marginBottom: 0 },
};

const itemTransition = { duration: 0.2, ease: 'easeInOut' as const };

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

// Form for editing builtin agent custom path and args
interface BuiltinAgentFormProps {
  agentId: string;
  agentName: string;
  customPath?: string;
  customArgs?: string;
  onSubmit: (config: { customPath?: string; customArgs?: string }) => void;
  onCancel: () => void;
}

function BuiltinAgentForm({
  agentName,
  customPath: initialPath,
  customArgs: initialArgs,
  onSubmit,
  onCancel,
}: BuiltinAgentFormProps) {
  const { t } = useI18n();
  const [customPath, setCustomPath] = React.useState(initialPath ?? '');
  const [customArgs, setCustomArgs] = React.useState(initialArgs ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      customPath: customPath.trim() || undefined,
      customArgs: customArgs.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="space-y-1">
        <label htmlFor="agent-path" className="text-sm font-medium">
          {t('Absolute path')}{' '}
          <span className="font-normal text-muted-foreground">{t('(optional)')}</span>
        </label>
        <Input
          id="agent-path"
          value={customPath}
          onChange={(e) => setCustomPath(e.target.value)}
          placeholder={`/usr/local/bin/${agentName.toLowerCase()}`}
        />
        <p className="text-xs text-muted-foreground">{t('Override default command lookup')}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="agent-args" className="text-sm font-medium">
          {t('Additional arguments')}{' '}
          <span className="font-normal text-muted-foreground">{t('(optional)')}</span>
        </label>
        <Input
          id="agent-args"
          value={customArgs}
          onChange={(e) => setCustomArgs(e.target.value)}
          placeholder="--yolo --dangerously-skip-permissions"
        />
        <p className="text-xs text-muted-foreground">{t('Extra arguments passed to the agent')}</p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button type="submit" size="sm">
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}

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

export function AgentSettings({ repoPath }: { repoPath?: string }) {
  const {
    agentSettings,
    agentDetectionStatus,
    customAgents,
    hapiSettings,
    setAgentEnabled,
    setAgentDefault,
    setAgentCustomConfig,
    setAgentDetectionStatus,
    clearAgentDetectionStatus,
    addCustomAgent,
    updateCustomAgent,
    removeCustomAgent,
  } = useSettingsStore();
  const { t } = useI18n();
  const [loadingAgents, setLoadingAgents] = React.useState<Set<string>>(new Set());
  const [editingAgent, setEditingAgent] = React.useState<CustomAgent | null>(null);
  const [editingBuiltinAgent, setEditingBuiltinAgent] = React.useState<string | null>(null);
  const [isAddingAgent, setIsAddingAgent] = React.useState(false);

  // Detect a single agent (auto-disable if not installed)
  const detectSingleAgent = React.useCallback(
    async (agentId: string, customAgent?: CustomAgent) => {
      setLoadingAgents((prev) => new Set([...prev, agentId]));
      try {
        // Get customPath from settings for builtin agents
        const customPath = agentSettings[agentId]?.customPath;
        const result = await window.electronAPI.cli.detectOne(
          repoPath,
          agentId,
          customAgent,
          customPath
        );
        setAgentDetectionStatus(agentId, {
          installed: result.installed,
          version: result.version,
          detectedAt: Date.now(),
        });
        // Auto-disable if not installed
        if (!result.installed && agentSettings[agentId]?.enabled) {
          setAgentEnabled(agentId, false);
        }
      } finally {
        setLoadingAgents((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
      }
    },
    [agentSettings, repoPath, setAgentDetectionStatus, setAgentEnabled]
  );

  // Refresh only enabled agents (auto-disable if not installed)
  const refreshEnabledAgents = React.useCallback(async () => {
    const enabledAgentIds = Object.entries(agentSettings)
      .filter(([, config]) => config.enabled)
      .map(([id]) => id);

    if (enabledAgentIds.length === 0) return;

    setLoadingAgents(new Set(enabledAgentIds));

    try {
      const results = await Promise.all(
        enabledAgentIds.map(async (agentId) => {
          const customAgent = customAgents.find((a) => a.id === agentId);
          const customPath = agentSettings[agentId]?.customPath;
          const result = await window.electronAPI.cli.detectOne(
            repoPath,
            agentId,
            customAgent,
            customPath
          );
          setAgentDetectionStatus(agentId, {
            installed: result.installed,
            version: result.version,
            detectedAt: Date.now(),
          });
          return { agentId, installed: result.installed };
        })
      );
      // Auto-disable agents that are not installed
      for (const { agentId, installed } of results) {
        if (!installed) {
          setAgentEnabled(agentId, false);
        }
      }
    } finally {
      setLoadingAgents(new Set());
    }
  }, [agentSettings, customAgents, repoPath, setAgentDetectionStatus, setAgentEnabled]);

  const handleEnabledChange = (agentId: string, enabled: boolean) => {
    setAgentEnabled(agentId, enabled);
    if (!enabled) {
      // Clear detection status when disabling (no need to persist for disabled agents)
      clearAgentDetectionStatus(agentId);
      if (agentSettings[agentId]?.isDefault) {
        const allAgentIds = [...BUILTIN_AGENTS, ...customAgents.map((a) => a.id)];
        const firstEnabled = allAgentIds.find(
          (id) =>
            id !== agentId && agentSettings[id]?.enabled && agentDetectionStatus[id]?.installed
        );
        if (firstEnabled) {
          setAgentDefault(firstEnabled);
        }
      }
    }
  };

  const handleDefaultChange = (agentId: string) => {
    // For hapi/happy agents, check the base agent's detection status
    const baseAgentId = agentId.replace(/-(hapi|happy)$/, '');
    const detectionId = baseAgentId !== agentId ? baseAgentId : agentId;
    if (agentSettings[agentId]?.enabled && agentDetectionStatus[detectionId]?.installed) {
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
    window.electronAPI.happy.checkGlobal(undefined, false).then((result) => {
      setHappyGlobal(result);
    });
  }, []);

  // Get all builtin agents
  const allAgentInfos = React.useMemo(() => {
    return BUILTIN_AGENTS.map((agentId) => {
      const baseInfo = BUILTIN_AGENT_INFO[agentId];
      const detection = agentDetectionStatus[agentId];
      return {
        id: agentId,
        info: baseInfo,
        detectionInfo: detection,
        isDetected: !!detection,
      };
    });
  }, [agentDetectionStatus]);

  // Get Hapi agents (virtual agents that use hapi wrapper)
  const hapiAgentInfos = React.useMemo(() => {
    if (!hapiSettings.enabled) return [];

    return HAPI_SUPPORTED_AGENTS.filter((agentId) => agentDetectionStatus[agentId]?.installed).map(
      (agentId) => ({
        id: `${agentId}-hapi`,
        info: BUILTIN_AGENT_INFO[agentId],
        detectionInfo: agentDetectionStatus[agentId],
      })
    );
  }, [agentDetectionStatus, hapiSettings.enabled]);

  // Get Happy agents (virtual agents that use happy wrapper)
  // Only shown when happy is globally installed AND enabled in settings
  const happyAgentInfos = React.useMemo(() => {
    if (!happyGlobal.installed || !hapiSettings.happyEnabled) return [];

    return HAPPY_SUPPORTED_AGENTS.filter((agentId) => agentDetectionStatus[agentId]?.installed).map(
      (agentId) => ({
        id: `${agentId}-happy`,
        info: BUILTIN_AGENT_INFO[agentId],
        detectionInfo: agentDetectionStatus[agentId],
      })
    );
  }, [agentDetectionStatus, happyGlobal.installed, hapiSettings.happyEnabled]);

  const isRefreshing = loadingAgents.size > 0;

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
          onClick={() => refreshEnabledAgents()}
          disabled={isRefreshing}
          title={t('Refresh enabled agents')}
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          'New sessions use the default agent. Long-press the plus to pick another enabled agent. Only Claude supports session persistence for now.'
        )}
      </p>

      {/* Enabled Agents */}
      <div>
        <h4 className="text-sm font-medium mb-2">{t('Enabled')}</h4>
        <div className="space-y-0">
          <AnimatePresence initial={false}>
            {allAgentInfos
              .filter(({ id }) => agentSettings[id]?.enabled)
              .map(({ id: agentId, info, detectionInfo, isDetected }) => {
                const isLoading = loadingAgents.has(agentId);
                const isInstalled = detectionInfo?.installed ?? false;
                const config = agentSettings[agentId];
                const canEnable = isDetected && isInstalled;
                const canSetDefault = canEnable && config?.enabled;

                return (
                  <motion.div
                    key={agentId}
                    layout
                    variants={itemVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={itemTransition}
                    className="overflow-hidden"
                  >
                    <div
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-3 py-2',
                        isDetected && !isInstalled && 'opacity-50'
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium text-sm">{info.name}</span>
                        {detectionInfo?.version && (
                          <span className="text-xs text-muted-foreground">
                            v{detectionInfo.version}
                          </span>
                        )}
                        {isDetected && !isInstalled && (
                          <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                            {t('Not installed')}
                          </span>
                        )}
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
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => setEditingBuiltinAgent(agentId)}
                            title={t('Edit')}
                          >
                            <Pencil
                              className={cn(
                                'h-3 w-3',
                                (config?.customPath || config?.customArgs) && 'text-primary'
                              )}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => detectSingleAgent(agentId)}
                            disabled={isLoading}
                            title={t('Detect')}
                          >
                            {isLoading ? (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                            ) : (
                              <Search className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
          </AnimatePresence>
          {allAgentInfos.filter(({ id }) => agentSettings[id]?.enabled).length === 0 && (
            <div className="rounded-lg border border-dashed p-3 text-center">
              <p className="text-xs text-muted-foreground">{t('No enabled agents')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Disabled Agents */}
      <div>
        <h4 className="text-sm font-medium mb-2">{t('Disabled')}</h4>
        <div className="space-y-0">
          <AnimatePresence initial={false}>
            {allAgentInfos
              .filter(({ id }) => !agentSettings[id]?.enabled)
              .map(({ id: agentId, info, detectionInfo, isDetected }) => {
                const isLoading = loadingAgents.has(agentId);
                const isInstalled = detectionInfo?.installed ?? false;
                const canEnable = isDetected && isInstalled;

                return (
                  <motion.div
                    key={agentId}
                    layout
                    variants={itemVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={itemTransition}
                    className="overflow-hidden"
                  >
                    <div
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-3 py-2',
                        isDetected && !isInstalled && 'opacity-50'
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium text-sm">{info.name}</span>
                        {detectionInfo?.version && (
                          <span className="text-xs text-muted-foreground">
                            v{detectionInfo.version}
                          </span>
                        )}
                        {isDetected && !isInstalled && (
                          <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                            {t('Not installed')}
                          </span>
                        )}
                        {!isDetected && !isLoading && (
                          <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {t('Not detected')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        {isDetected && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{t('Enable')}</span>
                            <Switch
                              checked={false}
                              onCheckedChange={(checked) => handleEnabledChange(agentId, checked)}
                              disabled={!canEnable}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => setEditingBuiltinAgent(agentId)}
                            title={t('Edit')}
                          >
                            <Pencil
                              className={cn(
                                'h-3 w-3',
                                (agentSettings[agentId]?.customPath ||
                                  agentSettings[agentId]?.customArgs) &&
                                  'text-primary'
                              )}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => detectSingleAgent(agentId)}
                            disabled={isLoading}
                            title={t('Detect')}
                          >
                            {isLoading ? (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                            ) : (
                              <Search className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
          </AnimatePresence>
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
            {hapiAgentInfos.map(({ id: agentId, info, detectionInfo }) => {
              const config = agentSettings[agentId];
              const canEnable = detectionInfo?.installed ?? false;
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
            {happyAgentInfos.map(({ id: agentId, info, detectionInfo }) => {
              const config = agentSettings[agentId];
              const canEnable = detectionInfo?.installed ?? false;
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
              const detectionInfo = agentDetectionStatus[agent.id];
              const isLoading = loadingAgents.has(agent.id);
              const isDetected = !!detectionInfo;
              const isInstalled = detectionInfo?.installed ?? false;
              const config = agentSettings[agent.id];
              const canEnable = isDetected && isInstalled;
              const canSetDefault = canEnable && config?.enabled;

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
                      {detectionInfo?.version && (
                        <span className="text-xs text-muted-foreground">
                          v{detectionInfo.version}
                        </span>
                      )}
                      {isDetected && !isInstalled && (
                        <span className="whitespace-nowrap rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          {t('Not installed')}
                        </span>
                      )}
                      {!isDetected && !isLoading && (
                        <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {t('Not detected')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {isDetected && (
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
                        </>
                      )}
                      <div className="flex items-center gap-0.5">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => detectSingleAgent(agent.id, agent)}
                          disabled={isLoading}
                          title={t('Detect')}
                        >
                          {isLoading ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                          ) : (
                            <Search className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
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

      {/* Edit Builtin Agent Dialog */}
      <Dialog
        open={!!editingBuiltinAgent}
        onOpenChange={(open) => !open && setEditingBuiltinAgent(null)}
      >
        <DialogPopup className="sm:max-w-sm" showCloseButton={false}>
          <div className="p-4">
            <DialogTitle className="text-base font-medium">
              {t('Edit')}{' '}
              {editingBuiltinAgent &&
                BUILTIN_AGENT_INFO[editingBuiltinAgent as BuiltinAgentId]?.name}
            </DialogTitle>
            {editingBuiltinAgent && (
              <BuiltinAgentForm
                agentId={editingBuiltinAgent}
                agentName={
                  BUILTIN_AGENT_INFO[editingBuiltinAgent as BuiltinAgentId]?.name ??
                  editingBuiltinAgent
                }
                customPath={agentSettings[editingBuiltinAgent]?.customPath}
                customArgs={agentSettings[editingBuiltinAgent]?.customArgs}
                onSubmit={(config) => {
                  setAgentCustomConfig(editingBuiltinAgent, config);
                  setEditingBuiltinAgent(null);
                }}
                onCancel={() => setEditingBuiltinAgent(null)}
              />
            )}
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
