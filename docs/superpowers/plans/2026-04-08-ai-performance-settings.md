# AI Performance Optimization Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove hardcoded `--bare` and `--effort` CLI parameters and expose them as user-configurable global settings in the AI Settings page.

**Architecture:** Add a new `AIPerformanceSettings` type with `bareEnabled`, `effortEnabled`, and `effortLevel` fields. Store in settings state, display in AISettings.tsx, and pass to CLI spawn via IPC handlers.

**Tech Stack:** TypeScript, Zustand, React, Electron IPC

---

## File Structure

| File | Purpose |
|------|---------|
| `src/renderer/stores/settings/types.ts` | Add `AIPerformanceSettings` type |
| `src/renderer/stores/settings/defaults.ts` | Add `defaultAiPerformanceSettings` |
| `src/renderer/stores/settings/index.ts` | Add state and setter |
| `src/renderer/components/settings/AISettings.tsx` | Add UI section |
| `src/main/ipc/git.ts` | Use settings instead of hardcoded values |
| `src/main/services/ai/index.ts` | Accept and pass performance settings |

---

### Task 1: Add AIPerformanceSettings Type

**Files:**
- Modify: `src/renderer/stores/settings/types.ts:1-30`

- [ ] **Step 1: Add AIPerformanceSettings interface**

Add after the existing type imports (around line 14):

```typescript
// AI Performance Optimization Settings
export interface AIPerformanceSettings {
  bareEnabled: boolean;
  effortEnabled: boolean;
  effortLevel: ClaudeEffort;
}
```

- [ ] **Step 2: Add to SettingsState interface**

Add to `SettingsState` interface (around line 340, after `todoPolish`):

```typescript
  // AI Performance Optimization
  aiPerformance: AIPerformanceSettings;
```

- [ ] **Step 3: Add setter to SettingsState interface**

Add to the setters section (around line 470):

```typescript
  // Setters - AI Performance
  setAiPerformance: (settings: Partial<AIPerformanceSettings>) => void;
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stores/settings/types.ts
git commit -m "feat(settings): add AIPerformanceSettings type

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add Default Settings

**Files:**
- Modify: `src/renderer/stores/settings/defaults.ts:1-30`

- [ ] **Step 1: Add import for AIPerformanceSettings**

Add to imports (around line 4):

```typescript
import type {
  AIPerformanceSettings,
  // ... existing imports
} from './types';
```

- [ ] **Step 2: Add defaultAiPerformanceSettings constant**

Add after `defaultCodeReviewSettings` (around line 235):

```typescript
// Default AI performance settings
export const defaultAiPerformanceSettings: AIPerformanceSettings = {
  bareEnabled: false,
  effortEnabled: false,
  effortLevel: 'low',
};
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/settings/defaults.ts
git commit -m "feat(settings): add defaultAiPerformanceSettings

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Update Settings Store

**Files:**
- Modify: `src/renderer/stores/settings/index.ts`

- [ ] **Step 1: Import defaultAiPerformanceSettings**

Add to imports (around line 13):

```typescript
import {
  defaultAgentSettings,
  defaultAiPerformanceSettings,
  defaultBranchNameGeneratorSettings,
  // ... rest of imports
} from './defaults';
```

- [ ] **Step 2: Add import for AIPerformanceSettings type**

Add to type imports (around line 37):

```typescript
import type {
  AIPerformanceSettings,
  BackgroundSizeMode,
  // ... rest of types
} from './types';
```

- [ ] **Step 3: Add aiPerformance to initial state**

Add to `getInitialState()` return object (around line 149, after `todoPolish`):

```typescript
    // AI Performance Optimization
    aiPerformance: defaultAiPerformanceSettings,
```

- [ ] **Step 4: Add setAiPerformance setter**

Add after `setTodoPolish` (around line 471):

