# Z-Index 系统指导

## 概述

本项目使用统一的 z-index token 系统来管理所有 UI 组件的层叠顺序，避免硬编码数值导致的层级冲突问题。

**核心原则**：

- ✅ **始终使用** `Z_INDEX` token，禁止硬编码数值
- ✅ **优先使用** 语义化的 token 名称（如 `DROPDOWN`、`MODAL_CONTENT`）
- ✅ **遵循层级体系**，不要随意提升组件层级
- ❌ **禁止使用** 任意数值（如 `z-index: 9999`）

## Z-Index Token 定义

文件位置：`src/renderer/lib/z-index.ts`

```typescript
export const Z_INDEX = {
  BASE: 0, // 基础内容层（主窗口）
  SETTINGS_WINDOW: 10, // 设置浮动窗口
  DROPDOWN: 40, // 下拉菜单、Popover
  MODAL_BACKDROP: 50, // 模态窗口遮罩
  MODAL_CONTENT: 51, // 模态窗口内容
  NESTED_MODAL_BACKDROP: 70, // 嵌套模态窗口遮罩
  NESTED_MODAL_CONTENT: 71, // 嵌套模态窗口内容
  TOOLTIP: 100, // 提示信息
  TOAST: 110, // 通知消息
} as const;
```

### 层级体系图

```
z-index 110  ← Toast 通知（全局最高，系统级提示）
z-index 100  ← Tooltip（悬停提示）
z-index 71   ← 嵌套 Dialog 内容
z-index 70   ← 嵌套 Dialog 遮罩
z-index 51   ← 普通 Dialog 内容
z-index 50   ← 普通 Dialog 遮罩
z-index 40   ← Dropdown/Select/Combobox/Popover
z-index 10    ← 设置浮动窗口
z-index 0    ← 主窗口（默认层级）
```

## 使用指南

### 1. 导入 Token

```typescript
import { Z_INDEX } from "@/renderer/lib/z-index";
```

### 2. 应用到组件

#### 内联样式

```typescript
<div style={{ zIndex: Z_INDEX.DROPDOWN }}>
  {/* 下拉菜单内容 */}
</div>
```

#### Tailwind CSS（不推荐）

由于 Tailwind 无法直接使用 TypeScript 常量，对于需要动态 z-index 的组件，优先使用内联样式。

#### 组件 Props

许多 UI 组件已内置 z-index 支持，使用 token 作为默认值：

```typescript
// Select 组件已默认使用 Z_INDEX.DROPDOWN
<Select>
  <SelectTrigger>选择选项</SelectTrigger>
  <SelectContent>
    {/* 内容 */}
  </SelectContent>
</Select>

// 如需覆盖（极少需要）
<SelectContent zIndex={Z_INDEX.TOOLTIP}>
  {/* 内容 */}
</SelectContent>
```

### 3. Dialog 嵌套场景

当 Dialog 出现在设置窗口或其他 Dialog 内部时，使用 `zIndexLevel` 属性：

```typescript
import { Dialog, DialogContent } from '@/components/ui/dialog';

// 普通 Dialog（默认）
<Dialog>
  <DialogContent>
    {/* 内容 */}
  </DialogContent>
</Dialog>

// 嵌套 Dialog（在设置窗口或其他 Dialog 内）
<Dialog>
  <DialogContent zIndexLevel="nested">
    {/* 内容 */}
  </DialogContent>
</Dialog>
```

`zIndexLevel` 会自动映射到正确的 z-index：

- `"base"`（默认）→ `MODAL_CONTENT` (51)
- `"nested"` → `NESTED_MODAL_CONTENT` (71)

## 常见场景示例

### 场景 1：普通下拉菜单

```typescript
import { Z_INDEX } from '@/renderer/lib/z-index';

function MyDropdown() {
  return (
    <div className="relative">
      <button>打开菜单</button>
      <div
        className="absolute top-full mt-2 rounded-lg border bg-popover"
        style={{ zIndex: Z_INDEX.DROPDOWN }}
      >
        {/* 菜单项 */}
      </div>
    </div>
  );
}
```

### 场景 2：模态对话框

```typescript
import { Dialog, DialogContent } from '@/components/ui/dialog';

function MyDialog() {
  return (
    <Dialog>
      {/* DialogContent 已自动使用 Z_INDEX.MODAL_CONTENT */}
      <DialogContent>
        <h2>标题</h2>
        <p>内容</p>
      </DialogContent>
    </Dialog>
  );
}
```

