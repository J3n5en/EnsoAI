import { Keyboard, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { codeToKey } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { type TerminalKeybinding, useSettingsStore } from '@/stores/settings';

export function KeybindingInput({
  value,
  onChange,
}: {
  value: TerminalKeybinding;
  onChange: (binding: TerminalKeybinding) => void;
}) {
  const { t } = useI18n();
  const [isRecording, setIsRecording] = React.useState(false);

  const formatKeybinding = (binding: TerminalKeybinding): string => {
    const parts: string[] = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    if (binding.meta) parts.push('Cmd');
    parts.push(binding.key.toUpperCase());
    return parts.join(' + ');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    const key = codeToKey(e.code) || e.key.toLowerCase();

    const newBinding: TerminalKeybinding = {
      key,
    };

    if (e.ctrlKey && !e.metaKey) newBinding.ctrl = true;
    if (e.altKey) newBinding.alt = true;
    if (e.shiftKey) newBinding.shift = true;
    if (e.metaKey) newBinding.meta = true;

    onChange(newBinding);
    setIsRecording(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          isRecording && 'ring-2 ring-ring ring-offset-2'
        )}
        onClick={() => setIsRecording(true)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        data-keybinding-recording={isRecording ? '' : undefined}
      >
        {isRecording ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Keyboard className="h-4 w-4" />
            {t('Press a shortcut...')}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            {formatKeybinding(value)}
          </span>
        )}
      </div>
      {isRecording && (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            setIsRecording(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function KeybindingsSettings() {
  const {
    xtermKeybindings,
    setXtermKeybindings,
    mainTabKeybindings,
    setMainTabKeybindings,
    sourceControlKeybindings,
    setSourceControlKeybindings,
    searchKeybindings,
    setSearchKeybindings,
    globalKeybindings,
    setGlobalKeybindings,
  } = useSettingsStore();
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      {/* Global */}
      <div>
        <h3 className="text-lg font-medium">{t('Global')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('App-wide shortcuts')}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[140px_1fr] items-center gap-4">
            <span className="text-sm">{t('Running Projects')}</span>
            <KeybindingInput
              value={globalKeybindings.runningProjects}
              onChange={(binding) => {
                setGlobalKeybindings({
                  ...globalKeybindings,
                  runningProjects: binding,
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Tab Switching */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Main tab switching')}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t('Set global main tab shortcuts (Cmd on macOS, Win on Windows)')}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Switch to Agent')}</span>
            <KeybindingInput
              value={mainTabKeybindings.switchToAgent}
              onChange={(binding) => {
                setMainTabKeybindings({
                  ...mainTabKeybindings,
                  switchToAgent: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Switch to File')}</span>
            <KeybindingInput
              value={mainTabKeybindings.switchToFile}
              onChange={(binding) => {
                setMainTabKeybindings({
                  ...mainTabKeybindings,
                  switchToFile: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Switch to Terminal')}</span>
            <KeybindingInput
              value={mainTabKeybindings.switchToTerminal}
              onChange={(binding) => {
                setMainTabKeybindings({
                  ...mainTabKeybindings,
                  switchToTerminal: binding,
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Search')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('File search shortcuts')}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Search files')}</span>
            <KeybindingInput
              value={searchKeybindings.searchFiles}
              onChange={(binding) => {
                setSearchKeybindings({
                  ...searchKeybindings,
                  searchFiles: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Search content')}</span>
            <KeybindingInput
              value={searchKeybindings.searchContent}
              onChange={(binding) => {
                setSearchKeybindings({
                  ...searchKeybindings,
                  searchContent: binding,
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* Terminal (unified xterm keybindings) */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Terminal')}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t('Shortcuts for terminal and agent sessions')}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('New Tab')}</span>
            <KeybindingInput
              value={xtermKeybindings.newTab}
              onChange={(binding) => {
                setXtermKeybindings({ ...xtermKeybindings, newTab: binding });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Close Tab')}</span>
            <KeybindingInput
              value={xtermKeybindings.closeTab}
              onChange={(binding) => {
                setXtermKeybindings({ ...xtermKeybindings, closeTab: binding });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Next Tab')}</span>
            <KeybindingInput
              value={xtermKeybindings.nextTab}
              onChange={(binding) => {
                setXtermKeybindings({ ...xtermKeybindings, nextTab: binding });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Previous Tab')}</span>
            <KeybindingInput
              value={xtermKeybindings.prevTab}
              onChange={(binding) => {
                setXtermKeybindings({ ...xtermKeybindings, prevTab: binding });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Split pane')}</span>
            <KeybindingInput
              value={xtermKeybindings.split}
              onChange={(binding) => {
                setXtermKeybindings({ ...xtermKeybindings, split: binding });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Merge pane')}</span>
            <KeybindingInput
              value={xtermKeybindings.merge}
              onChange={(binding) => {
                setXtermKeybindings({ ...xtermKeybindings, merge: binding });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Clear terminal')}</span>
            <KeybindingInput
              value={xtermKeybindings.clear}
              onChange={(binding) => {
                setXtermKeybindings({ ...xtermKeybindings, clear: binding });
              }}
            />
          </div>
        </div>
      </div>

      {/* Version Control */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Version Control')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('Diff navigation shortcuts')}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Previous change')}</span>
            <KeybindingInput
              value={sourceControlKeybindings.prevDiff}
              onChange={(binding) => {
                setSourceControlKeybindings({
                  ...sourceControlKeybindings,
                  prevDiff: binding,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] items-center gap-4">
            <span className="text-sm">{t('Next change')}</span>
            <KeybindingInput
              value={sourceControlKeybindings.nextDiff}
              onChange={(binding) => {
                setSourceControlKeybindings({
                  ...sourceControlKeybindings,
                  nextDiff: binding,
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
