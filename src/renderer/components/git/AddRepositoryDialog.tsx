import type { CloneProgress } from '@shared/types';
import { FolderOpen, Globe, Loader2, Minus, Plus } from 'lucide-react';
import * as React from 'react';
import type { RepositoryGroup } from '@/App/constants';
import { CreateGroupDialog } from '@/components/group';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { Z_INDEX } from '@/lib/z-index';
import { useCloneTasksStore } from '@/stores/cloneTasks';

type AddMode = 'local' | 'remote';

interface AddRepositoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: RepositoryGroup[];
  defaultGroupId: string | null;
  onAddLocal: (path: string, groupId: string | null) => void;
  onCloneComplete: (path: string, groupId: string | null) => void;
  onCreateGroup: (name: string, emoji: string, color: string) => RepositoryGroup;
  /** Pre-filled local path (e.g., from drag-and-drop) */
  initialLocalPath?: string;
  /** Callback to clear the initial local path after it's been used */
  onClearInitialLocalPath?: () => void;
}

export function AddRepositoryDialog({
  open,
  onOpenChange,
  groups,
  defaultGroupId,
  onAddLocal,
  onCloneComplete,
  onCreateGroup,
  initialLocalPath,
  onClearInitialLocalPath,
}: AddRepositoryDialogProps) {
  const { t } = useI18n();

  // Progress stage display labels (使用 t() 支持国际化，useMemo 避免重复创建)
  const stageLabels = React.useMemo<Record<string, string>>(
    () => ({
      counting: t('Counting objects...'),
      compressing: t('Compressing objects...'),
      receiving: t('Receiving objects...'),
      resolving: t('Resolving deltas...'),
    }),
    [t]
  );
  const [mode, setMode] = React.useState<AddMode>('local');

  // Group selection state ('' = no group)
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>('');
  const prevOpenRef = React.useRef(open);
  const prevDefaultGroupIdRef = React.useRef<string | null>(defaultGroupId);
  const groupSelectionTouchedRef = React.useRef(false);

  React.useEffect(() => {
    const wasOpen = prevOpenRef.current;
    const prevDefaultGroupId = prevDefaultGroupIdRef.current;

    if (!wasOpen && open) {
      groupSelectionTouchedRef.current = false;
      setSelectedGroupId(defaultGroupId || '');
    } else if (
      open &&
      !groupSelectionTouchedRef.current &&
      selectedGroupId === (prevDefaultGroupId || '')
    ) {
      setSelectedGroupId(defaultGroupId || '');
    }

    prevOpenRef.current = open;
    prevDefaultGroupIdRef.current = defaultGroupId;
  }, [open, defaultGroupId, selectedGroupId]);

  // Handle initial local path from drag-and-drop
  React.useEffect(() => {
    if (open && initialLocalPath) {
      setMode('local');
      setLocalPath(initialLocalPath);
      onClearInitialLocalPath?.();
    }
  }, [open, initialLocalPath, onClearInitialLocalPath]);

  // Local mode state
  const [localPath, setLocalPath] = React.useState('');

  // Remote mode state
  const [remoteUrl, setRemoteUrl] = React.useState('');
  const [targetDir, setTargetDir] = React.useState('');
  const [repoName, setRepoName] = React.useState('');
  const [isValidUrl, setIsValidUrl] = React.useState(false);

  // Clone progress state
  const [isCloning, setIsCloning] = React.useState(false);
  const [cloneProgress, setCloneProgress] = React.useState<CloneProgress | null>(null);
  const [cloneTaskId, setCloneTaskId] = React.useState<string | null>(null);

  // Clone tasks store
  const addCloneTask = useCloneTasksStore((s) => s.addTask);
  const completeCloneTask = useCloneTasksStore((s) => s.completeTask);
  const failCloneTask = useCloneTasksStore((s) => s.failTask);
  const activeTaskProgress = useCloneTasksStore((s) => {
    if (!cloneTaskId) return null;
    const task = s.tasks.find((t) => t.id === cloneTaskId);
    return task?.progress ?? null;
  });

  // Error state
  const [error, setError] = React.useState<string | null>(null);

  // Create group dialog state
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = React.useState(false);

  // Validate URL and extract repo name when URL changes
  React.useEffect(() => {
    if (!remoteUrl.trim()) {
      setIsValidUrl(false);
      setRepoName('');
      return;
    }

    const validateUrl = async () => {
      try {
        const result = await window.electronAPI.git.validateUrl(remoteUrl.trim());
        setIsValidUrl(result.valid);
        if (result.valid && result.repoName) {
          setRepoName(result.repoName);
        }
      } catch {
        setIsValidUrl(false);
      }
    };

    // Debounce validation
    const timer = setTimeout(validateUrl, 300);
    return () => clearTimeout(timer);
  }, [remoteUrl]);

  // Sync progress from store to local state for UI display
  React.useEffect(() => {
    if (activeTaskProgress) {
      setCloneProgress(activeTaskProgress);
    }
  }, [activeTaskProgress]);

  const handleSelectLocalPath = async () => {
    try {
      const selectedPath = await window.electronAPI.dialog.openDirectory();
      if (selectedPath) {
        setLocalPath(selectedPath);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to select directory'));
    }
  };

  const handleSelectTargetDir = async () => {
    try {
      const selectedPath = await window.electronAPI.dialog.openDirectory();
      if (selectedPath) {
        setTargetDir(selectedPath);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to select directory'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const groupIdToSave = selectedGroupId ? selectedGroupId : null;

    if (mode === 'local') {
      if (!localPath) {
        setError(t('Please select a local repository directory'));
        return;
      }
      onAddLocal(localPath, groupIdToSave);
      handleClose();
    } else {
      // Remote mode
      if (!isValidUrl) {
        setError(t('Please enter a valid Git URL'));
        return;
      }
      if (!targetDir) {
        setError(t('Please select a save location'));
        return;
      }
      if (!repoName.trim()) {
        setError(t('Please enter a repository name'));
        return;
      }

      const isWindows = window.electronAPI.env.platform === 'win32';
      const pathSep = isWindows ? '\\' : '/';
      const fullPath = `${targetDir}${pathSep}${repoName.trim()}`;

      // Create a task in the store for background tracking
      const taskId = addCloneTask({
        remoteUrl: remoteUrl.trim(),
        targetPath: fullPath,
        repoName: repoName.trim(),
        groupId: groupIdToSave,
      });
      setCloneTaskId(taskId);

      setIsCloning(true);
      setCloneProgress(null);

      try {
        const result = await window.electronAPI.git.clone(remoteUrl.trim(), fullPath);
        if (result.success) {
          completeCloneTask(taskId);
          onCloneComplete(result.path, groupIdToSave);
          handleClose();
        } else {
          failCloneTask(taskId, result.error || t('Clone failed'));
          handleCloneError(result.error || t('Clone failed'));
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('Clone failed');
        failCloneTask(taskId, errorMessage);
        handleCloneError(errorMessage);
      } finally {
        setIsCloning(false);
        setCloneProgress(null);
        setCloneTaskId(null);
      }
    }
  };

  const handleCloneError = (errorMessage: string) => {
    if (errorMessage.includes('already exists')) {
      setError(
        t(
          'Target directory already exists. Please choose a different location or rename the repository.'
        )
      );
    } else if (errorMessage.includes('Authentication failed')) {
      setError(t('Authentication failed. Please check your system credentials.'));
    } else if (errorMessage.includes('Permission denied')) {
      setError(t('SSH authentication failed. Please check your SSH key configuration.'));
    } else if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
      setError(t('Remote repository not found. Please check the URL.'));
    } else if (errorMessage.includes('unable to access')) {
      setError(t('Unable to connect to remote repository. Please check your network.'));
    } else if (errorMessage.includes('Invalid Git URL')) {
      setError(t('Invalid Git URL format. Please enter a valid HTTPS or SSH URL.'));
    } else {
      setError(errorMessage);
    }
  };

  const handleClose = () => {
    if (isCloning) return; // Prevent closing while cloning (use minimize instead)
    resetForm();
    onOpenChange(false);
  };

  // Minimize the dialog while clone continues in background
  const handleMinimize = () => {
    // Clone will continue in background via the store
    // Reset ALL form state including isCloning since the task is now managed by the store
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setMode('local');
    groupSelectionTouchedRef.current = false;
    setSelectedGroupId(defaultGroupId || '');
    setLocalPath('');
    setRemoteUrl('');
    setTargetDir('');
    setRepoName('');
    setIsValidUrl(false);
    setError(null);
    setIsCloning(false);
    setCloneProgress(null);
    setCreateGroupDialogOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && isCloning) {
      // When closing while cloning, minimize instead of blocking
      handleMinimize();
      return;
    }
    if (!newOpen) resetForm();
    onOpenChange(newOpen);
  };

  const getProgressLabel = () => {
    if (!cloneProgress) return '';
    // stageLabels 已使用 t() 翻译，直接返回即可
    return stageLabels[cloneProgress.stage] || cloneProgress.stage;
  };

  const isSubmitDisabled = () => {
    if (isCloning) return true;
    if (mode === 'local') return !localPath;
    return !isValidUrl || !targetDir || !repoName.trim();
  };

  const selectedGroupLabel = React.useMemo(() => {
    if (!selectedGroupId) return t('No Group');
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group) return t('No Group');
    return (
      <span className="flex min-w-0 items-center gap-2">
        {group.emoji && <span className="shrink-0 text-base">{group.emoji}</span>}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border"
          style={{ backgroundColor: group.color }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
      </span>
    );
  }, [groups, selectedGroupId, t]);

  const handleCreateGroup = React.useCallback(
    (name: string, emoji: string, color: string) => {
      const newGroup = onCreateGroup(name, emoji, color);
      groupSelectionTouchedRef.current = true;
      setSelectedGroupId(newGroup.id);
      return newGroup;
    },
    [onCreateGroup]
  );

  const groupSelect = (
    <Field>
      <FieldLabel>{t('Group')}</FieldLabel>
      <Select
        value={selectedGroupId}
        onValueChange={(v) => {
          groupSelectionTouchedRef.current = true;
          setSelectedGroupId(v || '');
        }}
        disabled={isCloning}
      >
        <div className="flex w-full items-center gap-2">
          <SelectTrigger className="min-w-0 flex-1 w-auto">
            <SelectValue>{selectedGroupLabel}</SelectValue>
          </SelectTrigger>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setCreateGroupDialogOpen(true)}
            disabled={isCloning}
            title={t('New Group')}
            aria-label={t('New Group')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <SelectPopup zIndex={Z_INDEX.DROPDOWN_IN_MODAL}>
          <SelectItem value="">{t('No Group')}</SelectItem>
          {groups.length > 0 && <SelectSeparator />}
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              <span className="flex min-w-0 items-center gap-2">
                {group.emoji && <span className="shrink-0 text-base">{group.emoji}</span>}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border"
                  style={{ backgroundColor: group.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('Add Repository')}</DialogTitle>
            <DialogDescription>
              {t('Add a local Git repository or clone from a remote URL.')}
            </DialogDescription>
          </DialogHeader>

          <DialogPanel className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => !isCloning && setMode(v as AddMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="local" className="flex-1" disabled={isCloning}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {t('Local')}
                </TabsTrigger>
                <TabsTrigger value="remote" className="flex-1" disabled={isCloning}>
                  <Globe className="mr-2 h-4 w-4" />
                  {t('Remote')}
                </TabsTrigger>
              </TabsList>

              {/* Local Repository Tab */}
              <TabsContent value="local" className="mt-4 space-y-4">
                <Field>
                  <FieldLabel>{t('Repository directory')}</FieldLabel>
                  <div className="flex w-full gap-2">
                    <Input
                      value={localPath}
                      readOnly
                      placeholder={t('Select a local Git repository...')}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSelectLocalPath}
                      className="shrink-0"
                    >
                      {t('Browse')}
                    </Button>
                  </div>
                  <FieldDescription>
                    {t('Select an existing Git repository on your computer.')}
                  </FieldDescription>
                </Field>

                {groupSelect}
              </TabsContent>

              {/* Remote Repository Tab */}
              <TabsContent value="remote" className="mt-4 space-y-4">
                {/* Repository URL */}
                <Field>
                  <FieldLabel>{t('Repository URL')}</FieldLabel>
                  <Input
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    disabled={isCloning}
                    autoFocus
                  />
                  <FieldDescription>
                    {t('Supports HTTPS and SSH protocols.')}
                    {remoteUrl && !isValidUrl && (
                      <span className="text-destructive ml-2">{t('Invalid URL format')}</span>
                    )}
                    {remoteUrl && isValidUrl && (
                      <span className="text-green-600 ml-2">✓ {t('Valid URL')}</span>
                    )}
                  </FieldDescription>
                </Field>

                {/* Save Location */}
                <Field>
                  <FieldLabel>{t('Save location')}</FieldLabel>
                  <div className="flex w-full gap-2">
                    <Input
                      value={targetDir}
                      readOnly
                      placeholder={t('Select a directory...')}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSelectTargetDir}
                      disabled={isCloning}
                      className="shrink-0"
                    >
                      {t('Browse')}
                    </Button>
                  </div>
                </Field>

                {/* Repository Name */}
                <Field>
                  <FieldLabel>{t('Repository name')}</FieldLabel>
                  <Input
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder={t('Repository folder name')}
                    disabled={isCloning}
                  />
                  <FieldDescription>
                    {t('The folder name for the cloned repository.')}
                  </FieldDescription>
                </Field>

                {groupSelect}

                {/* Clone Progress */}
                {isCloning && (
                  <div className="space-y-2">
                    <Progress value={cloneProgress?.progress || 0} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {getProgressLabel()}
                      </span>
                      <span>{cloneProgress?.progress || 0}%</span>
                    </div>
                  </div>
                )}

                {/* Full Path Preview */}
                {targetDir && repoName && !isCloning && (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    <span className="font-medium">{t('Full path')}:</span>
                    <code className="ml-1 break-all">
                      {targetDir}
                      {window.electronAPI.env.platform === 'win32' ? '\\' : '/'}
                      {repoName}
                    </code>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Error Display */}
            {error && <div className="text-sm text-destructive">{error}</div>}
          </DialogPanel>

          <DialogFooter variant="bare">
            {isCloning ? (
              <Button type="button" variant="outline" onClick={handleMinimize}>
                <Minus className="mr-2 h-4 w-4" />
                {t('Minimize')}
              </Button>
            ) : (
              <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            )}
            <Button type="submit" disabled={isSubmitDisabled()}>
              {isCloning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('Cloning...')}
                </>
              ) : mode === 'local' ? (
                t('Add')
              ) : (
                t('Clone')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>

      <CreateGroupDialog
        open={createGroupDialogOpen}
        onOpenChange={setCreateGroupDialogOpen}
        onSubmit={handleCreateGroup}
      />
    </Dialog>
  );
}
