import { create } from 'zustand';
import type { UnsavedChangesChoice } from '@/components/files/UnsavedChangesDialog';

interface UnsavedPromptState {
  open: boolean;
  fileName: string;
}

let resolver: ((choice: UnsavedChangesChoice) => void) | null = null;

export const useUnsavedPromptStore = create<UnsavedPromptState>(() => ({
  open: false,
  fileName: '',
}));

export function requestUnsavedChoice(fileName: string): Promise<UnsavedChangesChoice> {
  useUnsavedPromptStore.setState({ open: true, fileName });
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export function resolveUnsavedChoice(choice: UnsavedChangesChoice): void {
  const current = resolver;
  resolver = null;
  useUnsavedPromptStore.setState({ open: false, fileName: '' });
  current?.(choice);
}
