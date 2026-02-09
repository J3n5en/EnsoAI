import type { Locale } from '@shared/i18n';
import { normalizeLocale } from '@shared/i18n';
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

function applyInitialSettings(state: {
  theme: Theme;
  terminalTheme: string;
  terminalFontFamily: string;
  terminalFontSize: number;
  language: Locale;
}) {
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

export type Theme = 'light' | 'dark' | 'system' | 'sync-terminal';

export type LayoutMode = 'columns' | 'tree';

export type SettingsDisplayMode = 'tab' | 'draggable-modal';

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

export type TerminalRenderer = 'dom' | 'webgl';

export interface AgentConfig {
  enabled: boolean;
  isDefault: boolean;
  /** Custom absolute path to the agent CLI (overrides default command lookup) */
  customPath?: string;
  /** Additional arguments to pass to the agent CLI */
  customArgs?: string;
}

export type AgentSettings = Record<string, AgentConfig>;

// Agent detection status (persisted)
export interface AgentDetectionInfo {
  installed: boolean;
  version?: string;
  detectedAt: number; // timestamp
}

export type AgentDetectionStatus = Record<string, AgentDetectionInfo>;

export const BUILTIN_AGENT_IDS: BuiltinAgentId[] = [
  'claude',
  'codex',
  'droid',
  'gemini',
  'auggie',
  'cursor',
  'opencode',
];

// Quick Terminal settings
export interface QuickTerminalSettings {
  enabled: boolean;
  buttonPosition: { x: number; y: number } | null;
  modalPosition: { x: number; y: number } | null;
  modalSize: { width: number; height: number } | null;
  isOpen: boolean;
}

// Keybinding definition
export interface TerminalKeybinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

// Main tab switching keybindings
export interface MainTabKeybindings {
  switchToAgent: TerminalKeybinding;
  switchToFile: TerminalKeybinding;
  switchToTerminal: TerminalKeybinding;
  switchToSourceControl: TerminalKeybinding;
}

// Source control keybindings
export interface SourceControlKeybindings {
  prevDiff: TerminalKeybinding;
  nextDiff: TerminalKeybinding;
}

// Search keybindings
export interface SearchKeybindings {
  searchFiles: TerminalKeybinding;
  searchContent: TerminalKeybinding;
}

export interface GlobalKeybindings {
  runningProjects: TerminalKeybinding;
}

// Workspace panel keybindings
export interface WorkspaceKeybindings {
  toggleWorktree: TerminalKeybinding;
  toggleRepository: TerminalKeybinding;
  switchActiveWorktree: TerminalKeybinding;
}

// Unified xterm keybindings (for Terminal, Agent, and all xterm-based components)
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

export const defaultStatusLineFieldSettings: StatusLineFieldSettings = {
  model: true,
  context: true,
  cost: true,
  duration: false,
  lines: false,
  tokens: false,
  cache: false,
  apiTime: false,
  currentDir: false,
  projectDir: false,
  version: false,
};

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
}

export const defaultClaudeCodeIntegrationSettings: ClaudeCodeIntegrationSettings = {
  enabled: true,
  selectionChangedDebounce: 300,
  atMentionedKeybinding: { key: 'm', meta: true, shift: true }, // Cmd/Ctrl+Shift+M
  stopHookEnabled: true, // Enable Stop hook for precise agent completion notifications
  permissionRequestHookEnabled: true, // Enable PermissionRequest hook for AskUserQuestion notifications
  statusLineEnabled: false, // Disable Status Line hook by default
  statusLineFields: defaultStatusLineFieldSettings,
  tmuxEnabled: false, // Disable tmux wrapping by default
  showProviderSwitcher: true,
  enableProviderDisableFeature: false,
  providers: [],
};

export type { AIProvider, ReasoningEffort } from '@shared/types';

export interface CommitMessageGeneratorSettings {
  enabled: boolean;
  maxDiffLines: number;
  timeout: number; // in seconds
  provider: AIProvider;
  model: string; // Dynamic based on provider
  reasoningEffort?: ReasoningEffort; // For Codex CLI
  prompt: string; // Custom prompt template
}

