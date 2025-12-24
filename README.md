<p align="center">
  <img src="docs/assets/logo.png" alt="EnsoAI Logo" width="120" />
</p>

<h1 align="center">EnsoAI</h1>

<p align="center">
  <strong>Git Worktree Manager with AI Agents</strong>
</p>

<p align="center">
  <a href="#english">English</a> | <a href="#中文">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-39+-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

<h2 id="english">English</h2>

### What is EnsoAI?

EnsoAI is a desktop application that combines **Git Worktree management** with **AI coding agents**. It provides a unified workspace where you can manage multiple git worktrees while leveraging AI assistants like Claude, Codex, and Gemini to help with your development tasks.

![EnsoAI Screenshot](docs/assets/screenshot-main.png)


### Features

#### Multi-Agent Support

Seamlessly switch between different AI coding agents:

- **Claude** - Anthropic's AI assistant with session persistence
- **Codex** - OpenAI's coding assistant
- **Gemini** - Google's AI assistant
- **Droid** - Factory CLI for AI-powered CI/CD
- **Auggie** - Augment Code's AI assistant

You can also add custom agents by specifying the CLI command.

![Agent Panel Setting](docs/assets/screenshot-agents-setting.png)
![Agent Panel](docs/assets/screenshot-agents.png)

#### Git Worktree Management

Efficiently manage multiple worktrees in a single workspace:

- Create worktrees from existing or new branches
- Switch between worktrees instantly
- Delete worktrees with optional branch cleanup
- Visual worktree list with branch status

<!-- ![Worktree Panel](docs/assets/screenshot-worktree.png) -->
> Screenshot placeholder: Worktree management panel

#### Integrated File Editor

Built-in Monaco Editor for seamless code editing:

- Syntax highlighting for 50+ languages
- Multi-tab editing with drag-and-drop reorder
- File tree with create/rename/delete operations
- Automatic language detection
- Editor state persistence across sessions

![File Panel](docs/assets/screenshot-editor.png)

#### Multi-Tab Terminal

Full-featured terminal emulator:

- Multiple shell tabs (Cmd+T to create, Cmd+W to close)
- Ghostty theme support
- Customizable font settings
- Shift+Enter for newline input

![Terminal Panel](docs/assets/screenshot-terminal.png)

#### Additional Features

- **Multi-Window Support** - Open multiple workspaces simultaneously
- **Theme Sync** - Sync app theme with terminal theme (Ghostty)
- **Keyboard Shortcuts** - Efficient navigation (Cmd+1-9 to switch tabs)
- **Settings Persistence** - All settings saved to JSON for easy recovery

### Installation

#### Prerequisites

- Node.js 20+
- pnpm 10+
- Git

#### Build from Source

```bash
# Clone the repository
git clone https://github.com/your-username/EnsoAI.git
cd EnsoAI

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build:mac    # macOS
pnpm build:win    # Windows
pnpm build:linux  # Linux
```

### Tech Stack

- **Framework**: Electron + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Editor**: Monaco Editor
- **Terminal**: xterm.js + node-pty
- **Git**: simple-git
- **Database**: better-sqlite3

---

<h2 id="中文">中文</h2>

### EnsoAI 是什么？

EnsoAI 是一款将 **Git Worktree 管理**与 **AI 编程助手**相结合的桌面应用。它提供了一个统一的工作空间，让你可以在管理多个 git worktree 的同时，借助 Claude、Codex、Gemini 等 AI 助手来辅助开发工作。

![EnsoAI 截图](docs/assets/screenshot-main.png)

### 功能特性

#### 多 Agent 支持

无缝切换不同的 AI 编程助手：

- **Claude** - Anthropic 的 AI 助手，支持会话持久化
- **Codex** - OpenAI 的编程助手
- **Gemini** - Google 的 AI 助手
- **Droid** - Factory CLI，AI 驱动的 CI/CD 助手
- **Auggie** - Augment Code 的 AI 助手

你也可以通过指定 CLI 命令来添加自定义 Agent。

![Agent 面板设置](docs/assets/screenshot-agents-setting.png)
![Agent 面板](docs/assets/screenshot-agents.png)

#### Git Worktree 管理

在单一工作空间中高效管理多个 worktree：

- 从现有分支或新分支创建 worktree
- 即时切换 worktree
- 删除 worktree 并可选择同时删除分支
- 可视化 worktree 列表，显示分支状态

![Worktree 面板](docs/assets/screenshot-worktree.png)

#### 内置文件编辑器

基于 Monaco Editor 的代码编辑器：

- 支持 50+ 种语言的语法高亮
- 多标签编辑，支持拖拽排序
- 文件树支持创建/重命名/删除操作
- 自动语言检测
- 编辑器状态跨会话持久化

![文件面板](docs/assets/screenshot-editor.png)

#### 多标签终端

功能完整的终端模拟器：

- 多 Shell 标签（Cmd+T 新建，Cmd+W 关闭）
- 支持 Ghostty 主题
- 可自定义字体设置
- Shift+Enter 输入换行

![终端面板](docs/assets/screenshot-terminal.png)

#### 其他特性

- **多窗口支持** - 同时打开多个工作空间
- **主题同步** - 应用主题可与终端主题（Ghostty）同步
- **键盘快捷键** - 高效导航（Cmd+1-9 切换标签）
- **设置持久化** - 所有设置保存为 JSON，便于恢复

### 安装

#### 前置要求

- Node.js 20+
- pnpm 10+
- Git

#### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-username/EnsoAI.git
cd EnsoAI

# 安装依赖
pnpm install

# 开发模式运行
pnpm dev

# 生产构建
pnpm build:mac    # macOS
pnpm build:win    # Windows
pnpm build:linux  # Linux
```

### 技术栈

- **框架**: Electron + React 19 + TypeScript
- **样式**: Tailwind CSS 4
- **编辑器**: Monaco Editor
- **终端**: xterm.js + node-pty
- **Git**: simple-git
- **数据库**: better-sqlite3

---

## License

MIT License - see [LICENSE](LICENSE) for details.
