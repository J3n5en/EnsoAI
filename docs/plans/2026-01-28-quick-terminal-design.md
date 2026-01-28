# Quick Terminal 设计文档

**日期**: 2026-01-28
**状态**: 设计阶段
**作者**: Claude Code

## 概述

为 Agent Panel 添加 Quick Terminal 功能，提供完整的独立终端实例，通过可拖动的悬浮窗口交互。类似 VSCode 的 Quick Terminal，但以悬浮窗口形式呈现。

### 核心目标

- 提供完整的终端功能（与 TerminalPanel 同等能力）
- 以悬浮窗口形式快速访问终端
- 收起后保持终端进程运行状态
- 每个 worktree 拥有独立的 quick terminal 会话
- 支持拖动按钮和窗口位置，并记忆用户偏好

## 用户需求

### 功能需求

1. **悬浮触发按钮**
   - 位于 Agent Panel 右下角
   - 可拖动并记忆位置
   - 显示终端运行状态（进程活跃指示）

2. **悬浮终端窗口**
   - 可拖动标题栏改变位置
   - 中等尺寸（60vw × 35vh）
   - 默认位置：底部居中
   - 记忆用户拖动后的位置

3. **会话管理**
   - 每个 worktree 独立会话
   - 切换 worktree 时自动切换对应 session
   - 关闭窗口时不销毁进程（只是隐藏）

4. **状态指示**
   - 按钮显示运行状态（颜色/圆点）
   - 无进程：隐藏指示器
   - 有进程运行：绿色呼吸动画
   - 进程已结束：灰色

### 非功能需求

- 与现有 TerminalPanel 共享核心逻辑（复用 `useXterm`）
- 仅在 Agent Panel 激活时显示
- 支持快捷键 `Ctrl+\`` 切换显示

## 架构设计

### 组件结构

```
AgentPanel
├── QuickTerminalButton (悬浮按钮, z-30)
└── QuickTerminalModal (终端窗口, z-40)
    ├── 标题栏 (可拖动区域)
    │   ├── Terminal 图标 + 标题
    │   └── 最小化/关闭按钮
    └── ShellTerminal (复用现有组件)
```

### 新增组件

#### 1. QuickTerminalButton

**文件**: `src/renderer/components/chat/QuickTerminalButton.tsx`

**职责**:
- 渲染可拖动的圆形悬浮按钮
- 显示终端运行状态指示器
- 处理点击事件打开 Modal
- 持久化按钮位置到 settings

**Props**:
```typescript
interface QuickTerminalButtonProps {
  isOpen: boolean;           // Modal 是否打开
  hasRunningProcess: boolean; // 是否有运行中的进程
  onClick: () => void;       // 点击事件
}
```

**视觉规格**:
- 直径: 48px
- 背景: `bg-primary/90`, hover 时 `bg-primary`
- 图标: `Terminal` (lucide-react)
- 状态指示器: 右上角 8px 圆点
  - 运行中: `bg-green-500` + 呼吸动画
  - 已结束: `bg-muted-foreground`
- 默认位置: 右下角 (right: 16px, bottom: 16px)

#### 2. QuickTerminalModal

**文件**: `src/renderer/components/chat/QuickTerminalModal.tsx`

**职责**:
- 渲染可拖动的 Modal 容器
- 集成 `ShellTerminal` 组件
- 处理窗口拖动和位置持久化
- 管理最小化/关闭行为

**Props**:
```typescript
interface QuickTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string;           // 当前 worktree 路径
  sessionId?: string;    // 终端 session ID
  onSessionCreate: () => void; // 创建 session 回调
}
```

**视觉规格**:
- 默认尺寸:
  - 宽度: `60vw` (min: 600px, max: 1200px)
  - 高度: `35vh` (min: 300px, max: 600px)
- 标题栏高度: `h-9` (36px)
- 边框: `border border-border rounded-lg shadow-2xl`
- 默认位置: 底部居中，距底部 40px

#### 3. useDraggable Hook (可选)

**文件**: `src/renderer/hooks/useDraggable.ts`

**职责**:
- 提取可复用的拖动逻辑
- 支持边界约束
- 自动持久化位置到 settings

**接口**:
```typescript
interface UseDraggableOptions {
  initialPosition: { x: number; y: number } | null;
  bounds?: { width: number; height: number }; // 元素尺寸
  containerBounds?: DOMRect; // 容器边界
  onPositionChange?: (position: { x: number; y: number }) => void;
}

function useDraggable(options: UseDraggableOptions): {
  position: { x: number; y: number };
  isDragging: boolean;
  dragHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
  };
}
```

### 状态管理

#### 扩展 settings store

**文件**: `src/renderer/stores/settings.ts`

