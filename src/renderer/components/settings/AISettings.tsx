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

export function AISettings() {
  const { t } = useI18n();
  const {
    commitMessageGenerator,
    setCommitMessageGenerator,
    codeReview,
    setCodeReview,
    branchNameGenerator,
    setBranchNameGenerator,
  } = useSettingsStore();

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
          </div>
        )}
      </div>

      {/* Branch Name Generator Section */}
      <div className="border-t pt-6">
        <div>
          <h4 className="text-base font-medium">{t('Branch Name Generator')}</h4>
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
