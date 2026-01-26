# EnsoAI Preview 分支 - 新功能预览

> ⚠️ **注意**：这是 `preview` 分支，包含 6 个尚未合并到主分支的新功能，仅供尝鲜体验。

## 📦 包含的新功能

### 1. 📋 Claude Provider 标签显示
**分支**: `feat-agent-claude-provider-tag`

在 Agent 会话栏顶部显示 Claude 服务商标签（如 Anthropic、AWS、GCP 等），方便识别当前使用的 Claude 服务来源。

---

### 2. 📁 文件树折叠/展开功能
**分支**: `feat-filetree-collapse-toggle`

在文件树工具栏添加全局折叠/展开按钮，支持一键折叠或展开所有目录，提升大型项目的导航效率。

**快捷操作**：
- 点击文件树工具栏的折叠按钮即可切换全部目录的展开状态
- 支持记忆折叠状态

---

### 3. 👁️ Markdown 预览模式
**分支**: `feat-markdown-preview-modes`

为 Markdown 文件添加三种预览模式切换，提供灵活的编辑和预览体验。

**三种模式**：
- **关闭预览** (EyeOff 图标) - 纯编辑模式
- **分屏预览** (Eye 图标) - 左侧编辑，右侧实时预览
- **全屏预览** (Maximize2 图标) - 仅显示渲染后的预览内容

**功能特性**：
- 编辑器与预览区域双向滚动同步
- 支持拖动调节分屏宽度比例（20%-80%）
- 预览模式在文件切换时保持

---

### 4. ⚙️ 设置页面 Tab 化
**分支**: `feat-settings-page-tabs`

重构设置页面，支持两种显示模式，并持久化用户选择。

**显示模式**：
- **Tab 模式** (默认) - 设置页面作为主面板的一个标签页
- **浮动窗口模式** - 设置页面独立显示为可拖拽的模态窗口

**改进点**：
- 支持拖拽调整设置窗口位置
- 记忆上次打开的设置分类
- `Cmd+,` 快捷键在两种模式下均可使用

---

### 5. 🎯 工作树焦点切换快捷键
**分支**: `feat-switch-active-agent-worktree-focus`

添加快捷键支持快速在活跃的 Agent 会话和工作树面板之间切换焦点。

**快捷键**：
- 按下快捷键即可在当前活跃的 Agent 终端和工作树文件树之间切换焦点
- 提升键盘导航效率

---

### 6. 🔧 修复视图菜单缩放快捷键
**分支**: `fix/remove-global-shortcut-use-before-input`

移除 `globalShortcut` 改用 `before-input-event` 方式处理 `Cmd+-` 和 `Cmd+0` 缩放快捷键。

**修复问题**：
- 解决视图菜单缩放快捷键在某些场景下无法正常工作的问题
- 提升系统快捷键的兼容性和可靠性

---

## 🚀 如何体验

### 方法一：下载预编译包（即将提供）
```bash
# 敬请期待 preview 分支的构建产物
```

### 方法二：从源码运行
```bash
# 克隆仓库并切换到 preview 分支
git clone https://github.com/mofeiss/EnsoAI.git
cd EnsoAI
git checkout preview

# 安装依赖并运行
pnpm install
pnpm dev
```

---

## 📝 反馈

如果你在体验过程中发现问题或有建议，欢迎：
- 提交 Issue: https://github.com/mofeiss/EnsoAI/issues
- 加入 Telegram 群组讨论: https://t.me/EnsoAi_Offical

---

## ⚠️ 免责声明

此 `preview` 分支为功能预览版本，包含未经充分测试的新功能，**不建议在生产环境使用**。如需稳定版本，请使用 [main 分支](https://github.com/J3n5en/EnsoAI)。