```typescript
interface QuickTerminalSettings {
  buttonPosition: { x: number; y: number } | null;
  modalPosition: { x: number; y: number } | null;
  modalSize: { width: number; height: number } | null;
  isOpen: boolean;
}

// 添加到 SettingsState
quickTerminal: QuickTerminalSettings;
```

**默认值**:
```typescript
quickTerminal: {
  buttonPosition: null, // 使用默认位置 (right: 16px, bottom: 16px)
  modalPosition: null,  // 使用默认位置 (底部居中)
  modalSize: null,      // 使用默认尺寸
  isOpen: false,
}
```

#### 扩展 terminal store

**文件**: `src/renderer/stores/terminal.ts`

```typescript
interface TerminalState {
  // ... 现有字段
  quickTerminalSessions: Map<string, string>; // worktreePath -> sessionId
}

// 添加方法
setQuickTerminalSession: (worktreePath: string, sessionId: string) => void;
getQuickTerminalSession: (worktreePath: string) => string | undefined;
removeQuickTerminalSession: (worktreePath: string) => void;
```

### 集成到 AgentPanel

**修改文件**: `src/renderer/components/chat/AgentPanel.tsx`

**渲染结构**:
```tsx
<div className="relative h-full w-full">
  {/* 现有内容: terminals, session bars, status line */}

  {/* Quick Terminal Button - z-30 */}
  {isActive && (
    <QuickTerminalButton
      isOpen={quickTerminalOpen}
      hasRunningProcess={hasRunningProcess}
      onClick={handleToggleQuickTerminal}
    />
  )}

  {/* Quick Terminal Modal - z-40 */}
  <QuickTerminalModal
    open={quickTerminalOpen}
    onOpenChange={setQuickTerminalOpen}
    cwd={cwd}
    sessionId={currentQuickTerminalSession}
    onSessionCreate={handleCreateQuickTerminalSession}
  />
</div>
```

**逻辑处理**:
1. 监听快捷键 `Ctrl+\`` (使用现有 keybinding 系统)
2. 管理 quick terminal session 生命周期
3. 切换 worktree 时更新 `currentQuickTerminalSession`

## 技术实现细节

### 拖动实现

参考 `DraggableSettingsWindow` 的实现，使用原生事件处理：

```typescript
const handleMouseDown = (e: React.MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;

  const handleMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;

    // 计算新位置（带边界约束）
    const newX = clamp(position.x + deltaX, minX, maxX);
    const newY = clamp(position.y + deltaY, minY, maxY);

    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    // 持久化位置
    savePosition(position);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};
```

**边界约束**:
- 按钮: 完全位于 Agent Panel 内
- Modal: 标题栏至少 50% 可见（允许拖回）

### 会话管理

**初始化流程**:
1. 用户打开 Quick Terminal
2. 检查 `quickTerminalSessions.get(currentWorktreePath)`
3. 如果无 session:
   - 调用 `window.electronAPI.terminal.create({ cwd, ... })`
   - 存储 sessionId: `quickTerminalSessions.set(currentWorktreePath, sessionId)`
4. 渲染 `ShellTerminal` 并传入 sessionId

**Worktree 切换**:
```typescript
useEffect(() => {
  const sessionId = getQuickTerminalSession(cwd);
  setCurrentQuickTerminalSession(sessionId);
}, [cwd]);
```

**会话清理**:
- Modal 关闭时: 只隐藏，不销毁
- 提供显式"终止进程"按钮（可选）:
  - 调用 `window.electronAPI.terminal.destroy(sessionId)`
  - 从 `quickTerminalSessions` 中移除

### 快捷键支持

**修改文件**: `src/renderer/components/settings/KeybindingsSettings.tsx`

```typescript
// 添加到 keybindings 配置
{
  id: 'toggleQuickTerminal',
  label: 'Toggle Quick Terminal',
  category: 'terminal',
  default: 'Ctrl+`',
}
```

**在 AgentPanel 中监听**:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (matchesKeybinding(e, keybindings.toggleQuickTerminal)) {
      e.preventDefault();
      toggleQuickTerminal();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [keybindings, toggleQuickTerminal]);
```

## 边界情况处理

### 1. 窗口 Resize

**问题**: 用户调整窗口大小后，保存的位置可能越界

**解决方案**:
```typescript
useEffect(() => {
  const handleResize = () => {
    // 重新计算边界，调整位置
    const newPosition = clampPositionToBounds(savedPosition, newBounds);
    if (newPosition !== savedPosition) {
      updatePosition(newPosition);
    }
  };

  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, [savedPosition]);
```

### 2. PTY 创建失败

**问题**: 终端进程启动失败

