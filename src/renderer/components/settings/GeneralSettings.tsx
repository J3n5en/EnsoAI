import type { Locale } from '@shared/i18n';
import type { ShellInfo } from '@shared/types';
import { AppCategory } from '@shared/types';
import {
  ChevronRight,
  Columns3,
  FileCode,
  FileText,
  FolderOpen,
  LayoutList,
  Pencil,
  Plus,
  RefreshCw,
  TableProperties,
  Terminal,
  Trash2,
  TreePine,
} from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useDetectedApps } from '@/hooks/useAppDetector';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  type FileTreeDisplayMode,
  type LayoutMode,
  type RepositoryListDisplayMode,
  type TerminalRenderer,
  useSettingsStore,
} from '@/stores/settings';

// Parse shell arguments string, supporting single/double quotes for paths with spaces
function parseShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quoteChar = '';
  for (const ch of input) {
    if (!quoteChar && (ch === '"' || ch === "'")) {
      quoteChar = ch;
    } else if (ch === quoteChar) {
      quoteChar = '';
    } else if (ch === ' ' && !quoteChar) {
      if (current) args.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

function stringifyShellArgs(args: string[]): string {
  return args
    .map((a) => {
      if (a.includes(' ') || a.includes('"') || a.includes("'")) {
        return `"${a.replace(/"/g, '\\"')}"`;
      }
      return a;
    })
    .join(' ');
}

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: { version?: string };
  error?: string;
}

export function GeneralSettings() {
  const {
    language,
    setLanguage,
    layoutMode,
    setLayoutMode,
    fileTreeDisplayMode,
    setFileTreeDisplayMode,
    repositoryListDisplayMode,
    setRepositoryListDisplayMode,
    terminalRenderer,
    setTerminalRenderer,
    terminalScrollback,
    setTerminalScrollback,
    shellConfig,
    setShellConfig,
    agentNotificationEnabled,
    setAgentNotificationEnabled,
    agentNotificationDelay,
    setAgentNotificationDelay,
    agentNotificationEnterDelay,
    setAgentNotificationEnterDelay,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
    gitAutoFetchEnabled,
    setGitAutoFetchEnabled,
    defaultWorktreePath,
    setDefaultWorktreePath,
    proxySettings,
    setProxySettings,
    autoCreateSessionOnActivate,
    setAutoCreateSessionOnActivate,
    quickTerminal,
    setQuickTerminalEnabled,
    hideGroups,
    setHideGroups,
    hiddenOpenInApps,
    toggleHiddenOpenInApp,
    openInMenuFilterEnabled,
    setOpenInMenuFilterEnabled,
    copyOnSelection,
    setCopyOnSelection,
    todoEnabled,
    setTodoEnabled,
    temporaryWorkspaceEnabled,
    setTemporaryWorkspaceEnabled,
    defaultTemporaryPath,
    setDefaultTemporaryPath,
    autoCreateSessionOnTempActivate,
    setAutoCreateSessionOnTempActivate,
    loggingEnabled,
    setLoggingEnabled,
    logLevel,
    setLogLevel,
    logRetentionDays,
    setLogRetentionDays,
    gitClone,
    setGitClone,
    addHostMapping,
    removeHostMapping,
    updateHostMapping,
  } = useSettingsStore();
  const { t, locale } = useI18n();
  const { data: detectedApps = [] } = useDetectedApps();
  const hiddenSet = React.useMemo(() => new Set(hiddenOpenInApps), [hiddenOpenInApps]);

  const layoutModeOptions: {
    value: LayoutMode;
    icon: React.ElementType;
    label: string;
    description: string;
  }[] = [
    {
      value: 'columns',
      icon: Columns3,
      label: t('Columns'),
      description: t('Three-column layout: repos, worktrees, workspace'),
    },
    {
      value: 'tree',
      icon: TreePine,
      label: t('Tree'),
      description: t('Two-column layout: tree sidebar, workspace'),
    },
  ];

  const fileTreeDisplayModeOptions: {
    value: FileTreeDisplayMode;
    icon: React.ElementType;
    label: string;
    description: string;
  }[] = [
    {
      value: 'legacy',
      icon: FileText,
      label: t('Integrated tree'),
      description: t('Tree + editor in one panel'),
    },
    {
      value: 'current',
      icon: FolderOpen,
      label: t('Split sidebar'),
      description: t('Dedicated file sidebar + editor'),
    },
  ];

  const repositoryListDisplayModeOptions: {
    value: RepositoryListDisplayMode;
    icon: React.ElementType;
    label: string;
    description: string;
  }[] = [
    {
      value: 'list',
      icon: LayoutList,
      label: t('List'),
      description: t('VSCode-style collapsible list'),
    },
    {
      value: 'tabs',
      icon: TableProperties,
      label: t('Tabs'),
      description: t('Horizontal tabs for quick switching'),
    },
  ];

  const numberFormatter = React.useMemo(
    () => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US'),
    [locale]
  );

  const rendererOptions = React.useMemo(
    () => [
      { value: 'dom', label: 'DOM', description: t('Best compatibility (recommended)') },
      { value: 'webgl', label: 'WebGL', description: t('Higher performance, may have issues') },
    ],
    [t]
  );

  const scrollbackOptions = React.useMemo(
    () =>
      [1000, 5000, 10000, 20000, 50000].map((value) => ({
        value,
        label: t('{{count}} lines', { count: numberFormatter.format(value) }),
      })),
    [t, numberFormatter]
  );

  const notificationDelayOptions = React.useMemo(
    () =>
      [1, 2, 3, 5, 10].map((value) => ({
        value,
        label: t('{{count}} seconds', { count: value }),
      })),
    [t]
  );

  const enterDelayOptions = React.useMemo(
    () => [
      { value: 0, label: t('Disabled') },
      ...[1, 2, 3, 5, 10].map((value) => ({
        value,
        label: t('{{count}} seconds', { count: value }),
      })),
    ],
    [t]
  );

  const [shells, setShells] = React.useState<ShellInfo[]>([]);
  const [loadingShells, setLoadingShells] = React.useState(true);
  const appVersion = window.electronAPI?.env.appVersion || '0.0.0';

  // Update status state
  const [updateStatus, setUpdateStatus] = React.useState<UpdateStatus | null>(null);

  // Proxy test state
  const [proxyTestStatus, setProxyTestStatus] = React.useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [proxyTestLatency, setProxyTestLatency] = React.useState<number | null>(null);
  const [proxyTestError, setProxyTestError] = React.useState<string | null>(null);
  const [tempPathDialogOpen, setTempPathDialogOpen] = React.useState(false);

  // Host mapping dialog state
  const [hostMappingDialogOpen, setHostMappingDialogOpen] = React.useState(false);
  const [editingMapping, setEditingMapping] = React.useState<{
    pattern: string;
    dirname: string;
  } | null>(null);
  const [mappingPattern, setMappingPattern] = React.useState('');
  const [mappingDirname, setMappingDirname] = React.useState('');
  const [mappingError, setMappingError] = React.useState('');

  const handleTestProxy = React.useCallback(async () => {
    if (!proxySettings.server) return;

    setProxyTestStatus('testing');
    setProxyTestLatency(null);
    setProxyTestError(null);

    const result = await window.electronAPI.app.testProxy(proxySettings.server);

    if (result.success) {
      setProxyTestStatus('success');
      setProxyTestLatency(result.latency ?? null);
    } else {
      setProxyTestStatus('error');
      setProxyTestError(result.error ?? 'Unknown error');
    }
  }, [proxySettings.server]);

  const handleProxyServerChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setProxySettings({ server: e.target.value });
      // Reset test status when server changes
      setProxyTestStatus('idle');
      setProxyTestLatency(null);
      setProxyTestError(null);
    },
    [setProxySettings]
  );

  const handleProxyServerBlur = React.useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const trimmed = e.target.value.trim();
      if (trimmed !== e.target.value) {
        setProxySettings({ server: trimmed });
      }
    },
    [setProxySettings]
  );

  const handleEditHostMapping = React.useCallback(
    (mapping: { pattern: string; dirname: string }) => {
      setEditingMapping(mapping);
      setMappingPattern(mapping.pattern);
      setMappingDirname(mapping.dirname);
      setMappingError('');
      setHostMappingDialogOpen(true);
    },
    []
  );

  const handleDeleteHostMapping = React.useCallback(
    (pattern: string) => {
      removeHostMapping(pattern);
    },
    [removeHostMapping]
  );

  const handleSaveHostMapping = React.useCallback(() => {
    setMappingError('');

    // Validate
    if (!mappingPattern.trim()) {
      setMappingError(t('Pattern is required'));
      return;
    }
    if (!mappingDirname.trim()) {
      setMappingError(t('Directory name is required'));
      return;
    }

    // Check for duplicate pattern
    const existing = gitClone.hostMappings.find(
      (m) => m.pattern === mappingPattern.trim() && m.pattern !== editingMapping?.pattern
    );
    if (existing) {
      setMappingError(t('Pattern already exists'));
      return;
    }

    const newMapping = {
      pattern: mappingPattern.trim(),
      dirname: mappingDirname.trim(),
    };

    if (editingMapping) {
      updateHostMapping(editingMapping.pattern, newMapping);
    } else {
      addHostMapping(newMapping);
    }

    setHostMappingDialogOpen(false);
    setEditingMapping(null);
    setMappingPattern('');
    setMappingDirname('');
  }, [
    mappingPattern,
    mappingDirname,
    editingMapping,
    gitClone.hostMappings,
    t,
    addHostMapping,
    updateHostMapping,
  ]);

  const handleOpenLogFolder = React.useCallback(async () => {
    await window.electronAPI.log.openFolder();
  }, []);

  const handleSelectTempPath = React.useCallback(async () => {
    const result = await window.electronAPI.dialog.openDirectory();
    if (!result) return;
    const check = await window.electronAPI.tempWorkspace.checkPath(result);
    if (check.ok) {
      setDefaultTemporaryPath(result);
      return;
    }
    setTempPathDialogOpen(true);
  }, [setDefaultTemporaryPath]);

  React.useEffect(() => {
    window.electronAPI.shell.detect().then((detected) => {
      setShells(detected);
      setLoadingShells(false);
    });
  }, []);

  // Listen for update status changes
  React.useEffect(() => {
    const cleanup = window.electronAPI.updater.onStatus((status) => {
      setUpdateStatus(status as UpdateStatus);
    });
    return cleanup;
  }, []);

  const handleCheckForUpdates = React.useCallback(() => {
    window.electronAPI.updater.checkForUpdates();
  }, []);

  const availableShells = shells.filter((s) => s.available);
  const currentShell = shells.find((s) => s.id === shellConfig.shellType);
  const isCustomShell = shellConfig.shellType === 'custom';

  const [customArgsText, setCustomArgsText] = React.useState(() =>
    stringifyShellArgs(shellConfig.customShellArgs || [])
  );

  React.useEffect(() => {
    setCustomArgsText(stringifyShellArgs(shellConfig.customShellArgs || []));
  }, [shellConfig.customShellArgs]);

  const commitCustomArgs = React.useCallback(() => {
    setShellConfig({
      ...shellConfig,
      customShellArgs: parseShellArgs(customArgsText),
    });
  }, [customArgsText, shellConfig, setShellConfig]);

  const executionPlatform = window.electronAPI?.env.platform;
  const isWindows = executionPlatform === 'win32';
  const shellPathPlaceholder = isWindows ? 'cmd.exe' : '/bin/bash';
  const shellArgsPlaceholder = isWindows
    ? '/k "C:\\Program Files\\init.bat"'
    : "-l -c '/usr/local/bin/app'";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Language')}</h3>
        <p className="text-sm text-muted-foreground">{t('Choose display language')}</p>
      </div>

      {/* Language */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Language')}</span>
        <div className="space-y-1.5">
          <Select value={language} onValueChange={(v) => setLanguage(v as Locale)}>
            <SelectTrigger className="w-48">
              <SelectValue>{language === 'zh' ? t('Chinese') : t('English')}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="en">{t('English')}</SelectItem>
              <SelectItem value="zh">{t('Chinese')}</SelectItem>
            </SelectPopup>
          </Select>
        </div>
      </div>

      {/* Layout Section */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Layout')}</h3>
        <p className="text-sm text-muted-foreground">{t('Choose sidebar layout mode')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {layoutModeOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setLayoutMode(option.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
              layoutMode === option.value
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                layoutMode === option.value
                  ? 'bg-accent-foreground/20 text-accent-foreground'
                  : 'bg-muted'
              )}
            >
              <option.icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground text-center">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('File Tree Display')}</h3>
        <p className="text-sm text-muted-foreground">{t('Choose file tree display mode')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {fileTreeDisplayModeOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setFileTreeDisplayMode(option.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
              fileTreeDisplayMode === option.value
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                fileTreeDisplayMode === option.value
                  ? 'bg-accent-foreground/20 text-accent-foreground'
                  : 'bg-muted'
              )}
            >
              <option.icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground text-center">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Repository List Display')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Choose how repositories and submodules are displayed in source control')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {repositoryListDisplayModeOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setRepositoryListDisplayMode(option.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
              repositoryListDisplayMode === option.value
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-transparent bg-muted/50 hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                repositoryListDisplayMode === option.value
                  ? 'bg-accent-foreground/20 text-accent-foreground'
                  : 'bg-muted'
              )}
            >
              <option.icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground text-center">{option.description}</span>
          </button>
        ))}
      </div>

      {/* Auto-create session */}
      {/* Quick Terminal */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Quick Terminal')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Show floating terminal button for quick access')}
          </p>
          <Switch checked={quickTerminal.enabled} onCheckedChange={setQuickTerminalEnabled} />
        </div>
      </div>

      {/* Todo Kanban */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Todo')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Enable Todo kanban board tab')}</p>
          <Switch checked={todoEnabled} onCheckedChange={setTodoEnabled} />
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Temp Session')}</h3>
        <p className="text-sm text-muted-foreground">{t('Temp Session settings')}</p>
      </div>

      {/* Temp Session */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Temp Session')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Show Temp Session entry for quick scratch sessions')}
          </p>
          <Switch
            checked={temporaryWorkspaceEnabled}
            onCheckedChange={setTemporaryWorkspaceEnabled}
          />
        </div>
      </div>

      {/* Temp Session Auto-create */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto-create session')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Automatically create Agent/Terminal Session when activating a temp session')}
          </p>
          <Switch
            checked={autoCreateSessionOnTempActivate}
            onCheckedChange={setAutoCreateSessionOnTempActivate}
            disabled={!temporaryWorkspaceEnabled}
          />
        </div>
      </div>

      {/* Temp Session Path */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Save location')}</span>
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={defaultTemporaryPath}
              onChange={(e) => setDefaultTemporaryPath(e.target.value)}
              placeholder="~/ensoai/temporary"
              className="flex-1"
              disabled={!temporaryWorkspaceEnabled}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleSelectTempPath}
              disabled={!temporaryWorkspaceEnabled}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('Default directory for new temp sessions. Leave empty to use ~/ensoai/temporary')}
          </p>
        </div>
      </div>

      {/* Hide Groups */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Hide Groups')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Hide group management panel and show all repositories')}
          </p>
          <Switch checked={hideGroups} onCheckedChange={setHideGroups} />
        </div>
      </div>

      {/* Quick Open */}
      {detectedApps.length > 0 && (
        <div className="grid grid-cols-[100px_1fr] items-start gap-4">
          <span className="text-sm font-medium leading-8">{t('Quick Open')}</span>
          <Collapsible>
            <div className="flex h-8 items-center justify-between">
              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 [[data-panel-open]_&]:rotate-90" />
                {t('Configure apps shown in the quick open menu')}
              </CollapsibleTrigger>
              <Switch
                checked={openInMenuFilterEnabled}
                onCheckedChange={setOpenInMenuFilterEnabled}
              />
            </div>
            <CollapsibleContent>
              {openInMenuFilterEnabled ? (
                <div className="mt-2 space-y-2">
                  {(
                    [
                      { category: AppCategory.Finder, label: t('File Manager'), icon: FolderOpen },
                      { category: AppCategory.Terminal, label: t('Terminals'), icon: Terminal },
                      { category: AppCategory.Editor, label: t('Editors'), icon: FileCode },
                    ] as const
                  ).map(({ category, label, icon: CategoryIcon }) => {
                    const categoryApps = detectedApps.filter((app) => app.category === category);
                    if (categoryApps.length === 0) return null;
                    return (
                      <div key={category}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                          {label}
                        </div>
                        {categoryApps.map((app) => {
                          const isVisible = !hiddenSet.has(app.bundleId);
                          return (
                            <div
                              key={app.bundleId}
                              className="flex items-center justify-between rounded-md pl-2 py-1.5 hover:bg-accent/50"
                            >
                              <div className="flex items-center gap-2">
                                <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{app.name}</span>
                              </div>
                              <Switch
                                checked={isVisible}
                                onCheckedChange={() => toggleHiddenOpenInApp(app.bundleId)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('Enable filtering to configure which apps are shown')}
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Worktree')}</h3>
        <p className="text-sm text-muted-foreground">{t('Git worktree save location settings')}</p>
      </div>

      {/* Auto-create session */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto-create session')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Automatically create Agent/Terminal session when activating a worktree')}
          </p>
          <Switch
            checked={autoCreateSessionOnActivate}
            onCheckedChange={setAutoCreateSessionOnActivate}
          />
        </div>
      </div>

      {/* Default Worktree Path */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Save location')}</span>
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={defaultWorktreePath}
              onChange={(e) => setDefaultWorktreePath(e.target.value)}
              placeholder="~/ensoai/workspaces"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                const result = await window.electronAPI.dialog.openDirectory();
                if (result) {
                  setDefaultWorktreePath(result);
                }
              }}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('Default directory for new worktrees. Leave empty to use ~/ensoai/workspaces')}
          </p>
        </div>
      </div>

      {/* Git Auto Refresh */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Git auto refresh')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Automatically fetch and refresh git status')}
          </p>
          <Switch checked={gitAutoFetchEnabled} onCheckedChange={setGitAutoFetchEnabled} />
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Git Clone')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Settings for cloning remote Git repositories')}
        </p>
      </div>

      {/* Base Directory */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Base directory')}</span>
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={gitClone.baseDir}
              onChange={(e) => setGitClone({ baseDir: e.target.value })}
              placeholder="~/ensoai/repos"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                const result = await window.electronAPI.dialog.openDirectory();
                if (result) {
                  setGitClone({ baseDir: result });
                }
              }}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('Base directory for cloned repositories. Leave empty to use ~/ensoai/repos')}
          </p>
        </div>
      </div>

      {/* Organized Structure Toggle */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Organized structure')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Clone to organized structure (baseDir/host/owner/repo) or flat (baseDir/repo)')}
          </p>
          <Switch
            checked={gitClone.useOrganizedStructure}
            onCheckedChange={(checked) => setGitClone({ useOrganizedStructure: checked })}
          />
        </div>
      </div>

      {/* Repository Domains */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Repository domains')}</span>
        <div className="space-y-1.5">
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{t('Repository domains')}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setHostMappingDialogOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('Add')}
              </Button>
            </div>
            <div className="space-y-1">
              {gitClone.hostMappings.length === 0 ? (
                <div className="text-xs text-muted-foreground py-1">
                  {t('No mappings configured')}
                </div>
              ) : (
                gitClone.hostMappings.map((mapping) => (
                  <div key={mapping.pattern} className="flex items-center gap-2 group py-1">
                    <span className="font-mono text-xs flex-1 truncate">{mapping.pattern}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono text-xs flex-1 truncate">{mapping.dirname}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleEditHostMapping(mapping)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => handleDeleteHostMapping(mapping.pattern)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('Host-to-directory mappings for organizing cloned repositories')}
          </p>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium">{t('Terminal')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Terminal renderer and performance settings')}
        </p>
      </div>

      {/* Shell */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Shell')}</span>
        <div className="space-y-1.5">
          {loadingShells ? (
            <div className="flex h-10 items-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </div>
          ) : (
            <Select
              value={shellConfig.shellType}
              onValueChange={(v) => setShellConfig({ ...shellConfig, shellType: v as never })}
            >
              <SelectTrigger className="w-64">
                <SelectValue>
                  {isCustomShell ? t('Custom') : currentShell?.name || shellConfig.shellType}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {availableShells.map((shell) => (
                  <SelectItem key={shell.id} value={shell.id}>
                    <div className="flex items-center gap-2">
                      <span>{shell.name}</span>
                      {shell.isWsl && (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                          WSL
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="custom">
                  <span>{t('Custom')}</span>
                </SelectItem>
              </SelectPopup>
            </Select>
          )}
          {isCustomShell && (
            <div className="space-y-2 mt-2">
              <Input
                className="w-64"
                placeholder={t('Shell path (e.g. {{example}})', { example: shellPathPlaceholder })}
                value={shellConfig.customShellPath || ''}
                onChange={(e) =>
                  setShellConfig({ ...shellConfig, customShellPath: e.target.value })
                }
              />
              <Input
                className="w-64"
                placeholder={t('Arguments (e.g. {{example}})', { example: shellArgsPlaceholder })}
                value={customArgsText}
                onChange={(e) => setCustomArgsText(e.target.value)}
                onBlur={commitCustomArgs}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCustomArgs();
                }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals')}</p>
        </div>
      </div>

      {/* Renderer */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Renderer')}</span>
        <div className="space-y-1.5">
          <Select
            value={terminalRenderer}
            onValueChange={(v) => setTerminalRenderer(v as TerminalRenderer)}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {rendererOptions.find((o) => o.value === terminalRenderer)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {rendererOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {rendererOptions.find((o) => o.value === terminalRenderer)?.description}
          </p>
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals or restart')}</p>
        </div>
      </div>

      {/* Scrollback */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Terminal scrollback')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(terminalScrollback)}
            onValueChange={(v) => setTerminalScrollback(Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {scrollbackOptions.find((o) => o.value === terminalScrollback)?.label ??
                  t('{{count}} lines', { count: numberFormatter.format(terminalScrollback) })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {scrollbackOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('History lines in the terminal. Higher values use more memory.')}
          </p>
          <p className="text-xs text-muted-foreground">{t('Apply on new terminals only')}</p>
        </div>
      </div>

      {/* Copy on Selection */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Copy on Selection')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Automatically copy selected text in the terminal to the clipboard')}
          </p>
          <Switch checked={copyOnSelection} onCheckedChange={setCopyOnSelection} />
        </div>
      </div>

      {/* Agent Notification Section */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-medium">{t('Agent Notifications')}</h3>
        <p className="text-sm text-muted-foreground">{t('Stop output notification')}</p>
      </div>

      {/* Notification Enable */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Enable notifications')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('Notifications when agent is idle')}</p>
          <Switch
            checked={agentNotificationEnabled}
            onCheckedChange={setAgentNotificationEnabled}
          />
        </div>
      </div>

      {/* Notification Delay */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Idle time')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(agentNotificationDelay)}
            onValueChange={(v) => setAgentNotificationDelay(Number(v))}
            disabled={!agentNotificationEnabled}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {notificationDelayOptions.find((o) => o.value === agentNotificationDelay)?.label ??
                  t('{{count}} seconds', { count: agentNotificationDelay })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {notificationDelayOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('How long to wait before notifying after the agent stops output.')}
          </p>
        </div>
      </div>

      {/* Enter Delay */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Enter delay')}</span>
        <div className="space-y-1.5">
          <Select
            value={String(agentNotificationEnterDelay)}
            onValueChange={(v) => setAgentNotificationEnterDelay(Number(v))}
            disabled={!agentNotificationEnabled}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {enterDelayOptions.find((o) => o.value === agentNotificationEnterDelay)?.label ??
                  t('{{count}} seconds', { count: agentNotificationEnterDelay })}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {enterDelayOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('How long to wait after pressing Enter before starting idle timer.')}
          </p>
        </div>
      </div>

      {/* Proxy Section */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-medium">{t('Proxy')}</h3>
        <p className="text-sm text-muted-foreground">{t('Network proxy settings')}</p>
      </div>

      {/* Proxy Enable */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Enable proxy')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Route all network requests through proxy')}
          </p>
          <Switch
            checked={proxySettings.enabled}
            onCheckedChange={(enabled) => setProxySettings({ enabled })}
          />
        </div>
      </div>

      {/* Proxy Server */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Proxy server')}</span>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Input
              value={proxySettings.server}
              onChange={handleProxyServerChange}
              onBlur={handleProxyServerBlur}
              placeholder="http://127.0.0.1:7897"
              disabled={!proxySettings.enabled}
              className="w-64"
              aria-invalid={
                proxySettings.enabled &&
                !!proxySettings.server &&
                !/^((https?|socks5?h?|socks4a?):\/\/)?[\w.-]+:\d+/.test(proxySettings.server)
              }
            />
            <Button
              variant="outline"
              size="sm"
              disabled={
                !proxySettings.enabled ||
                !proxySettings.server ||
                !/^((https?|socks5?h?|socks4a?):\/\/)?[\w.-]+:\d+/.test(proxySettings.server) ||
                proxyTestStatus === 'testing'
              }
              onClick={handleTestProxy}
            >
              {proxyTestStatus === 'testing' ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t('Testing...')}
                </>
              ) : (
                t('Test')
              )}
            </Button>
            {proxyTestStatus === 'success' && proxyTestLatency !== null && (
              <span className="text-xs text-green-600 dark:text-green-400">
                ✓ {proxyTestLatency}ms
              </span>
            )}
            {proxyTestStatus === 'error' && proxyTestError && (
              <span className="text-xs text-destructive" title={proxyTestError}>
                ✗ {t('Failed')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('e.g., 127.0.0.1:7897 or http://proxy:8080')}
          </p>
        </div>
      </div>

      {/* Proxy Bypass */}
      <div className="grid grid-cols-[100px_1fr] items-start gap-4">
        <span className="text-sm font-medium mt-2">{t('Bypass list')}</span>
        <div className="space-y-1.5">
          <Input
            value={proxySettings.bypassList}
            onChange={(e) => setProxySettings({ bypassList: e.target.value })}
            placeholder="localhost,127.0.0.1"
            disabled={!proxySettings.enabled}
            className="w-64"
          />
          <p className="text-xs text-muted-foreground">
            {t('Comma-separated list of hosts that bypass the proxy')}
          </p>
        </div>
      </div>

      {/* Use proxy for updates */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Update via proxy')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Route update requests through proxy')}
            {!proxySettings.enabled && proxySettings.useProxyForUpdates && (
              <span className="text-xs ml-1">({t('Requires proxy to be enabled')})</span>
            )}
          </p>
          <Switch
            checked={proxySettings.useProxyForUpdates}
            onCheckedChange={(useProxyForUpdates) => setProxySettings({ useProxyForUpdates })}
            disabled={!proxySettings.enabled}
          />
        </div>
      </div>

      {/* Logging Section */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-medium">{t('Logging')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Enable logging to help diagnose issues. Logs are stored locally and never uploaded.')}
        </p>
      </div>

      {/* Enable Logging */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Enable Logging')}</span>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {loggingEnabled ? t('Enabled') : t('Disabled')}
          </span>
          <Switch checked={loggingEnabled} onCheckedChange={setLoggingEnabled} />
        </div>
      </div>

      {/* Log Level */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Log Level')}</span>
        <Select
          value={logLevel}
          onValueChange={(v) => setLogLevel(v as 'error' | 'warn' | 'info' | 'debug')}
          disabled={!loggingEnabled}
        >
          <SelectTrigger className="w-64">
            <SelectValue>
              {logLevel === 'error' && t('Error')}
              {logLevel === 'warn' && t('Warning')}
              {logLevel === 'info' && t('Info')}
              {logLevel === 'debug' && t('Debug')}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="error">
              {t('Error')} - {t('Only critical errors')}
            </SelectItem>
            <SelectItem value="warn">
              {t('Warning')} - {t('Errors and warnings')}
            </SelectItem>
            <SelectItem value="info">
              {t('Info')} - {t('General information')} ({t('Recommended')})
            </SelectItem>
            <SelectItem value="debug">
              {t('Debug')} - {t('Detailed diagnostic information')}
            </SelectItem>
          </SelectPopup>
        </Select>
      </div>

      {/* Open Log Folder */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Log Files')}</span>
        <Button variant="outline" size="sm" onClick={handleOpenLogFolder} className="w-fit">
          <FileText className="mr-2 h-4 w-4" />
          {t('Open Log Folder')}
        </Button>
      </div>

      {/* Log Retention Days */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Log Retention')}</span>
        <div className="flex items-center gap-2">
          <Select
            value={String(logRetentionDays)}
            onValueChange={(v) => setLogRetentionDays(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="7">{t('7 days')}</SelectItem>
              <SelectItem value="14">{t('14 days')}</SelectItem>
              <SelectItem value="30">{t('30 days')}</SelectItem>
            </SelectPopup>
          </Select>
          <span className="text-xs text-muted-foreground">
            {t('Old log files will be automatically deleted')}
          </span>
        </div>
      </div>

      {/* Updates Section */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-medium">{t('Updates')}</h3>
        <p className="text-sm text-muted-foreground">{t('Application update settings')}</p>
      </div>

      {/* Current Version */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Version')}</span>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">v{appVersion}</span>
            {updateStatus?.status === 'available' && updateStatus.info?.version && (
              <span className="text-xs text-green-600 dark:text-green-400">
                ({t('New version')}: v{updateStatus.info.version})
              </span>
            )}
            {updateStatus?.status === 'not-available' && (
              <span className="text-xs text-muted-foreground">({t('Up to date')})</span>
            )}
            {updateStatus?.status === 'error' && (
              <span className="text-xs text-destructive">({t('Check failed')})</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckForUpdates}
            disabled={updateStatus?.status === 'checking' || updateStatus?.status === 'downloading'}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${updateStatus?.status === 'checking' ? 'animate-spin' : ''}`}
            />
            {updateStatus?.status === 'checking' ? t('Checking...') : t('Check for updates')}
          </Button>
        </div>
      </div>

      {/* Auto Update */}
      <div className="grid grid-cols-[100px_1fr] items-center gap-4">
        <span className="text-sm font-medium">{t('Auto update')}</span>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('Automatically download and install updates')}
          </p>
          <Switch checked={autoUpdateEnabled} onCheckedChange={setAutoUpdateEnabled} />
        </div>
      </div>

      <AlertDialog open={tempPathDialogOpen} onOpenChange={setTempPathDialogOpen}>
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Directory unavailable')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This directory is not readable or writable. Please choose another location.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <AlertDialogClose
              render={<Button onClick={handleSelectTempPath}>{t('Choose directory')}</Button>}
            />
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Host Mapping Edit Dialog */}
      <Dialog open={hostMappingDialogOpen} onOpenChange={setHostMappingDialogOpen}>
        <DialogPopup zIndexLevel="nested">
          <DialogHeader>
            <DialogTitle>
              {editingMapping ? t('Edit repository domain') : t('Add repository domain')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Map a Git repository domain to a directory name for organizing cloned repositories'
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogPanel className="space-y-4">
            <Field>
              <FieldLabel>{t('Domain pattern')}</FieldLabel>
              <Input
                value={mappingPattern}
                onChange={(e) => setMappingPattern(e.target.value)}
                placeholder="gitlab.example.com"
                className="font-mono"
              />
              <FieldDescription>
                {t('Git host domain (e.g., gitlab.example.com or *.example.com)')}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('Directory name')}</FieldLabel>
              <Input
                value={mappingDirname}
                onChange={(e) => setMappingDirname(e.target.value)}
                placeholder="gitlab"
                className="font-mono"
              />
              <FieldDescription>
                {t('Directory name for this host (e.g., gitlab, company-gitlab)')}
              </FieldDescription>
            </Field>

            {mappingError && <div className="text-sm text-destructive">{mappingError}</div>}
          </DialogPanel>

          <DialogFooter variant="bare">
            <Button variant="outline" onClick={() => setHostMappingDialogOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleSaveHostMapping}>{t('Save')}</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
