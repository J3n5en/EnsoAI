import type { PromptPreset } from '@shared/types';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  FileText,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { PromptEditorDialog } from './PromptEditorDialog';

export function PromptsSection() {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingPreset, setEditingPreset] = React.useState<PromptPreset | null>(null);
  const [currentContent, setCurrentContent] = React.useState<string | null>(null);
  const [saveFromCurrent, setSaveFromCurrent] = React.useState(false);

  const promptPresets = useSettingsStore((s) => s.promptPresets);
  const addPromptPreset = useSettingsStore((s) => s.addPromptPreset);
  const updatePromptPreset = useSettingsStore((s) => s.updatePromptPreset);
  const removePromptPreset = useSettingsStore((s) => s.removePromptPreset);
  const setPromptPresetEnabled = useSettingsStore((s) => s.setPromptPresetEnabled);

  const activePreset = promptPresets.find((p) => p.enabled);

  // 读取当前 CLAUDE.md 内容
  React.useEffect(() => {
    if (expanded) {
      window.electronAPI.claudeConfig.prompts.read().then(setCurrentContent);
    }
  }, [expanded]);

  // 检查当前内容是否未保存
  const hasUnsavedConfig = React.useMemo(() => {
    if (!currentContent) return false;
    if (!activePreset) return true;
    return activePreset.content !== currentContent;
  }, [currentContent, activePreset]);

  const handleAdd = () => {
    setEditingPreset(null);
    setSaveFromCurrent(false);
    setDialogOpen(true);
  };

  const handleSaveFromCurrent = () => {
    setEditingPreset(null);
    setSaveFromCurrent(true);
    setDialogOpen(true);
  };

  const handleEdit = (preset: PromptPreset) => {
    setEditingPreset(preset);
    setSaveFromCurrent(false);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    removePromptPreset(id);
    toastManager.add({ type: 'success', title: t('Prompt preset removed') });
  };

  const handleActivate = async (id: string) => {
    const preset = promptPresets.find((p) => p.id === id);
    if (!preset) return;

    // 写入到 CLAUDE.md
    const success = await window.electronAPI.claudeConfig.prompts.write(preset.content);
    if (success) {
      setPromptPresetEnabled(id);
      setCurrentContent(preset.content);
      toastManager.add({ type: 'success', title: t('Prompt activated') });
    } else {
      toastManager.add({ type: 'error', title: t('Failed to activate prompt') });
    }
  };

  const handleSave = async (preset: PromptPreset) => {
    if (editingPreset) {
      updatePromptPreset(preset.id, preset);
      // 如果是激活的预设，同步到文件
      if (preset.enabled) {
        await window.electronAPI.claudeConfig.prompts.write(preset.content);
        setCurrentContent(preset.content);
      }
    } else {
      // 如果是从当前内容保存，或者是第一个预设，自动激活
      const shouldActivate = saveFromCurrent || promptPresets.length === 0;
      const presetToSave = shouldActivate ? { ...preset, enabled: true } : preset;
      addPromptPreset(presetToSave);
      if (shouldActivate) {
        setPromptPresetEnabled(presetToSave.id);
        setCurrentContent(presetToSave.content);
      }
    }
    setDialogOpen(false);
    setSaveFromCurrent(false);
    toastManager.add({ type: 'success', title: t('Prompt saved') });
  };

  return (
    <div className="border-t pt-4 mt-4">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <FileText className="h-4 w-4" />
          <span className="text-sm font-medium">{t('Prompts')}</span>
          {activePreset && (
            <span className="text-xs text-muted-foreground">({activePreset.name})</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            handleAdd();
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {/* 未保存提示 */}
          {hasUnsavedConfig && (
            <div className="flex items-center justify-between rounded-md border border-dashed border-yellow-500/50 bg-yellow-500/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">
                  {t('Current CLAUDE.md not saved')}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleSaveFromCurrent}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {t('Save')}
              </Button>
            </div>
          )}

          {/* 预设列表 */}
          {promptPresets.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {t('No prompt presets configured')}
            </div>
          ) : (
            promptPresets.map((preset) => (
              <div
                key={preset.id}
                className={cn(
                  'flex items-center justify-between rounded-md px-3 py-2',
                  preset.enabled ? 'bg-accent text-accent-foreground' : 'bg-muted/50 hover:bg-muted'
                )}
              >
                <div
                  className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                  onClick={() => !preset.enabled && handleActivate(preset.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (!preset.enabled && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleActivate(preset.id);
                    }
                  }}
                >
                  {preset.enabled ? (
                    <Check className="h-4 w-4 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{preset.name}</span>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button variant="ghost" size="icon-xs" onClick={() => handleEdit(preset)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(preset.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <PromptEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        preset={editingPreset}
        initialContent={saveFromCurrent ? currentContent : undefined}
        onSave={handleSave}
      />
    </div>
  );
}
