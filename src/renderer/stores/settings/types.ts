import type { Locale } from '@shared/i18n';
import type {
  AIProvider,
  BuiltinAgentId,
  CustomAgent,
  McpServer,
  PromptPreset,
  ProxySettings,
  ReasoningEffort,
  ShellConfig,
} from '@shared/types';

// Theme types
export type Theme = 'light' | 'dark' | 'system' | 'sync-terminal';

export type LayoutMode = 'columns' | 'tree';

export type FileTreeDisplayMode = 'legacy' | 'current';

export type SettingsDisplayMode = 'tab' | 'draggable-modal';

// Terminal types
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

export type TerminalRenderer = 'dom' | 'webgl';

// Editor types
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

// Keybinding types
export interface TerminalKeybinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface MainTabKeybindings {
  switchToAgent: TerminalKeybinding;
  switchToFile: TerminalKeybinding;
  switchToTerminal: TerminalKeybinding;
  switchToSourceControl: TerminalKeybinding;
}

export interface SourceControlKeybindings {
  prevDiff: TerminalKeybinding;
  nextDiff: TerminalKeybinding;
}

export interface SearchKeybindings {
  searchFiles: TerminalKeybinding;
  searchContent: TerminalKeybinding;
}

export interface GlobalKeybindings {
  runningProjects: TerminalKeybinding;
}

export interface WorkspaceKeybindings {
  toggleWorktree: TerminalKeybinding;
  toggleRepository: TerminalKeybinding;
  switchActiveWorktree: TerminalKeybinding;
}

export interface XtermKeybindings {
  newTab: TerminalKeybinding;
  closeTab: TerminalKeybinding;
  nextTab: TerminalKeybinding;
  prevTab: TerminalKeybinding;
  split: TerminalKeybinding;
  merge: TerminalKeybinding;
  clear: TerminalKeybinding;
}

// Legacy aliases for backward compatibility
export type TerminalKeybindings = XtermKeybindings;
export type AgentKeybindings = XtermKeybindings;
export type TerminalPaneKeybindings = XtermKeybindings;

// Agent types
export interface AgentConfig {
  enabled: boolean;
  isDefault: boolean;
  /** Custom absolute path to the agent CLI (overrides default command lookup) */
  customPath?: string;
  /** Additional arguments to pass to the agent CLI */
  customArgs?: string;
}

export type AgentSettings = Record<string, AgentConfig>;

export interface AgentDetectionInfo {
  installed: boolean;
  version?: string;
  detectedAt: number; // timestamp
}

export type AgentDetectionStatus = Record<string, AgentDetectionInfo>;

// Editor settings
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
  lineHeight: number;
  fontLigatures: boolean;
  // Padding
  paddingTop: number;
  paddingBottom: number;
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

// Status Line display field settings
export interface StatusLineFieldSettings {
  model: boolean;
  context: boolean;
  cost: boolean;
  duration: boolean;
  lines: boolean;
  tokens: boolean; // Input/Output tokens
  cache: boolean; // Cache hit tokens
  apiTime: boolean; // API duration vs total duration
  currentDir: boolean; // Current working directory
  projectDir: boolean; // Project directory
  version: boolean; // Claude version
}

// Claude Code integration settings
export interface ClaudeCodeIntegrationSettings {
  enabled: boolean;
  selectionChangedDebounce: number; // in milliseconds
  atMentionedKeybinding: TerminalKeybinding;
  stopHookEnabled: boolean; // Enable Stop hook for precise agent completion notifications
  permissionRequestHookEnabled: boolean; // Enable PermissionRequest hook for AskUserQuestion notifications
  statusLineEnabled: boolean; // Enable Status Line hook for displaying agent status
  statusLineFields: StatusLineFieldSettings; // Which fields to display in status line
  tmuxEnabled: boolean; // Enable tmux session wrapping for persistent terminal sessions
  showProviderSwitcher: boolean; // Show provider switcher in SessionBar
  enableProviderDisableFeature: boolean; // Enable/disable the provider temporary disable feature
  providers: import('@shared/types').ClaudeProvider[];
  enhancedInputEnabled: boolean; // Enable enhanced input panel for Claude Code
  enhancedInputAutoPopup: 'always' | 'hideWhileRunning' | 'manual'; // Enhanced input auto popup mode
}

