# EnsoAI Design System

## Tech Stack

- **Framework**: Electron + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **UI Components**: [coss ui](https://coss.com/ui) (基于 Base UI，copy-paste 模式)
- **Icons**: Lucide React
- **Editor**: Monaco Editor (local workers, no CDN)

## 组件使用原则

**优先使用 @coss/ui 组件**，避免手动实现：

1. 新增 UI 需求时，先查看 [coss.com/ui](https://coss.com/ui) 是否有现成组件
2. 使用 CLI 添加组件：`npx shadcn@latest add @coss/<component>`
3. 组件存放于 `src/renderer/components/ui/`
4. 仅在 @coss/ui 无法满足时才手动实现

## Color System

### Theme Variables

使用 CSS 变量定义颜色，支持 light/dark 模式切换：

| Variable | Usage |
|----------|-------|
| `background` | 页面背景 |
| `foreground` | 主要文字 |
| `muted` | 次要背景 |
| `muted-foreground` | 次要文字 |
| `accent` | 交互元素背景 |
| `accent-foreground` | 交互元素文字 |
| `primary` | 强调色/品牌色 |
| `primary-foreground` | 强调色上的文字 |
| `destructive` | 危险操作 |

### 使用规范

```tsx
// 强调色按钮/图标
className="text-primary"
className="hover:bg-primary/20"

// 次要元素
className="text-muted-foreground"
className="bg-muted/30"

// 选中状态
className="bg-accent text-accent-foreground"

// 危险操作
variant="destructive"
```

## Spacing & Sizing

### 高度规范

| Component | Height | Tailwind |
|-----------|--------|----------|
| Tab 栏 | 36px | `h-9` |
| 树节点行 | 28px | `h-7` |
| 小按钮 | 24px | `h-6` |
| 输入框 | 36px | `h-9` |

### 间距规范

| Usage | Size | Tailwind |
|-------|------|----------|
| 紧凑间距 | 4px | `gap-1` |
| 标准间距 | 8px | `gap-2` |
| 宽松间距 | 12px | `gap-3` |
| 缩进 | 12px/层级 | `depth * 12 + 8px` |

## Typography

### 字体

```tsx
// 代码/编辑器
fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace'

// UI 文字
className="text-sm"  // 14px, 树节点、Tab
className="text-xs"  // 12px, 辅助信息
```

## Components

### File Tree Node

```tsx
<div
  className={cn(
    'flex h-7 cursor-pointer select-none items-center gap-1 rounded-sm px-2 text-sm hover:bg-accent/50',
    isSelected && 'bg-accent text-accent-foreground'
  )}
  style={{ paddingLeft: `${depth * 12 + 8}px` }}
>
  {/* 目录展开图标 */}
  {node.isDirectory ? (
    <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground', isExpanded && 'rotate-90')} />
  ) : (
    <span className="w-4" />  {/* 占位保持对齐 */}
  )}

  {/* 文件图标 */}
  <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />

  {/* 文件名 - min-w-0 确保 truncate 生效 */}
  <span className="min-w-0 flex-1 truncate">{node.name}</span>
</div>
```

### Editor Tabs

```tsx
<div className="flex h-9 shrink-0 border-b bg-muted/30">
  {tabs.map((tab) => (
    <div
      className={cn(
        'group relative flex h-9 min-w-[120px] max-w-[180px] items-center gap-2 border-r px-3 text-sm',
        isActive
          ? 'bg-background text-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
      )}
    >
      {/* 激活指示器 */}
      {isActive && <div className="absolute inset-x-0 top-0 h-[2px] bg-primary" />}

      {/* 图标 */}
      <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />

      {/* 标题 */}
      <span className="flex-1 truncate">{tab.title}</span>

      {/* 关闭按钮 - 使用强调色 */}
      <button className="text-primary opacity-0 group-hover:opacity-100 hover:bg-primary/20">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ))}
</div>
```

### Context Menu

```tsx
<Menu open={menuOpen} onOpenChange={setMenuOpen}>
  <MenuPopup style={{ position: 'fixed', left: x, top: y }}>
    <MenuItem onClick={handler}>
      <Icon className="h-4 w-4" />
      Label
    </MenuItem>
    <MenuSeparator />
    <MenuItem variant="destructive" onClick={deleteHandler}>
      <Trash2 className="h-4 w-4" />
      Delete
    </MenuItem>
  </MenuPopup>
</Menu>
```

### Icon Buttons (工具栏图标按钮)

用于工具栏、搜索框等场景的小型图标按钮。

**基础样式（无状态）**：
```tsx
// 普通图标按钮 - 用于关闭、刷新等操作
<button
  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground"
>
  <X className="h-3.5 w-3.5" />
</button>
```

**切换按钮（有选中状态）**：
```tsx
// 切换按钮 - 用于大小写敏感、正则等开关
<button
  className={cn(
    'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground',
    isActive && 'bg-primary/20 text-primary'
  )}
>
  <CaseSensitive className="h-4 w-4" />
</button>
```

**带文字的切换按钮**：
```tsx
// 模式切换 - 用于 Tab 切换等
<button
  className={cn(
    'flex items-center gap-1 rounded px-2 py-1 text-xs',
    isActive
      ? 'bg-primary/20 text-primary'
      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
  )}
>
  <FileCode className="h-3.5 w-3.5" />
  Content
</button>
```

**规则总结**：
| 状态 | 样式 |
|------|------|
| 默认 | `text-muted-foreground` |
| 悬停 | `hover:bg-accent/50 hover:text-foreground` |
| 选中 | `bg-primary/20 text-primary` |
| 尺寸 | `h-6 w-6`（图标按钮）或 `px-2 py-1`（带文字）|
| 图标 | `h-3.5 w-3.5` 或 `h-4 w-4` |

**注意**：
- 悬停背景使用 `bg-accent/50`（半透明），不要用 `bg-accent`（太强烈）
- 选中状态使用 `bg-primary/20 text-primary`（微妙强调），不要用 `bg-accent`

### Dialog

```tsx
<Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
  <DialogPopup>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description text.</DialogDescription>
    </DialogHeader>
    <DialogPanel>
      {/* Content */}
    </DialogPanel>
    <DialogFooter variant="bare">
      <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
      <Button onClick={onConfirm}>Confirm</Button>
    </DialogFooter>
  </DialogPopup>
</Dialog>
```

## Icons

### 文件图标映射

使用 Lucide icons，根据文件扩展名和目录状态选择：

```tsx
// 目录
FolderOpen  // 展开状态
Folder      // 收起状态

// 常见文件类型
FileCode    // .ts, .tsx, .js, .jsx
FileJson    // .json
FileText    // .md, .txt
FileImage   // .png, .jpg, .svg
Settings    // 配置文件
```

### 图标颜色

| Type | Color |
|------|-------|
| 目录 | `text-yellow-500` |
| TypeScript | `text-blue-500` |
| JavaScript | `text-yellow-400` |
| JSON | `text-yellow-600` |
| Markdown | `text-gray-400` |
| 图片 | `text-purple-500` |
| 默认 | `text-muted-foreground` |

## Monaco Editor

### Worker 配置

避免 CSP 问题，使用本地 worker：

```tsx
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
// ... 其他 workers

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    // ...
    return new editorWorker();
  },
};
```

### 主题同步

Monaco 主题从终端主题 (Ghostty) 生成：

```tsx
monaco.editor.defineTheme('enso-theme', {
  base: isDark ? 'vs-dark' : 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: xtermTheme.brightBlack },
    { token: 'keyword', foreground: xtermTheme.magenta },
    { token: 'string', foreground: xtermTheme.green },
    // ...
  ],
  colors: {
    'editor.background': xtermTheme.background,
    'editor.foreground': xtermTheme.foreground,
    // ...
  },
});
```

### 语言检测

使用 `path` prop 自动检测语言：

```tsx
<Editor
  path={activeTab.path}  // Monaco 根据路径自动检测语言
  value={activeTab.content}
  // ...
/>
```

## Interaction Patterns

### 文件树

- **单击文件**: 在编辑器中打开
- **单击目录**: 展开/收起
- **右键**: 打开上下文菜单

### Tab 栏

- **单击 Tab**: 切换到该文件
- **拖拽 Tab**: 重新排序
- **点击关闭按钮**: 关闭文件
- **Cmd/Ctrl+S**: 保存当前文件

## Flexbox 技巧

### 文本截断对齐

```tsx
// 父容器
className="flex items-center gap-1"

// 固定宽度元素
className="h-4 w-4 shrink-0"

// 可截断文本
className="min-w-0 flex-1 truncate"
```

`min-w-0` 是关键 - 允许 flex 子元素收缩到内容尺寸以下。

## Animation System

本项目使用 **Framer Motion** 作为动画库，配置集中在 `src/renderer/lib/motion.ts`。

### 设计原则

- **快速响应**：动画时长控制在 150-200ms，保持操作效率
- **Spring 物理**：使用 Spring 弹性动画，带来自然的物理感
- **GPU 加速**：优先使用 `transform`、`opacity` 属性，启用硬件加速

### Spring 配置

| 名称 | 参数 | 适用场景 |
|------|------|----------|
| `springFast` | stiffness: 500, damping: 30 | Dialog、Menu 等弹出层 |
| `springStandard` | stiffness: 400, damping: 30 | 面板伸缩、布局动画 |
| `springGentle` | stiffness: 300, damping: 25 | Tooltip、微交互 |

### 通用 Variants

```tsx
import {
  fadeVariants,
  scaleInVariants,
  slideUpVariants,
  heightVariants,
  springFast
} from '@/lib/motion';

// 弹出层（Dialog、Menu）
<motion.div
  variants={scaleInVariants}
  initial="initial"
  animate="animate"
  exit="exit"
  transition={springFast}
>

// 高度展开（Accordion、列表）
<motion.div
  variants={heightVariants}
  initial="initial"
  animate="animate"
  exit="exit"
  transition={springStandard}
>

// Toast 通知
<motion.div
  variants={slideUpVariants}
  initial="initial"
  animate="animate"
  exit="exit"
>
```

### 微交互

```tsx
import { tapScale, hoverScale } from '@/lib/motion';
import { motion } from 'framer-motion';

// 按钮点击反馈
<motion.button whileTap={tapScale}>
  Click me
</motion.button>

// 悬浮放大
<motion.div whileHover={hoverScale}>
  Hover me
</motion.div>
```

### AnimatePresence 使用

所有条件渲染的动画元素必须用 `AnimatePresence` 包裹：

```tsx
import { AnimatePresence, motion } from 'framer-motion';

<AnimatePresence mode="wait">
  {isOpen && (
    <motion.div
      key="content"
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      Content
    </motion.div>
  )}
</AnimatePresence>
```

### Layout 动画

使用 `layout` 属性实现元素位置/尺寸的平滑过渡：

```tsx
// Tab 指示器滑动
<motion.div
  layoutId="tab-indicator"
  className="absolute bottom-0 h-0.5 bg-primary"
/>

// 列表项排序
<motion.div layout>
  {item.name}
</motion.div>
```

### 列表 Stagger 动画

```tsx
import { listContainerVariants, listItemVariants } from '@/lib/motion';

<motion.ul variants={listContainerVariants} initial="initial" animate="animate">
  {items.map((item) => (
    <motion.li key={item.id} variants={listItemVariants}>
      {item.name}
    </motion.li>
  ))}
</motion.ul>
```

### 性能注意事项

1. **避免频繁的 `height: 'auto'`**：对大列表使用虚拟化
2. **使用 `will-change` 谨慎**：仅在必要时添加
3. **避免同时动画多个属性**：优先使用 `transform` 系属性
