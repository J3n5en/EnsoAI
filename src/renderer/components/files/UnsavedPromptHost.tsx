import { resolveUnsavedChoice, useUnsavedPromptStore } from '@/stores/unsavedPrompt';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

export function UnsavedPromptHost() {
  const { open, fileName } = useUnsavedPromptStore();
  return <UnsavedChangesDialog open={open} fileName={fileName} onChoice={resolveUnsavedChoice} />;
}
