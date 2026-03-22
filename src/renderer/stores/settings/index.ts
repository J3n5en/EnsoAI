import type { Locale } from '@shared/i18n';
import { normalizeLocale } from '@shared/i18n';
import type { CustomAgent, McpServer, PromptPreset } from '@shared/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  applyTerminalThemeToApp,
  clearTerminalThemeFromApp,
  isTerminalThemeDark,
} from '@/lib/ghosttyTheme';
import { updateRendererLogging } from '@/utils/logging';
import {
  defaultAgentSettings,
  defaultBranchNameGeneratorSettings,
  defaultClaudeCodeIntegrationSettings,
  defaultCodeReviewSettings,
  defaultCommitMessageGeneratorSettings,
  defaultEditorKeybindings,
  defaultEditorSettings,
  defaultGitCloneSettings,
  defaultGlobalKeybindings,
  defaultHapiSettings,
  defaultMainTabKeybindings,
  defaultProxySettings,
  defaultQuickTerminalSettings,
  defaultRemoteSettings,
  defaultSearchKeybindings,
  defaultSourceControlKeybindings,
  defaultTodoPolishSettings,
  defaultWorkspaceKeybindings,
  defaultXtermKeybindings,
  getDefaultLocale,
  getDefaultShellConfig,
} from './defaults';
import { cleanupLegacyFields, migrateSettings } from './migration';
import { electronStorage } from './storage';
import type {
  BackgroundSizeMode,
  BackgroundSourceType,
  FontWeight,
  SettingsState,
  Theme,
} from './types';

export * from './defaults';
// Re-export types and defaults for external use
export * from './types';

// Apply terminal font settings to app CSS variables
function applyTerminalFont(fontFamily: string, fontSize: number): void {
  const root = document.documentElement;
  root.style.setProperty('--font-family-mono', fontFamily);
  root.style.setProperty('--font-size-base', `${fontSize}px`);
}

