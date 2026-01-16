# AI SDK 迁移实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Commit Message 生成和 Code Review 从 spawn claude CLI 迁移到 Vercel AI SDK

**Architecture:** 创建 `src/main/services/ai/` 模块，封装 provider 抽象层和业务逻辑，IPC handler 调用这些 service

**Tech Stack:** `ai@^6.0.0`, `ai-sdk-provider-claude-code@^3.2.0`, `zod@^4.0.0`

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装 AI SDK 依赖**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && pnpm add ai ai-sdk-provider-claude-code zod
```

**Step 2: 验证安装**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && pnpm list ai ai-sdk-provider-claude-code zod
```

Expected: 显示已安装的版本

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 添加 Vercel AI SDK 依赖"
```

---

### Task 2: 创建 Provider 抽象层

**Files:**
- Create: `src/main/services/ai/providers.ts`

**Step 1: 创建 providers.ts**

```typescript
import { claude } from 'ai-sdk-provider-claude-code'
import type { LanguageModel } from 'ai'

export type AIProvider = 'claude-code'

export type ModelId = 'haiku' | 'sonnet' | 'opus'

type ModelFactory = (provider: AIProvider) => LanguageModel

const MODEL_MAP: Record<ModelId, ModelFactory> = {
  haiku: () => claude('claude-haiku'),
  sonnet: () => claude('claude-sonnet-4-20250514'),
  opus: () => claude('claude-opus-4-20250514'),
}

export function getModel(modelId: ModelId, provider: AIProvider = 'claude-code'): LanguageModel {
  const factory = MODEL_MAP[modelId]
  if (!factory) {
    throw new Error(`Unknown model: ${modelId}`)
  }
  return factory(provider)
}
```

**Step 2: Commit**

```bash
git add src/main/services/ai/providers.ts
git commit -m "feat(ai): 添加 AI provider 抽象层"
```

---

### Task 3: 创建 Commit Message 生成服务

**Files:**
- Create: `src/main/services/ai/commit-message.ts`

**Step 1: 创建 commit-message.ts**

```typescript
import { generateText } from 'ai'
import { execSync } from 'node:child_process'
import { getModel, type ModelId } from './providers'

export interface CommitMessageOptions {
  workdir: string
  maxDiffLines: number
  timeout: number
  model: ModelId
}

export interface CommitMessageResult {
  success: boolean
  message?: string
  error?: string
}

function runGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000 }).trim()
  } catch {
    return ''
  }
}

export async function generateCommitMessage(
  options: CommitMessageOptions
): Promise<CommitMessageResult> {
  const { workdir, maxDiffLines, timeout, model } = options

  const recentCommits = runGit('git --no-pager log -5 --format="%s"', workdir)
  const stagedStat = runGit('git --no-pager diff --cached --stat', workdir)
  const stagedDiff = runGit('git --no-pager diff --cached', workdir)

  const truncatedDiff =
    stagedDiff.split('\n').slice(0, maxDiffLines).join('\n') || '(no staged changes detected)'

  const prompt = `你无法调用任何工具，我消息里已经包含了所有你需要的信息，无需解释，直接返回一句简短的 commit message。

参考风格：
${recentCommits || '(no recent commits)'}

变更摘要：
${stagedStat || '(no stats)'}

变更详情：
${truncatedDiff}`

  try {
    const { text } = await generateText({
      model: getModel(model),
      prompt,
      abortSignal: AbortSignal.timeout(timeout * 1000),
    })
    return { success: true, message: text.trim() }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error }
  }
}
```

**Step 2: Commit**

```bash
git add src/main/services/ai/commit-message.ts
git commit -m "feat(ai): 添加 commit message 生成服务"
```

---

### Task 4: 创建 Code Review 流式服务

**Files:**
- Create: `src/main/services/ai/code-review.ts`

**Step 1: 创建 code-review.ts**

```typescript
import { streamText } from 'ai'
import { execSync } from 'node:child_process'
import { getModel, type ModelId } from './providers'

