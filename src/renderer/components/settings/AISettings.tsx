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
import {
  type AIProvider,
  defaultBranchNameGeneratorSettings,
  defaultCommitPromptEn,
  defaultCommitPromptZh,
  type ReasoningEffort,
  useSettingsStore,
} from '@/stores/settings';

// Provider options
const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex-cli', label: 'Codex CLI' },
  { value: 'cursor-cli', label: 'Cursor CLI' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
];

// Model options per provider
const MODELS_BY_PROVIDER: Record<AIProvider, { value: string; label: string }[]> = {
  'claude-code': [
    { value: 'haiku', label: 'Haiku' },
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'opus', label: 'Opus' },
  ],
  'codex-cli': [
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  ],
  'cursor-cli': [
    { value: 'auto', label: 'Auto' },
    { value: 'composer-1', label: 'Composer 1' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'opus-4.6', label: 'Opus 4.6' },
  ],
  'gemini-cli': [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  ],
};

// Reasoning effort options for Codex CLI
const REASONING_EFFORTS: { value: string; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'xHigh' },
];

// Get default model for provider
function getDefaultModel(provider: AIProvider): string {
  const models = MODELS_BY_PROVIDER[provider];
  return models[0]?.value ?? 'haiku';
}

export function AISettings() {
  const { t, locale } = useI18n();
  const {
    commitMessageGenerator,
    setCommitMessageGenerator,
    codeReview,
    setCodeReview,
    branchNameGenerator,
    setBranchNameGenerator,
  } = useSettingsStore();

  // Handle provider change with model reset
  const handleCommitProviderChange = (provider: AIProvider) => {
    setCommitMessageGenerator({
      provider,
      model: getDefaultModel(provider),
    });
  };

  const handleCodeReviewProviderChange = (provider: AIProvider) => {
    setCodeReview({
      provider,
      model: getDefaultModel(provider),
    });
  };

  const handleBranchProviderChange = (provider: AIProvider) => {
    setBranchNameGenerator({
      provider,
      model: getDefaultModel(provider),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('AI Features')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Configure AI-powered features for code generation and review')}
        </p>
      </div>

      {/* Commit Message Generator Section */}
      <div className="border-t pt-6">
        <div>
          <h4 className="text-base font-medium">{t('Commit Message Generator')}</h4>
          <p className="text-sm text-muted-foreground">
            {t('Auto-generate commit messages using AI')}
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
            {/* Provider */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Provider')}</span>
              <div className="space-y-1.5">
                <Select
                  value={commitMessageGenerator.provider ?? 'claude-code'}
                  onValueChange={(v) => handleCommitProviderChange(v as AIProvider)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {PROVIDERS.find((p) => p.value === commitMessageGenerator.provider)?.label ??
                        'Claude Code'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">{t('AI provider to use')}</p>
              </div>
            </div>

            {/* Model */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Model')}</span>
              <div className="space-y-1.5">
                <Select
                  value={commitMessageGenerator.model}
                  onValueChange={(v) => v && setCommitMessageGenerator({ model: v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {MODELS_BY_PROVIDER[commitMessageGenerator.provider ?? 'claude-code']?.find(
                        (m) => m.value === commitMessageGenerator.model
                      )?.label ?? commitMessageGenerator.model}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {MODELS_BY_PROVIDER[commitMessageGenerator.provider ?? 'claude-code']?.map(
                      (m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      )
                    )}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('Model for generating commit messages')}
                </p>
              </div>
            </div>

            {/* Reasoning Level - Only for Codex CLI */}
            {commitMessageGenerator.provider === 'codex-cli' && (
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <span className="text-sm font-medium">{t('Reasoning Level')}</span>
                <div className="space-y-1.5">
                  <Select
                    value={commitMessageGenerator.reasoningEffort ?? 'medium'}
                    onValueChange={(v) =>
                      v && setCommitMessageGenerator({ reasoningEffort: v as ReasoningEffort })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue>
                        {REASONING_EFFORTS.find(
                          (r) => r.value === (commitMessageGenerator.reasoningEffort ?? 'medium')
                        )?.label ?? 'Medium'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      {REASONING_EFFORTS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('Reasoning depth for Codex CLI')}
                  </p>
                </div>
              </div>
            )}

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

            {/* Commit Prompt */}
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t('Commit Prompt')}</span>
              <div className="space-y-1.5">
                <textarea
                  value={commitMessageGenerator.prompt}
                  onChange={(e) => setCommitMessageGenerator({ prompt: e.target.value })}
                  maxLength={4000}
                  className="w-full h-40 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={t(
                    'Enter a prompt template for generating commit messages.\nAvailable variables:\n• {recent_commits} - Recent commit messages\n• {staged_stat} - Staged changes statistics\n• {staged_diff} - Staged changes diff'
                  )}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t('Customize the AI prompt for generating commit messages')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            'This will restore the default AI prompt for generating commit messages. Your custom prompt will be lost.'
                          )
                        )
                      ) {
                        setCommitMessageGenerator({
                          prompt: locale === 'zh' ? defaultCommitPromptZh : defaultCommitPromptEn,
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

      {/* Code Review Section */}
      <div className="border-t pt-6">
        <div>
          <h4 className="text-base font-medium">{t('Code Review')}</h4>
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
            {/* Provider */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Provider')}</span>
              <div className="space-y-1.5">
                <Select
                  value={codeReview.provider ?? 'claude-code'}
                  onValueChange={(v) => handleCodeReviewProviderChange(v as AIProvider)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {PROVIDERS.find((p) => p.value === codeReview.provider)?.label ??
                        'Claude Code'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">{t('AI provider to use')}</p>
                {codeReview.provider === 'codex-cli' && (
                  <p className="text-xs text-amber-500">
                    {t('Codex does not support streaming output')}
                  </p>
                )}
              </div>
            </div>

            {/* Model */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Model')}</span>
              <div className="space-y-1.5">
                <Select
                  value={codeReview.model}
                  onValueChange={(v) => v && setCodeReview({ model: v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {MODELS_BY_PROVIDER[codeReview.provider ?? 'claude-code']?.find(
                        (m) => m.value === codeReview.model
                      )?.label ?? codeReview.model}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {MODELS_BY_PROVIDER[codeReview.provider ?? 'claude-code']?.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">{t('Model for code review')}</p>
              </div>
            </div>

            {/* Reasoning Level - Only for Codex CLI */}
            {codeReview.provider === 'codex-cli' && (
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <span className="text-sm font-medium">{t('Reasoning Level')}</span>
                <div className="space-y-1.5">
                  <Select
                    value={codeReview.reasoningEffort ?? 'medium'}
                    onValueChange={(v) =>
                      v && setCodeReview({ reasoningEffort: v as ReasoningEffort })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue>
                        {REASONING_EFFORTS.find(
                          (r) => r.value === (codeReview.reasoningEffort ?? 'medium')
                        )?.label ?? 'Medium'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      {REASONING_EFFORTS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('Reasoning depth for Codex CLI')}
                  </p>
                </div>
              </div>
            )}

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
          </div>
        )}
      </div>

      {/* Branch Name Generator Section */}
      <div className="border-t pt-6">
        <div>
          <h4 className="text-base font-medium">{t('Branch Name Generator')}</h4>
          <p className="text-sm text-muted-foreground">
            {t('Auto-generate branch names using AI')}
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
            {/* Provider */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Provider')}</span>
              <div className="space-y-1.5">
                <Select
                  value={branchNameGenerator.provider ?? 'claude-code'}
                  onValueChange={(v) => handleBranchProviderChange(v as AIProvider)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {PROVIDERS.find((p) => p.value === branchNameGenerator.provider)?.label ??
                        'Claude Code'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">{t('AI provider to use')}</p>
              </div>
            </div>

            {/* Model */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Model')}</span>
              <div className="space-y-1.5">
                <Select
                  value={branchNameGenerator.model}
                  onValueChange={(v) => v && setBranchNameGenerator({ model: v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {MODELS_BY_PROVIDER[branchNameGenerator.provider ?? 'claude-code']?.find(
                        (m) => m.value === branchNameGenerator.model
                      )?.label ?? branchNameGenerator.model}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {MODELS_BY_PROVIDER[branchNameGenerator.provider ?? 'claude-code']?.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('Model for generating branch names')}
                </p>
              </div>
            </div>

            {/* Reasoning Level - Only for Codex CLI */}
            {branchNameGenerator.provider === 'codex-cli' && (
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <span className="text-sm font-medium">{t('Reasoning Level')}</span>
                <div className="space-y-1.5">
                  <Select
                    value={branchNameGenerator.reasoningEffort ?? 'medium'}
                    onValueChange={(v) =>
                      v && setBranchNameGenerator({ reasoningEffort: v as ReasoningEffort })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue>
                        {REASONING_EFFORTS.find(
                          (r) => r.value === (branchNameGenerator.reasoningEffort ?? 'medium')
                        )?.label ?? 'Medium'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      {REASONING_EFFORTS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('Reasoning depth for Codex CLI')}
                  </p>
                </div>
              </div>
            )}

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
