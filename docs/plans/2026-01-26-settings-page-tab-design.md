# 设置页面 Tab 化设计方案

## 背景

当前设置页面（Cmd+,）是模态窗口形式，用户调整设置时无法实时看到主界面效果。本方案将设置页面改为主内容区的 Tab 页面，提升用户体验。

## 设计目标

- 设置页面作为主内容区的一个视图，与 Agent/文件/终端/版本管理 并列
- 左下角设置图标保持原位，作为设置页面的入口
- 点击设置图标或 Cmd+, 切换到设置页面，顶部页签显示失焦状态
- 支持 toggle 行为：再次点击设置图标或 Cmd+, 返回上一视图
- 保持设置页面内部布局不变

## 实现方案：扩展现有 Tab 状态

### 1. 状态管理

**扩展 Tab 类型**
```typescript
type ActiveTab = 'agent' | 'files' | 'terminal' | 'git' | 'settings'
```

**新增状态**
```typescript
previousTab: ActiveTab | null  // 记录进入设置前的激活页签
```

**状态切换逻辑**
```
点击设置图标 或 Cmd+,:
  if activeTab === 'settings':
    activeTab = previousTab || 'agent'  // 返回上一视图
    previousTab = null
  else:
    previousTab = activeTab  // 记住当前位置
    activeTab = 'settings'

点击顶部任一页签:
  activeTab = 点击的页签
  previousTab = null
```

### 2. UI 组件修改

**顶部页签组件**
- 当 `activeTab === 'settings'` 时，所有页签显示失焦样式
- 失焦样式：降低不透明度、文字颜色变淡、无高亮下划线
- 点击任一页签正常切换

**左下角设置图标**
- 当 `activeTab === 'settings'` 时，图标高亮或添加背景色
- 点击事件改为调用 toggle 逻辑

**主内容区**
- 根据 `activeTab` 渲染对应内容
- 当 `activeTab === 'settings'` 时，渲染设置页面组件

**Cmd+, 快捷键**
- 从打开模态框改为调用 toggle 设置页面逻辑

### 3. 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `ActionPanel.tsx` 或相关状态管理 | 扩展 Tab 类型，增加 `previousTab` 状态和 toggle 逻辑 |
| 顶部页签组件 | 增加失焦样式判断 |
| 左下角设置图标组件 | 增加激活样式，修改点击事件 |
| `useAppKeyboardShortcuts.ts` | Cmd+, 改为调用 toggle 函数 |
| 主内容区渲染逻辑 | 增加 `settings` case |
| `SettingsDialog.tsx` | 提取内部内容为 `SettingsContent` 组件 |

### 4. 边界情况

- 应用启动时，`previousTab` 初始为 `null`
- 默认回退到 `agent` 面板
- 模态框相关代码可废弃