export interface CodeReviewOptions {
  workdir: string
  model: ModelId
  language: string
  reviewId: string
  onChunk: (chunk: string) => void
  onComplete: () => void
  onError: (error: string) => void
}

const activeReviews = new Map<string, AbortController>()

function runGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 10000 }).trim()
  } catch {
    return ''
  }
}

function buildPrompt(gitDiff: string, gitLog: string, language: string): string {
  return `Always reply in ${language}. You are performing a code review on the changes in the current branch.


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

${gitDiff || '(No diff available)'}

## Commit History

${gitLog || '(No commit history available)'}`
}

export async function startCodeReview(options: CodeReviewOptions): Promise<void> {
  const { workdir, model, language, reviewId, onChunk, onComplete, onError } = options

  const gitDiff = runGit('git --no-pager diff HEAD', workdir)
  const defaultBranch =
    runGit(
      "git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'",
      workdir
    ) || 'main'
  const gitLog = runGit(
    `git --no-pager log origin/${defaultBranch}..HEAD --oneline 2>/dev/null || git --no-pager log -10 --oneline`,
    workdir
  )

  if (!gitDiff && !gitLog) {
    onError('No changes to review')
    return
  }

  const controller = new AbortController()
  activeReviews.set(reviewId, controller)

  try {
    const result = streamText({
      model: getModel(model),
      prompt: buildPrompt(gitDiff, gitLog, language),
      abortSignal: controller.signal,
    })

    for await (const chunk of result.textStream) {
      onChunk(chunk)
    }
    onComplete()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // 用户主动取消，不报错
      return
    }
    onError(err instanceof Error ? err.message : 'Unknown error')
  } finally {
    activeReviews.delete(reviewId)
  }
}

export function stopCodeReview(reviewId: string): void {
  const controller = activeReviews.get(reviewId)
  if (controller) {
    controller.abort()
    activeReviews.delete(reviewId)
  }
}
```

**Step 2: Commit**

```bash
git add src/main/services/ai/code-review.ts
git commit -m "feat(ai): 添加 code review 流式服务"
```

---

### Task 5: 创建 AI 服务统一导出

**Files:**
- Create: `src/main/services/ai/index.ts`

**Step 1: 创建 index.ts**

```typescript
export { getModel, type AIProvider, type ModelId } from './providers'
export {
  generateCommitMessage,
  type CommitMessageOptions,
  type CommitMessageResult,
} from './commit-message'
export { startCodeReview, stopCodeReview, type CodeReviewOptions } from './code-review'
```

**Step 2: Commit**

```bash
git add src/main/services/ai/index.ts
git commit -m "feat(ai): 添加 AI 服务统一导出"
```

---

### Task 6: 修改 IPC Handler - Commit Message

**Files:**
- Modify: `src/main/ipc/git.ts:198-339`

**Step 1: 替换 GIT_GENERATE_COMMIT_MSG handler**

找到原有的 `ipcMain.handle(IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG, ...)` 实现（约 198-339 行），替换为：

```typescript
import { generateCommitMessage, type ModelId } from '../services/ai'

// ... 其他代码 ...

ipcMain.handle(
  IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG,
  async (
    _,
    workdir: string,
    options: { maxDiffLines: number; timeout: number; model: string }
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    const resolved = validateWorkdir(workdir)
    return generateCommitMessage({
      workdir: resolved,
      maxDiffLines: options.maxDiffLines,
      timeout: options.timeout,
      model: options.model as ModelId,
    })
  }
)
```

**Step 2: 验证类型检查通过**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/main/ipc/git.ts
git commit -m "refactor(git): 迁移 commit message 生成到 AI SDK"
```

---

### Task 7: 修改 IPC Handler - Code Review

**Files:**
- Modify: `src/main/ipc/git.ts:342-517`

**Step 1: 替换 GIT_CODE_REVIEW_START handler**

找到原有的 `ipcMain.handle(IPC_CHANNELS.GIT_CODE_REVIEW_START, ...)` 实现，替换为：

