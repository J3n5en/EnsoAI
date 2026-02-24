import type { SettingsState, TerminalKeybinding, XtermKeybindings } from './types';

/**
 * Helper functions for sanitizing persisted values
 */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(max, Math.max(min, value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(max, Math.max(min, parsed));
    }
  }
  return fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Migrate persisted state to current state format
 * Handles version upgrades, field sanitization, and legacy data migration
 */
export function migrateSettings(
  persistedState: Partial<SettingsState> | undefined,
  currentState: SettingsState
): SettingsState {
  if (!persistedState) {
    return currentState;
  }

  const persisted = persistedState;

  // Sanitize background image settings
  const sanitizedBackgroundOpacity = clampNumber(
    persisted.backgroundOpacity,
    0,
    1,
    currentState.backgroundOpacity
  );
  const sanitizedBackgroundBlur = clampNumber(
    persisted.backgroundBlur,
    0,
    20,
    currentState.backgroundBlur
  );
  const sanitizedBackgroundBrightness = clampNumber(
    persisted.backgroundBrightness,
    0,
    2,
    currentState.backgroundBrightness
  );
  const sanitizedBackgroundSaturation = clampNumber(
    persisted.backgroundSaturation,
    0,
    2,
    currentState.backgroundSaturation
  );
  const sanitizedBackgroundImageEnabled = sanitizeBoolean(
    persisted.backgroundImageEnabled,
    currentState.backgroundImageEnabled
  );
  const sanitizedBackgroundImagePath = sanitizeString(
    persisted.backgroundImagePath,
    currentState.backgroundImagePath
  );
  const sanitizedBackgroundUrlPath = sanitizeString(
    persisted.backgroundUrlPath,
    currentState.backgroundUrlPath
  );
  const sanitizedBackgroundFolderPath = sanitizeString(
    persisted.backgroundFolderPath,
    currentState.backgroundFolderPath
  );

  // Validate background source type
  const sourceTypes: SettingsState['backgroundSourceType'][] = ['file', 'folder', 'url'];
  const sanitizedBackgroundSourceType =
    persisted.backgroundSourceType && sourceTypes.includes(persisted.backgroundSourceType)
      ? persisted.backgroundSourceType
      : currentState.backgroundSourceType;

  // Migrate legacy backgroundUrlPath from backgroundImagePath
  const migratedBackgroundUrlPath =
    sanitizedBackgroundUrlPath ||
    (sanitizedBackgroundSourceType === 'url' ? sanitizedBackgroundImagePath : '');

  const sanitizedBackgroundRandomEnabled = sanitizeBoolean(
    persisted.backgroundRandomEnabled,
    currentState.backgroundRandomEnabled
  );
  const sanitizedBackgroundRandomInterval = clampNumber(
    persisted.backgroundRandomInterval,
    5,
    86400,
    currentState.backgroundRandomInterval
  );

  // Validate background size mode
  const sizeModes: SettingsState['backgroundSizeMode'][] = ['cover', 'contain', 'repeat', 'center'];
  const sanitizedBackgroundSizeMode =
    persisted.backgroundSizeMode && sizeModes.includes(persisted.backgroundSizeMode)
      ? persisted.backgroundSizeMode
      : currentState.backgroundSizeMode;

  // Migrate legacy 'canvas' renderer to 'webgl' (canvas support was removed)
  const terminalRenderer =
    (persisted.terminalRenderer as string) === 'canvas' ? 'webgl' : persisted.terminalRenderer;

  // Migrate xterm keybindings from legacy formats
  const migratedXtermKeybindings = migrateXtermKeybindings(persisted, currentState);

  // Migrate Claude Code integration settings
  const migratedClaudeCodeIntegration = migrateClaudeCodeIntegration(persisted, currentState);

  // Filter agent detection status to only include enabled agents
  const migratedAgentDetectionStatus = Object.fromEntries(
    Object.entries({
      ...currentState.agentDetectionStatus,
      ...persisted.agentDetectionStatus,
    }).filter(([agentId]) => {
      const agentConfig = persisted.agentSettings?.[agentId] ?? currentState.agentSettings[agentId];
      return agentConfig?.enabled;
    })
  );

  return {
    ...currentState,
    ...persisted,
    // Override with migrated/sanitized values
    ...(terminalRenderer && { terminalRenderer }),
    xtermKeybindings: migratedXtermKeybindings,
    mainTabKeybindings: {
      ...currentState.mainTabKeybindings,
      ...persisted.mainTabKeybindings,
    },
    sourceControlKeybindings: {
      ...currentState.sourceControlKeybindings,
      ...persisted.sourceControlKeybindings,
    },
    searchKeybindings: {
      ...currentState.searchKeybindings,
      ...persisted.searchKeybindings,
    },
    globalKeybindings: {
      ...currentState.globalKeybindings,
      ...persisted.globalKeybindings,
    },
    workspaceKeybindings: {
      ...currentState.workspaceKeybindings,
      ...persisted.workspaceKeybindings,
    },
    backgroundImageEnabled: sanitizedBackgroundImageEnabled,
    backgroundImagePath: sanitizedBackgroundImagePath,
    backgroundUrlPath: migratedBackgroundUrlPath,
    backgroundFolderPath: sanitizedBackgroundFolderPath,
    backgroundSourceType: sanitizedBackgroundSourceType,
    backgroundRandomEnabled: sanitizedBackgroundRandomEnabled,
    backgroundRandomInterval: sanitizedBackgroundRandomInterval,
    backgroundOpacity: sanitizedBackgroundOpacity,
    backgroundBlur: sanitizedBackgroundBlur,
    backgroundBrightness: sanitizedBackgroundBrightness,
    backgroundSaturation: sanitizedBackgroundSaturation,
    backgroundSizeMode: sanitizedBackgroundSizeMode,
    editorSettings: {
      ...currentState.editorSettings,
      ...persisted.editorSettings,
    },
    claudeCodeIntegration: migratedClaudeCodeIntegration,
    commitMessageGenerator: {
      ...currentState.commitMessageGenerator,
      ...persisted.commitMessageGenerator,
    },
    codeReview: {
      ...currentState.codeReview,
      ...persisted.codeReview,
    },
    branchNameGenerator: {
      ...currentState.branchNameGenerator,
      ...persisted.branchNameGenerator,
    },
    hapiSettings: {
      ...currentState.hapiSettings,
      ...persisted.hapiSettings,
    },
    agentDetectionStatus: migratedAgentDetectionStatus,
    mcpServers: persisted.mcpServers ?? currentState.mcpServers,
    promptPresets: persisted.promptPresets ?? currentState.promptPresets,
    quickTerminal: {
      ...currentState.quickTerminal,
      ...persisted.quickTerminal,
    },
  };
}

