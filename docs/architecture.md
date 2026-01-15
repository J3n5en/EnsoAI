# EnsoAI Architecture

## Overview

EnsoAI 是一个基于 Electron 的增强型 Git Worktree 管理器，核心理念是 **"多 Agent 并行流"**。通过 Git Worktree 技术，让每个功能分支拥有独立的物理目录、编辑器状态、终端会话和 AI Agent 上下文。

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 39+ |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Editor | Monaco Editor (local workers) |
| Terminal | xterm.js + node-pty |
| Git | simple-git |
| State | Zustand |
| Build | electron-vite + electron-builder |

## Project Structure

```
src/
├── main/           # 主进程
│   ├── index.ts    # 入口文件
│   ├── ipc/        # IPC 处理器
│   └── services/   # 业务服务
├── renderer/       # 渲染进程
│   ├── App.tsx     # 应用入口
│   ├── components/ # UI 组件
│   ├── stores/     # Zustand 状态
│   └── hooks/      # 自定义 Hooks
├── preload/        # 预加载脚本
│   └── index.ts    # ContextBridge API
└── shared/         # 共享模块
    └── types.ts    # 类型定义
```

---

## Main Process (`src/main`)

### 启动流程

```
app.whenReady()
    └── init()
        ├── checkGitEnvironment()
        ├── registerIpcHandlers()
        └── createMainWindow()
```

生命周期管理：
- `will-quit`：异步 `cleanupAllResources()` 优雅清理
- `SIGINT/SIGTERM`：同步 `cleanupAllResourcesSync()` 立即终止

### IPC 架构

```
src/main/ipc/
├── index.ts      # 统一注册入口
├── git.ts        # Git 操作
├── terminal.ts   # PTY 管理
├── files.ts      # 文件系统
└── window.ts     # 窗口控制
```

通信模式：
- **请求-响应**：`ipcMain.handle()` + `ipcRenderer.invoke()`
- **主动推送**：`webContents.send()` + `ipcRenderer.on()`

### 核心服务

#### Git Service (`src/main/services/git`)
- 封装 `simple-git` 提供 Git 操作
- `authorizedWorkdirs` 白名单安全机制
- AI 增强：
  - `GIT_GENERATE_COMMIT_MSG`：调用 Claude 生成提交信息
  - `GIT_CODE_REVIEW_START`：流式代码审查

#### PTY Manager (`src/main/services/pty`)
- 统一管理所有虚拟终端实例
- 数据流：渲染进程 ↔ IPC ↔ node-pty
- 优雅关闭：等待 PTY 进程完全终止

#### File Watcher (`src/main/services/files`)
- 多路目录监控
- 编码检测：`jschardet` + `iconv-lite`
- Git 忽略集成

---

## Renderer Process (`src/renderer`)

### 布局系统

```
App.tsx
├── tree 模式    # 仓库+工作区合并侧边栏
└── columns 模式 # 仓库和工作区独立侧边栏

MainContent.tsx (核心调度器)
├── AgentPanel         # AI 对话
├── FilePanel          # 文件编辑
├── TerminalPanel      # 终端
└── SourceControlPanel # 版本控制
```

状态保留策略：面板切换时保持挂载（CSS `invisible`），保留终端会话和编辑器状态。

### 状态管理 (Zustand)

```
src/renderer/stores/
├── editor.ts         # 标签页、光标
├── terminal.ts       # 会话管理
├── agentSessions.ts  # Agent 会话
├── settings.ts       # 全局配置
└── worktree.ts       # 工作区状态
```

核心设计：
- **领域隔离**：每个功能模块独立 store
- **Worktree 隔离**：`WorktreeEditorState` 按工作区保存/恢复
- **Context 切换**：`switchWorktree()` 自动保存+加载

### Monaco Editor 集成

```
src/renderer/components/files/
├── FilePanel.tsx      # 容器组件
├── EditorArea.tsx     # Monaco 封装
├── monacoSetup.ts     # Worker 配置
└── monacoTheme.ts     # 主题同步
```

