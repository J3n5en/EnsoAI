import type { BuiltinAgentId, CustomAgent } from '@shared/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  applyTerminalThemeToApp,
  clearTerminalThemeFromApp,
  isTerminalThemeDark,
} from '@/lib/ghosttyTheme';

// Custom storage using Electron IPC to persist settings to JSON file
const electronStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const data = await window.electronAPI.settings.read();
    if (data && typeof data === 'object' && name in data) {
      return JSON.stringify((data as Record<string, unknown>)[name]);
    }
    return null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const existingData = (await window.electronAPI.settings.read()) || {};
    const newData = {
      ...(typeof existingData === 'object' ? existingData : {}),
      [name]: JSON.parse(value),
    };
    await window.electronAPI.settings.write(newData);
  },
  removeItem: async (name: string): Promise<void> => {
    const existingData = (await window.electronAPI.settings.read()) || {};
    if (typeof existingData === 'object' && existingData !== null) {
      const newData = { ...existingData } as Record<string, unknown>;
      delete newData[name];
      await window.electronAPI.settings.write(newData);
    }
  },
};

// Apply terminal font settings to app CSS variables
function applyTerminalFont(fontFamily: string, fontSize: number) {
  const root = document.documentElement;
  root.style.setProperty('--font-family-mono', fontFamily);
  root.style.setProperty('--font-size-base', `${fontSize}px`);
}

export type Theme = 'light' | 'dark' | 'system' | 'sync-terminal';

// Apply app theme (dark/light mode)
function applyAppTheme(theme: Theme, terminalTheme: string) {
  const root = document.documentElement;
  let isDark: boolean;

  switch (theme) {
    case 'light':
      isDark = false;
      break;
    case 'dark':
      isDark = true;
      break;
    case 'system':
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      break;
    case 'sync-terminal':
      isDark = isTerminalThemeDark(terminalTheme);
      break;
  }

  root.classList.toggle('dark', isDark);
}

export type FontWeight =
  | 'normal'
  | 'bold'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900';

export type TerminalRenderer = 'canvas' | 'webgl';

export interface AgentConfig {
  enabled: boolean;
  isDefault: boolean;
}

export type AgentSettings = Record<string, AgentConfig>;

export const BUILTIN_AGENT_IDS: BuiltinAgentId[] = [
  'claude',
  'codex',
  'droid',
  'gemini',
  'auggie',
  'cursor',
];

// Terminal keybindings
export interface TerminalKeybinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface TerminalKeybindings {
  clear: TerminalKeybinding;
  newTab: TerminalKeybinding;
  closeTab: TerminalKeybinding;
  nextTab: TerminalKeybinding;
  prevTab: TerminalKeybinding;
}

// Main tab switching keybindings
export interface MainTabKeybindings {
  switchToAgent: TerminalKeybinding;
  switchToFile: TerminalKeybinding;
  switchToTerminal: TerminalKeybinding;
}

// Agent session keybindings
export interface AgentKeybindings {
  newSession: TerminalKeybinding;
  closeSession: TerminalKeybinding;
  nextSession: TerminalKeybinding;
  prevSession: TerminalKeybinding;
}

export const defaultTerminalKeybindings: TerminalKeybindings = {
  clear: { key: 'r', meta: true }, // Cmd/Win+R
  newTab: { key: 't', ctrl: true },
  closeTab: { key: 'w', ctrl: true },
  nextTab: { key: ']', ctrl: true },
  prevTab: { key: '[', ctrl: true },
};

export const defaultMainTabKeybindings: MainTabKeybindings = {
  switchToAgent: { key: '1', ctrl: true }, // Ctrl+1
  switchToFile: { key: '2', ctrl: true }, // Ctrl+2
  switchToTerminal: { key: '3', ctrl: true }, // Ctrl+3
};

export const defaultAgentKeybindings: AgentKeybindings = {
  newSession: { key: 't', meta: true, shift: true }, // Cmd/Win+Shift+T
  closeSession: { key: 'w', meta: true, shift: true }, // Cmd/Win+Shift+W
  nextSession: { key: ']', meta: true }, // Cmd/Win+]
  prevSession: { key: '[', meta: true }, // Cmd/Win+[
};

interface SettingsState {
  theme: Theme;
  fontSize: number;
  fontFamily: string;
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalFontWeight: FontWeight;
  terminalFontWeightBold: FontWeight;
  terminalTheme: string;
  terminalRenderer: TerminalRenderer;
  terminalKeybindings: TerminalKeybindings;
  mainTabKeybindings: MainTabKeybindings;
  agentKeybindings: AgentKeybindings;
  agentSettings: AgentSettings;
  customAgents: CustomAgent[];

  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalFontFamily: (family: string) => void;
  setTerminalFontWeight: (weight: FontWeight) => void;
  setTerminalFontWeightBold: (weight: FontWeight) => void;
  setTerminalTheme: (theme: string) => void;
  setTerminalRenderer: (renderer: TerminalRenderer) => void;
  setTerminalKeybindings: (keybindings: TerminalKeybindings) => void;
  setMainTabKeybindings: (keybindings: MainTabKeybindings) => void;
  setAgentKeybindings: (keybindings: AgentKeybindings) => void;
  setAgentEnabled: (agentId: string, enabled: boolean) => void;
  setAgentDefault: (agentId: string) => void;
  addCustomAgent: (agent: CustomAgent) => void;
  updateCustomAgent: (id: string, updates: Partial<CustomAgent>) => void;
  removeCustomAgent: (id: string) => void;
}

