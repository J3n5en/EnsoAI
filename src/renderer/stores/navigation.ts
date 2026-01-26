import { create } from 'zustand';

export interface FileNavigationRequest {
  path: string;
  line?: number;
  column?: number;
  previewMode?: 'off' | 'split' | 'fullscreen';
}

interface NavigationState {
  // Pending navigation request
  pendingNavigation: FileNavigationRequest | null;

  // Request navigation to a file (optionally with line/column)
  navigateToFile: (request: FileNavigationRequest) => void;

  // Clear pending navigation (called after handling)
  clearNavigation: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  pendingNavigation: null,

  navigateToFile: (request) => set({ pendingNavigation: request }),

  clearNavigation: () => set({ pendingNavigation: null }),
}));
