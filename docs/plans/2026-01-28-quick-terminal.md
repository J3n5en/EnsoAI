# Quick Terminal 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标**: 为 Agent Panel 添加可拖动的悬浮 Quick Terminal 功能，提供完整的独立终端实例。

**架构**:
- 基于现有 `ShellTerminal` 组件复用终端核心能力
- 使用 `@base-ui/react/dialog` 作为 Modal 基础
- 参考 `DraggableSettingsWindow` 实现拖动逻辑
- 扩展 settings 和 terminal stores 管理状态

**技术栈**: React, Zustand, framer-motion, @base-ui/react, xterm.js

---

## 阶段 1: 基础架构（核心功能）

### Task 1: 扩展 Settings Store

**目标**: 添加 Quick Terminal 配置项到 settings store

**文件**:
- 修改: `src/renderer/stores/settings.ts`

**Step 1: 添加 QuickTerminal 类型定义**

在 `settings.ts` 的类型定义区域（约 154 行附近），添加：

```typescript
// Quick Terminal settings
export interface QuickTerminalSettings {
  buttonPosition: { x: number; y: number } | null;
  modalPosition: { x: number; y: number } | null;
  modalSize: { width: number; height: number } | null;
  isOpen: boolean;
}
```

**Step 2: 添加到 SettingsState 接口**

在 `SettingsState` 接口中（约 483 行附近），添加字段：

```typescript
interface SettingsState {
  // ... 现有字段
  quickTerminal: QuickTerminalSettings;

  // ... 现有方法
  setQuickTerminalButtonPosition: (position: { x: number; y: number } | null) => void;
  setQuickTerminalModalPosition: (position: { x: number; y: number } | null) => void;
  setQuickTerminalModalSize: (size: { width: number; height: number } | null) => void;
  setQuickTerminalOpen: (open: boolean) => void;
}
```

**Step 3: 添加默认值**

在 `useSettingsStore` 创建时（约 620 行附近），添加默认值：

```typescript
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // ... 现有默认值
      quickTerminal: {
        buttonPosition: null,
        modalPosition: null,
        modalSize: null,
        isOpen: false,
      },
```

**Step 4: 实现 setter 方法**

在 store 实现的末尾（约 900 行附近），添加方法：

```typescript
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
```

**Step 5: 提交**

```bash
cd /Users/j3n5en/ensoai/workspaces/EnsoAI/quick-terminal
git add src/renderer/stores/settings.ts
git commit -m "feat(store): 添加 Quick Terminal 配置项到 settings store"
```

---

### Task 2: 扩展 Terminal Store

**目标**: 添加 Quick Terminal session 管理到 terminal store

**文件**:
- 修改: `src/renderer/stores/terminal.ts`

**Step 1: 添加 quickTerminalSessions 字段**

在 `TerminalState` 接口中（约第 4 行），添加：

```typescript
interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  quickTerminalSessions: Map<string, string>; // worktreePath -> sessionId

  addSession: (session: TerminalSession) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateSession: (id: string, updates: Partial<TerminalSession>) => void;
  syncSessions: (sessions: TerminalSession[]) => void;

  // Quick Terminal session management
  setQuickTerminalSession: (worktreePath: string, sessionId: string) => void;
  getQuickTerminalSession: (worktreePath: string) => string | undefined;
  removeQuickTerminalSession: (worktreePath: string) => void;
}
```

**Step 2: 初始化 quickTerminalSessions**

在 store 创建时（约第 15 行），添加初始值：

```typescript
export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  quickTerminalSessions: new Map(),
```

**Step 3: 实现 Quick Terminal session 方法**

在 store 末尾，添加方法实现：

```typescript
  syncSessions: (sessions) => set({ sessions }),

  setQuickTerminalSession: (worktreePath, sessionId) =>
    set((state) => {
      const newMap = new Map(state.quickTerminalSessions);
      newMap.set(worktreePath, sessionId);
      return { quickTerminalSessions: newMap };
    }),
  getQuickTerminalSession: (worktreePath) => {
    const state = get();
    return state.quickTerminalSessions.get(worktreePath);
  },
  removeQuickTerminalSession: (worktreePath) =>
    set((state) => {
      const newMap = new Map(state.quickTerminalSessions);
      newMap.delete(worktreePath);
      return { quickTerminalSessions: newMap };
    }),
}));
```

**Step 4: 提交**

