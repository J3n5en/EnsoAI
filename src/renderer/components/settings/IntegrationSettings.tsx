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
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { ProviderList } from './claude-provider';
import { KeybindingInput } from './KeybindingsSettings';
import { McpSection } from './mcp';
import { PluginsSection } from './plugins';
import { PromptsSection } from './prompts';

interface IntegrationSettingsProps {
  /** Scroll to Claude Provider section on mount */
  scrollToProvider?: boolean;
}

export function IntegrationSettings({ scrollToProvider }: IntegrationSettingsProps) {
  const { t } = useI18n();
  const providerRef = React.useRef<HTMLDivElement>(null);
  const { claudeCodeIntegration, setClaudeCodeIntegration } = useSettingsStore();
  const [bridgePort, setBridgePort] = React.useState<number | null>(null);
  const [showDependencyDialog, setShowDependencyDialog] = React.useState(false);
  const [tmuxError, setTmuxError] = React.useState<string | null>(null);
  const isWindows = window.electronAPI?.env?.platform === 'win32';

  const debounceOptions = React.useMemo(
    () =>
      [100, 200, 300, 500, 1000].map((value) => ({
        value,
        label: `${value}ms`,
      })),
    []
  );

  // Fetch bridge status on mount and when enabled changes
  React.useEffect(() => {
    if (claudeCodeIntegration.enabled) {
      window.electronAPI.mcp.getStatus().then((status) => {
        setBridgePort(status.port);
      });
    } else {
      setBridgePort(null);
    }
  }, [claudeCodeIntegration.enabled]);

  // Scroll to provider section when requested
  React.useEffect(() => {
    if (scrollToProvider && providerRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        providerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scrollToProvider]);

  const handleEnabledChange = (checked: boolean) => {
    // Just update the settings - App.tsx useEffect will handle the bridge
    setClaudeCodeIntegration({ enabled: checked });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Claude Code Integration')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Connect to Claude Code CLI for enhanced IDE features')}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">{t('Enable Integration')}</span>
          <p className="text-xs text-muted-foreground">
            {t('Start WebSocket server for Claude Code connection')}
            {bridgePort && ` (Port: ${bridgePort})`}
          </p>
        </div>
        <Switch checked={claudeCodeIntegration.enabled} onCheckedChange={handleEnabledChange} />
      </div>

      {claudeCodeIntegration.enabled && (
        <div className="mt-4 space-y-4 border-t pt-4">
          {/* Selection Changed Debounce */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-4">
            <span className="text-sm font-medium">{t('Debounce Time')}</span>
            <div className="space-y-1.5">
              <Select
                value={String(claudeCodeIntegration.selectionChangedDebounce)}
                onValueChange={(v) =>
                  setClaudeCodeIntegration({ selectionChangedDebounce: Number(v) })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue>{claudeCodeIntegration.selectionChangedDebounce}ms</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {debounceOptions.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('Delay before sending selection changes to Claude Code')}
              </p>
            </div>
          </div>

          {/* At Mentioned Keybinding */}
          <div className="grid grid-cols-[140px_1fr] items-start gap-4">
            <span className="text-sm font-medium mt-2">{t('Mention Shortcut')}</span>
            <div className="space-y-1.5">
              <KeybindingInput
                value={claudeCodeIntegration.atMentionedKeybinding}
                onChange={(binding) => setClaudeCodeIntegration({ atMentionedKeybinding: binding })}
              />
              <p className="text-xs text-muted-foreground">
                {t('Send selected code range to Claude Code')}
              </p>
            </div>
          </div>

          {/* Stop Hook (Enhanced Notification) */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{t('Enhanced Notification')}</span>
              <p className="text-xs text-muted-foreground">
                {t('Use Claude Stop hook for precise agent completion notifications')}
              </p>
            </div>
            <Switch
              checked={claudeCodeIntegration.stopHookEnabled}
              onCheckedChange={(checked) => {
                if (
                  !checked &&
                  claudeCodeIntegration.enhancedInputAutoPopup === 'hideWhileRunning'
                ) {
                  // Show dependency dialog when disabling and hideWhileRunning is selected
                  setShowDependencyDialog(true);
                } else {
                  setClaudeCodeIntegration({ stopHookEnabled: checked });
                }
              }}
            />
          </div>

          {/* Dependency Dialog */}
          <AlertDialog open={showDependencyDialog}>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('Feature Dependency')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    '"Hide While Running" mode requires "Enhanced Notification". Display mode will be switched to "Always Show".'
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose
                  render={(props) => (
                    <Button
                      {...props}
                      onClick={() => {
                        setClaudeCodeIntegration({
                          stopHookEnabled: false,
                          enhancedInputAutoPopup: 'always',
                        });
                        setShowDependencyDialog(false);
                      }}
                    >
                      {t('Confirm')}
                    </Button>
                  )}
                />
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>

          {/* Ask User Question Notification */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{t('Ask User Question Notification')}</span>
              <p className="text-xs text-muted-foreground">
                {t('Notify when Claude asks a question (requires PermissionRequest hook)')}
              </p>
            </div>
            <Switch
              checked={claudeCodeIntegration.permissionRequestHookEnabled}
              onCheckedChange={(checked) =>
                setClaudeCodeIntegration({ permissionRequestHookEnabled: checked })
              }
            />
          </div>

          {/* Enhanced Input */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{t('Enhanced Input')}</span>
              <p className="text-xs text-muted-foreground">
                {t('Enable enhanced input panel with multi-line editing and image support')}
              </p>
            </div>
            <Switch
              checked={claudeCodeIntegration.enhancedInputEnabled ?? true}
              onCheckedChange={(checked) =>
                setClaudeCodeIntegration({ enhancedInputEnabled: checked })
              }
            />
          </div>

          {claudeCodeIntegration.enhancedInputEnabled && (
            <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
              <span className="text-xs font-medium text-muted-foreground">{t('Display Mode')}</span>
              <div className="space-y-1">
                <label className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50 cursor-pointer">
                  <input
                    type="radio"
                    name="enhancedInputAutoPopup"
                    checked={claudeCodeIntegration.enhancedInputAutoPopup === 'manual'}
                    onChange={() => setClaudeCodeIntegration({ enhancedInputAutoPopup: 'manual' })}
                    className="h-4 w-4 mt-0.5 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium">{t('Manual')}</span>
                    <p className="text-xs text-muted-foreground">
                      {t('Only open via Ctrl+G shortcut, Esc to close')}
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50 cursor-pointer">
                  <input
                    type="radio"
                    name="enhancedInputAutoPopup"
                    checked={claudeCodeIntegration.enhancedInputAutoPopup === 'always'}
                    onChange={() => setClaudeCodeIntegration({ enhancedInputAutoPopup: 'always' })}
                    className="h-4 w-4 mt-0.5 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium">{t('Always Show')}</span>
                    <p className="text-xs text-muted-foreground">
                      {t('Panel stays visible, remains open after sending')}
                    </p>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-2 rounded-md p-2 ${!claudeCodeIntegration.stopHookEnabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="enhancedInputAutoPopup"
                    checked={
                      (claudeCodeIntegration.enhancedInputAutoPopup ?? 'hideWhileRunning') ===
                      'hideWhileRunning'
                    }
                    onChange={() =>
                      setClaudeCodeIntegration({ enhancedInputAutoPopup: 'hideWhileRunning' })
                    }
                    disabled={!claudeCodeIntegration.stopHookEnabled}
                    className="h-4 w-4 mt-0.5 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium">{t('Hide While Running')}</span>
                    <p className="text-xs text-muted-foreground">
                      {t('Auto-hide when agent is running, show when idle (requires Stop Hook)')}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Status Line */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{t('Status Line')}</span>
              <p className="text-xs text-muted-foreground">
                {t('Show agent status (model, context, cost) at bottom of terminal')}
              </p>
            </div>
            <Switch
              checked={claudeCodeIntegration.statusLineEnabled}
              onCheckedChange={(checked) =>
                setClaudeCodeIntegration({ statusLineEnabled: checked })
              }
            />
          </div>

          {/* Status Line Fields */}
          {claudeCodeIntegration.statusLineEnabled && (
            <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
              <span className="text-xs font-medium text-muted-foreground">
                {t('Display Fields')}
              </span>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.model ?? true}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          model: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Model')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.context ?? true}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          context: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Context')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.cost ?? true}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          cost: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Cost')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.duration ?? false}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          duration: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Duration')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.lines ?? false}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          lines: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Lines Changed')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.tokens ?? false}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          tokens: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Tokens')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.cache ?? false}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          cache: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Cache')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.apiTime ?? false}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          apiTime: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('API Time')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.currentDir ?? false}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          currentDir: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Current Dir')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.projectDir ?? false}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          projectDir: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Project Dir')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={claudeCodeIntegration.statusLineFields?.version ?? false}
                    onChange={(e) =>
                      setClaudeCodeIntegration({
                        statusLineFields: {
                          ...claudeCodeIntegration.statusLineFields,
                          version: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  {t('Version')}
                </label>
              </div>
            </div>
          )}

          {/* Tmux Session (non-Windows only) */}
          {!isWindows && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{t('Tmux Session')}</span>
                  <p className="text-xs text-muted-foreground">
                    {t('Wrap Claude agent in tmux for session persistence and recovery')}
                  </p>
                </div>
                <Switch
                  checked={claudeCodeIntegration.tmuxEnabled}
                  onCheckedChange={async (checked) => {
                    if (checked) {
                      setTmuxError(null);
                      const result = await window.electronAPI.tmux.check(true);
                      if (!result.installed) {
                        setTmuxError(t('tmux is not installed. Please install tmux first.'));
                        return;
                      }
                    }
                    setTmuxError(null);
                    setClaudeCodeIntegration({ tmuxEnabled: checked });
                  }}
                />
              </div>
              {tmuxError && <p className="text-xs text-destructive">{tmuxError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4 border-t pt-4">
        {/* Provider Switcher in SessionBar */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Provider Switcher')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Show provider switcher in SessionBar for quick switching')}
            </p>
          </div>
          <Switch
            checked={claudeCodeIntegration.showProviderSwitcher ?? true}
            onCheckedChange={(checked) =>
              setClaudeCodeIntegration({ showProviderSwitcher: checked })
            }
          />
        </div>

        {/* Provider Disable Feature */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Provider Disable Feature')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Allow temporarily disabling individual providers')}
            </p>
          </div>
          <Switch
            checked={claudeCodeIntegration.enableProviderDisableFeature ?? true}
            onCheckedChange={(checked) =>
              setClaudeCodeIntegration({ enableProviderDisableFeature: checked })
            }
          />
        </div>

        {/* Claude Provider */}
        <div ref={providerRef}>
          <div className="mb-3">
            <span className="text-sm font-medium">{t('Claude Provider')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Manage Claude API provider configurations')}
            </p>
          </div>
          <ProviderList />
        </div>
      </div>

      {/* MCP Servers */}
      <McpSection />

      {/* Plugins */}
      <PluginsSection />

      {/* Prompts */}
      <PromptsSection />
    </div>
  );
}
