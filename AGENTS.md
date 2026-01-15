# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-13
**Commit:** ccc93c2
**Branch:** main

## OVERVIEW

EnsoAI - Git Worktree 管理器 + 多 AI Agent 集成。Electron 39 + React 19 + TypeScript 5.9 + Tailwind 4。

## STRUCTURE

```
EnsoAI/
├── src/
│   ├── main/          # Electron 主进程 (IPC, Services, Menu)
│   ├── preload/       # Electron 预加载脚本 (Context Bridge)
│   ├── renderer/      # React 前端 (Components, Stores, Hooks)
│   └── shared/        # 跨进程共享类型定义
├── resources/         # 静态资源 (Ghostty themes 438个)
├── scripts/           # 构建脚本 (dev.js 进程管理)
├── docs/              # 设计文档 (design-system.md 关键)
└── build/             # Electron Builder 图标资源
```

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| IPC 通信 | `src/main/ipc/*.ts` | 17 个 handler 模块，按功能分离 |
| 状态管理 | `src/renderer/stores/*.ts` | Zustand stores，settings.ts 最大(37KB) |
| UI 组件 | `src/renderer/components/ui/` | @coss/ui 组件，52 个文件 |
| Git 操作 | `src/main/services/git/` | simple-git 封装 |
| 终端 | `src/main/services/terminal/` + `src/renderer/hooks/useXterm.ts` | node-pty + xterm.js |
| AI Agent | `src/main/services/claude/` | Claude IDE Bridge (7 文件) |
| 类型定义 | `src/shared/types/*.ts` | 15 个类型文件，ipc.ts 最重要 |
| 设计规范 | `docs/design-system.md` | **UI 开发必读** |

## CONVENTIONS

### 工具链（非标准配置）
- **Biome** 替代 ESLint/Prettier — `biome.json` 配置
- **Tailwind 4** 新语法 — `@theme` 块定义在 `globals.css`
- **OKLCH 色彩空间** — 非传统 HEX/HSL

### 路径别名
```typescript
@/*      → src/renderer/*
@shared/* → src/shared/*
```

### 提交规范（CLAUDE.md 已定义）
- Conventional Commits 格式
- 描述用中文
- `feat|fix|ci|build` 才进 Release Notes

## ANTI-PATTERNS (禁止)

| 禁止 | 原因 |
|------|------|
| `as any` / `@ts-ignore` | Biome 规则明确禁用类型逃逸 |
| 手动实现 UI 组件 | 必须优先用 `@coss/ui`，见 `docs/design-system.md` |
| CDN 加载 Monaco worker | CSP 限制，必须本地 worker import |
| 直接修改 `globals.css` 主题 | 使用 Ghostty themes 同步机制 |

## UNIQUE STYLES

### UI 尺寸常量
```
Tab 栏:   h-9 (36px)
树节点:   h-7 (28px)
小按钮:   h-6 (24px)
缩进:     depth * 12 + 8px
```

### Flexbox 截断模式
```tsx
// 固定元素
<Icon className="h-4 w-4 shrink-0" />
// 可截断文本
<span className="min-w-0 flex-1 truncate">{text}</span>
```

### 图标颜色映射
- 目录: `text-yellow-500`
- TypeScript: `text-blue-500`
- JavaScript: `text-yellow-400`

## COMMANDS

```bash
# 开发
pnpm dev              # electron-vite dev (自定义 scripts/dev.js 包装)

# 构建
pnpm build            # electron-vite build
pnpm build:mac        # 构建 macOS (签名+公证)
pnpm build:win        # 构建 Windows
pnpm build:linux      # 构建 Linux

# 质量检查
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check
pnpm lint:fix         # biome check --write
```

## NOTES

- **无自动化测试** — 项目依赖 TypeScript + Biome 保证质量
- **原生模块** — `node-pty`, `@parcel/watcher` 需 `postinstall` 编译
- **Settings Store 巨大** — `settings.ts` 37KB，修改前仔细阅读结构
- **Claude IDE Bridge** — `src/main/services/claude/ClaudeIdeBridge.ts` 是 MCP 集成核心
- **进程清理** — `scripts/dev.js` 处理 SIGINT/SIGTERM，确保 PTY 正确退出
