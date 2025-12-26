import type { Locale } from '@shared/i18n';
import { normalizeLocale } from '@shared/i18n';
import type { BuiltinAgentId, CustomAgent, ShellConfig } from '@shared/types';
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

function getDefaultLocale(): Locale {
  if (typeof navigator !== 'undefined') {
    return normalizeLocale(navigator.language);
  }
  return 'en';
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

export type TerminalRenderer = 'dom' | 'canvas' | 'webgl';

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

// Source control keybindings
export interface SourceControlKeybindings {
  prevDiff: TerminalKeybinding;
  nextDiff: TerminalKeybinding;
}

// Claude Code integration settings
export interface ClaudeCodeIntegrationSettings {
  enabled: boolean;
  selectionChangedDebounce: number; // in milliseconds
  atMentionedKeybinding: TerminalKeybinding;
}

export const defaultClaudeCodeIntegrationSettings: ClaudeCodeIntegrationSettings = {
  enabled: false,
  selectionChangedDebounce: 300,
  atMentionedKeybinding: { key: 'm', meta: true, shift: true }, // Cmd/Ctrl+Shift+M
};

// Commit message generator settings
export interface CommitMessageGeneratorSettings {
  enabled: boolean;
  maxDiffLines: number;
  timeout: number; // in seconds
}

export const defaultCommitMessageGeneratorSettings: CommitMessageGeneratorSettings = {
  enabled: true,
  maxDiffLines: 1000,
  timeout: 60,
};

// Editor settings
export type EditorLineNumbers = 'on' | 'off' | 'relative';
export type EditorWordWrap = 'on' | 'off' | 'wordWrapColumn' | 'bounded';
export type EditorRenderWhitespace = 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
export type EditorCursorBlinking = 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
export type EditorCursorStyle =
  | 'line'
  | 'block'
  | 'underline'
  | 'line-thin'
  | 'block-outline'
  | 'underline-thin';
export type EditorRenderLineHighlight = 'none' | 'gutter' | 'line' | 'all';
export type EditorAutoClosingBrackets = 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';
export type EditorAutoClosingQuotes = 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';

export type EditorAutoSave = 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';

export interface EditorSettings {
  // Display
  minimapEnabled: boolean;
  lineNumbers: EditorLineNumbers;
  wordWrap: EditorWordWrap;
  renderWhitespace: EditorRenderWhitespace;
  renderLineHighlight: EditorRenderLineHighlight;
  folding: boolean;
  links: boolean;
  smoothScrolling: boolean;
  // Font
  fontSize: number;
  fontFamily: string;
  // Indentation
  tabSize: number;
  insertSpaces: boolean;
  // Cursor
  cursorStyle: EditorCursorStyle;
  cursorBlinking: EditorCursorBlinking;
  // Brackets
  bracketPairColorization: boolean;
  matchBrackets: 'always' | 'near' | 'never';
  bracketPairGuides: boolean;
  indentationGuides: boolean;
  // Editing
  autoClosingBrackets: EditorAutoClosingBrackets;
  autoClosingQuotes: EditorAutoClosingQuotes;
  // Auto Save
  autoSave: EditorAutoSave;
  autoSaveDelay: number;
}

export const defaultEditorSettings: EditorSettings = {
  // Display
  minimapEnabled: false,
  lineNumbers: 'on',
  wordWrap: 'on',
  renderWhitespace: 'selection',
  renderLineHighlight: 'line',
  folding: true,
  links: true,
  smoothScrolling: true,
  // Font
  fontSize: 13,
  fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
  // Indentation
  tabSize: 2,
  insertSpaces: true,
  // Cursor
  cursorStyle: 'line',
  cursorBlinking: 'smooth',
  // Brackets
  bracketPairColorization: true,
  matchBrackets: 'always',
  bracketPairGuides: true,
  indentationGuides: true,
  // Editing
  autoClosingBrackets: 'languageDefined',
  autoClosingQuotes: 'languageDefined',
  // Auto Save
  autoSave: 'off',
  autoSaveDelay: 1000,
};

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

export const defaultSourceControlKeybindings: SourceControlKeybindings = {
  prevDiff: { key: 'F7' }, // F7
  nextDiff: { key: 'F8' }, // F8
};

interface SettingsState {
  theme: Theme;
  language: Locale;
  fontSize: number;
  fontFamily: string;
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalFontWeight: FontWeight;
  terminalFontWeightBold: FontWeight;
  terminalTheme: string;
  terminalRenderer: TerminalRenderer;
  terminalScrollback: number;
  terminalKeybindings: TerminalKeybindings;
  mainTabKeybindings: MainTabKeybindings;
  agentKeybindings: AgentKeybindings;
  sourceControlKeybindings: SourceControlKeybindings;
  editorSettings: EditorSettings;
  agentSettings: AgentSettings;
  customAgents: CustomAgent[];
  shellConfig: ShellConfig;
  wslEnabled: boolean;
  agentNotificationEnabled: boolean;
  agentNotificationDelay: number; // in seconds
  agentNotificationEnterDelay: number; // delay after Enter before starting idle timer
  claudeCodeIntegration: ClaudeCodeIntegrationSettings;
  commitMessageGenerator: CommitMessageGeneratorSettings;

  setTheme: (theme: Theme) => void;
  setLanguage: (language: Locale) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalFontFamily: (family: string) => void;
  setTerminalFontWeight: (weight: FontWeight) => void;
  setTerminalFontWeightBold: (weight: FontWeight) => void;
  setTerminalTheme: (theme: string) => void;
  setTerminalRenderer: (renderer: TerminalRenderer) => void;
  setTerminalScrollback: (scrollback: number) => void;
  setTerminalKeybindings: (keybindings: TerminalKeybindings) => void;
  setMainTabKeybindings: (keybindings: MainTabKeybindings) => void;
  setAgentKeybindings: (keybindings: AgentKeybindings) => void;
  setSourceControlKeybindings: (keybindings: SourceControlKeybindings) => void;
  setEditorSettings: (settings: Partial<EditorSettings>) => void;
  setAgentEnabled: (agentId: string, enabled: boolean) => void;
  setAgentDefault: (agentId: string) => void;
  addCustomAgent: (agent: CustomAgent) => void;
  updateCustomAgent: (id: string, updates: Partial<CustomAgent>) => void;
  removeCustomAgent: (id: string) => void;
  setShellConfig: (config: ShellConfig) => void;
  setWslEnabled: (enabled: boolean) => void;
  setAgentNotificationEnabled: (enabled: boolean) => void;
  setAgentNotificationDelay: (delay: number) => void;
  setAgentNotificationEnterDelay: (delay: number) => void;
  setClaudeCodeIntegration: (settings: Partial<ClaudeCodeIntegrationSettings>) => void;
  setCommitMessageGenerator: (settings: Partial<CommitMessageGeneratorSettings>) => void;
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
      language: getDefaultLocale(),
      fontSize: 14,
      fontFamily: 'Inter',
      terminalFontSize: 18,
      terminalFontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
      terminalFontWeight: 'normal',
      terminalFontWeightBold: '500',
      terminalTheme: 'Dracula',
      terminalRenderer: 'webgl',
      terminalScrollback: 10000,
      terminalKeybindings: defaultTerminalKeybindings,
      mainTabKeybindings: defaultMainTabKeybindings,
      agentKeybindings: defaultAgentKeybindings,
      sourceControlKeybindings: defaultSourceControlKeybindings,
      editorSettings: defaultEditorSettings,
      agentSettings: defaultAgentSettings,
      customAgents: [],
      shellConfig: {
        shellType: window.electronAPI?.env.platform === 'win32' ? 'powershell7' : 'system',
      },
      wslEnabled: false,
      agentNotificationEnabled: true,
      agentNotificationDelay: 3, // 3 seconds
      agentNotificationEnterDelay: 0, // 0 = disabled, start timer immediately
      claudeCodeIntegration: defaultClaudeCodeIntegrationSettings,
      commitMessageGenerator: defaultCommitMessageGeneratorSettings,

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
      setLanguage: (language) => {
        document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
        window.electronAPI.app.setLanguage(language);
        set({ language });
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
      setTerminalScrollback: (terminalScrollback) => set({ terminalScrollback }),
      setTerminalKeybindings: (terminalKeybindings) => set({ terminalKeybindings }),
      setMainTabKeybindings: (mainTabKeybindings) => set({ mainTabKeybindings }),
      setAgentKeybindings: (agentKeybindings) => set({ agentKeybindings }),
      setSourceControlKeybindings: (sourceControlKeybindings) => set({ sourceControlKeybindings }),
      setEditorSettings: (settings) =>
        set((state) => ({
          editorSettings: { ...state.editorSettings, ...settings },
        })),
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
      setShellConfig: (shellConfig) => set({ shellConfig }),
      setWslEnabled: (wslEnabled) => set({ wslEnabled }),
      setAgentNotificationEnabled: (agentNotificationEnabled) => set({ agentNotificationEnabled }),
      setAgentNotificationDelay: (agentNotificationDelay) => set({ agentNotificationDelay }),
      setAgentNotificationEnterDelay: (agentNotificationEnterDelay) =>
        set({ agentNotificationEnterDelay }),
      setClaudeCodeIntegration: (settings) =>
        set((state) => ({
          claudeCodeIntegration: { ...state.claudeCodeIntegration, ...settings },
        })),
      setCommitMessageGenerator: (settings) =>
        set((state) => ({
          commitMessageGenerator: { ...state.commitMessageGenerator, ...settings },
        })),
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
          const resolvedLanguage = normalizeLocale(state.language);
          document.documentElement.lang = resolvedLanguage === 'zh' ? 'zh-CN' : 'en';
          window.electronAPI.app.setLanguage(resolvedLanguage);
        }
      },
    }
  )
);