```bash
git add src/renderer/stores/terminal.ts
git commit -m "feat(store): 添加 Quick Terminal session 管理到 terminal store"
```

---

### Task 3: 创建 QuickTerminalButton 组件（固定位置）

**目标**: 创建悬浮按钮组件（阶段 1 先使用固定位置）

**文件**:
- 创建: `src/renderer/components/chat/QuickTerminalButton.tsx`

**Step 1: 创建基础组件文件**

```typescript
import { Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickTerminalButtonProps {
  isOpen: boolean;
  hasRunningProcess: boolean;
  onClick: () => void;
}

export function QuickTerminalButton({
  isOpen,
  hasRunningProcess,
  onClick,
}: QuickTerminalButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all',
        'bg-primary/90 text-primary-foreground hover:bg-primary hover:scale-105 active:scale-95',
        isOpen && 'opacity-50'
      )}
      style={{
        right: '16px',
        bottom: '16px',
      }}
      title="Quick Terminal (Ctrl+`)"
    >
      <Terminal className="h-5 w-5" />

      {/* Status indicator - 暂时隐藏，阶段 3 实现 */}
      {hasRunningProcess && (
        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </button>
  );
}
```

**Step 2: 提交**

```bash
git add src/renderer/components/chat/QuickTerminalButton.tsx
git commit -m "feat(ui): 创建 QuickTerminalButton 悬浮按钮组件"
```

---

### Task 4: 创建 QuickTerminalModal 组件（固定位置）

**目标**: 创建 Modal 容器组件（阶段 1 先使用固定位置和尺寸）

**文件**:
- 创建: `src/renderer/components/chat/QuickTerminalModal.tsx`

**Step 1: 创建基础 Modal 组件**

```typescript
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { Minimize2, X, Terminal as TerminalIcon } from 'lucide-react';
import { ShellTerminal } from '@/components/terminal/ShellTerminal';
import { cn } from '@/lib/utils';

interface QuickTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string;
}