```typescript
      // AI Performance Setter
      setAiPerformance: (settings) =>
        set((state) => ({
          aiPerformance: { ...state.aiPerformance, ...settings },
        })),
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/settings/index.ts
git commit -m "feat(settings): add aiPerformance state and setter

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Remove Hardcoded Values from Individual Settings Defaults

**Files:**
- Modify: `src/renderer/stores/settings/defaults.ts`

- [ ] **Step 1: Remove bare and claudeEffort from defaultCommitMessageGeneratorSettings**

Change lines 169-178:

```typescript
export const defaultCommitMessageGeneratorSettings: CommitMessageGeneratorSettings = {
  enabled: true,
  maxDiffLines: 1000,
  timeout: 120,
  provider: 'claude-code',
  model: 'haiku',
  prompt: defaultCommitPromptZh,
};
```

- [ ] **Step 2: Remove bare and claudeEffort from defaultBranchNameGeneratorSettings**

Change lines 181-189:

```typescript
export const defaultBranchNameGeneratorSettings: BranchNameGeneratorSettings = {
  enabled: false,
  provider: 'claude-code',
  model: 'haiku',
  prompt:
    '你是 Git 分支命名助手（不可用工具）。输入含 desc 可含 date/branch_style。任务：从 desc 判定 type、提取 ticket、生成 slug，按模板渲染分支名。只输出一行分支名，无解释无标点。\n\n约束：仅允许 a-z0-9-/.；全小写；词用 -；禁空格/中文/下划线/其他符号。渲染后：-// 连续压缩为 1；去掉首尾 - / .；空变量不产生多余分隔符。\n\nticket：识别 ABC-123/#456/issue 789 等 → 小写，去 #；若存在则置于 slug 最前（形成 ticket-slug）。\n\nslug：取核心关键词 3–8 词，过滤泛词（如：一下/相关/进行/支持/增加/优化/问题/功能/页面/接口/调整/更新/修改等）；必要时将中文概念转换为常见英文词（如 login/order/pay），无法转换则丢弃。\n\ntype 枚举：feat fix hotfix perf refactor docs test chore ci build 判定优先级：hotfix(紧急/回滚/prod) > perf(性能) > fix(bug/修复) > feat(新增) > refactor(结构不变) > docs > test > ci > build > chore(兜底)。\n\ndate: 格式为 yyyyMMdd\n\n输出格式：{type}-{date}-{slug}\n\ndate: {current_date}\ntime: {current_time}\ndesc：{description}',
};
```

- [ ] **Step 3: Remove bare and claudeEffort from defaultTodoPolishSettings**

Change lines 215-223:

```typescript
export const defaultTodoPolishSettings: TodoPolishSettings = {
  enabled: true,
  provider: 'claude-code',
  model: 'haiku',
  timeout: 60,
  prompt: defaultTodoPolishPromptZh,
};
```

- [ ] **Step 4: Remove bare and claudeEffort from defaultCodeReviewSettings**

Change lines 226-234:

```typescript
export const defaultCodeReviewSettings: CodeReviewSettings = {
  enabled: true,
  provider: 'claude-code',
  model: 'haiku',
  language: '中文',
  prompt: defaultCodeReviewPromptZh,
};
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/settings/defaults.ts
git commit -m "refactor(settings): remove bare/effort from individual AI settings

These will now be controlled globally via aiPerformance settings

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Add UI in AISettings.tsx

**Files:**
- Modify: `src/renderer/components/settings/AISettings.tsx`

- [ ] **Step 1: Add import for ClaudeEffort type**

Add to imports (around line 13):

```typescript
import type {
  AIProvider,
  ClaudeEffort,
  defaultBranchNameGeneratorSettings,
  // ... rest
} from '@/stores/settings';
```

- [ ] **Step 2: Add EFFORT_LEVELS constant**

Add after `REASONING_EFFORTS` constant (around line 66):

```typescript
// Claude effort levels for performance optimization
const EFFORT_LEVELS: { value: ClaudeEffort; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
  { value: 'auto', label: 'Auto' },
];
```

- [ ] **Step 3: Add aiPerformance to useSettingsStore destructuring**

Modify the destructuring (around line 76):

```typescript
  const { t, locale } = useI18n();
  const {
    aiPerformance,
    setAiPerformance,
    commitMessageGenerator,
    setCommitMessageGenerator,
    codeReview,
    setCodeReview,
    branchNameGenerator,
    setBranchNameGenerator,
    todoPolish,
    setTodoPolish,
  } = useSettingsStore();
```

- [ ] **Step 4: Add Performance Optimization UI section**

Add after the "AI Features" header section (around line 144, before "Commit Message Generator"):

