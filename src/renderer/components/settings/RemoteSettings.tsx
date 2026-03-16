import type { ConnectionProfile, ConnectionTestResult, RemoteRuntimeStatus } from '@shared/types';
import {
  Download,
  Loader2,
  RefreshCw,
  RotateCw,
  Save,
  Server,
  TestTube2,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

interface RemoteProfileFormState {
  name: string;
  sshTarget: string;
  runtimeInstallDir: string;
}

const EMPTY_FORM: RemoteProfileFormState = {
  name: '',
  sshTarget: '',
  runtimeInstallDir: '',
};

export function RemoteSettings() {
  const { t } = useI18n();
  const profiles = useSettingsStore((state) => state.remoteSettings.profiles);
  const setRemoteProfiles = useSettingsStore((state) => state.setRemoteProfiles);
  const upsertRemoteProfile = useSettingsStore((state) => state.upsertRemoteProfile);
  const removeRemoteProfile = useSettingsStore((state) => state.removeRemoteProfile);

  const [selectedProfileId, setSelectedProfileId] = React.useState('');
  const [form, setForm] = React.useState<RemoteProfileFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyAction, setBusyAction] = React.useState<
    | 'refresh'
    | 'save'
    | 'test'
    | 'delete'
    | 'runtime-status'
    | 'runtime-install'
    | 'runtime-update'
    | 'runtime-delete'
    | null
  >(null);
  const [feedback, setFeedback] = React.useState<{
    variant: 'error' | 'success' | 'info';
    title: string;
    description: string;
  } | null>(null);
  const [testResult, setTestResult] = React.useState<ConnectionTestResult | null>(null);
  const [runtimeStatus, setRuntimeStatus] = React.useState<RemoteRuntimeStatus | null>(null);
  const [deleteRuntimeDialogOpen, setDeleteRuntimeDialogOpen] = React.useState(false);
  const selectedProfile = profiles.find((item) => item.id === selectedProfileId);

  const syncFormFromProfile = React.useCallback((profile?: ConnectionProfile | null) => {
    if (!profile) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      name: profile.name,
      sshTarget: profile.sshTarget,
      runtimeInstallDir: profile.runtimeInstallDir ?? profile.helperInstallDir ?? '',
    });
  }, []);

  const loadProfiles = React.useCallback(async () => {
    setBusyAction((current) => current ?? 'refresh');
    try {
      const nextProfiles = await window.electronAPI.remote.listProfiles();
      setRemoteProfiles(nextProfiles);
      if (selectedProfileId && !nextProfiles.some((item) => item.id === selectedProfileId)) {
        setSelectedProfileId('');
        syncFormFromProfile(null);
      }
      setFeedback(null);
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: t('Failed to load remote profiles'),
        description: error instanceof Error ? error.message : t('Unknown error'),
      });
    } finally {
      setBusyAction(null);
      setIsLoading(false);
    }
  }, [selectedProfileId, setRemoteProfiles, syncFormFromProfile, t]);

  React.useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  React.useEffect(() => {
    const profile = profiles.find((item) => item.id === selectedProfileId);
    syncFormFromProfile(profile);
    setTestResult(null);
    setRuntimeStatus(null);
  }, [profiles, selectedProfileId, syncFormFromProfile]);

  const loadRuntimeStatus = React.useCallback(
    async (profileId: string, mode: 'refresh' | 'silent' = 'refresh') => {
      if (!profileId) {
        setRuntimeStatus(null);
        return null;
      }

      if (mode === 'refresh') {
        setBusyAction('runtime-status');
      }

      try {
        const status = await window.electronAPI.remote.getRuntimeStatus(profileId);
        setRuntimeStatus(status);
        return status;
      } catch (error) {
        setRuntimeStatus(null);
        if (mode === 'refresh') {
          setFeedback({
            variant: 'error',
            title: t('Failed to refresh runtime status'),
            description: error instanceof Error ? error.message : t('Unknown error'),
          });
        }
        return null;
      } finally {
        if (mode === 'refresh') {
          setBusyAction(null);
        }
      }
    },
    [t]
  );

  React.useEffect(() => {
    if (!selectedProfileId) {
      setRuntimeStatus(null);
      return;
    }
    void loadRuntimeStatus(selectedProfileId, 'silent');
  }, [loadRuntimeStatus, selectedProfileId]);

  const buildDraftProfile = React.useCallback((): ConnectionProfile => {
    const now = Date.now();
    return {
      id: selectedProfileId || 'draft-profile',
      name: form.name.trim(),
      sshTarget: form.sshTarget.trim(),
      runtimeInstallDir: form.runtimeInstallDir.trim() || undefined,
      helperInstallDir: form.runtimeInstallDir.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }, [form, selectedProfileId]);

  const handleSave = React.useCallback(async () => {
    if (!form.name.trim()) {
      setFeedback({
        variant: 'error',
        title: t('Profile name is required'),
        description: t('Give this connection a short recognizable name.'),
      });
      return;
    }

    if (!form.sshTarget.trim()) {
      setFeedback({
        variant: 'error',
        title: t('SSH target is required'),
        description: t('Use the same target you would pass to ssh, for example user@example.com.'),
      });
      return;
    }

    setBusyAction('save');
    try {
      const savedProfile = await window.electronAPI.remote.saveProfile({
        id: selectedProfileId || undefined,
        name: form.name.trim(),
        sshTarget: form.sshTarget.trim(),
        runtimeInstallDir: form.runtimeInstallDir.trim() || undefined,
        helperInstallDir: form.runtimeInstallDir.trim() || undefined,
      });
      upsertRemoteProfile(savedProfile);
      setSelectedProfileId(savedProfile.id);
      setFeedback({
        variant: 'success',
        title: t('Remote profile saved'),
        description: t('You can now use it from the Remote Host entry in the sidebar.'),
      });
      await loadProfiles();
      await loadRuntimeStatus(savedProfile.id, 'silent');
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: t('Failed to save remote profile'),
        description: error instanceof Error ? error.message : t('Unknown error'),
      });
    } finally {
      setBusyAction(null);
    }
  }, [form, loadRuntimeStatus, loadProfiles, selectedProfileId, t, upsertRemoteProfile]);

  const handleDelete = React.useCallback(async () => {
    if (!selectedProfileId) return;
    setBusyAction('delete');
    try {
      await window.electronAPI.remote.deleteProfile(selectedProfileId);
      removeRemoteProfile(selectedProfileId);
      setSelectedProfileId('');
      syncFormFromProfile(null);
      setTestResult(null);
      setRuntimeStatus(null);
      setFeedback({
        variant: 'success',
        title: t('Remote profile deleted'),
        description: t('The saved SSH connection has been removed.'),
      });
      await loadProfiles();
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: t('Failed to delete remote profile'),
        description: error instanceof Error ? error.message : t('Unknown error'),
      });
    } finally {
      setBusyAction(null);
    }
  }, [loadProfiles, removeRemoteProfile, selectedProfileId, syncFormFromProfile, t]);

  const handleTest = React.useCallback(async () => {
    const draftProfile = buildDraftProfile();
    if (!draftProfile.name || !draftProfile.sshTarget) {
      setFeedback({
        variant: 'error',
        title: t('Profile is incomplete'),
        description: t('Fill in the profile name and SSH target before testing the connection.'),
      });
      return;
    }

    setBusyAction('test');
    try {
      const result = await window.electronAPI.remote.testConnection(draftProfile);
      setTestResult(result);
      if (result.success) {
        setFeedback({
          variant: 'success',
          title: t('Connection succeeded'),
          description: t('The remote host is reachable and ready for managed runtime setup.'),
        });
      } else {
        setFeedback({
          variant: 'error',
          title: t('Connection failed'),
          description: result.error || t('Unknown error'),
        });
      }
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: t('Connection failed'),
        description: error instanceof Error ? error.message : t('Unknown error'),
      });
    } finally {
      setBusyAction(null);
    }
  }, [buildDraftProfile, t]);

  const runRuntimeAction = React.useCallback(
    async (
      action: 'install' | 'update' | 'delete',
      onSuccess: () => { title: string; description: string }
    ) => {
      if (!selectedProfileId) return;

      setBusyAction(
        action === 'install'
          ? 'runtime-install'
          : action === 'update'
            ? 'runtime-update'
            : 'runtime-delete'
      );

      try {
        const nextStatus =
          action === 'install'
            ? await window.electronAPI.remote.installRuntime(selectedProfileId)
            : action === 'update'
              ? await window.electronAPI.remote.updateRuntime(selectedProfileId)
              : await window.electronAPI.remote.deleteRuntime(selectedProfileId);
        setRuntimeStatus(nextStatus);
        const message = onSuccess();
        setFeedback({
          variant: 'success',
          title: message.title,
          description: message.description,
        });
      } catch (error) {
        setFeedback({
          variant: 'error',
          title:
            action === 'install'
              ? t('Failed to install runtime')
              : action === 'update'
                ? t('Failed to update runtime')
                : t('Failed to delete runtime'),
          description: error instanceof Error ? error.message : t('Unknown error'),
        });
      } finally {
        setBusyAction(null);
      }
    },
    [selectedProfileId, t]
  );

  const handleInstallRuntime = React.useCallback(async () => {
    await runRuntimeAction('install', () => ({
      title: t('Runtime installed'),
      description: t('The managed remote runtime is now installed on this host.'),
    }));
  }, [runRuntimeAction, t]);

  const handleUpdateRuntime = React.useCallback(async () => {
    await runRuntimeAction('update', () => ({
      title: t('Runtime updated'),
      description: t('The managed remote runtime was reinstalled successfully.'),
    }));
  }, [runRuntimeAction, t]);

  const handleDeleteRuntime = React.useCallback(async () => {
    setDeleteRuntimeDialogOpen(false);
    await runRuntimeAction('delete', () => ({
      title: t('Runtime deleted'),
      description: t('All installed managed runtime versions for this profile were removed.'),
    }));
  }, [runRuntimeAction, t]);

  const environmentItems = React.useMemo(
    () =>
      testResult?.success
        ? [
            {
              label: t('Platform'),
              value: testResult.platform ?? '-',
            },
            { label: t('Home directory'), value: testResult.homeDir || '-' },
            { label: t('Node'), value: testResult.nodeVersion || '-' },
            { label: t('Git'), value: testResult.gitVersion || '-' },
          ]
        : [],
    [t, testResult]
  );

  const runtimeInfoItems = React.useMemo(
    () =>
      runtimeStatus
        ? [
            {
              label: t('Status'),
              value: runtimeStatus.installed ? t('Installed') : t('Not installed'),
            },
            { label: t('Current version'), value: runtimeStatus.currentVersion },
            { label: t('Install directory'), value: runtimeStatus.installDir },
            {
              label: t('Installed versions'),
              value:
                runtimeStatus.installedVersions.length > 0
                  ? runtimeStatus.installedVersions.join(', ')
                  : '-',
            },
            {
              label: t('Connection'),
              value: runtimeStatus.connected ? t('Connected') : t('Disconnected'),
            },
          ]
        : [],
    [runtimeStatus, t]
  );

  const runtimeBusy =
    busyAction === 'runtime-status' ||
    busyAction === 'runtime-install' ||
    busyAction === 'runtime-update' ||
    busyAction === 'runtime-delete';
  const hasSelectedProfile = Boolean(selectedProfileId);
  const runtimeInstalled = runtimeStatus?.installed ?? false;
  const currentVersionInstalled =
    runtimeStatus?.installedVersions.includes(runtimeStatus.currentVersion) ?? false;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-semibold text-xl">{t('Remote Connection')}</h2>
        <p className="text-muted-foreground text-sm">
          {t(
            'Save SSH profiles here, then use the Remote Host entry in the sidebar to open a full remote window.'
          )}
        </p>
        <p className="text-muted-foreground text-sm">
          {t('Remote connections currently support Linux x64 and arm64 hosts only.')}
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('SSH Profiles')}</CardTitle>
          <CardDescription>
            {t('These profiles reuse your existing SSH configuration and credentials.')}
          </CardDescription>
        </CardHeader>
        <CardPanel className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_248px] xl:items-end">
            <Field className="min-w-0">
              <FieldLabel>{t('Profile')}</FieldLabel>
              <Select
                value={selectedProfileId}
                onValueChange={(value) => setSelectedProfileId(value ?? '')}
              >
                <SelectTrigger className="min-w-0">
                  <SelectValue>
                    {selectedProfileId
                      ? selectedProfile?.name || t('Unknown profile')
                      : t('Create new profile')}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="">{t('Create new profile')}</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <FieldDescription>
                {profiles.length === 0
                  ? t('No profiles saved yet.')
                  : t('{{count}} saved profiles', { count: profiles.length })}
              </FieldDescription>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => {
                  setSelectedProfileId('');
                  syncFormFromProfile(null);
                  setFeedback(null);
                  setTestResult(null);
                  setRuntimeStatus(null);
                }}
              >
                <Server className="h-4 w-4 shrink-0" />
                <span>{t('New')}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => void loadProfiles()}
              >
                {busyAction === 'refresh' || isLoading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 shrink-0" />
                )}
                <span>{t('Refresh')}</span>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field className="min-w-0">
              <FieldLabel>{t('Profile name')}</FieldLabel>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder={t('My staging server')}
              />
            </Field>

            <Field className="min-w-0">
              <FieldLabel>{t('SSH target')}</FieldLabel>
              <Input
                value={form.sshTarget}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sshTarget: event.target.value }))
                }
                placeholder="user@example.com"
              />
              <FieldDescription>
                {t('Use the same target string you would pass to the ssh command.')}
              </FieldDescription>
            </Field>

            <Field className="min-w-0">
              <FieldLabel>{t('Runtime install directory')}</FieldLabel>
              <Input
                value={form.runtimeInstallDir}
                onChange={(event) =>
                  setForm((current) => ({ ...current, runtimeInstallDir: event.target.value }))
                }
                placeholder={t('Optional override, for example ~/.ensoai/remote-runtime')}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              type="button"
              className="w-full justify-center"
              onClick={() => void handleSave()}
            >
              {busyAction === 'save' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Save className="h-4 w-4 shrink-0" />
              )}
              <span>{t('Save profile')}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              onClick={() => void handleTest()}
            >
              {busyAction === 'test' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <TestTube2 className="h-4 w-4 shrink-0" />
              )}
              <span>{t('Test connection')}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              onClick={() => void handleDelete()}
              disabled={!selectedProfileId}
            >
              {busyAction === 'delete' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 shrink-0" />
              )}
              <span>{t('Delete profile')}</span>
            </Button>
          </div>
        </CardPanel>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('Managed Remote Runtime')}</CardTitle>
          <CardDescription>
            {t(
              'Install, refresh, update, or remove the managed runtime on the selected remote host.'
            )}
          </CardDescription>
        </CardHeader>
        <CardPanel className="space-y-6">
          {!hasSelectedProfile ? (
            <Alert variant="info">
              <AlertTitle>{t('Select a profile')}</AlertTitle>
              <AlertDescription>
                {t('Choose a saved SSH profile above before managing the remote runtime.')}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {runtimeStatus?.error && (
                <Alert variant="error">
                  <AlertTitle>{t('Failed to refresh runtime status')}</AlertTitle>
                  <AlertDescription>{runtimeStatus.error}</AlertDescription>
                </Alert>
              )}

              {runtimeStatus && (
                <Alert variant="info">
                  <AlertTitle>{t('Runtime status')}</AlertTitle>
                  <AlertDescription className="grid gap-3 sm:grid-cols-2">
                    {runtimeInfoItems.map((item) => (
                      <div
                        key={item.label}
                        className="min-w-0 rounded-lg bg-background/70 px-3 py-2"
                      >
                        <div className="text-muted-foreground text-xs">{item.label}</div>
                        <div className="mt-1 break-all font-medium text-foreground text-sm">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => void loadRuntimeStatus(selectedProfileId)}
                  disabled={!hasSelectedProfile || runtimeBusy}
                >
                  {busyAction === 'runtime-status' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 shrink-0" />
                  )}
                  <span>{t('Refresh status')}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => void handleInstallRuntime()}
                  disabled={!hasSelectedProfile || runtimeBusy || currentVersionInstalled}
                >
                  {busyAction === 'runtime-install' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 shrink-0" />
                  )}
                  <span>{t('Install')}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => void handleUpdateRuntime()}
                  disabled={!hasSelectedProfile || runtimeBusy || !runtimeInstalled}
                >
                  {busyAction === 'runtime-update' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <RotateCw className="h-4 w-4 shrink-0" />
                  )}
                  <span>{t('Update')}</span>
                </Button>

                <Button
                  type="button"
                  variant="destructive-outline"
                  className="w-full justify-center"
                  onClick={() => setDeleteRuntimeDialogOpen(true)}
                  disabled={!hasSelectedProfile || runtimeBusy || !runtimeInstalled}
                >
                  {busyAction === 'runtime-delete' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 shrink-0" />
                  )}
                  <span>{t('Delete runtime')}</span>
                </Button>
              </div>
            </>
          )}
        </CardPanel>
      </Card>

      {feedback && (
        <Alert variant={feedback.variant}>
          <AlertTitle>{feedback.title}</AlertTitle>
          <AlertDescription>{feedback.description}</AlertDescription>
        </Alert>
      )}

      {testResult?.success && (
        <Alert variant="info">
          <AlertTitle>{t('Remote environment')}</AlertTitle>
          <AlertDescription className="grid gap-3 sm:grid-cols-2">
            {environmentItems.map((item) => (
              <div key={item.label} className="min-w-0 rounded-lg bg-background/70 px-3 py-2">
                <div className="text-muted-foreground text-xs">{item.label}</div>
                <div className="mt-1 break-all font-medium text-foreground text-sm">
                  {item.value}
                </div>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog open={deleteRuntimeDialogOpen} onOpenChange={setDeleteRuntimeDialogOpen}>
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete managed remote runtime?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This will remove all installed managed runtime versions for this SSH profile.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={() => void handleDeleteRuntime()}>
              {t('Delete runtime')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