export function QuickTerminalModal({
  open,
  onOpenChange,
  cwd,
}: QuickTerminalModalProps) {
  // 默认尺寸和位置（阶段 1 固定值）
  const modalWidth = Math.min(Math.max(window.innerWidth * 0.6, 600), 1200);
  const modalHeight = Math.min(Math.max(window.innerHeight * 0.35, 300), 600);
  const modalLeft = (window.innerWidth - modalWidth) / 2;
  const modalBottom = 40;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className="!max-w-none !rounded-lg"
        showCloseButton={false}
        showBackdrop={false}
        style={{
          position: 'fixed',
          left: `${modalLeft}px`,
          bottom: `${modalBottom}px`,
          width: `${modalWidth}px`,
          height: `${modalHeight}px`,
          top: 'auto',
          transform: 'none',
        }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between h-9 px-3 border-b bg-muted/30 rounded-t-lg select-none">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TerminalIcon className="h-4 w-4" />
            <span>Quick Terminal</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              title="最小化 (Esc)"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 终端内容区 */}
        <div className="flex-1 min-h-0">
          {open && <ShellTerminal cwd={cwd} isActive={open} />}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
```

**Step 2: 提交**

```bash
git add src/renderer/components/chat/QuickTerminalModal.tsx
git commit -m "feat(ui): 创建 QuickTerminalModal 悬浮终端窗口组件"
```

---

### Task 5: 集成到 AgentPanel

**目标**: 将 Quick Terminal 组件集成到 AgentPanel

**文件**:
- 修改: `src/renderer/components/chat/AgentPanel.tsx`

**Step 1: 导入组件和 hooks**

在文件顶部导入区域（约第 1-26 行），添加：

```typescript
import { QuickTerminalButton } from './QuickTerminalButton';
import { QuickTerminalModal } from './QuickTerminalModal';
```

**Step 2: 获取 Quick Terminal 状态**

在 `AgentPanel` 组件内，`useSettingsStore` 调用后（约 114-123 行），添加：

```typescript
  const quickTerminalOpen = useSettingsStore((s) => s.quickTerminal.isOpen);
  const setQuickTerminalOpen = useSettingsStore((s) => s.setQuickTerminalOpen);
```

**Step 3: 添加切换处理函数**

在组件内部，状态声明后，添加：

```typescript
  const handleToggleQuickTerminal = useCallback(() => {
    setQuickTerminalOpen(!quickTerminalOpen);
  }, [quickTerminalOpen, setQuickTerminalOpen]);
```

**Step 4: 渲染 Quick Terminal 组件**

在组件返回的 JSX 中，StatusLine 之后（约 1270 行），添加：

```typescript
      {/* Quick Terminal - 仅在 Agent Panel 激活时显示 */}
      {isActive && (
        <>
          <QuickTerminalButton
            isOpen={quickTerminalOpen}
            hasRunningProcess={false} // 阶段 3 实现
            onClick={handleToggleQuickTerminal}
          />
          <QuickTerminalModal
            open={quickTerminalOpen}
            onOpenChange={setQuickTerminalOpen}
            cwd={cwd}
          />
        </>
      )}
    </div>
  );
}
```

**Step 5: 验证集成**

运行开发服务器验证：
```bash
npm run dev
```

预期行为：
- Agent Panel 右下角显示悬浮按钮
- 点击按钮打开/关闭 Modal
- Modal 中显示终端
- ESC 键关闭 Modal

**Step 6: 提交**

```bash
git add src/renderer/components/chat/AgentPanel.tsx
git commit -m "feat(agent): 集成 Quick Terminal 到 AgentPanel"
```

---

## 阶段 2: 拖动能力

### Task 6: 创建 useDraggable Hook

**目标**: 提取可复用的拖动逻辑

**文件**:
- 创建: `src/renderer/hooks/useDraggable.ts`

**Step 1: 创建 hook 文件**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseDraggableOptions {
  initialPosition: { x: number; y: number } | null;
  bounds?: { width: number; height: number }; // 元素尺寸
  containerBounds?: { width: number; height: number }; // 容器尺寸 (默认 window)
  minVisibleArea?: { x: number; y: number }; // 最小可见区域
  onPositionChange?: (position: { x: number; y: number }) => void;
}

export function useDraggable({
  initialPosition,
  bounds = { width: 0, height: 0 },
  containerBounds,
  minVisibleArea = { x: 32, y: 32 },
  onPositionChange,
}: UseDraggableOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });

  // 计算边界约束
  const clampPosition = useCallback(
    (pos: { x: number; y: number }) => {
      const container = containerBounds || {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      const minX = -bounds.width + minVisibleArea.x;
      const maxX = container.width - minVisibleArea.x;
      const minY = 0;
      const maxY = container.height - minVisibleArea.y;

      return {
        x: Math.max(minX, Math.min(pos.x, maxX)),
        y: Math.max(minY, Math.min(pos.y, maxY)),
      };
    },
    [bounds, containerBounds, minVisibleArea]
  );

  // 初始化位置（居中或使用保存的位置）
  useEffect(() => {
    if (initialPosition) {
      setPosition(clampPosition(initialPosition));
    } else {
      // 默认居中
      const container = containerBounds || {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const centered = {
        x: (container.width - bounds.width) / 2,
        y: (container.height - bounds.height) / 2,
      };
      setPosition(clampPosition(centered));
    }
  }, [initialPosition, bounds, containerBounds, clampPosition]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const newPos = {
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y,
      };

      setPosition(clampPosition(newPos));
    },
    [isDragging, clampPosition]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onPositionChange?.(position);
    }
  }, [isDragging, position, onPositionChange]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return {
    position,
    isDragging,
    dragHandlers: {
      onMouseDown: handleMouseDown,
    },
  };
}
```

**Step 2: 提交**

```bash
git add src/renderer/hooks/useDraggable.ts
git commit -m "feat(hook): 创建 useDraggable 可复用拖动 hook"
```

---

### Task 7: 为 QuickTerminalButton 添加拖动功能

**目标**: 使按钮可拖动并保存位置

**文件**:
- 修改: `src/renderer/components/chat/QuickTerminalButton.tsx`

**Step 1: 导入 hook 和 settings**

```typescript
import { Terminal } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { useDraggable } from '@/hooks/useDraggable';
import { cn } from '@/lib/utils';
```

**Step 2: 使用 useDraggable hook**

在组件内部，添加：

```typescript
export function QuickTerminalButton({
  isOpen,
  hasRunningProcess,
  onClick,
}: QuickTerminalButtonProps) {
  const buttonPosition = useSettingsStore((s) => s.quickTerminal.buttonPosition);
  const setButtonPosition = useSettingsStore((s) => s.setQuickTerminalButtonPosition);

  const BUTTON_SIZE = 48;

  const { position, isDragging, dragHandlers } = useDraggable({
    initialPosition: buttonPosition || { x: window.innerWidth - BUTTON_SIZE - 16, y: window.innerHeight - BUTTON_SIZE - 16 },
    bounds: { width: BUTTON_SIZE, height: BUTTON_SIZE },
    onPositionChange: setButtonPosition,
  });

  const handleClick = (e: React.MouseEvent) => {
    // 如果刚拖动过，不触发点击
    if (isDragging) {
      e.stopPropagation();
      return;
    }
    onClick();
  };
```

