import type { ProxySettings } from '@shared/types';
import type {
  AgentDetectionStatus,
  AgentSettings,
  BranchNameGeneratorSettings,
  ClaudeCodeIntegrationSettings,
  CodeReviewSettings,
  CommitMessageGeneratorSettings,
  EditorSettings,
  GlobalKeybindings,
  HapiSettings,
  MainTabKeybindings,
  QuickTerminalSettings,
  SearchKeybindings,
  SourceControlKeybindings,
  StatusLineFieldSettings,
  WorkspaceKeybindings,
  XtermKeybindings,
} from './types';

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

export const defaultCodeReviewPromptZh = `请始终使用 {language} 回复。你正在对当前分支的变更进行代码审查。

## 代码审查指南

下面提供了该分支的完整 git diff 以及所有提交记录。

**关键提示：你需要的所有信息都已经在下方提供。** 完整的 git diff 和提交历史都包含在此消息中。

**请勿运行 git diff、git log、git status 或任何其他 git 命令。** 你进行审查所需的所有信息都已在此处。

审查 diff 时请：
1. **关注逻辑和正确性** - 检查 bug、边界情况和潜在问题。
2. **考虑可读性** - 代码是否清晰易维护？是否遵循了本仓库的最佳实践？
3. **评估性能** - 是否存在明显的性能问题或可优化之处？
4. **评估测试覆盖率** - 该仓库是否有测试模式？如果有，这些变更是否有足够的测试？
5. **提出澄清问题** - 如果你对变更不确定或需要更多上下文，请向用户询问。
6. **不要过于吹毛求疵** - 细节问题可以提，但仅限于合理范围内的相关问题。

输出格式：
- 提供代码整体质量的概览摘要。
- 将发现问题以表格形式呈现，包含以下列：序号（1, 2, 等）、行号、代码、问题、潜在解决方案。
- 如果没有发现问题，简要说明代码符合最佳实践。

## 完整的 Diff

**再次提醒：直接输出结果，请勿通过工具输出、提供反馈或提问，请勿使用任何工具获取 git 信息。** 只需阅读下方的 diff 和提交历史。

{git_diff}

## 提交历史

{git_log}`;

export const defaultCodeReviewPromptEn = `Always reply in {language}. You are performing a code review on the changes in the current branch.

## Code Review Instructions

The entire git diff for this branch has been provided below, as well as a list of all commits made to this branch.

**CRITICAL: EVERYTHING YOU NEED IS ALREADY PROVIDED BELOW.** The complete git diff and full commit history are included in this message.

**DO NOT run git diff, git log, git status, or ANY other git commands.** All the information you need to perform this review is already here.

When reviewing the diff:
1. **Focus on logic and correctness** - Check for bugs, edge cases, and potential issues.
2. **Consider readability** - Is the code clear and maintainable? Does it follow best practices in this repository?
3. **Evaluate performance** - Are there obvious performance concerns or optimizations that could be made?
4. **Assess test coverage** - Does the repository have testing patterns? If so, are there adequate tests for these changes?
5. **Ask clarifying questions** - Ask the user for clarification if you are unsure about the changes or need more context.
6. **Don't be overly pedantic** - Nitpicks are fine, but only if they are relevant issues within reason.

In your output:
- Provide a summary overview of the general code quality.
- Present the identified issues in a table with the columns: index (1, 2, etc.), line number(s), code, issue, and potential solution(s).
- If no issues are found, briefly state that the code meets best practices.

## Full Diff

**REMINDER: Output directly, DO NOT output, provide feedback, or ask questions via tools, DO NOT use any tools to fetch git information.** Simply read the diff and commit history that follow.

{git_diff}

## Commit History

{git_log}`;

// Default status line field settings
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

// Default Claude Code integration settings
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
  enhancedInputEnabled: false, // Disable enhanced input by default
  enhancedInputAutoPopup: 'hideWhileRunning', // Hide while running by default
};

// Default commit message generator settings
export const defaultCommitMessageGeneratorSettings: CommitMessageGeneratorSettings = {
  enabled: true,
  maxDiffLines: 1000,
  timeout: 120,
  provider: 'claude-code',
  model: 'haiku',
  prompt: defaultCommitPromptZh,
};