特性：
- **Worker 配置**：适配 Electron 环境
- **语法增强**：Shiki 支持 Vue/Svelte/Astro
- **主题同步**：与终端 Ghostty 主题实时同步
- **行间评论**：自定义 `IContentWidget`

### xterm.js 终端

```
src/renderer/
├── hooks/useXterm.ts              # 核心 Hook
└── components/terminal/
    ├── ShellTerminal.tsx          # Shell 终端
    └── AgentTerminal.tsx          # Agent 终端
```

特性：
- **渲染**：WebGL 优先，DOM 降级
- **性能**：`requestAnimationFrame` 缓冲合并
- **链接**：识别 `file.ts:10:5` 点击跳转
- **快捷键**：macOS 风格优化

---

## AI Agent Integration

### 支持的 Agent

| Agent | 对话 | 编辑 | 终端 | 文件写入 |
|-------|:----:|:----:|:----:|:--------:|
| Claude | ✅ | ✅ | ✅ | ✅ |
| Codex | ✅ | ✅ | ✅ | ✅ |
| Gemini | ✅ | ❌ | ❌ | ❌ |
| 自定义 CLI | ✅ | - | - | - |

### 会话绑定机制

```
Worktree A ←→ Session A ←→ Agent Instance A
Worktree B ←→ Session B ←→ Agent Instance B
```

- **Session ID**：`--session-id` / `--resume` 参数传递
- **Worktree 隔离**：`cwd` 硬绑定工作区路径
- **工作区感知**：WebSocket 实时同步 `workspaceFolders`

### Claude 深度集成

```
src/main/services/claude/
├── ClaudeIdeBridge.ts      # WebSocket IDE 桥接
├── ClaudeProviderManager   # API 配置 (~/.claude/settings.json)
├── McpManager              # MCP 服务器 (~/.claude.json)
├── PromptsManager          # CLAUDE.md 管理
└── ClaudeHookManager       # 钩子注入 (~/.claude/hooks/)
```

### 交互流程

```
┌─────────────────┐      IPC       ┌─────────────┐      PTY      ┌───────────┐
│  AgentTerminal  │ ────────────▶ │  PtyManager  │ ────────────▶ │ Agent CLI │
│    (React)      │ ◀──────────── │   (Main)     │ ◀──────────── │ (Claude)  │
└─────────────────┘               └─────────────┘               └───────────┘
                                         │
                                         ▼ WebSocket
                                  ┌─────────────────┐
                                  │ ClaudeIdeBridge │
                                  │   (IDE 感知)     │
                                  └─────────────────┘
```

---

## IPC Channel Reference

### Git
| Channel | Direction | Description |
|---------|-----------|-------------|
| `GIT_STATUS` | invoke | 获取 Git 状态 |
| `GIT_DIFF` | invoke | 获取差异 |
| `GIT_COMMIT` | invoke | 提交更改 |
| `GIT_GENERATE_COMMIT_MSG` | invoke | AI 生成提交信息 |

### Terminal
| Channel | Direction | Description |
|---------|-----------|-------------|
| `TERMINAL_CREATE` | invoke | 创建终端 |
| `TERMINAL_WRITE` | invoke | 写入终端 |
| `TERMINAL_DATA` | push | 终端输出 |
| `TERMINAL_EXIT` | push | 终端退出 |

### Files
| Channel | Direction | Description |
|---------|-----------|-------------|
| `FILE_READ` | invoke | 读取文件 |
| `FILE_WRITE` | invoke | 写入文件 |
| `FILE_LIST` | invoke | 列出目录 |
| `FILE_WATCH` | invoke | 监控文件 |
| `FILE_CHANGED` | push | 文件变更 |

---

## Key Design Decisions

1. **Worktree 隔离**：物理隔离 + 上下文隔离，消除分支切换成本
2. **会话持久化**：Agent 对话可跨会话恢复
3. **IDE 深度集成**：编辑器选区实时同步给 Agent
4. **模块化架构**：主进程/渲染进程/预加载脚本职责分离
5. **状态保留**：面板切换不销毁，保持终端和编辑器状态