const defaultAgentSettings: AgentSettings = {
  claude: { enabled: true, isDefault: true },
  codex: { enabled: true, isDefault: false },
  droid: { enabled: true, isDefault: false },
  gemini: { enabled: true, isDefault: false },
  auggie: { enabled: true, isDefault: false },
  cursor: { enabled: true, isDefault: false },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      fontSize: 14,
      fontFamily: 'Inter',
      terminalFontSize: 18,
      terminalFontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
      terminalFontWeight: 'normal',
      terminalFontWeightBold: '500',
      terminalTheme: 'Dracula',
      terminalRenderer: 'canvas',
      terminalKeybindings: defaultTerminalKeybindings,
      mainTabKeybindings: defaultMainTabKeybindings,
      agentKeybindings: defaultAgentKeybindings,
      agentSettings: defaultAgentSettings,
      customAgents: [],

      setTheme: (theme) => {
        const terminalTheme = get().terminalTheme;
        if (theme === 'sync-terminal') {
          applyTerminalThemeToApp(terminalTheme, true);
        } else {
          clearTerminalThemeFromApp();
          applyAppTheme(theme, terminalTheme);
        }
        set({ theme });
      },
      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setTerminalFontSize: (terminalFontSize) => {
        applyTerminalFont(get().terminalFontFamily, terminalFontSize);
        set({ terminalFontSize });
      },
      setTerminalFontFamily: (terminalFontFamily) => {
        applyTerminalFont(terminalFontFamily, get().terminalFontSize);
        set({ terminalFontFamily });
      },
      setTerminalFontWeight: (terminalFontWeight) => set({ terminalFontWeight }),
      setTerminalFontWeightBold: (terminalFontWeightBold) => set({ terminalFontWeightBold }),
      setTerminalTheme: (terminalTheme) => {
        const currentTheme = get().theme;
        if (currentTheme === 'sync-terminal') {
          applyTerminalThemeToApp(terminalTheme, true);
        }
        set({ terminalTheme });
      },
      setTerminalRenderer: (terminalRenderer) => set({ terminalRenderer }),
      setTerminalKeybindings: (terminalKeybindings) => set({ terminalKeybindings }),
      setMainTabKeybindings: (mainTabKeybindings) => set({ mainTabKeybindings }),
      setAgentKeybindings: (agentKeybindings) => set({ agentKeybindings }),
      setAgentEnabled: (agentId, enabled) => {
        const current = get().agentSettings;
        set({
          agentSettings: {
            ...current,
            [agentId]: { ...current[agentId], enabled },
          },
        });
      },
      setAgentDefault: (agentId) => {
        const current = get().agentSettings;
        const updated = { ...current };
        for (const id of Object.keys(updated)) {
          updated[id] = { ...updated[id], isDefault: id === agentId };
        }
        set({ agentSettings: updated });
      },
      addCustomAgent: (agent) => {
        const { customAgents, agentSettings } = get();
        set({
          customAgents: [...customAgents, agent],
          agentSettings: {
            ...agentSettings,
            [agent.id]: { enabled: true, isDefault: false },
          },
        });
      },
      updateCustomAgent: (id, updates) => {
        const { customAgents } = get();
        set({
          customAgents: customAgents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        });
      },
      removeCustomAgent: (id) => {
        const { customAgents, agentSettings } = get();
        const wasDefault = agentSettings[id]?.isDefault;
        const newAgentSettings = { ...agentSettings };
        delete newAgentSettings[id];

        if (wasDefault) {
          const firstEnabled = Object.entries(newAgentSettings).find(([, cfg]) => cfg.enabled);
          if (firstEnabled) {
            newAgentSettings[firstEnabled[0]] = { ...firstEnabled[1], isDefault: true };
          }
        }

        set({
          customAgents: customAgents.filter((a) => a.id !== id),
          agentSettings: newAgentSettings,
        });
      },
    }),
    {
      name: 'enso-settings',
      storage: createJSONStorage(() => electronStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.theme === 'sync-terminal') {
            applyTerminalThemeToApp(state.terminalTheme, true);
          } else {
            applyAppTheme(state.theme, state.terminalTheme);
          }
          applyTerminalFont(state.terminalFontFamily, state.terminalFontSize);
        }
      },
    }
  )
);
