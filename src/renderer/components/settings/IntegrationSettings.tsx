import * as React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { defaultBranchNameGeneratorSettings, useSettingsStore } from '@/stores/settings';
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
  const {
    claudeCodeIntegration,
    setClaudeCodeIntegration,
    commitMessageGenerator,
    setCommitMessageGenerator,
    codeReview,
    setCodeReview,
    branchNameGenerator,
    setBranchNameGenerator,
  } = useSettingsStore();
  const [bridgePort, setBridgePort] = React.useState<number | null>(null);

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
              onCheckedChange={(checked) => setClaudeCodeIntegration({ stopHookEnabled: checked })}
            />
          </div>

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

          {/* Claude Provider */}
          <div ref={providerRef} className="mt-4 border-t pt-4">
            <div className="mb-3">
              <span className="text-sm font-medium">{t('Claude Provider')}</span>
              <p className="text-xs text-muted-foreground">
                {t('Manage Claude API provider configurations')}
              </p>
            </div>
            <ProviderList />
          </div>

          {/* MCP Servers */}
          <McpSection />

          {/* Plugins */}
          <PluginsSection />

          {/* Prompts */}
          <PromptsSection />
        </div>
      )}

      {/* Commit Message Generator Section */}
      <div className="mt-6 border-t pt-6">
        <div>
          <h3 className="text-lg font-medium">{t('Commit Message Generator')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('Auto-generate commit messages using Claude')}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Enable Generator')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Generate commit messages with AI assistance')}
            </p>
          </div>
          <Switch
            checked={commitMessageGenerator.enabled}
            onCheckedChange={(checked) => setCommitMessageGenerator({ enabled: checked })}
          />
        </div>

        {commitMessageGenerator.enabled && (
          <div className="mt-4 space-y-4 border-t pt-4">
            {/* Max Diff Lines */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Max Diff Lines')}</span>
              <div className="space-y-1.5">
                <Input
                  type="number"
                  value={commitMessageGenerator.maxDiffLines}
                  onChange={(e) =>
                    setCommitMessageGenerator({ maxDiffLines: Number(e.target.value) || 1000 })
                  }
                  min={100}
                  max={10000}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  {t('Maximum number of diff lines to include')}
                </p>
              </div>
            </div>

            {/* Timeout */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Timeout')}</span>
              <div className="space-y-1.5">
                <Select
                  value={String(commitMessageGenerator.timeout)}
                  onValueChange={(v) => setCommitMessageGenerator({ timeout: Number(v) })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue>{commitMessageGenerator.timeout}s</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {[30, 60, 120, 180].map((sec) => (
                      <SelectItem key={sec} value={String(sec)}>
                        {sec}s
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">{t('Timeout in seconds')}</p>
              </div>
            </div>

            {/* Model */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Model')}</span>
              <div className="space-y-1.5">
                <Select
                  value={commitMessageGenerator.model ?? 'haiku'}
                  onValueChange={(v) =>
                    setCommitMessageGenerator({
                      model: v as 'default' | 'opus' | 'sonnet' | 'haiku',
                    })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue>
                      {(commitMessageGenerator.model ?? 'haiku') === 'default'
                        ? t('Default')
                        : (commitMessageGenerator.model ?? 'haiku').charAt(0).toUpperCase() +
                          (commitMessageGenerator.model ?? 'haiku').slice(1)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="haiku">Haiku</SelectItem>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                    <SelectItem value="opus">Opus</SelectItem>
                    <SelectItem value="default">{t('Default')}</SelectItem>
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('Claude model for generating commit messages')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Code Review Section */}
      <div className="mt-6 border-t pt-6">
        <div>
          <h3 className="text-lg font-medium">{t('Code Review')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('AI-powered code review for staged changes')}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Enable Code Review')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Show code review button in source control')}
            </p>
          </div>
          <Switch
            checked={codeReview.enabled}
            onCheckedChange={(checked) => setCodeReview({ enabled: checked })}
          />
        </div>

        {codeReview.enabled && (
          <div className="mt-4 space-y-4 border-t pt-4">
            {/* Model */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Model')}</span>
              <div className="space-y-1.5">
                <Select
                  value={codeReview.model}
                  onValueChange={(v) => setCodeReview({ model: v as 'opus' | 'sonnet' | 'haiku' })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue>
                      {codeReview.model.charAt(0).toUpperCase() + codeReview.model.slice(1)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="haiku">Haiku</SelectItem>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                    <SelectItem value="opus">Opus</SelectItem>
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">{t('Claude model for code review')}</p>
              </div>
            </div>

            {/* Language */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Language')}</span>
              <div className="space-y-1.5">
                <Input
                  value={codeReview.language ?? '中文'}
                  onChange={(e) => setCodeReview({ language: e.target.value })}
                  placeholder="中文"
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  {t('Language for code review output')}
                </p>
              </div>
            </div>

            {/* Continue Conversation */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('Continue Conversation')}</span>
                <p className="text-xs text-muted-foreground">
                  {t('Preserve session for follow-up conversations after review')}
                </p>
              </div>
              <Switch
                checked={codeReview.continueConversation ?? true}
                onCheckedChange={(checked) => setCodeReview({ continueConversation: checked })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 border-t pt-6">
        <div>
          <h3 className="text-lg font-medium">{t('Branch Name Generator')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('Auto-generate branch names using Claude')}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('Enable Generator')}</span>
            <p className="text-xs text-muted-foreground">
              {t('Generate branch names with AI assistance')}
            </p>
          </div>
          <Switch
            checked={branchNameGenerator.enabled}
            onCheckedChange={(checked) => setBranchNameGenerator({ enabled: checked })}
          />
        </div>

        {branchNameGenerator.enabled && (
          <div className="mt-4 space-y-4 border-t pt-4">
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Model')}</span>
              <div className="space-y-1.5">
                <Select
                  value={branchNameGenerator.model ?? 'haiku'}
                  onValueChange={(v) =>
                    setBranchNameGenerator({
                      model: v as 'default' | 'opus' | 'sonnet' | 'haiku',
                    })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue>
                      {(branchNameGenerator.model ?? 'haiku') === 'default'
                        ? t('Default')
                        : (branchNameGenerator.model ?? 'haiku').charAt(0).toUpperCase() +
                          (branchNameGenerator.model ?? 'haiku').slice(1)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="haiku">Haiku</SelectItem>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                    <SelectItem value="opus">Opus</SelectItem>
                    <SelectItem value="default">{t('Default')}</SelectItem>
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('Claude model for generating branch names')}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t('Prompt')}</span>
              <div className="space-y-1.5">
                <textarea
                  value={branchNameGenerator.prompt}
                  onChange={(e) => setBranchNameGenerator({ prompt: e.target.value })}
                  className="w-full h-40 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={t(
                    'Enter a prompt template, and the AI will generate branch names according to your rules.\nAvailable variables:\n• {description} - Feature description\n• {current_date} - Current date\n• {current_time} - Current time'
                  )}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t('Customize the AI prompt for generating branch names')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            'This will restore the default AI prompt for generating branch names. Your custom prompt will be lost.'
                          )
                        )
                      ) {
                        setBranchNameGenerator({
                          prompt: defaultBranchNameGeneratorSettings.prompt,
                        });
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-primary underline"
                  >
                    {t('Restore default prompt')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
