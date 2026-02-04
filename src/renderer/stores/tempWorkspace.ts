import type { TempWorkspaceItem } from '@shared/types';
import { create } from 'zustand';

const TEMP_WORKSPACES_KEY = 'enso-temp-workspaces';

function loadFromStorage(): TempWorkspaceItem[] {
  try {
    const saved = localStorage.getItem(TEMP_WORKSPACES_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as TempWorkspaceItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: TempWorkspaceItem[]): void {
  localStorage.setItem(TEMP_WORKSPACES_KEY, JSON.stringify(items));
}

interface TempWorkspaceState {
  items: TempWorkspaceItem[];
  renameTargetId: string | null;
  deleteTargetId: string | null;
  setItems: (items: TempWorkspaceItem[]) => void;
  addItem: (item: TempWorkspaceItem) => void;
  removeItem: (id: string) => void;
  renameItem: (id: string, title: string) => void;
  openRename: (id: string | null) => void;
  openDelete: (id: string | null) => void;
  rehydrate: () => Promise<void>;
}

export const useTempWorkspaceStore = create<TempWorkspaceState>((set, get) => ({
  items: loadFromStorage(),
  renameTargetId: null,
  deleteTargetId: null,
  setItems: (items) => {
    saveToStorage(items);
    set({ items });
  },
  addItem: (item) => {
    const next = [...get().items, item];
    saveToStorage(next);
    set({ items: next });
  },
  removeItem: (id) => {
    const next = get().items.filter((item) => item.id !== id);
    saveToStorage(next);
    set({ items: next });
  },
  renameItem: (id, title) => {
    const next = get().items.map((item) => (item.id === id ? { ...item, title } : item));
    saveToStorage(next);
    set({ items: next });
  },
  openRename: (id) => set({ renameTargetId: id }),
  openDelete: (id) => set({ deleteTargetId: id }),
  rehydrate: async () => {
    const items = loadFromStorage();
    const filtered: TempWorkspaceItem[] = [];
    for (const item of items) {
      try {
        await window.electronAPI.file.list(item.path);
        filtered.push(item);
      } catch {
        // Skip missing or inaccessible directories
      }
    }
    saveToStorage(filtered);
    set({ items: filtered });
  },
}));
