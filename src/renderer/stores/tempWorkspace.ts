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

let rehydratePromise: Promise<void> | null = null;

function getErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: string }).code || '');
  }
  return null;
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
    if (rehydratePromise) {
      try {
        await rehydratePromise;
      } catch (err) {
        console.error('Temp Session rehydrate failed', err);
      }
      return;
    }
    rehydratePromise = (async () => {
      const items = loadFromStorage();
      const results = await Promise.allSettled(
        items.map((item) => window.electronAPI.file.list(item.path))
      );
      const filtered = items.filter((_item, index) => {
        const result = results[index];
        if (result.status === 'fulfilled') return true;
        const code = getErrorCode(result.reason);
        return code !== 'ENOENT' && code !== 'ENOTDIR';
      });
      saveToStorage(filtered);
      set({ items: filtered });
    })();
    try {
      await rehydratePromise;
    } catch (err) {
      console.error('Temp Session rehydrate failed', err);
    } finally {
      rehydratePromise = null;
    }
  },
}));