/**
 * Migrate xterm keybindings from legacy formats
 * TODO: Remove this migration block after v1.0 release
 */
function migrateXtermKeybindings(
  persisted: Partial<SettingsState>,
  currentState: SettingsState
): XtermKeybindings {
  // If user has already saved xtermKeybindings, use it directly (no legacy migration)
  if (persisted.xtermKeybindings) {
    return {
      ...currentState.xtermKeybindings,
      ...persisted.xtermKeybindings,
    };
  }

  // Legacy migration: only runs when xtermKeybindings doesn't exist yet
  const filterDefined = <T extends object>(obj: T): Partial<T> =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

  type LegacyAgentKeybindings = {
    newSession?: TerminalKeybinding;
    closeSession?: TerminalKeybinding;
    nextSession?: TerminalKeybinding;
    prevSession?: TerminalKeybinding;
  };

  type LegacyPaneKeybindings = {
    split?: TerminalKeybinding;
    merge?: TerminalKeybinding;
  };

  const legacy = persisted as {
    terminalKeybindings?: Partial<XtermKeybindings>;
    agentKeybindings?: LegacyAgentKeybindings;
    terminalPaneKeybindings?: LegacyPaneKeybindings;
  };

  return {
    ...currentState.xtermKeybindings,
    ...(legacy.terminalKeybindings &&
      filterDefined({
        newTab: legacy.terminalKeybindings.newTab,
        closeTab: legacy.terminalKeybindings.closeTab,
        nextTab: legacy.terminalKeybindings.nextTab,
        prevTab: legacy.terminalKeybindings.prevTab,
        clear: legacy.terminalKeybindings.clear,
      })),
    ...(legacy.agentKeybindings &&
      filterDefined({
        newTab: legacy.agentKeybindings.newSession,
        closeTab: legacy.agentKeybindings.closeSession,
        nextTab: legacy.agentKeybindings.nextSession,
        prevTab: legacy.agentKeybindings.prevSession,
      })),
    ...(legacy.terminalPaneKeybindings &&
      filterDefined({
        split: legacy.terminalPaneKeybindings.split,
        merge: legacy.terminalPaneKeybindings.merge,
      })),
  };
}

/**
 * Migrate Claude Code integration settings
 */
function migrateClaudeCodeIntegration(
  persisted: Partial<SettingsState>,
  currentState: SettingsState
): SettingsState['claudeCodeIntegration'] {
  const merged = {
    ...currentState.claudeCodeIntegration,
    ...persisted.claudeCodeIntegration,
    statusLineFields: {
      ...currentState.claudeCodeIntegration.statusLineFields,
      ...persisted.claudeCodeIntegration?.statusLineFields,
    },
  };

  // Migrate legacy boolean enhancedInputAutoPopup to new enum value
  const legacyAutoPopup = persisted.claudeCodeIntegration?.enhancedInputAutoPopup;
  if (typeof legacyAutoPopup === 'boolean') {
    merged.enhancedInputAutoPopup = legacyAutoPopup ? 'hideWhileRunning' : 'manual';
  }

  // Fix inconsistent state: hideWhileRunning requires stopHookEnabled
  if (merged.enhancedInputAutoPopup === 'hideWhileRunning' && !merged.stopHookEnabled) {
    merged.enhancedInputAutoPopup = 'always';
  }

  return merged;
}

/**
 * Clean up legacy fields from persisted state
 * TODO: Remove this function after v1.0 release
 */
export async function cleanupLegacyFields(): Promise<void> {
  const data = await window.electronAPI.settings.read();
  if (data && typeof data === 'object') {
    const settingsData = data as Record<string, unknown>;
    const ensoSettings = settingsData['enso-settings'] as
      | { state?: Record<string, unknown> }
      | undefined;

    if (ensoSettings?.state) {
      const legacyFields = ['terminalKeybindings', 'agentKeybindings', 'terminalPaneKeybindings'];
      const hasLegacy = legacyFields.some((f) => f in ensoSettings.state!);

      if (hasLegacy) {
        for (const field of legacyFields) {
          delete ensoSettings.state[field];
        }
        await window.electronAPI.settings.write(settingsData);
      }
    }
  }
}