// Commit message generator settings
export interface CommitMessageGeneratorSettings {
  enabled: boolean;
  maxDiffLines: number;
  timeout: number; // in seconds
  provider: AIProvider;
  model: string; // Dynamic based on provider
  reasoningEffort?: ReasoningEffort; // For Codex CLI
  prompt: string; // Custom prompt template
}

// Branch name generator settings
export interface BranchNameGeneratorSettings {
  enabled: boolean;
  provider: AIProvider;
  model: string; // Dynamic based on provider
  reasoningEffort?: ReasoningEffort; // For Codex CLI
  prompt: string;
}

// Code review settings
export interface CodeReviewSettings {
  enabled: boolean;
  provider: AIProvider;
  model: string; // Dynamic based on provider
  reasoningEffort?: ReasoningEffort; // For Codex CLI
  language: string;
  prompt: string; // Custom prompt template
}

// Validation result for code review prompt template
export interface PromptValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Hapi remote sharing settings
export type TunnelMode = 'quick' | 'auth';

export interface HapiSettings {
  enabled: boolean;
  webappPort: number;
  cliApiToken: string;
  telegramBotToken: string;
  webappUrl: string;
  allowedChatIds: string;
  // Cloudflared settings
  cfEnabled: boolean;
  tunnelMode: TunnelMode;
  tunnelToken: string;
  useHttp2: boolean;
  // Hapi runner settings
  runnerEnabled: boolean;
  // Happy settings
  happyEnabled: boolean;
}

// Quick Terminal settings
export interface QuickTerminalSettings {
  enabled: boolean;
  buttonPosition: { x: number; y: number } | null;
  modalPosition: { x: number; y: number } | null;
  modalSize: { width: number; height: number } | null;
  isOpen: boolean;
}

// Background image settings
export type BackgroundSourceType = 'file' | 'folder' | 'url';
export type BackgroundSizeMode = 'cover' | 'contain' | 'repeat' | 'center';

// Main settings state interface
export interface SettingsState {
  // UI Settings
  theme: Theme;
  layoutMode: LayoutMode;
  fileTreeDisplayMode: FileTreeDisplayMode;
  language: Locale;
  fontSize: number;
  fontFamily: string;

  // Terminal Settings
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalFontWeight: FontWeight;
  terminalFontWeightBold: FontWeight;
  terminalTheme: string;
  terminalRenderer: TerminalRenderer;
  terminalScrollback: number;
  terminalOptionIsMeta: boolean;
  copyOnSelection: boolean;

  // Keybindings
  xtermKeybindings: XtermKeybindings;
  mainTabKeybindings: MainTabKeybindings;
  sourceControlKeybindings: SourceControlKeybindings;
  searchKeybindings: SearchKeybindings;
  globalKeybindings: GlobalKeybindings;
  workspaceKeybindings: WorkspaceKeybindings;

  // Editor Settings
  editorSettings: EditorSettings;

  // Agent Settings
  agentSettings: AgentSettings;
  agentDetectionStatus: AgentDetectionStatus;
  customAgents: CustomAgent[];
  shellConfig: ShellConfig;
  agentNotificationEnabled: boolean;
  agentNotificationDelay: number; // in seconds
  agentNotificationEnterDelay: number; // delay after Enter before starting idle timer

  // Claude Code Integration
  claudeCodeIntegration: ClaudeCodeIntegrationSettings;

  // AI Features
  commitMessageGenerator: CommitMessageGeneratorSettings;
  codeReview: CodeReviewSettings;
  branchNameGenerator: BranchNameGeneratorSettings;

  // App Settings
  autoUpdateEnabled: boolean;
  hapiSettings: HapiSettings;
  defaultWorktreePath: string; // Default path for creating worktrees
  proxySettings: ProxySettings;
  autoCreateSessionOnActivate: boolean; // Auto-create agent/terminal session when worktree becomes active

  // Beta features
  glowEffectEnabled: boolean; // Enable glow animation effect for AI output states (Beta)
  temporaryWorkspaceEnabled: boolean; // Enable Temp Session (Beta)
  defaultTemporaryPath: string; // Default path for temp sessions
  autoCreateSessionOnTempActivate: boolean; // Auto-create agent/terminal session when temp session becomes active