```typescript
import { startCodeReview, stopCodeReview, type ModelId } from '../services/ai'

// ... 其他代码 ...

ipcMain.handle(
  IPC_CHANNELS.GIT_CODE_REVIEW_START,
  async (
    event,
    workdir: string,
    options: {
      model: string
      language?: string
      reviewId: string
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const resolved = validateWorkdir(workdir)
    const sender = event.sender

    startCodeReview({
      workdir: resolved,
      model: options.model as ModelId,
      language: options.language ?? '中文',
      reviewId: options.reviewId,
      onChunk: (chunk) => {
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
            reviewId: options.reviewId,
            type: 'data',
            data: chunk,
          })
        }
      },
      onComplete: () => {
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
            reviewId: options.reviewId,
            type: 'exit',
            exitCode: 0,
          })
        }
      },
      onError: (error) => {
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
            reviewId: options.reviewId,
            type: 'error',
            data: error,
          })
        }
      },
    })

    return { success: true }
  }
)

ipcMain.handle(IPC_CHANNELS.GIT_CODE_REVIEW_STOP, async (_, reviewId: string): Promise<void> => {
  stopCodeReview(reviewId)
})
```

**Step 2: 删除不再需要的代码**

删除 `git.ts` 中以下不再需要的部分：
- `activeCodeReviews` Map
- `killProcessTree` 相关调用（如果仅用于 code review）
- 原有的 spawn/stdin/stdout 处理逻辑

**Step 3: 验证类型检查通过**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && pnpm typecheck
```

**Step 4: Commit**

```bash
git add src/main/ipc/git.ts
git commit -m "refactor(git): 迁移 code review 到 AI SDK"
```

---

### Task 8: 简化渲染层 - 移除 StreamJsonParser

**Files:**
- Modify: `src/renderer/stores/codeReviewContinue.ts`

**Step 1: 简化 codeReviewContinue.ts**

移除 `StreamJsonParser` 依赖，直接处理文本：

```typescript
import { create } from 'zustand'

export type ReviewStatus = 'idle' | 'initializing' | 'streaming' | 'complete' | 'error'

interface CodeReviewState {
  content: string
  status: ReviewStatus
  error: string | null
  repoPath: string | null
  reviewId: string | null
}

interface CodeReviewContinueState {
  isMinimized: boolean
  review: CodeReviewState

  minimize: () => void
  restore: () => void

  updateReview: (partial: Partial<CodeReviewState>) => void
  appendContent: (text: string) => void
  resetReview: () => void
  setReviewId: (reviewId: string | null) => void
}

const initialReviewState: CodeReviewState = {
  content: '',
  status: 'idle',
  error: null,
  repoPath: null,
  reviewId: null,
}

export const useCodeReviewContinueStore = create<CodeReviewContinueState>((set) => ({
  isMinimized: false,
  review: { ...initialReviewState },

  minimize: () => set({ isMinimized: true }),
  restore: () => set({ isMinimized: false }),

  updateReview: (partial) =>
    set((state) => ({
      review: { ...state.review, ...partial },
    })),

  appendContent: (text) =>
    set((state) => ({
      review: { ...state.review, content: state.review.content + text },
    })),

  resetReview: () =>
    set({
      review: { ...initialReviewState },
      isMinimized: false,
    }),

  setReviewId: (reviewId) =>
    set((state) => ({
      review: { ...state.review, reviewId },
    })),
}))

let cleanupFn: (() => void) | null = null

