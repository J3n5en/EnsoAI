import type { ClaudeProvider, GitWorktree } from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  Circle,
  Clock,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Terminal,
} from 'lucide-react';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CommandDialog,
  CommandDialogPopup,
  CommandPanel,
  CommandShortcut,
} from '@/components/ui/command';
import { toastManager } from '@/components/ui/toast';
import { useDetectedApps, useOpenWith } from '@/hooks/useAppDetector';
import { useI18n } from '@/i18n';
import {
  clearClaudeProviderSwitch,
  isClaudeProviderMatch,
  markClaudeProviderSwitch,
} from '@/lib/claudeProvider';
import { cn } from '@/lib/utils';
import { type TerminalKeybinding, useSettingsStore } from '@/stores/settings';

// Format keybinding for display in ActionPanel
function formatKeybindingDisplay(binding: TerminalKeybinding): string {
  const parts: string[] = [];
  if (binding.meta) parts.push('⌘');
  if (binding.ctrl) parts.push('⌃');
  if (binding.alt) parts.push('⌥');
  if (binding.shift) parts.push('⇧');
  parts.push(binding.key.toUpperCase());
  return parts.join('');
}

function useCliInstallStatus() {
  return useQuery({
    queryKey: ['cli', 'install-status'],
    queryFn: async () => {
      return await window.electronAPI.cli.getInstallStatus();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useCliInstall() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async () => {
      return await window.electronAPI.cli.install();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cli', 'install-status'] });
      if (result.installed) {
        toastManager.add({
          type: 'success',
          title: t('CLI install success'),
          description: t("'enso' command installed to {{path}}", { path: result.path ?? '' }),
        });
      } else if (result.error) {
        toastManager.add({
          type: 'error',
          title: t('CLI install failed'),
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toastManager.add({
        type: 'error',
        title: t('CLI install failed'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

function useCliUninstall() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async () => {
      return await window.electronAPI.cli.uninstall();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cli', 'install-status'] });
      if (!result.installed) {
        toastManager.add({
          type: 'success',
          title: t('CLI uninstall success'),
          description: t("'enso' command uninstalled"),
        });
      } else if (result.error) {
        toastManager.add({
          type: 'error',
          title: t('CLI uninstall failed'),
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toastManager.add({
        type: 'error',
        title: t('CLI uninstall failed'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

const RECENT_COMMANDS_KEY = 'enso-recent-commands';
const MAX_RECENT_COMMANDS = 5;

function useRecentCommands() {
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const addRecentCommand = useCallback((id: string) => {
    setRecentIds((prev) => {
      const filtered = prev.filter((i) => i !== id);
      const updated = [id, ...filtered].slice(0, MAX_RECENT_COMMANDS);
      localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { recentIds, addRecentCommand };
}

interface Repository {
  name: string;
  path: string;
}

interface ActionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryCollapsed: boolean;
  worktreeCollapsed: boolean;
  projectPath?: string;
  repositories?: Repository[];
  selectedRepoPath?: string;
  worktrees?: GitWorktree[];
  activeWorktreePath?: string;
  onToggleRepository: () => void;
  onToggleWorktree: () => void;
  onOpenSettings: () => void;
  onSwitchRepo?: (repoPath: string) => void;
  onSwitchWorktree?: (worktree: GitWorktree) => void;
}

interface ActionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  loading?: boolean;
}

interface ActionGroup {
  label: string;
  items: ActionItem[];
}

export function ActionPanel({
  open,
  onOpenChange,
  repositoryCollapsed,
  worktreeCollapsed,
  projectPath,
  repositories = [],
  selectedRepoPath,
  worktrees = [],
  activeWorktreePath,
  onToggleRepository,
  onToggleWorktree,
  onOpenSettings,
  onSwitchRepo,
  onSwitchWorktree,
}: ActionPanelProps) {
  const { t } = useI18n();
  const [search, setSearch] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: detectedApps = [] } = useDetectedApps();
  const openWith = useOpenWith();

  // Workspace keybindings for shortcut display
  const workspaceKeybindings = useSettingsStore((s) => s.workspaceKeybindings);

  // CLI install status
  const { data: cliStatus } = useCliInstallStatus();
  const cliInstall = useCliInstall();
  const cliUninstall = useCliUninstall();

  // Recent commands
  const { recentIds, addRecentCommand } = useRecentCommands();

  // Claude Provider
  const queryClient = useQueryClient();
  const providers = useSettingsStore((s) => s.claudeCodeIntegration.providers);

  const { data: claudeData } = useQuery({
    queryKey: ['claude-settings'],
    queryFn: () => window.electronAPI.claudeProvider.readSettings(),
    enabled: open, // 只在面板打开时查询
  });

  const activeProvider = React.useMemo(() => {
    const currentConfig = claudeData?.extracted;
    if (!currentConfig) return null;
    return providers.find((p) => isClaudeProviderMatch(p, currentConfig)) ?? null;
  }, [providers, claudeData?.extracted]);

  const applyProvider = useMutation({
    mutationFn: (provider: ClaudeProvider) => window.electronAPI.claudeProvider.apply(provider),
    onSuccess: (success, provider) => {
      if (!success) {
        clearClaudeProviderSwitch();
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['claude-settings'] });
      toastManager.add({
        type: 'success',
        title: t('Provider switched'),
        description: provider.name,
      });
    },
    onError: () => {
      clearClaudeProviderSwitch();
    },
  });

  const actionGroups: ActionGroup[] = React.useMemo(() => {
    const groups: ActionGroup[] = [];

    // Claude Provider group (only show if providers exist)
    if (providers.length > 0) {
      groups.push({
        label: 'Claude Provider',
        items: providers.map((provider) => ({
          id: `claude-provider-${provider.id}`,
          label: provider.name,
          icon: activeProvider?.id === provider.id ? CheckCircle : Circle,
          action: () => {
            if (activeProvider?.id !== provider.id) {
              markClaudeProviderSwitch(provider);
              applyProvider.mutate(provider);
            }
          },
        })),
      });
    }

    groups.push(
      {
        label: t('Panel'),
        items: [
          {
            id: 'toggle-repository',
            label: repositoryCollapsed ? t('Expand Repository') : t('Collapse Repository'),
            icon: repositoryCollapsed ? FolderOpen : PanelLeftClose,
            shortcut: formatKeybindingDisplay(workspaceKeybindings.toggleRepository),
            action: onToggleRepository,
          },
          {
            id: 'toggle-worktree',
            label: worktreeCollapsed ? t('Expand Worktree') : t('Collapse Worktree'),
            icon: worktreeCollapsed ? GitBranch : PanelLeftOpen,
            shortcut: formatKeybindingDisplay(workspaceKeybindings.toggleWorktree),
            action: onToggleWorktree,
          },
        ],
      },
      {
        label: t('General'),
        items: [
          {
            id: 'open-settings',
            label: t('Open settings'),
            icon: Settings,
            shortcut: '⌘,',
            action: onOpenSettings,
          },
          // CLI install/uninstall action
          {
            id: 'cli-install',
            label:
              cliInstall.isPending || cliUninstall.isPending
                ? cliStatus?.installed
                  ? t('Uninstalling...')
                  : t('Installing...')
                : cliStatus?.installed
                  ? t("Uninstall 'enso' command")
                  : t("Install 'enso' command to PATH"),
            icon: cliInstall.isPending || cliUninstall.isPending ? Loader2 : Terminal,
            loading: cliInstall.isPending || cliUninstall.isPending,
            disabled: cliInstall.isPending || cliUninstall.isPending,
            action: async () => {
              if (cliInstall.isPending || cliUninstall.isPending) return;
              // Re-check status at execution time
              const status = await window.electronAPI.cli.getInstallStatus();
              if (status.installed) {
                cliUninstall.mutate();
              } else {
                cliInstall.mutate();
              }
            },
          },
        ],
      }
    );

    // Add "Switch Repository" group
    if (repositories.length > 1 && onSwitchRepo) {
      const switchableRepos = repositories.filter((repo) => repo.path !== selectedRepoPath);
      if (switchableRepos.length > 0) {
        groups.push({
          label: t('Switch repository'),
          items: switchableRepos.map((repo) => ({
            id: `switch-repo-${repo.path}`,
            label: t('Switch to {{name}}', { name: repo.name }),
            icon: FolderOpen,
            action: () => {
              onSwitchRepo(repo.path);
            },
          })),
        });
      }
    }

    // Add "Switch Worktree" group
    if (worktrees.length > 1 && onSwitchWorktree) {
      const switchableWorktrees = worktrees.filter((wt) => wt.path !== activeWorktreePath);
      if (switchableWorktrees.length > 0) {
        groups.push({
          label: t('Switch Worktree'),
          items: switchableWorktrees.map((wt) => ({
            id: `switch-worktree-${wt.path}`,
            label: t('Switch to {{name}}', { name: wt.branch || wt.path.split('/').pop() || '' }),
            icon: GitBranch,
            action: () => {
              onSwitchWorktree(wt);
            },
          })),
        });
      }
    }

    // Add "Open in XXX" group for detected apps
    if (projectPath && detectedApps.length > 0) {
      groups.push({
        label: t('Open with'),
        items: detectedApps.map((app) => ({
          id: `open-in-${app.bundleId}`,
          label: t('Open in {{app}}', { app: app.name }),
          icon: ExternalLink,
          action: () => {
            openWith.mutate({ path: projectPath, bundleId: app.bundleId });
          },
        })),
      });
    }

    // Build recent commands group
    if (recentIds.length > 0) {
      const allItems = groups.flatMap((g) => g.items);
      const recentItems = recentIds
        .map((id) => allItems.find((item) => item.id === id))
        .filter((item): item is ActionItem => item !== undefined)
        .map((item) => ({
          ...item,
          id: `recent-${item.id}`,
          icon: Clock,
        }));

      if (recentItems.length > 0) {
        groups.unshift({
          label: t('Recent'),
          items: recentItems,
        });
      }
    }

    return groups;
  }, [
    providers,
    activeProvider,
    applyProvider,
    t,
    repositoryCollapsed,
    worktreeCollapsed,
    projectPath,
    repositories,
    selectedRepoPath,
    worktrees,
    activeWorktreePath,
    detectedApps,
    cliStatus,
    recentIds,
    workspaceKeybindings,
    onToggleRepository,
    onToggleWorktree,
    onOpenSettings,
    onSwitchRepo,
    onSwitchWorktree,
    openWith,
    cliInstall,
    cliUninstall,
  ]);

  // Flatten and filter actions for keyboard navigation
  const filteredGroups = React.useMemo(() => {
    if (!search) return actionGroups;
    const lower = search.toLowerCase();
    return actionGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(lower)),
      }))
      .filter((group) => group.items.length > 0);
  }, [actionGroups, search]);

  const flatFilteredItems = React.useMemo(
    () => filteredGroups.flatMap((g) => g.items),
    [filteredGroups]
  );

  // Reset selection when filtered list changes
  const filteredCount = flatFilteredItems.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset index on count change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCount]);

  // Scroll selected item into view
  useEffect(() => {
    const selected = document.querySelector(`[data-action-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  // Reset search and focus input when dialog opens/closes
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  const executeAction = React.useCallback(
    (action: ActionItem) => {
      // Record to recent commands (strip 'recent-' prefix if present)
      const originalId = action.id.startsWith('recent-') ? action.id.slice(7) : action.id;
      addRecentCommand(originalId);

      action.action();
      onOpenChange(false);
    },
    [onOpenChange, addRecentCommand]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % flatFilteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + flatFilteredItems.length) % flatFilteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const action = flatFilteredItems[selectedIndex];
        if (action) {
          executeAction(action);
        }
      }
    },
    [flatFilteredItems, selectedIndex, executeAction]
  );

  // Calculate global index for each item
  let globalIndex = -1;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup>
        <CommandPanel>
          <div className="px-3 py-2" onKeyDown={handleKeyDown}>
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={t('Filter actions...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="border-t" />
          <div className="max-h-72 overflow-y-auto p-2">
            {flatFilteredItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('No matching actions found')}
              </div>
            ) : (
              filteredGroups.map((group, groupIdx) => (
                <div key={group.label} className={groupIdx > 0 ? 'mt-2' : ''}>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    globalIndex++;
                    const currentIndex = globalIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-action-index={currentIndex}
                        disabled={item.disabled}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
                          currentIndex === selectedIndex
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-accent/50',
                          item.disabled && 'cursor-not-allowed opacity-60'
                        )}
                        onClick={() => !item.disabled && executeAction(item)}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                      >
                        <item.icon className={cn('h-4 w-4', item.loading && 'animate-spin')} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </CommandPanel>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
