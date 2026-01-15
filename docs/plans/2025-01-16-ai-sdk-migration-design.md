# AI SDK 迁移设计

## 背景

将 Commit Message 生成和 Code Review 功能从 `spawn claude CLI` 迁移到 Vercel AI SDK + `ai-sdk-provider-claude-code`。

## 决策

- **移除会话功能**：Code Review 每次独立，不保留 sessionId
- **预留多模型架构**：抽象 provider 层，未来可扩展 Gemini/OpenAI

## 依赖

```json
{
  "ai": "^6.0.0",
  "ai-sdk-provider-claude-code": "^3.2.0",
  "zod": "^4.0.0"
}
```

## 架构

```
src/main/
├── services/
│   └── ai/
│       ├── index.ts           # 统一导出
│       ├── providers.ts       # Provider 配置与切换
│       ├── commit-message.ts  # Commit Message 生成
│       └── code-review.ts     # Code Review 流式处理
```

## 实现细节

### 1. Provider 抽象层

```typescript
// src/main/services/ai/providers.ts

import { claude } from 'ai-sdk-provider-claude-code'
import type { LanguageModel } from 'ai'

export type AIProvider = 'claude-code' // | 'gemini' | 'openai' 未来扩展

export type ModelId = 'haiku' | 'sonnet' | 'opus'

const MODEL_MAP: Record<ModelId, (provider: AIProvider) => LanguageModel> = {
  haiku: (p) => (p === 'claude-code' ? claude('claude-haiku') : claude('claude-haiku')),
  sonnet: (p) => (p === 'claude-code' ? claude('claude-sonnet-4-20250514') : claude('claude-sonnet-4-20250514')),
  opus: (p) => (p === 'claude-code' ? claude('claude-opus-4-20250514') : claude('claude-opus-4-20250514')),
}

export function getModel(modelId: ModelId, provider: AIProvider = 'claude-code') {
  return MODEL_MAP[modelId](provider)
}
```

### 2. Commit Message 生成

```typescript
// src/main/services/ai/commit-message.ts

import { generateText } from 'ai'
import { getModel, type ModelId } from './providers'

interface CommitMessageOptions {
  workdir: string
  maxDiffLines: number
  timeout: number
  model: ModelId
}

export async function generateCommitMessage(options: CommitMessageOptions) {
  // gatherGitInfo 从 workdir 获取 git 信息
  const { recentCommits, stagedStat, stagedDiff } = gatherGitInfo(options.workdir)

  const truncatedDiff =
    stagedDiff.split('\n').slice(0, options.maxDiffLines).join('\n') ||
    '(no staged changes)'

  const prompt = `你无法调用任何工具，我消息里已经包含了所有你需要的信息，无需解释，直接返回一句简短的 commit message。

参考风格：
${recentCommits || '(no recent commits)'}

变更摘要：
${stagedStat || '(no stats)'}

变更详情：
${truncatedDiff}`

  try {
    const { text } = await generateText({
      model: getModel(options.model),
      prompt,
      abortSignal: AbortSignal.timeout(options.timeout * 1000),
    })
    return { success: true, message: text }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
```

### 3. Code Review 流式处理

```typescript
// src/main/services/ai/code-review.ts

import { streamText } from 'ai'
import { getModel, type ModelId } from './providers'

interface CodeReviewOptions {
  workdir: string
  model: ModelId
  language: string
  reviewId: string
  onChunk: (chunk: string) => void
  onComplete: () => void
  onError: (error: string) => void
}

const activeReviews = new Map<string, AbortController>()

export async function startCodeReview(options: CodeReviewOptions) {
  const { gitDiff, gitLog } = gatherGitInfo(options.workdir)

  const controller = new AbortController()
  activeReviews.set(options.reviewId, controller)

  const prompt = buildCodeReviewPrompt(gitDiff, gitLog, options.language)

  try {
    const result = streamText({
      model: getModel(options.model),
      prompt,
      abortSignal: controller.signal,
    })

    for await (const chunk of result.textStream) {
      options.onChunk(chunk)
    }
    options.onComplete()
  } catch (err) {
    if (err.name !== 'AbortError') {
      options.onError(err.message)
    }
  } finally {
    activeReviews.delete(options.reviewId)
  }
}

export function stopCodeReview(reviewId: string) {
  activeReviews.get(reviewId)?.abort()
  activeReviews.delete(reviewId)
}
```

### 4. IPC Handler 改造

```typescript
// src/main/ipc/git.ts (修改部分)

import { generateCommitMessage } from '../services/ai/commit-message'
import { startCodeReview, stopCodeReview } from '../services/ai/code-review'

ipcMain.handle(
  IPC_CHANNELS.GIT_GENERATE_COMMIT_MSG,
  async (_, workdir: string, options) => {
    return generateCommitMessage({ workdir, ...options })
  }
)

ipcMain.handle(
  IPC_CHANNELS.GIT_CODE_REVIEW_START,
  async (event, workdir: string, options) => {
    const sender = event.sender

    startCodeReview({
      workdir,
      model: options.model,
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
      onError: (err) => {
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.GIT_CODE_REVIEW_DATA, {
            reviewId: options.reviewId,
            type: 'error',
            data: err,
          })
        }
      },
    })

    return { success: true }
  }
)
```

## 渲染层影响

- 移除 `sessionId` 相关状态管理
- 移除 stream-json 解析逻辑，`onChunk` 直接返回文本
- 简化 `codeReviewContinue.ts` store

## 代码削减

- `src/main/ipc/git.ts`: 删除约 200 行
- 渲染层: 删除 stream-json 解析逻辑