// Default prompts for different languages
export const defaultCommitPromptZh = `你是一个 Git commit message 生成助手。请根据以下信息生成规范的 commit message。

要求：
1. 遵循 Conventional Commits 规范
2. 格式：<type>(<scope>): <description>
3. type 包括：feat, fix, docs, style, refactor, perf, test, chore, ci, build
4. scope 可选，表示影响范围
5. description 使用中文，简洁明了
6. 如果变更较复杂，可以添加正文说明

参考最近的提交风格：
{recent_commits}

变更摘要：
{staged_stat}

变更详情：
{staged_diff}

请直接输出 commit message，无需解释。`;

export const defaultCommitPromptEn = `You are a Git commit message generator. Generate a commit message based on the following information.

Requirements:
1. Follow Conventional Commits specification
2. Format: <type>(<scope>): <description>
3. Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build
4. Scope is optional, indicates the affected area
5. Description should be concise and clear
6. Add body for complex changes

Reference recent commit style:
{recent_commits}

Changes summary:
{staged_stat}

Changes detail:
{staged_diff}

Output the commit message directly, no explanation needed.`;

export const defaultCommitMessageGeneratorSettings: CommitMessageGeneratorSettings = {
  enabled: true,
  maxDiffLines: 1000,
  timeout: 120,
  provider: 'claude-code',
  model: 'haiku',
  prompt: defaultCommitPromptZh,
};

export interface CodeReviewSettings {
  enabled: boolean;
  provider: AIProvider;
  model: string; // Dynamic based on provider
  reasoningEffort?: ReasoningEffort; // For Codex CLI
  language: string;
}

export const defaultCodeReviewSettings: CodeReviewSettings = {
  enabled: true,
  provider: 'claude-code',
  model: 'haiku',
  language: '中文',
};

export interface BranchNameGeneratorSettings {
  enabled: boolean;
  provider: AIProvider;
  model: string; // Dynamic based on provider
  reasoningEffort?: ReasoningEffort; // For Codex CLI
  prompt: string;
}

export const defaultBranchNameGeneratorSettings: BranchNameGeneratorSettings = {
  enabled: false,
  provider: 'claude-code',
  model: 'haiku',
  prompt:
    '你是 Git 分支命名助手（不可用工具）。输入含 desc 可含 date/branch_style。任务：从 desc 判定 type、提取 ticket、生成 slug，按模板渲染分支名。只输出一行分支名，无解释无标点。\n\n约束：仅允许 a-z0-9-/.；全小写；词用 -；禁空格/中文/下划线/其他符号。渲染后：-// 连续压缩为 1；去掉首尾 - / .；空变量不产生多余分隔符。\n\nticket：识别 ABC-123/#456/issue 789 等 → 小写，去 #；若存在则置于 slug 最前（形成 ticket-slug）。\n\nslug：取核心关键词 3–8 词，过滤泛词（如：一下/相关/进行/支持/增加/优化/问题/功能/页面/接口/调整/更新/修改等）；必要时将中文概念转换为常见英文词（如 login/order/pay），无法转换则丢弃。\n\ntype 枚举：feat fix hotfix perf refactor docs test chore ci build 判定优先级：hotfix(紧急/回滚/prod) > perf(性能) > fix(bug/修复) > feat(新增) > refactor(结构不变) > docs > test > ci > build > chore(兜底)。\n\ndate: 格式为 yyyyMMdd\n\n输出格式：{type}-{date}-{slug}\n\ndate: {current_date}\ntime: {current_time}\ndesc：{description}',
};

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
  // Happy settings
  happyEnabled: boolean;
}

export const defaultHapiSettings: HapiSettings = {
  enabled: false,
  webappPort: 3006,
  cliApiToken: '',
  telegramBotToken: '',
  webappUrl: '',
  allowedChatIds: '',
  // Cloudflared defaults
  cfEnabled: false,
  tunnelMode: 'quick',
  tunnelToken: '',
  useHttp2: true,
  // Happy defaults
  happyEnabled: false,
};