**Step 3: 更新渲染逻辑**

```typescript
  return (
    <button
      type="button"
      onClick={handleClick}
      {...dragHandlers}
      className={cn(
        'fixed z-30 flex items-center justify-center rounded-full shadow-lg transition-all',
        'bg-primary/90 text-primary-foreground hover:bg-primary hover:scale-105 active:scale-95',
        isDragging && 'cursor-grabbing opacity-70',
        !isDragging && 'cursor-grab',
        isOpen && 'opacity-50'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${BUTTON_SIZE}px`,
        height: `${BUTTON_SIZE}px`,
      }}
      title="Quick Terminal (Ctrl+`)"
    >
      <Terminal className="h-5 w-5" />

      {hasRunningProcess && (
        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </button>
  );
}
```

**Step 4: 验证拖动**

运行并测试：
```bash
npm run dev
```

预期行为：
- 按钮可拖动
- 拖动后位置被保存
- 刷新后位置保持
- 边界约束正确

**Step 5: 提交**

```bash
git add src/renderer/components/chat/QuickTerminalButton.tsx
git commit -m "feat(ui): 为 QuickTerminalButton 添加拖动功能"
```

---

### Task 8: 为 QuickTerminalModal 添加拖动功能

**目标**: 使 Modal 可通过标题栏拖动并保存位置

**文件**:
- 修改: `src/renderer/components/chat/QuickTerminalModal.tsx`

**Step 1: 导入 hook 和 settings**

```typescript
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { Minimize2, X, Terminal as TerminalIcon } from 'lucide-react';
import { ShellTerminal } from '@/components/terminal/ShellTerminal';
import { useSettingsStore } from '@/stores/settings';
import { useDraggable } from '@/hooks/useDraggable';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
```

**Step 2: 计算 Modal 尺寸和使用 useDraggable**

```typescript
export function QuickTerminalModal({
  open,
  onOpenChange,
  cwd,
}: QuickTerminalModalProps) {
  const modalPosition = useSettingsStore((s) => s.quickTerminal.modalPosition);
  const setModalPosition = useSettingsStore((s) => s.setQuickTerminalModalPosition);

  // 计算默认尺寸
  const modalSize = useMemo(() => {
    const width = Math.min(Math.max(window.innerWidth * 0.6, 600), 1200);
    const height = Math.min(Math.max(window.innerHeight * 0.35, 300), 600);
    return { width, height };
  }, []);

  // 计算默认位置（底部居中）
  const defaultPosition = useMemo(() => {
    const left = (window.innerWidth - modalSize.width) / 2;
    const top = window.innerHeight - modalSize.height - 40;
    return { x: left, y: top };
  }, [modalSize]);

  const { position, isDragging, dragHandlers } = useDraggable({
    initialPosition: modalPosition || defaultPosition,
    bounds: modalSize,
    minVisibleArea: { x: 50, y: 32 }, // 确保标题栏至少 50% 可见
    onPositionChange: setModalPosition,
  });
```

**Step 3: 更新标题栏为可拖动**

```typescript
        {/* 标题栏 - 可拖动 */}
        <div
          {...dragHandlers}
          className={cn(
            'flex items-center justify-between h-9 px-3 border-b bg-muted/30 rounded-t-lg select-none',
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium pointer-events-none">
            <TerminalIcon className="h-4 w-4" />
            <span>Quick Terminal</span>
          </div>
          <div className="flex items-center gap-1 pointer-events-auto">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              title="最小化 (Esc)"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
```

**Step 4: 更新 Modal 样式使用拖动位置**

```typescript
      <DialogPopup
        className="!max-w-none !rounded-lg"
        showCloseButton={false}
        showBackdrop={false}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${modalSize.width}px`,
          height: `${modalSize.height}px`,
          transform: 'none',
        }}
      >
```

**Step 5: 验证拖动**

运行并测试：
```bash
npm run dev
```

预期行为：
- Modal 可通过标题栏拖动
- 按钮可正常点击（pointer-events-auto）
- 位置被保存并在重新打开时恢复
- 边界约束正确（标题栏始终可见）

**Step 6: 提交**

```bash
git add src/renderer/components/chat/QuickTerminalModal.tsx
git commit -m "feat(ui): 为 QuickTerminalModal 添加拖动功能"
```

---

## 阶段 3: 增强功能

### Task 9: 实现终端会话管理

**目标**: 每个 worktree 独立 quick terminal 会话

**文件**:
- 修改: `src/renderer/components/chat/QuickTerminalModal.tsx`
- 修改: `src/renderer/components/chat/AgentPanel.tsx`

**Step 1: 在 Modal 中添加 session 管理**

修改 `QuickTerminalModal.tsx`，添加 props 和逻辑：

```typescript
interface QuickTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string;
  sessionId?: string;
  onSessionInit: (sessionId: string) => void;
}

export function QuickTerminalModal({
  open,
  onOpenChange,
  cwd,
  sessionId,
  onSessionInit,
}: QuickTerminalModalProps) {
  // ... 现有代码

  // 终端初始化回调
  const handleTerminalInit = useCallback((ptyId: string) => {
    onSessionInit?.(ptyId);
  }, [onSessionInit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ... */}
        <div className="flex-1 min-h-0">
          {open && (
            <ShellTerminal
              cwd={cwd}
              isActive={open}
              // 传递 session 初始化回调
              onTitleChange={handleTerminalInit}
            />
          )}
        </div>
      {/* ... */}
    </Dialog>
  );
}
```

**Step 2: 在 AgentPanel 中管理会话**

修改 `AgentPanel.tsx`，添加会话管理逻辑：

```typescript
  const { getQuickTerminalSession, setQuickTerminalSession } = useTerminalStore();
  const currentQuickTerminalSession = getQuickTerminalSession(cwd);

  const handleQuickTerminalSessionInit = useCallback(
    (sessionId: string) => {
      if (!currentQuickTerminalSession) {
        setQuickTerminalSession(cwd, sessionId);
      }
    },
    [cwd, currentQuickTerminalSession, setQuickTerminalSession]
  );

  // 在 worktree 切换时更新 session
  useEffect(() => {
    const sessionId = getQuickTerminalSession(cwd);
    // 如果切换到新 worktree 且有 session，可以在这里处理
  }, [cwd, getQuickTerminalSession]);
```

**Step 3: 更新 QuickTerminalModal 调用**

```typescript
          <QuickTerminalModal
            open={quickTerminalOpen}
            onOpenChange={setQuickTerminalOpen}
            cwd={cwd}
            sessionId={currentQuickTerminalSession}
            onSessionInit={handleQuickTerminalSessionInit}
          />
```

**Step 4: 验证会话管理**

测试：
1. 打开 Quick Terminal，执行命令
2. 关闭 Modal
3. 重新打开，验证会话保持
4. 切换 worktree，验证新 worktree 有独立会话

**Step 5: 提交**

```bash
git add src/renderer/components/chat/QuickTerminalModal.tsx src/renderer/components/chat/AgentPanel.tsx
git commit -m "feat(terminal): 实现每 worktree 独立 quick terminal 会话管理"
```

---

### Task 10: 实现进程状态检测

**目标**: 检测终端是否有运行中的进程并显示状态

**文件**:
- 修改: `src/renderer/components/chat/AgentPanel.tsx`

**Step 1: 添加进程状态检测逻辑**

在 `AgentPanel.tsx` 中，添加状态检测：

```typescript
  const [hasRunningProcess, setHasRunningProcess] = useState(false);

  // 监听终端输出状态（简化版，检测是否有活动）
  useEffect(() => {
    if (!currentQuickTerminalSession) {
      setHasRunningProcess(false);
      return;
    }

    // TODO: 实现真正的进程检测逻辑
    // 这里可以通过监听终端输出或使用 IPC 查询进程状态
    // 暂时设置为 false
    setHasRunningProcess(false);
  }, [currentQuickTerminalSession]);
```

**Step 2: 传递状态到按钮**

```typescript
          <QuickTerminalButton
            isOpen={quickTerminalOpen}
            hasRunningProcess={hasRunningProcess}
            onClick={handleToggleQuickTerminal}
          />
```

**Step 3: 验证状态显示**

测试按钮状态指示器：
- 无进程时：无指示器
- 有进程时：绿色呼吸动画（待后续实现真正检测）

**Step 4: 提交**

```bash
git add src/renderer/components/chat/AgentPanel.tsx
git commit -m "feat(ui): 添加终端进程状态检测基础架构"
```

---

### Task 11: 添加快捷键支持

**目标**: 支持 Ctrl+` 快捷键切换 Quick Terminal

**文件**:
- 修改: `src/renderer/components/chat/AgentPanel.tsx`

**Step 1: 添加快捷键监听**

在 `AgentPanel` 中，添加快捷键处理：

```typescript
  // Quick Terminal 快捷键监听
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+` 或 Cmd+` (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        handleToggleQuickTerminal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleToggleQuickTerminal]);
```

**Step 2: 验证快捷键**

测试：
1. 按 `Ctrl+\`` 打开 Quick Terminal
2. 再按 `Ctrl+\`` 关闭
3. 确保只在 Agent Panel 激活时响应

**Step 3: 提交**

```bash
git add src/renderer/components/chat/AgentPanel.tsx
git commit -m "feat(keybinding): 添加 Ctrl+` 快捷键切换 Quick Terminal"
```

---

### Task 12: 添加窗口 resize 处理

**目标**: 窗口大小改变时自动调整位置，防止越界

**文件**:
- 修改: `src/renderer/hooks/useDraggable.ts`

**Step 1: 添加 resize 监听**

在 `useDraggable` hook 中，添加：

```typescript
  // 窗口 resize 时重新验证位置
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampPosition(prev));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPosition]);
```

**Step 2: 验证 resize 行为**

测试：
1. 拖动按钮/Modal 到边缘
2. 调整窗口大小
3. 验证元素位置自动调整到合法范围

**Step 3: 提交**

```bash
git add src/renderer/hooks/useDraggable.ts
git commit -m "feat(hook): 添加窗口 resize 时的位置自动调整"
```

---

### Task 13: 优化动画效果

**目标**: 为 Modal 打开/关闭添加流畅动画

**文件**:
- 修改: `src/renderer/components/chat/QuickTerminalModal.tsx`

**Step 1: 添加 framer-motion 动画**

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { fadeInVariants, scaleInVariants, springFast } from '@/lib/motion';
```

