import type { PromptPreset } from '@shared/types';
import * as React from 'react';
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';

interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: PromptPreset | null;
  initialContent?: string | null;
  onSave: (preset: PromptPreset) => void;
}

export function PromptEditorDialog({
  open,
  onOpenChange,
  preset,
  initialContent,
  onSave,
}: PromptEditorDialogProps) {
  const { t } = useI18n();
  const isEditing = !!preset;

  const [name, setName] = React.useState('');
  const [content, setContent] = React.useState('');

  React.useEffect(() => {
    if (open) {
      if (preset) {
        setName(preset.name);
        setContent(preset.content);
      } else if (initialContent) {
        setName('');
        setContent(initialContent);
      } else {
        setName('');
        setContent('');
      }
    }
  }, [open, preset, initialContent]);

  const handleSubmit = () => {
    if (!name.trim()) return;

    const now = Date.now();
    const newPreset: PromptPreset = preset
      ? { ...preset, name: name.trim(), content, updatedAt: now }
      : {
          id: `prompt-${now}`,
          name: name.trim(),
          content,
          enabled: false,
          createdAt: now,
          updatedAt: now,
        };

    onSave(newPreset);
  };

  const isValid = name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl" zIndexLevel="nested">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('Edit Prompt') : t('Add Prompt')}</DialogTitle>
          <DialogDescription>{t('Create or edit a prompt preset for CLAUDE.md')}</DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <Field>
            <FieldLabel>{t('Name')} *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Default Prompt')}
            />
          </Field>

          <Field>
            <FieldLabel>{t('Content')}</FieldLabel>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-64 rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="# CLAUDE.md&#10;&#10;Your instructions here..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('This content will be written to ~/.claude/CLAUDE.md')}
            </p>
          </Field>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button onClick={handleSubmit} disabled={!isValid}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