export async function startCodeReview(
  repoPath: string,
  settings: {
    model: string
    language: string
  }
): Promise<void> {
  const store = useCodeReviewContinueStore.getState()

  store.updateReview({
    content: '',
    status: 'initializing',
    error: null,
    repoPath,
  })

  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }

  const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2)}`
  store.setReviewId(reviewId)

  const onDataCleanup = window.electronAPI.git.onCodeReviewData((event) => {
    if (event.reviewId !== reviewId) return

    const currentReviewId = useCodeReviewContinueStore.getState().review.reviewId
    if (currentReviewId !== reviewId) return

    if (event.type === 'data' && event.data) {
      store.updateReview({ status: 'streaming' })
      store.appendContent(event.data)
    } else if (event.type === 'error' && event.data) {
      store.updateReview({
        status: 'error',
        error: event.data,
      })
      store.setReviewId(null)
    } else if (event.type === 'exit') {
      const currentStatus = useCodeReviewContinueStore.getState().review.status
      if (event.exitCode !== 0 && currentStatus !== 'complete') {
        store.updateReview({
          status: 'error',
          error: `Process exited with code ${event.exitCode}`,
        })
      } else if (currentStatus !== 'error') {
        store.updateReview({ status: 'complete' })
      }
      store.setReviewId(null)
    }
  })
  cleanupFn = onDataCleanup

  try {
    const result = await window.electronAPI.git.startCodeReview(repoPath, {
      model: settings.model,
      language: settings.language ?? '中文',
      reviewId,
    })

    if (!result.success) {
      store.updateReview({
        status: 'error',
        error: result.error || 'Failed to start review',
      })
      stopCodeReview()
    }
  } catch (err) {
    store.updateReview({
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to start review',
    })
    stopCodeReview()
  }
}

export function stopCodeReview(): void {
  const store = useCodeReviewContinueStore.getState()
  const reviewId = store.review.reviewId

  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }

  if (reviewId) {
    window.electronAPI.git.stopCodeReview(reviewId).catch(console.error)
    store.setReviewId(null)
  }

  store.updateReview({ status: 'idle' })
}
```

**Step 2: 验证类型检查通过**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/renderer/stores/codeReviewContinue.ts
git commit -m "refactor(renderer): 简化 code review store，移除 StreamJsonParser"
```

---

### Task 9: 更新 Preload 类型定义

**Files:**
- Modify: `src/preload/index.ts` (如果需要)

**Step 1: 检查并更新 startCodeReview 的类型定义**

移除 `continueConversation` 和 `sessionId` 参数：

```typescript
startCodeReview: (
  workdir: string,
  options: {
    model: string
    language?: string
    reviewId: string
  }
) => Promise<{ success: boolean; error?: string }>
```

**Step 2: 验证类型检查通过**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "refactor(preload): 更新 code review API 类型定义"
```

---

### Task 10: 清理废弃代码

**Files:**
- Delete: `src/renderer/lib/stream-json-parser.ts` (如果不再被其他地方使用)
- Modify: `src/main/ipc/git.ts` - 删除未使用的 import

**Step 1: 检查 stream-json-parser.ts 是否还有其他引用**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && grep -r "stream-json-parser" src/ --include="*.ts" --include="*.tsx"
```

如果只有 codeReviewContinue.ts 引用，删除该文件。

**Step 2: 清理 git.ts 中未使用的 import**

删除：
- `spawn` from `child_process` (如果不再使用)
- `getShellForCommand`, `getEnvForCommand` 等（如果不再使用）

**Step 3: 验证构建通过**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && pnpm build
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: 清理 AI SDK 迁移后的废弃代码"
```

---

### Task 11: 手动验证功能

**Step 1: 启动应用**

Run:
```bash
cd /Users/j3n5en/project/EnsoAI && pnpm dev
```

**Step 2: 验证 Commit Message 生成**

1. 打开一个 Git 仓库
2. Stage 一些文件
3. 点击生成 Commit Message 按钮
4. 确认生成成功

**Step 3: 验证 Code Review**

1. 打开一个有修改的 Git 仓库
2. 启动 Code Review
3. 确认流式输出正常
4. 测试停止功能

**Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: 完成 AI SDK 迁移"
```

---

## 回滚方案

如果迁移出现问题，可以通过以下方式回滚：

```bash
git revert HEAD~N  # N 为提交数量
pnpm remove ai ai-sdk-provider-claude-code zod
```