  // Background image (Beta)
  backgroundImageEnabled: boolean;
  backgroundImagePath: string; // Local file path (for file mode)
  backgroundUrlPath: string; // Remote URL path (for url mode)
  backgroundFolderPath: string; // Local folder path (for folder mode)
  backgroundSourceType: BackgroundSourceType; // Source type: single file, folder, or remote URL
  backgroundRandomEnabled: boolean; // Auto-random: periodically refresh folder/URL source
  backgroundRandomInterval: number; // Auto-random interval in seconds (default 300)
  backgroundOpacity: number; // 0-1, background image opacity
  backgroundBlur: number; // 0-20, blur px
  backgroundBrightness: number; // 0-2, CSS brightness filter (1 = normal)
  backgroundSaturation: number; // 0-2, CSS saturate filter (1 = normal)
  backgroundSizeMode: BackgroundSizeMode;
  _backgroundRefreshKey: number; // Transient: trigger folder re-scan (not persisted)

  // MCP, Prompts management
  mcpServers: McpServer[];
  promptPresets: PromptPreset[];

  // Settings display mode
  settingsDisplayMode: SettingsDisplayMode;
  settingsModalPosition: { x: number; y: number } | null;

  // Terminal theme favorites
  favoriteTerminalThemes: string[];

  // Quick Terminal settings
  quickTerminal: QuickTerminalSettings;

  // Web Inspector settings
  webInspectorEnabled: boolean;

  // Hide Groups setting
  hideGroups: boolean;

  // Logging
  loggingEnabled: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  logRetentionDays: number; // How many days to keep log files (1-30)

  // Setters - UI
  setTheme: (theme: Theme) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setFileTreeDisplayMode: (mode: FileTreeDisplayMode) => void;
  setLanguage: (language: Locale) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;

  // Setters - Terminal
  setTerminalFontSize: (size: number) => void;
  setTerminalFontFamily: (family: string) => void;
  setTerminalFontWeight: (weight: FontWeight) => void;
  setTerminalFontWeightBold: (weight: FontWeight) => void;
  setTerminalTheme: (theme: string) => void;
  setTerminalRenderer: (renderer: TerminalRenderer) => void;
  setTerminalScrollback: (scrollback: number) => void;
  setTerminalOptionIsMeta: (enabled: boolean) => void;
  setCopyOnSelection: (enabled: boolean) => void;

  // Setters - Keybindings
  setXtermKeybindings: (keybindings: XtermKeybindings) => void;
  setMainTabKeybindings: (keybindings: MainTabKeybindings) => void;
  setSourceControlKeybindings: (keybindings: SourceControlKeybindings) => void;
  setSearchKeybindings: (keybindings: SearchKeybindings) => void;
  setGlobalKeybindings: (keybindings: GlobalKeybindings) => void;
  setWorkspaceKeybindings: (keybindings: WorkspaceKeybindings) => void;

  // Setters - Editor
  setEditorSettings: (settings: Partial<EditorSettings>) => void;

  // Setters - Agent
  setAgentEnabled: (agentId: string, enabled: boolean) => void;
  setAgentDefault: (agentId: string) => void;
  setAgentCustomConfig: (
    agentId: string,
    config: { customPath?: string; customArgs?: string }
  ) => void;
  setAgentDetectionStatus: (agentId: string, info: AgentDetectionInfo) => void;
  clearAgentDetectionStatus: (agentId: string) => void;
  addCustomAgent: (agent: CustomAgent) => void;
  updateCustomAgent: (id: string, updates: Partial<CustomAgent>) => void;
  removeCustomAgent: (id: string) => void;
  setShellConfig: (config: ShellConfig) => void;
  setAgentNotificationEnabled: (enabled: boolean) => void;
  setAgentNotificationDelay: (delay: number) => void;
  setAgentNotificationEnterDelay: (delay: number) => void;