// Apply app theme (dark/light mode)
function applyAppTheme(theme: Theme, terminalTheme: string): void {
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

// Apply initial settings on app load
function applyInitialSettings(state: {
  theme: Theme;
  terminalTheme: string;
  terminalFontFamily: string;
  terminalFontSize: number;
  language: Locale;
}): void {
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

// Get initial state values
function getInitialState() {
  return {
    // UI Settings
    theme: 'system' as Theme,
    layoutMode: 'tree' as const,
    fileTreeDisplayMode: 'legacy' as const,
    repositoryListDisplayMode: 'list' as const,
    language: getDefaultLocale(),
    fontSize: 14,
    fontFamily: 'Inter',

    // Terminal Settings
    terminalFontSize: 18,
    terminalFontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
    terminalFontWeight: 'normal' as FontWeight,
    terminalFontWeightBold: '500' as FontWeight,
    terminalTheme: 'Dracula',
    terminalRenderer: 'dom' as const,
    terminalScrollback: 10000,
    terminalOptionIsMeta: true,
    copyOnSelection: false,

    // Keybindings
    xtermKeybindings: defaultXtermKeybindings,
    mainTabKeybindings: defaultMainTabKeybindings,
    sourceControlKeybindings: defaultSourceControlKeybindings,
    searchKeybindings: defaultSearchKeybindings,
    editorKeybindings: defaultEditorKeybindings,
    globalKeybindings: defaultGlobalKeybindings,
    workspaceKeybindings: defaultWorkspaceKeybindings,

    // Editor Settings
    editorSettings: defaultEditorSettings,

    // Agent Settings
    agentSettings: defaultAgentSettings,
    agentDetectionStatus: {},
    customAgents: [] as CustomAgent[],
    shellConfig: getDefaultShellConfig(),
    agentNotificationEnabled: true,
    agentNotificationDelay: 5,
    agentNotificationEnterDelay: 5,

    // Claude Code Integration
    claudeCodeIntegration: defaultClaudeCodeIntegrationSettings,

    // AI Features
    commitMessageGenerator: defaultCommitMessageGeneratorSettings,
    codeReview: defaultCodeReviewSettings,
    branchNameGenerator: defaultBranchNameGeneratorSettings,
    todoPolish: defaultTodoPolishSettings,

    // App Settings
    autoUpdateEnabled: true,
    hapiSettings: defaultHapiSettings,
    remoteSettings: defaultRemoteSettings,
    defaultWorktreePath: '',
    proxySettings: defaultProxySettings,
    autoCreateSessionOnActivate: false,

    // Git Auto Operations
    gitAutoFetchEnabled: true,

    // Git Clone Settings
    gitClone: defaultGitCloneSettings,

    // Beta features
    todoEnabled: false,
    glowEffectEnabled: false,
    temporaryWorkspaceEnabled: false,
    defaultTemporaryPath: '',
    autoCreateSessionOnTempActivate: false,

    // Background image defaults
    backgroundImageEnabled: false,
    backgroundImagePath: '',
    backgroundUrlPath: '',
    backgroundFolderPath: '',
    backgroundSourceType: 'file' as BackgroundSourceType,
    backgroundRandomEnabled: false,
    backgroundRandomInterval: 300,
    backgroundOpacity: 0.85,
    backgroundBlur: 0,
    backgroundBrightness: 1,
    backgroundSaturation: 1,
    backgroundSizeMode: 'cover' as BackgroundSizeMode,
    _backgroundRefreshKey: 0,

    // MCP, Prompts defaults
    mcpServers: [] as McpServer[],
    promptPresets: [] as PromptPreset[],

    // Settings display mode
    settingsDisplayMode: 'tab' as const,
    settingsModalPosition: null,

    // Terminal theme favorites
    favoriteTerminalThemes: [] as string[],

    // Quick Terminal defaults
    quickTerminal: defaultQuickTerminalSettings,

    // Web Inspector defaults
    webInspectorEnabled: false,

    // Hide Groups default
    hideGroups: false,
    hiddenOpenInApps: [] as string[],
    openInMenuFilterEnabled: false,

    // File Tree defaults
    fileTreeAutoReveal: true, // Auto-reveal active file in file tree by default (like VSCode)

    // Logging defaults
    loggingEnabled: false,
    logLevel: 'info' as const,
    logRetentionDays: 7,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      // UI Setters
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

      setLayoutMode: (layoutMode) => set({ layoutMode }),

      setFileTreeDisplayMode: (fileTreeDisplayMode) => set({ fileTreeDisplayMode }),

      setRepositoryListDisplayMode: (repositoryListDisplayMode) =>
        set({ repositoryListDisplayMode }),

      setLanguage: (language) => {
        document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
        window.electronAPI.app.setLanguage(language);
        set({ language });
      },

      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),

      // Terminal Setters
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
      setTerminalOptionIsMeta: (terminalOptionIsMeta) => set({ terminalOptionIsMeta }),
      setCopyOnSelection: (copyOnSelection) => set({ copyOnSelection }),

      // Keybinding Setters
      setXtermKeybindings: (xtermKeybindings) => set({ xtermKeybindings }),
      setMainTabKeybindings: (mainTabKeybindings) => set({ mainTabKeybindings }),
      setSourceControlKeybindings: (sourceControlKeybindings) => set({ sourceControlKeybindings }),
      setSearchKeybindings: (searchKeybindings) => set({ searchKeybindings }),
      setEditorKeybindings: (editorKeybindings) => set({ editorKeybindings }),
      setGlobalKeybindings: (globalKeybindings) => set({ globalKeybindings }),
      setWorkspaceKeybindings: (workspaceKeybindings) => set({ workspaceKeybindings }),

      // Editor Setters
      setEditorSettings: (settings) =>
        set((state) => ({
          editorSettings: { ...state.editorSettings, ...settings },
        })),

      // Agent Setters
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

      setAgentCustomConfig: (agentId, config) => {
        const current = get().agentSettings;
        set({
          agentSettings: {
            ...current,
            [agentId]: {
              ...current[agentId],
              customPath: config.customPath || undefined,
              customArgs: config.customArgs || undefined,
            },
          },
        });
      },

      setAgentDetectionStatus: (agentId, info) => {
        const current = get().agentDetectionStatus;
        set({
          agentDetectionStatus: {
            ...current,
            [agentId]: info,
          },
        });
      },

      clearAgentDetectionStatus: (agentId) => {
        const current = get().agentDetectionStatus;
        const updated = { ...current };
        delete updated[agentId];
        set({ agentDetectionStatus: updated });
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
      setAgentNotificationEnabled: (agentNotificationEnabled) => set({ agentNotificationEnabled }),
      setAgentNotificationDelay: (agentNotificationDelay) => set({ agentNotificationDelay }),
      setAgentNotificationEnterDelay: (agentNotificationEnterDelay) =>
        set({ agentNotificationEnterDelay }),

      // Claude Code Integration Setters
      setClaudeCodeIntegration: (settings) =>
        set((state) => ({
          claudeCodeIntegration: { ...state.claudeCodeIntegration, ...settings },
        })),

      addClaudeProvider: (provider) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: [...state.claudeCodeIntegration.providers, provider],
          },
        })),

      updateClaudeProvider: (id, updates) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: state.claudeCodeIntegration.providers.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          },
        })),

      removeClaudeProvider: (id) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: state.claudeCodeIntegration.providers.filter((p) => p.id !== id),
          },
        })),

      reorderClaudeProviders: (fromIndex, toIndex) =>
        set((state) => {
          const providers = [...state.claudeCodeIntegration.providers];
          const [removed] = providers.splice(fromIndex, 1);
          providers.splice(toIndex, 0, removed);
          const reordered = providers.map((p, index) => ({ ...p, displayOrder: index }));
          return {
            claudeCodeIntegration: {
              ...state.claudeCodeIntegration,
              providers: reordered,
            },
          };
        }),

      setClaudeProviderEnabled: (id, enabled) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: state.claudeCodeIntegration.providers.map((p) =>
              p.id === id ? { ...p, enabled } : p
            ),
          },
        })),

      setClaudeProviderOrder: (providers) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: providers.map((p, index) => ({ ...p, displayOrder: index })),
          },
        })),

      // AI Feature Setters
      setCommitMessageGenerator: (settings) =>
        set((state) => ({
          commitMessageGenerator: { ...state.commitMessageGenerator, ...settings },
        })),

      setCodeReview: (settings) =>
        set((state) => ({
          codeReview: { ...state.codeReview, ...settings },
        })),

      setBranchNameGenerator: (settings) =>
        set((state) => ({
          branchNameGenerator: { ...state.branchNameGenerator, ...settings },
        })),

      setTodoPolish: (settings) =>
        set((state) => ({
          todoPolish: { ...state.todoPolish, ...settings },
        })),

      // App Setters
      setAutoUpdateEnabled: (autoUpdateEnabled) => {
        set({ autoUpdateEnabled });
        window.electronAPI.updater.setAutoUpdateEnabled(autoUpdateEnabled);
      },

      setHapiSettings: (settings) =>
        set((state) => ({
          hapiSettings: { ...state.hapiSettings, ...settings },
        })),

      setRemoteProfiles: (profiles) =>
        set((state) => ({
          remoteSettings: { ...state.remoteSettings, profiles },
        })),

      upsertRemoteProfile: (profile) =>
        set((state) => {
          const index = state.remoteSettings.profiles.findIndex((item) => item.id === profile.id);
          const profiles =
            index >= 0
              ? state.remoteSettings.profiles.map((item) =>
                  item.id === profile.id ? profile : item
                )
              : [...state.remoteSettings.profiles, profile];
          return {
            remoteSettings: { ...state.remoteSettings, profiles },
          };
        }),

      removeRemoteProfile: (profileId) =>
        set((state) => ({
          remoteSettings: {
            ...state.remoteSettings,
            profiles: state.remoteSettings.profiles.filter((profile) => profile.id !== profileId),
          },
        })),

      setDefaultWorktreePath: (defaultWorktreePath) => set({ defaultWorktreePath }),

      setProxySettings: (settings) => {
        set((state) => ({
          proxySettings: { ...state.proxySettings, ...settings },
        }));
        const newSettings = { ...get().proxySettings, ...settings };
        window.electronAPI.app.setProxy(newSettings);
      },

      setAutoCreateSessionOnActivate: (autoCreateSessionOnActivate) =>
        set({ autoCreateSessionOnActivate }),

      setGitAutoFetchEnabled: (gitAutoFetchEnabled) => {
        set({ gitAutoFetchEnabled });
        window.electronAPI.git.setAutoFetchEnabled(gitAutoFetchEnabled);
      },

      // Git Clone Setters
      setGitClone: (settings) =>
        set((state) => ({
          gitClone: { ...state.gitClone, ...settings },
        })),

      addHostMapping: (mapping) =>
        set((state) => ({
          gitClone: {
            ...state.gitClone,
            hostMappings: [...state.gitClone.hostMappings, mapping],
          },
        })),

      removeHostMapping: (pattern) =>
        set((state) => ({
          gitClone: {
            ...state.gitClone,
            hostMappings: state.gitClone.hostMappings.filter((m) => m.pattern !== pattern),
          },
        })),

      updateHostMapping: (oldPattern, updates) =>
        set((state) => ({
          gitClone: {
            ...state.gitClone,
            hostMappings: state.gitClone.hostMappings.map((m) =>
              m.pattern === oldPattern ? { ...m, ...updates } : m
            ),
          },
        })),

      // Beta Feature Setters
      setTodoEnabled: (todoEnabled) => set({ todoEnabled }),
      setGlowEffectEnabled: (glowEffectEnabled) => set({ glowEffectEnabled }),
      setTemporaryWorkspaceEnabled: (temporaryWorkspaceEnabled) =>
        set({ temporaryWorkspaceEnabled }),
      setDefaultTemporaryPath: (defaultTemporaryPath) => set({ defaultTemporaryPath }),
      setAutoCreateSessionOnTempActivate: (autoCreateSessionOnTempActivate) =>
        set({ autoCreateSessionOnTempActivate }),

      // Background Image Setters
      setBackgroundImageEnabled: (backgroundImageEnabled) => set({ backgroundImageEnabled }),
      setBackgroundImagePath: (backgroundImagePath) => set({ backgroundImagePath }),
      setBackgroundUrlPath: (backgroundUrlPath) => set({ backgroundUrlPath }),
      setBackgroundFolderPath: (backgroundFolderPath) => set({ backgroundFolderPath }),
      setBackgroundSourceType: (backgroundSourceType) => set({ backgroundSourceType }),
      setBackgroundRandomEnabled: (backgroundRandomEnabled) => set({ backgroundRandomEnabled }),

      setBackgroundRandomInterval: (backgroundRandomInterval) => {
        const safeValue = Number.isFinite(backgroundRandomInterval)
          ? Math.max(5, Math.min(86400, backgroundRandomInterval))
          : 300;
        set({ backgroundRandomInterval: safeValue });
      },

      setBackgroundOpacity: (backgroundOpacity) => {
        const safeValue = Number.isFinite(backgroundOpacity)
          ? backgroundOpacity
          : get().backgroundOpacity;
        const clamped = Math.min(1, Math.max(0, safeValue));
        set({ backgroundOpacity: clamped });
      },

      setBackgroundBlur: (backgroundBlur) => {
        const safeValue = Number.isFinite(backgroundBlur) ? backgroundBlur : get().backgroundBlur;
        const clamped = Math.min(20, Math.max(0, safeValue));
        set({ backgroundBlur: clamped });
      },

      setBackgroundBrightness: (backgroundBrightness) => {
        const safeValue = Number.isFinite(backgroundBrightness)
          ? backgroundBrightness
          : get().backgroundBrightness;
        const clamped = Math.min(2, Math.max(0, safeValue));
        set({ backgroundBrightness: clamped });
      },

      setBackgroundSaturation: (backgroundSaturation) => {
        const safeValue = Number.isFinite(backgroundSaturation)
          ? backgroundSaturation
          : get().backgroundSaturation;
        const clamped = Math.min(2, Math.max(0, safeValue));
        set({ backgroundSaturation: clamped });
      },

      setBackgroundSizeMode: (backgroundSizeMode) => set({ backgroundSizeMode }),

      triggerBackgroundRefresh: () =>
        set((state) => ({ _backgroundRefreshKey: state._backgroundRefreshKey + 1 })),

      // MCP Setters
      addMcpServer: (server) =>
        set((state) => ({
          mcpServers: [...state.mcpServers, server],
        })),

      updateMcpServer: (id, updates) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === id ? ({ ...s, ...updates } as McpServer) : s
          ),
        })),

      removeMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.id !== id),
        })),

      setMcpServerEnabled: (id, enabled) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === id ? ({ ...s, enabled } as McpServer) : s
          ),
        })),

      // Prompt Setters
      addPromptPreset: (preset) =>
        set((state) => ({
          promptPresets: [...state.promptPresets, preset],
        })),

      updatePromptPreset: (id, updates) =>
        set((state) => ({
          promptPresets: state.promptPresets.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
        })),

      removePromptPreset: (id) =>
        set((state) => ({
          promptPresets: state.promptPresets.filter((p) => p.id !== id),
        })),

      setPromptPresetEnabled: (id) =>
        set((state) => ({
          promptPresets: state.promptPresets.map((p) => ({
            ...p,
            enabled: p.id === id,
          })),
        })),

      // Settings Display Setters
      setSettingsDisplayMode: (mode) => set({ settingsDisplayMode: mode }),
      setSettingsModalPosition: (position) => set({ settingsModalPosition: position }),

      // Terminal Theme Favorites Setters
      addFavoriteTerminalTheme: (theme) =>
        set((state) => ({
          favoriteTerminalThemes: state.favoriteTerminalThemes.includes(theme)
            ? state.favoriteTerminalThemes
            : [...state.favoriteTerminalThemes, theme],
        })),

      removeFavoriteTerminalTheme: (theme) =>
        set((state) => ({
          favoriteTerminalThemes: state.favoriteTerminalThemes.filter((t) => t !== theme),
        })),

      toggleFavoriteTerminalTheme: (theme) =>
        set((state) => ({
          favoriteTerminalThemes: state.favoriteTerminalThemes.includes(theme)
            ? state.favoriteTerminalThemes.filter((t) => t !== theme)
            : [...state.favoriteTerminalThemes, theme],
        })),

      // Quick Terminal Setters
      setQuickTerminalEnabled: (enabled) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, enabled },
        })),

      setQuickTerminalButtonPosition: (position) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, buttonPosition: position },
        })),

      setQuickTerminalModalPosition: (position) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, modalPosition: position },
        })),

      setQuickTerminalModalSize: (size) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, modalSize: size },
        })),

      setQuickTerminalOpen: (open) =>
        set((state) => ({
          quickTerminal: { ...state.quickTerminal, isOpen: open },
        })),

      // Web Inspector Setter
      setWebInspectorEnabled: async (enabled) => {
        set({ webInspectorEnabled: enabled });
        if (enabled) {
          const result = await window.electronAPI.webInspector.start();
          if (!result.success) {
            console.error('[WebInspector] Failed to start:', result.error);
            set({ webInspectorEnabled: false });
          }
        } else {
          await window.electronAPI.webInspector.stop();
        }
      },

      // Other Setters
      setHideGroups: (hideGroups) => set({ hideGroups }),
      toggleHiddenOpenInApp: (bundleId) =>
        set((state) => ({
          hiddenOpenInApps: state.hiddenOpenInApps.includes(bundleId)
            ? state.hiddenOpenInApps.filter((id) => id !== bundleId)
            : [...state.hiddenOpenInApps, bundleId],
        })),
      setOpenInMenuFilterEnabled: (enabled) => set({ openInMenuFilterEnabled: enabled }),

      // File Tree Setters
      setFileTreeAutoReveal: (fileTreeAutoReveal) => set({ fileTreeAutoReveal }),

      // Logging Setters
      setLoggingEnabled: (loggingEnabled) => {
        const { logLevel } = get();
        set({ loggingEnabled });
        window.electronAPI.log.updateConfig({ enabled: loggingEnabled, level: logLevel });
        updateRendererLogging(loggingEnabled, logLevel);
      },

      setLogLevel: (logLevel) => {
        const { loggingEnabled } = get();
        set({ logLevel });
        window.electronAPI.log.updateConfig({ enabled: loggingEnabled, level: logLevel });
        updateRendererLogging(loggingEnabled, logLevel);
      },

      setLogRetentionDays: (logRetentionDays) => {
        const clampedDays = Math.min(30, Math.max(1, Math.floor(logRetentionDays)));
        set({ logRetentionDays: clampedDays });
      },
    }),
    {
      name: 'enso-settings',
      storage: createJSONStorage(() => electronStorage),
      // Exclude transient fields from persistence
      partialize: (state) => {
        const { _backgroundRefreshKey, ...rest } = state;
        return rest as SettingsState;
      },
      // Deep merge nested objects to preserve new default fields when upgrading
      merge: (persistedState, currentState) => {
        return migrateSettings(persistedState as Partial<SettingsState>, currentState);
      },
      onRehydrateStorage: () => (state) => {
        const effectiveState = state ?? useSettingsStore.getState();
        applyInitialSettings(effectiveState);

        // Sync renderer logging configuration after settings are loaded
        updateRendererLogging(effectiveState.loggingEnabled, effectiveState.logLevel);

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', () => {
          const currentState = useSettingsStore.getState();
          if (currentState.theme === 'system') {
            applyAppTheme('system', currentState.terminalTheme);
          }
        });

        if (state) {
          // Apply proxy settings
          if (state.proxySettings) {
            window.electronAPI.app.setProxy(state.proxySettings);
          }

          // Auto-start Web Inspector server if it was enabled
          if (state.webInspectorEnabled) {
            window.electronAPI.webInspector.start().catch((error) => {
              console.error('[WebInspector] Failed to auto-start:', error);
            });
          }

          // Sync git auto-fetch setting to main process
          if (state.gitAutoFetchEnabled) {
            window.electronAPI.git.setAutoFetchEnabled(true);
          }

          // Clean up legacy fields (async)
          cleanupLegacyFields().catch((err) => {
            console.warn('Failed to cleanup legacy fields:', err);
          });

          // Auto-detect best shell on Windows for new users
          const shellAutoDetectKey = 'enso-shell-auto-detected';
          const executionPlatform = window.electronAPI?.env?.platform;
          if (executionPlatform === 'win32' && !localStorage.getItem(shellAutoDetectKey)) {
            localStorage.setItem(shellAutoDetectKey, 'true');
            window.electronAPI.shell
              .detect()
              .then((shells) => {
                const ps7 = shells.find((s) => s.id === 'powershell7' && s.available);
                if (ps7) {
                  useSettingsStore.getState().setShellConfig({ shellType: 'powershell7' });
                }
              })
              .catch((err) => {
                console.warn('Shell auto-detection failed:', err);
              });
          }
        }
      },
    }
  )
);