### 场景 3：设置窗口内的嵌套对话框

```typescript
import { Dialog, DialogContent } from '@/components/ui/dialog';

function SettingsDialog() {
  return (
    <Dialog>
      {/* 使用 nested 级别确保显示在设置窗口上方 */}
      <DialogContent zIndexLevel="nested">
        <h2>配置选项</h2>
        <Select>
          {/* Select 会自动使用 Z_INDEX.DROPDOWN (40) */}
          {/* 由于 40 < 71，下拉菜单会正确显示在 Dialog 下方 */}
        </Select>
      </DialogContent>
    </Dialog>
  );
}
```

### 场景 4：Toast 通知

```typescript
import { Z_INDEX } from '@/renderer/lib/z-index';

function ToastContainer() {
  return (
    <div
      className="fixed bottom-4 right-4"
      style={{ zIndex: Z_INDEX.TOAST }}
    >
      {/* Toast 内容 */}
    </div>
  );
}
```

## 调试技巧

### 检查层级冲突

使用浏览器开发者工具：

1. 打开 Chrome DevTools → Elements
2. 选中有问题的元素
3. 查看 Computed 面板中的 `z-index` 值
4. 检查是否使用了正确的 token

### 常见问题诊断

| 问题                   | 可能原因                 | 解决方案                            |
| ---------------------- | ------------------------ | ----------------------------------- |
| 下拉菜单被遮挡         | 使用了硬编码的低 z-index | 改用 `Z_INDEX.DROPDOWN`             |
| Dialog 被设置窗口遮挡  | 未使用 `nested` 级别     | 添加 `zIndexLevel="nested"`         |
| Select 穿透 Dialog     | Select 的 z-index 过高   | 检查是否正确使用 `Z_INDEX.DROPDOWN` |
| Tooltip 被模态窗口遮挡 | Tooltip z-index 不够高   | 使用 `Z_INDEX.TOOLTIP` (100)        |

## 新增组件时的注意事项

### 1. 评估组件类型

确定组件属于哪个层级：

- 普通弹出元素（下拉菜单、气泡卡片）→ `DROPDOWN`
- 模态对话框 → `MODAL_CONTENT` 或 `NESTED_MODAL_CONTENT`
- 提示信息 → `TOOLTIP`
- 系统通知 → `TOAST`

### 2. 设计 API 时暴露 z-index 配置

```typescript
interface MyComponentProps {
  // 允许外部覆盖，但提供合理的默认值
  zIndex?: number;
}

function MyComponent({ zIndex = Z_INDEX.DROPDOWN }: MyComponentProps) {
  return (
    <div style={{ zIndex }}>
      {/* 内容 */}
    </div>
  );
}
```

### 3. 避免创建新的层级

除非有充分理由，否则**不要**添加新的 z-index token。现有层级体系已覆盖绝大多数场景。

## 代码审查检查清单

审查代码时，确保：

- [ ] 所有 `z-index` 使用都来自 `Z_INDEX` token
- [ ] Dialog 组件在嵌套场景下使用 `zIndexLevel="nested"`
- [ ] 没有硬编码的数值（如 `z-index: 9999`）
- [ ] 组件文档说明了默认使用的 z-index 级别

## 迁移现有代码

如果发现旧代码使用硬编码 z-index：

### 步骤 1：识别用途

```typescript
// 旧代码
<div style={{ zIndex: 200 }}>...</div>
```

### 步骤 2：映射到对应 token

```typescript
// 200 通常用于下拉菜单 → DROPDOWN
import { Z_INDEX } from '@/renderer/lib/z-index';

<div style={{ zIndex: Z_INDEX.DROPDOWN }}>...</div>
```

### 步骤 3：测试验证

- 检查组件是否正常显示
- 测试嵌套场景（在 Dialog 内、设置窗口内）
- 确认没有层级冲突

## 参考资料

- [MDN: z-index](https://developer.mozilla.org/zh-CN/docs/Web/CSS/z-index)
- [MDN: 层叠上下文](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context)
- 项目源码：`src/renderer/lib/z-index.ts`

---

**最后更新**：2026-01-28
**维护者**：EnsoAI 开发团队
