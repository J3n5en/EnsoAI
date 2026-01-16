# RENDERER PROCESS

React 19 前端。状态管理 (Zustand)、UI 组件 (@coss/ui)、终端 (xterm.js)。

## STRUCTURE

```
renderer/
├── index.tsx          # 入口 (QueryClient, ToastProvider)
├── App.tsx            # 根组件 (1141 行，核心状态逻辑)
├── App/               # App 相关工具
│   ├── constants.ts   # 类型定义 (Repository, TabId)
│   ├── storage.ts     # localStorage 持久化
│   └── use*.ts        # App 级 hooks
├── components/        # UI 组件 (按功能域分)
│   ├── ui/            # @coss/ui 基础组件 (52 文件)
│   ├── layout/        # 布局组件 (Sidebar, MainContent)
│   ├── terminal/      # 终端组件
│   ├── chat/          # AI 对话组件
│   ├── files/         # 文件树 + 编辑器
│   ├── git/           # Git 操作 UI
│   ├── source-control/# 源码控制面板
│   ├── worktree/      # Worktree 管理
│   └── settings/      # 设置面板
├── stores/            # Zustand stores (14 文件)
│   ├── settings.ts    # 全局设置 (37KB，最复杂)
│   ├── editor.ts      # 编辑器状态
│   └── ...
├── hooks/             # React hooks (14 文件)
│   ├── useXterm.ts    # xterm.js 集成 (26KB)
│   ├── useFileTree.ts # 文件树逻辑 (13KB)
│   └── ...
├── lib/               # 工具函数
└── styles/            # CSS (globals.css 含 Tailwind 4 主题)
```

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| 全局状态 | `stores/settings.ts` | **巨大文件**，修改前理解结构 |
| 新 UI 组件 | `components/ui/` | 先查 @coss/ui 是否已有 |
| 功能组件 | `components/<domain>/` | 按功能域组织 |
| 终端逻辑 | `hooks/useXterm.ts` | xterm.js 配置 + 主题同步 |
| 文件操作 | `hooks/useFileTree.ts` + `hooks/useEditor.ts` | |
| IPC 调用 | `window.electronAPI.<domain>.*` | 类型在 `@shared/types/ipc.ts` |

## CONVENTIONS

### 组件结构
```tsx
// components/<domain>/ComponentName.tsx
export function ComponentName({ prop }: Props) {
  // hooks 调用
  // 事件处理
  // JSX
}

// components/<domain>/index.ts 导出
export { ComponentName } from './ComponentName';
```

### Zustand Store 模式
```typescript
// stores/example.ts
interface ExampleState {
  value: string;
  setValue: (v: string) => void;
}

export const useExampleStore = create<ExampleState>()((set) => ({
  value: '',
  setValue: (v) => set({ value: v }),
}));
```

### 样式规则（docs/design-system.md）
```tsx
// 颜色 - 使用 CSS 变量
className="text-primary bg-accent text-muted-foreground"

// 尺寸
className="h-9"  // Tab
className="h-7"  // 树节点
className="h-6"  // 小按钮

// 截断
className="min-w-0 flex-1 truncate"  // 文本
className="shrink-0"                  // 固定元素
```

## ANTI-PATTERNS

- **直接写 UI 组件** — 必须先查 `components/ui/` 和 @coss/ui
- **硬编码颜色** — 使用 Tailwind CSS 变量 (`text-primary` 非 `text-blue-500`)
- **非响应式间距** — 使用 `gap-1/2/3`，非固定像素
- **忽略 min-w-0** — Flexbox 截断必须加

## NOTES

- `App.tsx` 1141 行，核心状态管理在此，**修改需谨慎**
- `settings.ts` 37KB — 包含所有用户设置逻辑
- `useXterm.ts` 26KB — 终端集成最复杂的 hook
- Monaco Editor 主题从 Ghostty themes 动态生成
- React Query 用于异步数据 (worktree list, git branches)