**解决方案**:
- 在 Modal 中显示错误信息
- 提供"重试"按钮
- 记录错误到日志

### 3. Session 冲突

**问题**: 同一 worktree 在多个窗口打开

**解决方案**:
- 当前架构下不会发生（单窗口应用）
- 未来多窗口支持时，需添加 session 锁机制

### 4. 空状态

**问题**: 首次打开时无 session

**解决方案**:
- 自动创建 session
- 显示加载状态（spinner）
- 创建完成后自动激活

## 实施计划

### 阶段 1: 基础架构 (核心功能)

**目标**: 基本可用的 Quick Terminal

**任务**:
1. ✅ 扩展 `settings.ts` 添加 `quickTerminal` 配置
2. ✅ 扩展 `terminal.ts` 添加 `quickTerminalSessions` 管理
3. ✅ 创建 `QuickTerminalModal` 组件（固定位置、固定尺寸）
4. ✅ 创建 `QuickTerminalButton` 组件（固定位置）
5. ✅ 集成到 `AgentPanel.tsx`

**验收标准**:
- 点击按钮能打开/关闭 Modal
- Modal 中能正常使用终端
- 关闭 Modal 后终端进程保持运行
- 重新打开能恢复到之前的会话

### 阶段 2: 拖动能力

**目标**: 支持自定义位置

**任务**:
1. ✅ 实现 `useDraggable` hook（可选）
2. ✅ 为 `QuickTerminalButton` 添加拖动功能
3. ✅ 为 `QuickTerminalModal` 添加拖动功能
4. ✅ 实现位置持久化

**验收标准**:
- 按钮可拖动，位置被保存
- Modal 可通过标题栏拖动，位置被保存
- 刷新应用后位置保持不变
- 窗口 resize 后位置自动调整到合法范围

### 阶段 3: 增强功能

**目标**: 完善用户体验

**任务**:
1. ✅ 实现状态指示器（进程运行检测）
2. ✅ 添加快捷键支持 (`Ctrl+\``)
3. ✅ 处理边界情况（resize、创建失败等）
4. ✅ 添加动画效果（Modal 打开/关闭、状态指示器呼吸）

**验收标准**:
- 按钮正确显示终端运行状态
- 快捷键能正常切换 Modal
- 边界情况处理正确
- 动画流畅自然

## 文件清单

### 新增文件

- `src/renderer/components/chat/QuickTerminalButton.tsx` - 悬浮按钮组件
- `src/renderer/components/chat/QuickTerminalModal.tsx` - 终端窗口组件
- `src/renderer/hooks/useDraggable.ts` (可选) - 拖动逻辑 hook

### 修改文件

- `src/renderer/stores/settings.ts` - 添加 quickTerminal 配置
- `src/renderer/stores/terminal.ts` - 添加 quickTerminalSessions 管理
- `src/renderer/components/chat/AgentPanel.tsx` - 集成 Quick Terminal
- `src/renderer/components/settings/KeybindingsSettings.tsx` - 添加快捷键配置

## 设计原则遵循

### COSS UI 组件库

- 使用 `@coss/ui` 的 `Button` 组件
- Modal 基于 `@base-ui/react/dialog` 封装
- 图标使用 `lucide-react`

### 颜色系统

- 按钮: `bg-primary`, `text-primary-foreground`
- 状态指示: `bg-green-500` (运行中), `bg-muted-foreground` (已结束)
- Modal 边框: `border-border`

### 间距与尺寸

- 标题栏高度: `h-9` (与 Tab 栏一致)
- 按钮间距: `gap-2`
- 圆角: `rounded-lg`

### 动画

- 使用 `framer-motion` (已在 `src/renderer/lib/motion.ts` 封装)
- Modal 打开/关闭: `fadeIn`/`fadeOut` + `scaleIn`/`scaleOut`
- 状态指示器: CSS `animate-pulse` (呼吸效果)

## 未来扩展

### 可选功能 (本次不实现)

1. **窗口大小调整**
   - 支持拖动边框/角落调整尺寸
   - 记忆用户自定义尺寸

2. **多标签页支持**
   - 在同一个 Modal 中管理多个终端会话
   - 类似 TerminalPanel 的分组功能

3. **预设布局**
   - 提供几种常用的位置/尺寸预设
   - 快速切换布局

4. **全局 Quick Terminal**
   - 跨 worktree 的全局终端选项
   - 用户可选择独立会话或全局共享

## 参考资料

- 现有实现: `src/renderer/components/terminal/TerminalPanel.tsx`
- 拖动参考: `src/renderer/components/settings/DraggableSettingsWindow.tsx`
- Modal 参考: `src/renderer/components/source-control/CodeReviewModal.tsx`
- 设计系统: `docs/design-system.md`