  // Setters - Claude Code Integration
  setClaudeCodeIntegration: (settings: Partial<ClaudeCodeIntegrationSettings>) => void;
  addClaudeProvider: (provider: import('@shared/types').ClaudeProvider) => void;
  updateClaudeProvider: (
    id: string,
    updates: Partial<import('@shared/types').ClaudeProvider>
  ) => void;
  removeClaudeProvider: (id: string) => void;
  reorderClaudeProviders: (fromIndex: number, toIndex: number) => void;
  setClaudeProviderEnabled: (id: string, enabled: boolean) => void;
  setClaudeProviderOrder: (providers: import('@shared/types').ClaudeProvider[]) => void;

  // Setters - AI Features
  setCommitMessageGenerator: (settings: Partial<CommitMessageGeneratorSettings>) => void;
  setCodeReview: (settings: Partial<CodeReviewSettings>) => void;
  setBranchNameGenerator: (settings: Partial<BranchNameGeneratorSettings>) => void;

  // Setters - App
  setAutoUpdateEnabled: (enabled: boolean) => void;
  setHapiSettings: (settings: Partial<HapiSettings>) => void;
  setDefaultWorktreePath: (path: string) => void;
  setProxySettings: (settings: Partial<ProxySettings>) => void;
  setAutoCreateSessionOnActivate: (enabled: boolean) => void;

  // Setters - Beta features
  setGlowEffectEnabled: (enabled: boolean) => void;
  setTemporaryWorkspaceEnabled: (enabled: boolean) => void;
  setDefaultTemporaryPath: (path: string) => void;
  setAutoCreateSessionOnTempActivate: (enabled: boolean) => void;

  // Setters - Background image
  setBackgroundImageEnabled: (enabled: boolean) => void;
  setBackgroundImagePath: (path: string) => void;
  setBackgroundUrlPath: (path: string) => void;
  setBackgroundFolderPath: (path: string) => void;
  setBackgroundSourceType: (type: BackgroundSourceType) => void;
  setBackgroundRandomEnabled: (enabled: boolean) => void;
  setBackgroundRandomInterval: (interval: number) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setBackgroundBlur: (blur: number) => void;
  setBackgroundBrightness: (brightness: number) => void;
  setBackgroundSaturation: (saturation: number) => void;
  setBackgroundSizeMode: (mode: BackgroundSizeMode) => void;
  triggerBackgroundRefresh: () => void;

  // Setters - MCP
  addMcpServer: (server: McpServer) => void;
  updateMcpServer: (id: string, updates: Partial<McpServer>) => void;
  removeMcpServer: (id: string) => void;
  setMcpServerEnabled: (id: string, enabled: boolean) => void;

  // Setters - Prompts
  addPromptPreset: (preset: PromptPreset) => void;
  updatePromptPreset: (id: string, updates: Partial<PromptPreset>) => void;
  removePromptPreset: (id: string) => void;
  setPromptPresetEnabled: (id: string) => void;

  // Setters - Settings display
  setSettingsDisplayMode: (mode: SettingsDisplayMode) => void;
  setSettingsModalPosition: (position: { x: number; y: number } | null) => void;

  // Setters - Terminal theme favorites
  addFavoriteTerminalTheme: (theme: string) => void;
  removeFavoriteTerminalTheme: (theme: string) => void;
  toggleFavoriteTerminalTheme: (theme: string) => void;

  // Setters - Quick Terminal
  setQuickTerminalEnabled: (enabled: boolean) => void;
  setQuickTerminalButtonPosition: (position: { x: number; y: number } | null) => void;
  setQuickTerminalModalPosition: (position: { x: number; y: number } | null) => void;
  setQuickTerminalModalSize: (size: { width: number; height: number } | null) => void;
  setQuickTerminalOpen: (open: boolean) => void;

  // Setters - Web Inspector
  setWebInspectorEnabled: (enabled: boolean) => void;

  // Setters - Other
  setHideGroups: (hide: boolean) => void;

  // Setters - Logging
  setLoggingEnabled: (enabled: boolean) => void;
  setLogLevel: (level: 'error' | 'warn' | 'info' | 'debug') => void;
  setLogRetentionDays: (days: number) => void;
}

// Re-export types from @shared/types
export type { AIProvider, ReasoningEffort } from '@shared/types';

// Builtin agent IDs
export const BUILTIN_AGENT_IDS: BuiltinAgentId[] = [
  'claude',
  'codex',
  'droid',
  'gemini',
  'auggie',
  'cursor',
  'opencode',
];
