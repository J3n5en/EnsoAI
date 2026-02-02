import type {
  GhCliStatus,
  GitBranch as GitBranchType,
  PullRequest,
  WorktreeCreateOptions,
} from '@shared/types';
import { AlertCircle, GitBranch, GitPullRequest, Loader2, Plus, Sparkles } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSeparator,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { Z_INDEX } from '@/lib/z-index';
import { useSettingsStore } from '@/stores/settings';

// Get display name for branch (remove remotes/ prefix for remote branches)
const getBranchDisplayName = (name: string) => {
  return name.startsWith('remotes/') ? name.replace('remotes/', '') : name;
};

interface CreateWorktreeDialogProps {
  branches: GitBranchType[];
  projectName: string;
  workdir: string;
  isLoading?: boolean;
  onSubmit: (options: WorktreeCreateOptions) => Promise<void>;
  trigger?: React.ReactElement;
  // Support controlled mode (for context menu trigger)
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type CreateMode = 'branch' | 'pr';

export function CreateWorktreeDialog({
  branches,
  projectName,
  workdir,
  isLoading,
  onSubmit,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CreateWorktreeDialogProps) {
  const { t } = useI18n();
  const { defaultWorktreePath, branchNameGenerator } = useSettingsStore();

  // Internal state (for uncontrolled mode)
  const [internalOpen, setInternalOpen] = React.useState(false);

  // Determine if controlled mode
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (value: boolean) => {
      if (isControlled) {
        controlledOnOpenChange?.(value);
      } else {
        setInternalOpen(value);
      }
    },
    [isControlled, controlledOnOpenChange]
  );
  const [mode, setMode] = React.useState<CreateMode>('branch');
  const [baseBranch, setBaseBranch] = React.useState<string>('');
  const [baseBranchQuery, setBaseBranchQuery] = React.useState('');
  const [baseBranchOpen, setBaseBranchOpen] = React.useState(false);
  const [newBranchName, setNewBranchName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [generatingBranchName, setGeneratingBranchName] = React.useState(false);

  // PR mode state
  const [ghStatus, setGhStatus] = React.useState<GhCliStatus | null>(null);
  const [ghStatusLoading, setGhStatusLoading] = React.useState(false);
  const [pullRequests, setPullRequests] = React.useState<PullRequest[]>([]);
  const [prsLoading, setPrsLoading] = React.useState(false);
  const [selectedPr, setSelectedPr] = React.useState<PullRequest | null>(null);

  // Worktree path: {defaultWorktreePath}/{projectName}/{branchName}
  // Falls back to ~/ensoai/workspaces if not configured
  const home = window.electronAPI?.env?.HOME || '';
  const isWindows = window.electronAPI?.env?.platform === 'win32';
  const pathSep = isWindows ? '\\' : '/';
  const getWorktreePath = (branchName: string) => {
    if (!home) return '';
    // Extract last directory name from projectName when a full path is passed in.
    const normalizedName = projectName.replace(/\\/g, '/');
    const projectBaseName = normalizedName.split('/').filter(Boolean).pop() || projectName;

    // Use configured path or default to ~/ensoai/workspaces
    const basePath = defaultWorktreePath || [home, 'ensoai', 'workspaces'].join(pathSep);
    return [basePath, projectBaseName, branchName].join(pathSep);
  };

  // Branch item type for combobox
  type BranchItem = { id: string; label: string; value: string };
  type BranchGroup = { value: string; label: string; items: BranchItem[] };

  // Convert branches to grouped combobox items format
  const branchGroups = React.useMemo((): BranchGroup[] => {
    const localItems: BranchItem[] = [];
    const remoteItems: BranchItem[] = [];

    for (const b of branches) {
      const item: BranchItem = {
        id: b.name,
        label: getBranchDisplayName(b.name) + (b.current ? ` (${t('Current')})` : ''),
        value: b.name,
      };
      if (b.name.startsWith('remotes/')) {
        remoteItems.push(item);
      } else {
        localItems.push(item);
      }
    }

    const groups: BranchGroup[] = [];
    if (localItems.length > 0) {
      groups.push({ value: 'local', label: t('Local branches'), items: localItems });
    }
    if (remoteItems.length > 0) {
      groups.push({ value: 'remote', label: t('Remote branches'), items: remoteItems });
    }
    return groups;
  }, [branches, t]);

  // Use current branch as default base
  const currentBranch = branches.find((b) => b.current);
  const getBranchLabel = React.useCallback(
    (branchName: string | null | undefined) => {
      if (!branchName) return '';
      const matched = branches.find((b) => b.name === branchName);
      const displayName = getBranchDisplayName(branchName);
      return matched?.current ? `${displayName} (${t('Current')})` : displayName;
    },
    [branches, t]
  );

  // Track if baseBranch has been initialized to prevent Combobox reset
  const baseBranchInitializedRef = React.useRef(false);

  // Initialize baseBranch state when dialog opens
  React.useEffect(() => {
    if (open && currentBranch && !baseBranchInitializedRef.current) {
      const branchName = currentBranch.name;
      setBaseBranch(branchName);
      setBaseBranchQuery(getBranchLabel(branchName));
      baseBranchInitializedRef.current = true;
    }
    // Reset initialized flag when dialog closes
    if (!open) {
      baseBranchInitializedRef.current = false;
    }
  }, [open, currentBranch, getBranchLabel]);

  // Keep input value in sync when dropdown is closed
  React.useEffect(() => {
    if (baseBranchOpen) {
      // Clear search when opening to show all branches
      setBaseBranchQuery('');
    } else if (baseBranch) {
      // Restore branch label when closing
      setBaseBranchQuery(getBranchLabel(baseBranch));
    }
  }, [baseBranchOpen, baseBranch, getBranchLabel]);

  const loadPullRequests = React.useCallback(async () => {
    setPrsLoading(true);
    try {
      const prs = await window.electronAPI.git.listPullRequests(workdir);
      setPullRequests(prs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PRs');
    } finally {
      setPrsLoading(false);
    }
  }, [workdir]);

  const checkGhStatus = React.useCallback(async () => {
    setGhStatusLoading(true);
    try {
      const status = await window.electronAPI.git.getGhStatus(workdir);
      setGhStatus(status);
      if (status.installed && status.authenticated) {
        loadPullRequests();
      }
    } catch {
      setGhStatus({ installed: false, authenticated: false, error: 'Failed to check gh status' });
    } finally {
      setGhStatusLoading(false);
    }
  }, [workdir, loadPullRequests]);

  // Check gh CLI status and load PRs when PR mode is selected
  React.useEffect(() => {
    if (open && mode === 'pr' && !ghStatus && !ghStatusLoading) {
      checkGhStatus();
    }
  }, [open, mode, ghStatus, ghStatusLoading, checkGhStatus]);

  // PR items for combobox
  type PrItem = { id: string; label: string; value: PullRequest };
  const prItems = React.useMemo((): PrItem[] => {
    return pullRequests.map((pr) => ({
      id: String(pr.number),
      label: `#${pr.number} ${pr.title}${pr.isDraft ? ` (${t('Draft')})` : ''}`,
      value: pr,
    }));
  }, [pullRequests, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'branch') {
      if (!newBranchName) {
        setError(t('Enter new branch name'));
        return;
      }

      // Use baseBranch state, or fall back to current branch if state wasn't set
      const effectiveBaseBranch = baseBranch || currentBranch?.name;
      if (!effectiveBaseBranch) {
        setError(t('Select base branch'));
        return;
      }

      if (!home) {
        setError(t('Unable to determine your home directory'));
        return;
      }

      try {
        await onSubmit({
          path: getWorktreePath(newBranchName),
          branch: effectiveBaseBranch,
          newBranch: newBranchName,
        });
        setOpen(false);
        resetForm();
      } catch (err) {
        handleSubmitError(err);
      }
    } else {
      // PR mode
      if (!selectedPr) {
        setError(t('Select a pull request'));
        return;
      }

      const branchName = newBranchName || selectedPr.headRefName;

      if (!home) {
        setError(t('Unable to determine your home directory'));
        return;
      }

      try {
        // First fetch PR to local branch (without checkout)
        await window.electronAPI.git.fetchPullRequest(workdir, selectedPr.number, branchName);

        // Then create worktree from that branch (branch already exists, no newBranch needed)
        await onSubmit({
          path: getWorktreePath(branchName),
          branch: branchName,
        });
        setOpen(false);
        resetForm();
      } catch (err) {
        handleSubmitError(err);
      }
    }
  };

  const handleSubmitError = (err: unknown) => {
    const message = err instanceof Error ? err.message : t('Failed to create');
    if (message.includes('already exists')) {
      setError(t('Worktree path already exists. Choose a different path or branch name.'));
    } else if (
      message.includes('is already used by worktree') ||
      message.includes('already checked out')
    ) {
      setError(t('Branch already exists. Choose a different name.'));
    } else {
      setError(message);
    }
  };

  const resetForm = () => {
    const branchName = currentBranch?.name || '';
    setBaseBranch(branchName);
    setBaseBranchQuery(getBranchLabel(branchName));
    setNewBranchName('');
    setSelectedPr(null);
    setError(null);
  };

  const handleGenerateBranchName = async () => {
    if (!newBranchName.trim()) return;

    setGeneratingBranchName(true);
    try {
      const trimmedDescription = newBranchName.trim();
      const now = new Date();
      const pad2 = (value: number) => String(value).padStart(2, '0');
      const currentDate = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
      const currentTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(
        now.getSeconds()
      )}`;
      const prompt = branchNameGenerator.prompt
        .replaceAll('{description}', trimmedDescription)
        .replaceAll('{current_date}', currentDate)
        .replaceAll('{current_time}', currentTime);
      const result = await window.electronAPI.git.generateBranchName(workdir, {
        prompt,
        provider: branchNameGenerator.provider,
        model: branchNameGenerator.model,
        reasoningEffort: branchNameGenerator.reasoningEffort,
      });

      if (result.success && result.branchName) {
        setNewBranchName(result.branchName.trim());
      } else {
        const errorMessage =
          result.error === 'timeout'
            ? t('Generation timed out')
            : result.error || t('Failed to generate branch name');
        setError(errorMessage);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || t('Failed to generate branch name'));
    } finally {
      setGeneratingBranchName(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset PR state when dialog closes
      setGhStatus(null);
      setPullRequests([]);
      setMode('branch');
      resetForm();
    }
  };

  const effectiveBranchName =
    mode === 'pr' ? newBranchName || selectedPr?.headRefName || '' : newBranchName;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Only render trigger in uncontrolled mode */}
      {!isControlled && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t('New')}
              </Button>
            )
          }
        />
      )}
      <DialogPopup>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('New Worktree')}</DialogTitle>
            <DialogDescription>
              {t('Create a new branch and work in a separate directory to handle multiple tasks.')}
            </DialogDescription>
          </DialogHeader>

          <DialogPanel className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as CreateMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="branch" className="flex-1">
                  <GitBranch className="mr-2 h-4 w-4" />
                  {t('From branch')}
                </TabsTrigger>
                <TabsTrigger value="pr" className="flex-1">
                  <GitPullRequest className="mr-2 h-4 w-4" />
                  {t('From PR')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="branch" className="mt-4 space-y-4">
                {/* New Branch Name */}
                <Field>
                  <FieldLabel>{t('Branch name')}</FieldLabel>
                  <div className="relative w-full">
                    <Input
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="feature/my-feature"
                      autoFocus
                      className="pr-8"
                    />
                    {branchNameGenerator.enabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 z-10 h-6 w-6 -translate-y-1/2 p-1 hover:bg-transparent data-[pressed]:bg-transparent"
                        onClick={handleGenerateBranchName}
                        disabled={!newBranchName.trim() || generatingBranchName}
                        title={t('Generate branch name')}
                        aria-label={t('Generate branch name')}
                      >
                        {generatingBranchName ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                  <FieldDescription>
                    {t('This branch will be created and checked out in the new worktree.')}
                  </FieldDescription>
                </Field>

                {/* Base Branch Selection with Search */}
                <Field>
                  <FieldLabel>{t('Base branch')}</FieldLabel>
                  <Combobox<string>
                    items={branchGroups}
                    value={baseBranch || null}
                    onValueChange={(value: string | null) => {
                      // Ignore null values from Combobox initialization/reset if already initialized
                      if (value === null && baseBranchInitializedRef.current) {
                        return;
                      }
                      const nextValue = value || '';
                      setBaseBranch(nextValue);
                      setBaseBranchQuery(getBranchLabel(nextValue));
                    }}
                    inputValue={baseBranchQuery}
                    onInputValueChange={(value) => {
                      // Allow clearing when dropdown is open (for showing all branches)
                      if (value === '' && baseBranchOpen) {
                        setBaseBranchQuery('');
                        return;
                      }
                      // Ignore empty string during initialization if we already have a query
                      if (value === '' && baseBranchQuery && baseBranchInitializedRef.current) {
                        return;
                      }
                      setBaseBranchQuery(value);
                    }}
                    open={baseBranchOpen}
                    onOpenChange={setBaseBranchOpen}
                  >
                    <ComboboxInput
                      placeholder={t('Search branches...')}
                      startAddon={<GitBranch className="h-4 w-4" />}
                      showTrigger
                    />
                    <ComboboxPopup zIndex={Z_INDEX.NESTED_MODAL_CONTENT}>
                      <ComboboxEmpty>{t('No branches found')}</ComboboxEmpty>
                      <ComboboxList>
                        {(group: BranchGroup) => (
                          <React.Fragment key={group.value}>
                            <ComboboxGroup items={group.items}>
                              <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel>
                              <ComboboxCollection>
                                {(item: BranchItem) => (
                                  <ComboboxItem key={item.id} value={item.value}>
                                    {item.label}
                                  </ComboboxItem>
                                )}
                              </ComboboxCollection>
                            </ComboboxGroup>
                            {group.value === 'local' && branchGroups.length > 1 && (
                              <ComboboxSeparator />
                            )}
                          </React.Fragment>
                        )}
                      </ComboboxList>
                    </ComboboxPopup>
                  </Combobox>
                </Field>
              </TabsContent>

              <TabsContent value="pr" className="mt-4 space-y-4">
                {ghStatusLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">{t('Checking gh CLI...')}</span>
                  </div>
                ) : ghStatus && !ghStatus.installed ? (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-destructive">
                          {t('GitHub CLI not installed')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t('To create worktrees from pull requests, please install GitHub CLI:')}
                        </p>
                        <code className="block rounded bg-muted px-2 py-1 text-xs">
                          brew install gh
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.electronAPI.shell.openExternal('https://cli.github.com/')
                          }
                        >
                          {t('Learn more')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : ghStatus && !ghStatus.authenticated ? (
                  <div className="rounded-md border border-warning/50 bg-warning/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-warning">
                          {t('GitHub CLI not authenticated')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t('Please authenticate with GitHub CLI:')}
                        </p>
                        <code className="block rounded bg-muted px-2 py-1 text-xs">
                          gh auth login
                        </code>
                        <Button type="button" variant="outline" size="sm" onClick={checkGhStatus}>
                          {t('Retry')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* PR Selection */}
                    <Field>
                      <FieldLabel>{t('Pull Request')}</FieldLabel>
                      {prsLoading ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">
                            {t('Loading pull requests...')}
                          </span>
                        </div>
                      ) : prItems.length === 0 ? (
                        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                          {t('No open pull requests found')}
                        </div>
                      ) : (
                        <Combobox
                          items={prItems}
                          onValueChange={(item: PrItem | null) => {
                            setSelectedPr(item?.value || null);
                            // Auto-fill branch name from PR
                            if (item?.value && !newBranchName) {
                              setNewBranchName('');
                            }
                          }}
                        >
                          <ComboboxInput
                            placeholder={t('Search pull requests...')}
                            startAddon={<GitPullRequest className="h-4 w-4" />}
                            showTrigger
                          />
                          <ComboboxPopup zIndex={Z_INDEX.NESTED_MODAL_CONTENT}>
                            <ComboboxEmpty>{t('No pull requests found')}</ComboboxEmpty>
                            <ComboboxList>
                              {(item: PrItem) => (
                                <ComboboxItem key={item.id} value={item}>
                                  <div className="flex flex-col">
                                    <span>{item.label}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {item.value.headRefName} · @{item.value.author}
                                    </span>
                                  </div>
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxPopup>
                        </Combobox>
                      )}
                    </Field>

                    {/* Optional: Override Branch Name */}
                    {selectedPr && (
                      <Field>
                        <FieldLabel>
                          {t('Branch name')} ({t('optional')})
                        </FieldLabel>
                        <Input
                          value={newBranchName}
                          onChange={(e) => setNewBranchName(e.target.value)}
                          placeholder={selectedPr.headRefName}
                        />
                        <FieldDescription>
                          {t('Leave empty to use the PR branch name:')} {selectedPr.headRefName}
                        </FieldDescription>
                      </Field>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>

            {/* Path Preview */}
            {effectiveBranchName && home && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium">{t('Save location')}:</span>
                <code className="ml-1 break-all">{getWorktreePath(effectiveBranchName)}</code>
              </div>
            )}

            {error && <div className="text-sm text-destructive">{error}</div>}
          </DialogPanel>

          <DialogFooter variant="bare">
            <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button
              type="submit"
              disabled={
                isLoading ||
                (mode === 'pr' && (!ghStatus?.authenticated || !selectedPr)) ||
                (mode === 'branch' && !newBranchName)
              }
            >
              {isLoading ? t('Creating...') : t('Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