// Proxy settings default
export const defaultProxySettings: ProxySettings = {
  enabled: false,
  server: '',
  bypassList: 'localhost,127.0.0.1',
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
  lineHeight: 20,
  fontLigatures: true,
  // Padding
  paddingTop: 12,
  paddingBottom: 12,
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

export const defaultXtermKeybindings: XtermKeybindings = {
  newTab: { key: 't', meta: true },
  closeTab: { key: 'w', meta: true },
  nextTab: { key: ']', meta: true },
  prevTab: { key: '[', meta: true },
  split: { key: 'd', meta: true },
  merge: { key: 'd', meta: true, shift: true },
  clear: { key: 'r', meta: true },
};

export const defaultMainTabKeybindings: MainTabKeybindings = {
  switchToAgent: { key: '1', ctrl: true },
  switchToFile: { key: '2', ctrl: true },
  switchToTerminal: { key: '3', ctrl: true },
  switchToSourceControl: { key: '4', ctrl: true },
};

export const defaultSourceControlKeybindings: SourceControlKeybindings = {
  prevDiff: { key: 'F7' },
  nextDiff: { key: 'F8' },
};

export const defaultSearchKeybindings: SearchKeybindings = {
  searchFiles: { key: 'p', meta: true },
  searchContent: { key: 'f', meta: true, shift: true },
};

export const defaultGlobalKeybindings: GlobalKeybindings = {
  runningProjects: { key: 'l', meta: true },
};

export const defaultWorkspaceKeybindings: WorkspaceKeybindings = {
  toggleWorktree: { key: 'w', meta: true, shift: true },
  toggleRepository: { key: 'r', meta: true, shift: true },
  switchActiveWorktree: { key: 'CapsLock', ctrl: true },
};

interface SettingsState {
  theme: Theme;
  layoutMode: LayoutMode;
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
  terminalOptionIsMeta: boolean;
  xtermKeybindings: XtermKeybindings;
  mainTabKeybindings: MainTabKeybindings;
  sourceControlKeybindings: SourceControlKeybindings;
  searchKeybindings: SearchKeybindings;
  globalKeybindings: GlobalKeybindings;
  workspaceKeybindings: WorkspaceKeybindings;
  editorSettings: EditorSettings;
  agentSettings: AgentSettings;
  agentDetectionStatus: AgentDetectionStatus;
  customAgents: CustomAgent[];
  shellConfig: ShellConfig;
  agentNotificationEnabled: boolean;
  agentNotificationDelay: number; // in seconds
  agentNotificationEnterDelay: number; // delay after Enter before starting idle timer
  claudeCodeIntegration: ClaudeCodeIntegrationSettings;
  commitMessageGenerator: CommitMessageGeneratorSettings;
  codeReview: CodeReviewSettings;
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
  backgroundSourceType: 'file' | 'folder' | 'url'; // Source type: single file, folder, or remote URL
  backgroundRandomEnabled: boolean; // Auto-random: periodically refresh folder/URL source
  backgroundRandomInterval: number; // Auto-random interval in seconds (default 300)
  backgroundOpacity: number; // 0-1, background image opacity
  backgroundBlur: number; // 0-20, blur px
  backgroundBrightness: number; // 0-2, CSS brightness filter (1 = normal)
  backgroundSaturation: number; // 0-2, CSS saturate filter (1 = normal)
  backgroundSizeMode: 'cover' | 'contain' | 'repeat' | 'center';
  _backgroundRefreshKey: number; // Transient: trigger folder re-scan (not persisted)
  // MCP, Prompts management
  mcpServers: McpServer[];
  promptPresets: PromptPreset[];
  // Branch name generator
  branchNameGenerator: BranchNameGeneratorSettings;
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
  // Copy on Selection
  copyOnSelection: boolean;

  setTheme: (theme: Theme) => void;
  setLayoutMode: (mode: LayoutMode) => void;
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
  setTerminalOptionIsMeta: (enabled: boolean) => void;
  setXtermKeybindings: (keybindings: XtermKeybindings) => void;
  setMainTabKeybindings: (keybindings: MainTabKeybindings) => void;
  setSourceControlKeybindings: (keybindings: SourceControlKeybindings) => void;
  setSearchKeybindings: (keybindings: SearchKeybindings) => void;
  setGlobalKeybindings: (keybindings: GlobalKeybindings) => void;
  setWorkspaceKeybindings: (keybindings: WorkspaceKeybindings) => void;
  setEditorSettings: (settings: Partial<EditorSettings>) => void;
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
  setCommitMessageGenerator: (settings: Partial<CommitMessageGeneratorSettings>) => void;
  setCodeReview: (settings: Partial<CodeReviewSettings>) => void;
  setAutoUpdateEnabled: (enabled: boolean) => void;
  setHapiSettings: (settings: Partial<HapiSettings>) => void;
  setDefaultWorktreePath: (path: string) => void;
  setProxySettings: (settings: Partial<ProxySettings>) => void;
  setAutoCreateSessionOnActivate: (enabled: boolean) => void;
  // Beta features
  setGlowEffectEnabled: (enabled: boolean) => void;
  setTemporaryWorkspaceEnabled: (enabled: boolean) => void;
  setDefaultTemporaryPath: (path: string) => void;
  setAutoCreateSessionOnTempActivate: (enabled: boolean) => void;
  // Background image methods
  setBackgroundImageEnabled: (enabled: boolean) => void;
  setBackgroundImagePath: (path: string) => void;
  setBackgroundUrlPath: (path: string) => void;
  setBackgroundFolderPath: (path: string) => void;
  setBackgroundSourceType: (type: 'file' | 'folder' | 'url') => void;
  setBackgroundRandomEnabled: (enabled: boolean) => void;
  setBackgroundRandomInterval: (interval: number) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setBackgroundBlur: (blur: number) => void;
  setBackgroundBrightness: (brightness: number) => void;
  setBackgroundSaturation: (saturation: number) => void;
  setBackgroundSizeMode: (mode: 'cover' | 'contain' | 'repeat' | 'center') => void;
  triggerBackgroundRefresh: () => void;
  // MCP management
  addMcpServer: (server: McpServer) => void;
  updateMcpServer: (id: string, updates: Partial<McpServer>) => void;
  removeMcpServer: (id: string) => void;
  setMcpServerEnabled: (id: string, enabled: boolean) => void;
  // Prompts management
  addPromptPreset: (preset: PromptPreset) => void;
  updatePromptPreset: (id: string, updates: Partial<PromptPreset>) => void;
  removePromptPreset: (id: string) => void;
  setPromptPresetEnabled: (id: string) => void;
  // Branch name generator
  setBranchNameGenerator: (settings: Partial<BranchNameGeneratorSettings>) => void;
  // Settings display mode
  setSettingsDisplayMode: (mode: SettingsDisplayMode) => void;
  setSettingsModalPosition: (position: { x: number; y: number } | null) => void;
  // Terminal theme favorites
  addFavoriteTerminalTheme: (theme: string) => void;
  removeFavoriteTerminalTheme: (theme: string) => void;
  toggleFavoriteTerminalTheme: (theme: string) => void;
  // Quick Terminal methods
  setQuickTerminalEnabled: (enabled: boolean) => void;
  setQuickTerminalButtonPosition: (position: { x: number; y: number } | null) => void;
  setQuickTerminalModalPosition: (position: { x: number; y: number } | null) => void;
  setQuickTerminalModalSize: (size: { width: number; height: number } | null) => void;
  setQuickTerminalOpen: (open: boolean) => void;
  // Web Inspector methods
  setWebInspectorEnabled: (enabled: boolean) => void;
  // Hide Groups method
  setHideGroups: (hide: boolean) => void;
  // Copy on Selection
  setCopyOnSelection: (enabled: boolean) => void;
}

const defaultAgentSettings: AgentSettings = {
  claude: { enabled: true, isDefault: true },
  codex: { enabled: false, isDefault: false },
  droid: { enabled: false, isDefault: false },
  gemini: { enabled: false, isDefault: false },
  auggie: { enabled: false, isDefault: false },
  cursor: { enabled: false, isDefault: false },
  opencode: { enabled: false, isDefault: false },
};

// No default detection status - all agents need to be detected
const defaultAgentDetectionStatus: AgentDetectionStatus = {};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      layoutMode: 'tree',
      language: getDefaultLocale(),
      fontSize: 14,
      fontFamily: 'Inter',
      terminalFontSize: 18,
      terminalFontFamily: 'ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace',
      terminalFontWeight: 'normal',
      terminalFontWeightBold: '500',
      terminalTheme: 'Dracula',
      terminalRenderer: 'dom',
      terminalScrollback: 10000,
      terminalOptionIsMeta: true,
      xtermKeybindings: defaultXtermKeybindings,
      mainTabKeybindings: defaultMainTabKeybindings,
      sourceControlKeybindings: defaultSourceControlKeybindings,
      searchKeybindings: defaultSearchKeybindings,
      globalKeybindings: defaultGlobalKeybindings,
      workspaceKeybindings: defaultWorkspaceKeybindings,
      editorSettings: defaultEditorSettings,
      agentSettings: defaultAgentSettings,
      agentDetectionStatus: defaultAgentDetectionStatus,
      customAgents: [],
      shellConfig: {
        // Use PowerShell 5.x as default on Windows (always available)
        // PowerShell 7 (pwsh.exe) requires separate installation
        shellType: window.electronAPI?.env.platform === 'win32' ? 'powershell' : 'system',
      },
      agentNotificationEnabled: true,
      agentNotificationDelay: 5, // 5 seconds
      agentNotificationEnterDelay: 5, // 5 seconds delay after Enter before starting idle timer
      claudeCodeIntegration: defaultClaudeCodeIntegrationSettings,
      commitMessageGenerator: defaultCommitMessageGeneratorSettings,
      codeReview: defaultCodeReviewSettings,
      autoUpdateEnabled: true,
      hapiSettings: defaultHapiSettings,
      defaultWorktreePath: '', // Empty means use default ~/ensoai/workspaces
      proxySettings: defaultProxySettings,
      autoCreateSessionOnActivate: false, // Default: don't auto-create sessions
      // Beta features
      glowEffectEnabled: false, // Default: disabled, use classic dot indicator
      temporaryWorkspaceEnabled: false,
      defaultTemporaryPath: '', // Empty means use default ~/ensoai/temporary
      autoCreateSessionOnTempActivate: false,
      // Background image defaults
      backgroundImageEnabled: false,
      backgroundImagePath: '',
      backgroundUrlPath: '',
      backgroundFolderPath: '',
      backgroundSourceType: 'file',
      backgroundRandomEnabled: false,
      backgroundRandomInterval: 300,
      backgroundOpacity: 0.85,
      backgroundBlur: 0,
      backgroundBrightness: 1,
      backgroundSaturation: 1,
      backgroundSizeMode: 'cover',
      _backgroundRefreshKey: 0,
      // MCP, Prompts defaults
      mcpServers: [],
      promptPresets: [],
      branchNameGenerator: defaultBranchNameGeneratorSettings,
      // Settings display mode
      settingsDisplayMode: 'tab', // 默认使用 Tab 模式（保持向后兼容）
      settingsModalPosition: null, // 首次打开居中
      // Terminal theme favorites
      favoriteTerminalThemes: [],
      // Quick Terminal defaults
      quickTerminal: {
        enabled: true,
        buttonPosition: null,
        modalPosition: null,
        modalSize: null,
        isOpen: false,
      },
      // Web Inspector defaults
      webInspectorEnabled: false,
      // Hide Groups default
      hideGroups: false,
      // Copy on Selection default
      copyOnSelection: false,

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
      setTerminalOptionIsMeta: (terminalOptionIsMeta) => set({ terminalOptionIsMeta }),
      setXtermKeybindings: (xtermKeybindings) => set({ xtermKeybindings }),
      setMainTabKeybindings: (mainTabKeybindings) => set({ mainTabKeybindings }),
      setSourceControlKeybindings: (sourceControlKeybindings) => set({ sourceControlKeybindings }),
      setSearchKeybindings: (searchKeybindings) => set({ searchKeybindings }),
      setGlobalKeybindings: (globalKeybindings) => set({ globalKeybindings }),
      setWorkspaceKeybindings: (workspaceKeybindings) => set({ workspaceKeybindings }),
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
          // 更新 displayOrder
          const reordered = providers.map((p, index) => ({ ...p, displayOrder: index }));
          return {
            claudeCodeIntegration: {
              ...state.claudeCodeIntegration,
              providers: reordered,
            },
          };
        }),
      setClaudeProviderOrder: (providers) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: providers.map((p, index) => ({ ...p, displayOrder: index })),
          },
        })),
      setClaudeProviderEnabled: (id, enabled) =>
        set((state) => ({
          claudeCodeIntegration: {
            ...state.claudeCodeIntegration,
            providers: state.claudeCodeIntegration.providers.map((p) =>
              p.id === id ? { ...p, enabled } : p
            ),
          },
        })),
      setCommitMessageGenerator: (settings) =>
        set((state) => ({
          commitMessageGenerator: { ...state.commitMessageGenerator, ...settings },
        })),
      setCodeReview: (settings) =>
        set((state) => ({
          codeReview: { ...state.codeReview, ...settings },
        })),
      setAutoUpdateEnabled: (autoUpdateEnabled) => {
        set({ autoUpdateEnabled });
        window.electronAPI.updater.setAutoUpdateEnabled(autoUpdateEnabled);
      },
      setHapiSettings: (settings) =>
        set((state) => ({
          hapiSettings: { ...state.hapiSettings, ...settings },
        })),
      setDefaultWorktreePath: (defaultWorktreePath) => set({ defaultWorktreePath }),
      setProxySettings: (settings) => {
        set((state) => ({
          proxySettings: { ...state.proxySettings, ...settings },
        }));
        // Notify main process to apply proxy settings
        const newSettings = { ...get().proxySettings, ...settings };
        window.electronAPI.app.setProxy(newSettings);
      },
      setAutoCreateSessionOnActivate: (autoCreateSessionOnActivate) =>
        set({ autoCreateSessionOnActivate }),
      // Beta features
      setGlowEffectEnabled: (glowEffectEnabled) => set({ glowEffectEnabled }),
      setTemporaryWorkspaceEnabled: (temporaryWorkspaceEnabled) =>
        set({ temporaryWorkspaceEnabled }),
      setDefaultTemporaryPath: (defaultTemporaryPath) => set({ defaultTemporaryPath }),
      setAutoCreateSessionOnTempActivate: (autoCreateSessionOnTempActivate) =>
        set({ autoCreateSessionOnTempActivate }),
      // Background image methods
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
        const safeValue = Number.isFinite(backgroundBlur)
          ? backgroundBlur
          : get().backgroundBlur;
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
      // MCP management
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
      // Prompts management
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
      setBranchNameGenerator: (settings) =>
        set((state) => ({
          branchNameGenerator: { ...state.branchNameGenerator, ...settings },
        })),
      // Settings display mode
      setSettingsDisplayMode: (mode) => {
        set({ settingsDisplayMode: mode });
      },
      setSettingsModalPosition: (position) => {
        set({ settingsModalPosition: position });
      },
      // Terminal theme favorites
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
      // Quick Terminal methods
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
      // Web Inspector methods
      setWebInspectorEnabled: async (enabled) => {
        set({ webInspectorEnabled: enabled });
        // Notify main process to start/stop Web Inspector server
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
      // Hide Groups method
      setHideGroups: (hideGroups) => set({ hideGroups }),
      // Copy on Selection
      setCopyOnSelection: (copyOnSelection) => set({ copyOnSelection }),
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
        const persisted = persistedState as Partial<SettingsState>;

        const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
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
        };

        const sanitizeBoolean = (value: unknown, fallback: boolean) =>
          typeof value === 'boolean' ? value : fallback;

        const sanitizeString = (value: unknown, fallback: string) =>
          (typeof value === 'string' ? value : fallback);

        const sizeModes: SettingsState['backgroundSizeMode'][] = ['cover', 'contain', 'repeat', 'center'];
        const sanitizeSizeMode = (
          value: unknown,
          fallback: SettingsState['backgroundSizeMode']
        ): SettingsState['backgroundSizeMode'] =>
          sizeModes.includes(value as SettingsState['backgroundSizeMode'])
            ? (value as SettingsState['backgroundSizeMode'])
            : fallback;

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
        const sourceTypes: SettingsState['backgroundSourceType'][] = ['file', 'folder', 'url'];
        const sanitizedBackgroundSourceType = sourceTypes.includes(
          persisted.backgroundSourceType as SettingsState['backgroundSourceType']
        )
          ? (persisted.backgroundSourceType as SettingsState['backgroundSourceType'])
          : currentState.backgroundSourceType;
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
        const sanitizedBackgroundSizeMode = sanitizeSizeMode(
          persisted.backgroundSizeMode,
          currentState.backgroundSizeMode
        );

        // Migrate legacy 'canvas' renderer to 'webgl' (canvas support was removed)
        // Cast to string for comparison since persisted data may contain old values
        const terminalRenderer =
          (persisted.terminalRenderer as string) === 'canvas'
            ? 'webgl'
            : persisted.terminalRenderer;

        return {
          ...currentState,
          ...persisted,
          // Override with migrated value
          ...(terminalRenderer && { terminalRenderer }),
          // TODO: Remove this entire xtermKeybindings migration block after v1.0 release
          // Legacy fields: terminalKeybindings, agentKeybindings, terminalPaneKeybindings
          xtermKeybindings: (() => {
            // If user has already saved xtermKeybindings, use it directly (no legacy migration)
            if (persisted.xtermKeybindings) {
              return {
                ...currentState.xtermKeybindings,
                ...persisted.xtermKeybindings,
              };
            }

            // Legacy migration: only runs when xtermKeybindings doesn't exist yet
            const filterDefined = <T extends object>(obj: T): Partial<T> =>
              Object.fromEntries(
                Object.entries(obj).filter(([, v]) => v !== undefined)
              ) as Partial<T>;

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
          })(),
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
          claudeCodeIntegration: {
            ...currentState.claudeCodeIntegration,
            ...persisted.claudeCodeIntegration,
            statusLineFields: {
              ...currentState.claudeCodeIntegration.statusLineFields,
              ...persisted.claudeCodeIntegration?.statusLineFields,
            },
          },
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
          // Only keep detection status for enabled agents
          agentDetectionStatus: Object.fromEntries(
            Object.entries({
              ...currentState.agentDetectionStatus,
              ...persisted.agentDetectionStatus,
            }).filter(([agentId]) => {
              const agentConfig =
                persisted.agentSettings?.[agentId] ?? currentState.agentSettings[agentId];
              return agentConfig?.enabled;
            })
          ),
          // MCP, Prompts - use persisted or defaults
          mcpServers: persisted.mcpServers ?? currentState.mcpServers,
          promptPresets: persisted.promptPresets ?? currentState.promptPresets,
          // Quick Terminal - deep merge with defaults
          quickTerminal: {
            ...currentState.quickTerminal,
            ...persisted.quickTerminal,
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        const effectiveState = state ?? useSettingsStore.getState();
        applyInitialSettings(effectiveState);

        // 监听系统主题变化，当用户选择"跟随系统"时自动切换
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', () => {
          const currentState = useSettingsStore.getState();
          if (currentState.theme === 'system') {
            applyAppTheme('system', currentState.terminalTheme);
          }
        });

        if (state) {
          if (state.proxySettings) {
            window.electronAPI.app.setProxy(state.proxySettings);
          }

          // Auto-start Web Inspector server if it was enabled
          if (state.webInspectorEnabled) {
            window.electronAPI.webInspector.start().catch((error) => {
              console.error('[WebInspector] Failed to auto-start:', error);
            });
          }

          // TODO: Remove this cleanup block after v1.0 release (along with xtermKeybindings migration)
          window.electronAPI.settings.read().then((data) => {
            if (data && typeof data === 'object') {
              const settingsData = data as Record<string, unknown>;
              const ensoSettings = settingsData['enso-settings'] as
                | { state?: Record<string, unknown> }
                | undefined;
              if (ensoSettings?.state) {
                const legacyFields = [
                  'terminalKeybindings',
                  'agentKeybindings',
                  'terminalPaneKeybindings',
                ];
                const hasLegacy = legacyFields.some((f) => f in ensoSettings.state!);
                if (hasLegacy) {
                  for (const field of legacyFields) {
                    delete ensoSettings.state[field];
                  }
                  window.electronAPI.settings.write(settingsData);
                }
              }
            }
          });

          // Auto-detect best shell on Windows for new users
          // Only run once: check localStorage flag to avoid overwriting user's explicit choice
          const shellAutoDetectKey = 'enso-shell-auto-detected';
          if (
            window.electronAPI?.env?.platform === 'win32' &&
            !localStorage.getItem(shellAutoDetectKey)
          ) {
            localStorage.setItem(shellAutoDetectKey, 'true');
            // Async detection: upgrade to PowerShell 7 if available
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