**Step 2: 包装 DialogPopup 添加动画**

```typescript
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <motion.div
            variants={fadeInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springFast}
          >
            <DialogPopup
              className="!max-w-none !rounded-lg"
              showCloseButton={false}
              showBackdrop={false}
              style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${modalSize.width}px`,
                height: `${modalSize.height}px`,
                transform: 'none',
              }}
            >
              {/* 内容 */}
            </DialogPopup>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
```

**Step 3: 验证动画**

测试打开/关闭动画是否流畅自然

**Step 4: 提交**

```bash
git add src/renderer/components/chat/QuickTerminalModal.tsx
git commit -m "feat(animation): 为 Quick Terminal Modal 添加打开/关闭动画"
```

---

### Task 14: 最终测试和文档更新

**目标**: 全面测试功能并更新文档

**Step 1: 创建测试清单**

测试所有功能点：
- [ ] 按钮点击打开/关闭 Modal
- [ ] 按钮可拖动并保存位置
- [ ] Modal 可拖动并保存位置
- [ ] 每个 worktree 独立会话
- [ ] 关闭 Modal 后终端保持运行
- [ ] Ctrl+` 快捷键正常工作
- [ ] 窗口 resize 后位置调整正确
- [ ] 动画流畅
- [ ] 边界约束正确

**Step 2: 修复发现的问题**

根据测试结果修复 bug

**Step 3: 更新设计文档**

标记实施计划中的所有任务为已完成

**Step 4: 最终提交**

```bash
git add -A
git commit -m "feat(quick-terminal): 完成 Quick Terminal 功能实现

实现了以下功能：
- 可拖动的悬浮按钮和 Modal
- 每个 worktree 独立终端会话
- 位置持久化
- Ctrl+` 快捷键支持
- 窗口 resize 处理
- 流畅动画效果
"
```

---

## 完成标准

- ✅ 所有组件创建完成并集成
- ✅ 拖动功能正常工作
- ✅ 位置持久化正确
- ✅ 会话管理符合设计
- ✅ 快捷键响应正确
- ✅ 无明显 bug
- ✅ 代码符合项目规范

## 预估时间

- 阶段 1 (基础架构): ~2 小时
- 阶段 2 (拖动能力): ~1.5 小时
- 阶段 3 (增强功能): ~1.5 小时
- 总计: ~5 小时