```tsx
      {/* Performance Optimization Section */}
      <div className="border-t pt-6">
        <div>
          <h4 className="text-base font-medium">{t('Performance Optimization')}</h4>
          <p className="text-sm text-muted-foreground">
            {t('Global settings for AI CLI performance optimization')}
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {/* Enable bare mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{t('Enable bare mode')}</span>
              <p className="text-xs text-muted-foreground">
                {t('Skip hooks, LSP, plugins for faster response')}
              </p>
            </div>
            <Switch
              checked={aiPerformance.bareEnabled}
              onCheckedChange={(checked) => setAiPerformance({ bareEnabled: checked })}
            />
          </div>

          {/* Enable effort control */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{t('Enable effort control')}</span>
              <p className="text-xs text-muted-foreground">
                {t('Control token usage vs quality balance')}
              </p>
            </div>
            <Switch
              checked={aiPerformance.effortEnabled}
              onCheckedChange={(checked) => setAiPerformance({ effortEnabled: checked })}
            />
          </div>

          {/* Effort level selector - only show when effort is enabled */}
          {aiPerformance.effortEnabled && (
            <div className="grid grid-cols-[140px_1fr] items-center gap-4">
              <span className="text-sm font-medium">{t('Effort Level')}</span>
              <div className="space-y-1.5">
                <Select
                  value={aiPerformance.effortLevel}
                  onValueChange={(v) => setAiPerformance({ effortLevel: v as ClaudeEffort })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue>
                      {EFFORT_LEVELS.find((e) => e.value === aiPerformance.effortLevel)?.label ??
                        'Low'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {EFFORT_LEVELS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('Higher effort = better quality, more tokens')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/settings/AISettings.tsx
git commit -m "feat(ui): add AI Performance Optimization settings section

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Update IPC Handlers to Use Settings

**Files:**
- Modify: `src/main/ipc/git.ts`

- [ ] **Step 1: Import settings store access**

This file is in main process, so we need to get settings from the store. Add at the top (around line 1):

```typescript
// Note: Settings are accessed via IPC from renderer, passed as parameters
// The renderer will include aiPerformance settings in the options
```

- [ ] **Step 2: Update GIT_GENERATE_COMMIT_MSG handler to accept aiPerformance options**

Modify the handler (lines 311-341):

```typescript
  ipcMain.handle(
    IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG,
    async (
      _,
      workdir: string,
      options: {
        maxDiffLines: number;
        timeout: number;
        provider: string;
        model: string;
        reasoningEffort?: string;
        prompt?: string;
        // AI Performance settings from renderer
        bareEnabled?: boolean;
        effortEnabled?: boolean;
        effortLevel?: string;
      }
    ): Promise<{ success: boolean; message?: string; error?: string }> => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('aiCommitMessageGeneration');
      }
      const resolved = validateWorkdir(workdir);
      return generateCommitMessage({
        workdir: resolved,
        maxDiffLines: options.maxDiffLines,
        timeout: options.timeout,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
        bare: options.bareEnabled,
        claudeEffort: options.effortEnabled
          ? (options.effortLevel as ClaudeEffort)
          : undefined,
        prompt: options.prompt,
      });
    }
  );
```

- [ ] **Step 3: Update GIT_CODE_REVIEW_START handler**

Modify the handler (lines 343-409) to use aiPerformance from options:

```typescript
  // Code Review - Start
  ipcMain.handle(
    IPC_CHANNELS.GIT_CODE_REVIEW_START,
    async (
      event,
      workdir: string,
      options: {
        provider: string;
        model: string;
        reasoningEffort?: string;
        language?: string;
        reviewId: string;
        sessionId?: string;
        prompt?: string;
        // AI Performance settings from renderer
        bareEnabled?: boolean;
        effortEnabled?: boolean;
        effortLevel?: string;
      }
    ): Promise<{ success: boolean; error?: string; sessionId?: string }> => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('codeReview');
      }
      const resolved = validateWorkdir(workdir);
      const sender = event.sender;

      startCodeReviewService({
        workdir: resolved,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
        bare: options.bareEnabled,
        claudeEffort: options.effortEnabled
          ? (options.effortLevel as ClaudeEffort)
          : undefined,
        language: options.language ?? '中文',
        reviewId: options.reviewId,
        sessionId: options.sessionId,
        prompt: options.prompt,
        onChunk: (chunk) => {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
              reviewId: options.reviewId,
              type: 'data',
              data: chunk,
            });
          }
        },
        onComplete: () => {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
              reviewId: options.reviewId,
              type: 'exit',
              exitCode: 0,
            });
          }
        },
        onError: (error) => {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
              reviewId: options.reviewId,
              type: 'error',
              data: error,
            });
          }
        },
      });

      return { success: true, sessionId: options.sessionId };
    }
  );