// Default branch name generator settings
export const defaultBranchNameGeneratorSettings: BranchNameGeneratorSettings = {
  enabled: false,
  provider: 'claude-code',
  model: 'haiku',
  prompt:
    '你是 Git 分支命名助手（不可用工具）。输入含 desc 可含 date/branch_style。任务：从 desc 判定 type、提取 ticket、生成 slug，按模板渲染分支名。只输出一行分支名，无解释无标点。\n\n约束：仅允许 a-z0-9-/.；全小写；词用 -；禁空格/中文/下划线/其他符号。渲染后：-// 连续压缩为 1；去掉首尾 - / .；空变量不产生多余分隔符。\n\nticket：识别 ABC-123/#456/issue 789 等 → 小写，去 #；若存在则置于 slug 最前（形成 ticket-slug）。\n\nslug：取核心关键词 3–8 词，过滤泛词（如：一下/相关/进行/支持/增加/优化/问题/功能/页面/接口/调整/更新/修改等）；必要时将中文概念转换为常见英文词（如 login/order/pay），无法转换则丢弃。\n\ntype 枚举：feat fix hotfix perf refactor docs test chore ci build 判定优先级：hotfix(紧急/回滚/prod) > perf(性能) > fix(bug/修复) > feat(新增) > refactor(结构不变) > docs > test > ci > build > chore(兜底)。\n\ndate: 格式为 yyyyMMdd\n\n输出格式：{type}-{date}-{slug}\n\ndate: {current_date}\ntime: {current_time}\ndesc：{description}',
};

// Default code review settings
export const defaultCodeReviewSettings: CodeReviewSettings = {
  enabled: true,
  provider: 'claude-code',
  model: 'haiku',
  language: '中文',
  prompt: defaultCodeReviewPromptZh,
};

// Default Hapi settings
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
  // Hapi runner defaults
  runnerEnabled: false,
  // Happy defaults
  happyEnabled: false,
};

// Default proxy settings
export const defaultProxySettings: ProxySettings = {
  enabled: false,
  server: '',
  bypassList: 'localhost,127.0.0.1',
};

// Default editor settings
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

// Default keybindings
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

// Default agent settings
export const defaultAgentSettings: AgentSettings = {
  claude: { enabled: true, isDefault: true },
  codex: { enabled: false, isDefault: false },
  droid: { enabled: false, isDefault: false },
  gemini: { enabled: false, isDefault: false },
  auggie: { enabled: false, isDefault: false },
  cursor: { enabled: false, isDefault: false },
  opencode: { enabled: false, isDefault: false },
};

// No default detection status - all agents need to be detected
export const defaultAgentDetectionStatus: AgentDetectionStatus = {};

// Default quick terminal settings
export const defaultQuickTerminalSettings: QuickTerminalSettings = {
  enabled: true,
  buttonPosition: null,
  modalPosition: null,
  modalSize: null,
  isOpen: false,
};

/**
 * Validate code review prompt template
 * Checks for required variables and unknown placeholders
 */
export function validateCodeReviewPrompt(template: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for empty template
  const trimmed = template.trim();
  if (!trimmed) {
    errors.push('Prompt template cannot be empty');
    return { valid: false, errors, warnings };
  }

  // Check required variables
  if (!template.includes('{git_diff}')) {
    errors.push('Missing required variable: {git_diff}');
  }

  // Check recommended variables
  if (!template.includes('{language}')) {
    warnings.push('Missing recommended variable: {language}');
  }
  if (!template.includes('{git_log}')) {
    warnings.push('Missing recommended variable: {git_log}');
  }

  // Check for unmatched braces
  const openCount = (template.match(/\{/g) || []).length;
  const closeCount = (template.match(/\}/g) || []).length;
  if (openCount !== closeCount) {
    warnings.push('Unmatched braces detected in template');
  }

  // Check for unknown variables
  const validVars = ['language', 'git_diff', 'git_log'];
  const varPattern = /\{([^}]+)\}/g;
  const matches = Array.from(template.matchAll(varPattern));

  for (const match of matches) {
    const varName = match[1];
    if (!validVars.includes(varName)) {
      warnings.push(`Unknown variable: {${varName}}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get default locale based on browser language
 */
export function getDefaultLocale(): import('@shared/i18n').Locale {
  if (typeof navigator !== 'undefined') {
    const { normalizeLocale } = require('@shared/i18n');
    return normalizeLocale(navigator.language);
  }
  return 'en';
}

/**
 * Get default shell config based on platform
 */
export function getDefaultShellConfig(): import('@shared/types').ShellConfig {
  return {
    // Use PowerShell 5.x as default on Windows (always available)
    // PowerShell 7 (pwsh.exe) requires separate installation
    shellType:
      typeof window !== 'undefined' && window.electronAPI?.env?.platform === 'win32'
        ? 'powershell'
        : 'system',
  };
}