```

- [ ] **Step 4: Update GIT_GENERATE_BRANCH_NAME handler**

Modify the handler (lines 458-486):

```typescript
  ipcMain.handle(
    IPC_CHANNELS.GIT_GENERATE_BRANCH_NAME,
    async (
      _,
      workdir: string,
      options: {
        prompt: string;
        provider: string;
        model: string;
        reasoningEffort?: string;
        // AI Performance settings from renderer
        bareEnabled?: boolean;
        effortEnabled?: boolean;
        effortLevel?: string;
      }
    ): Promise<{ success: boolean; branchName?: string; error?: string }> => {
      if (isRemoteWorkdir(workdir)) {
        assertRemoteUnsupported('aiBranchNameGeneration');
      }
      const resolved = validateWorkdir(workdir);
      return generateBranchName({
        workdir: resolved,
        prompt: options.prompt,
        provider: (options.provider ?? 'claude-code') as AIProvider,
        model: options.model as ModelId,
        reasoningEffort: options.reasoningEffort as ReasoningEffort | undefined,
        bare: options.bareEnabled,
        claudeEffort: options.effortEnabled
          ? (options.effortLevel as ClaudeEffort)
          : undefined,
      });
    }
  );
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/git.ts
git commit -m "refactor(ipc): use aiPerformance settings instead of hardcoded values

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Update Renderer to Pass aiPerformance Settings

**Files:**
- Modify: `src/renderer/hooks/useGit.ts`
- Modify: `src/renderer/hooks/useCodeReview.ts`

- [ ] **Step 1: Update useGit.ts to pass aiPerformance**

Find the `generateCommitMessage` function call and add aiPerformance settings:

```typescript
// In the function that calls window.electronAPI.git.generateCommitMessage
// Add aiPerformance settings from useSettingsStore
const { aiPerformance } = useSettingsStore.getState();

const result = await window.electronAPI.git.generateCommitMessage(workdir, {
  ...existingOptions,
  bareEnabled: aiPerformance.bareEnabled,
  effortEnabled: aiPerformance.effortEnabled,
  effortLevel: aiPerformance.effortLevel,
});
```

- [ ] **Step 2: Update useGit.ts generateBranchName call**

Similarly update the branch name generation call.

- [ ] **Step 3: Update useCodeReview.ts to pass aiPerformance**

Find the code review start call and add:

```typescript
const { aiPerformance } = useSettingsStore.getState();

await window.electronAPI.git.startCodeReview(workdir, {
  ...existingOptions,
  bareEnabled: aiPerformance.bareEnabled,
  effortEnabled: aiPerformance.effortEnabled,
  effortLevel: aiPerformance.effortLevel,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useGit.ts src/renderer/hooks/useCodeReview.ts
git commit -m "feat(renderer): pass aiPerformance settings to IPC calls

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Add i18n Translations

**Files:**
- Modify: `src/renderer/locales/zh.json`
- Modify: `src/renderer/locales/en.json`

- [ ] **Step 1: Add Chinese translations**

Add to `zh.json`:

```json
  "Performance Optimization": "性能优化",
  "Global settings for AI CLI performance optimization": "AI CLI 性能优化的全局设置",
  "Enable bare mode": "启用 bare 模式",
  "Skip hooks, LSP, plugins for faster response": "跳过 hooks、LSP、插件以加快响应速度",
  "Enable effort control": "启用 effort 控制",
  "Control token usage vs quality balance": "控制 token 使用量与质量的平衡",
  "Effort Level": "Effort 级别",
  "Higher effort = better quality, more tokens": "更高级别 = 更好质量，更多 token"
```

- [ ] **Step 2: Add English translations**

Add to `en.json`:

```json
  "Performance Optimization": "Performance Optimization",
  "Global settings for AI CLI performance optimization": "Global settings for AI CLI performance optimization",
  "Enable bare mode": "Enable bare mode",
  "Skip hooks, LSP, plugins for faster response": "Skip hooks, LSP, plugins for faster response",
  "Enable effort control": "Enable effort control",
  "Control token usage vs quality balance": "Control token usage vs quality balance",
  "Effort Level": "Effort Level",
  "Higher effort = better quality, more tokens": "Higher effort = better quality, more tokens"
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/locales/zh.json src/renderer/locales/en.json
git commit -m "feat(i18n): add translations for AI Performance settings

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run TypeScript type check**

```bash
pnpm tsc --noEmit
```

Expected: No type errors

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: No lint errors

- [ ] **Step 3: Build the application**

```bash
pnpm build
```

Expected: Build succeeds

- [ ] **Step 4: Manual testing**

1. Open Settings > AI Features
2. Verify "Performance Optimization" section appears
3. Toggle "Enable bare mode" - should persist
4. Toggle "Enable effort control" - should show effort level dropdown
5. Change effort level - should persist
6. Generate a commit message - verify settings are applied

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: add AI Performance Optimization settings

- Add global bare mode and effort control settings
- Remove hardcoded values from individual AI features
- Add UI in AISettings.tsx
- Update IPC handlers to use settings

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
