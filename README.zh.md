<p align="center">
  <img src="docs/assets/logo.png" alt="EnsoAI Logo" width="120" />
</p>

<h1 align="center">EnsoAI</h1>

<p align="center">
  <strong>多路智能，并行穿梭</strong>
</p>
<p align="center">
  让多路 AI 助手化身并行线程，在同一个项目的不同分支间自由穿梭。<br/>
  Claude、Gemini 与 Codex 同步协作，思路永不中断。
</p>
<p align="center">
  <a href="README.zh.md">中文</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/J3n5en/EnsoAI/releases/latest"><img src="https://img.shields.io/github/v/release/J3n5en/EnsoAI?style=flat&color=blue" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Electron-39+-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

<p align="center">
  <a href="https://t.me/EnsoAI_news"><img src="https://img.shields.io/badge/更新频道-Telegram-26A5E4?logo=telegram&logoColor=white" alt="Telegram Channel" /></a>
  <a href="https://t.me/EnsoAi_Offical"><img src="https://img.shields.io/badge/官方交流群-Telegram-26A5E4?logo=telegram&logoColor=white" alt="Telegram Group" /></a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/ensoai?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-ensoai" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1057621&theme=light" alt="EnsoAI - Multiple AI Agents, Parallel Workflow in Git Worktrees | Product Hunt" width="250" height="54" /></a>
</p>

---

## 重构你的工作流

告别 git stash。EnsoAI 将每个分支视为一等公民，赋予其独立的工作区与 AI 上下文。

![EnsoAI 终端](docs/assets/feature-terminal.png)

---

## 安装

### 包管理器（推荐）

**macOS (Homebrew)**

```bash
brew tap j3n5en/ensoai
brew install --cask ensoai
```

**Windows (Scoop)**

```powershell
scoop bucket add ensoai https://github.com/J3n5en/scoop-ensoai
scoop install ensoai
```

**Windows (Winget)**

```powershell
winget install J3n5en.EnsoAI
```

### 手动下载

从 [GitHub Releases](https://github.com/J3n5en/EnsoAI/releases/latest) 下载适合你平台的安装包：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `EnsoAI-x.x.x-arm64.dmg` |
| macOS (Intel) | `EnsoAI-x.x.x.dmg` |
| Windows (安装版) | `EnsoAI-Setup-x.x.x.exe` |
| Windows (便携版) | `EnsoAI-x.x.x-portable.exe` |
| Linux (AppImage) | `EnsoAI-x.x.x.AppImage` |
| Linux (deb) | `ensoai_x.x.x_amd64.deb` |

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/J3n5en/EnsoAI.git
cd EnsoAI

# 安装依赖（需要 Node.js 20+、pnpm 10+）
pnpm install

# 开发模式运行
pnpm dev

# 生产构建
pnpm build:mac    # macOS
pnpm build:win    # Windows
pnpm build:linux  # Linux
```

---

## 功能特性

### 多 Agent 矩阵

无缝切换 Claude、Codex、Gemini 或本地 LLM。每个 Worktree 都有独立的持久化 AI 会话。

![多 Agent 矩阵](docs/assets/feature-terminal.png)

内置支持：
- **Claude** - Anthropic 的 AI 助手，支持会话持久化
- **Codex** - OpenAI 的编程助手
- **Gemini** - Google 的 AI 助手
- **Cursor** - Cursor 的 AI 助手 (`cursor-agent`)
- **Droid** - Factory CLI，AI 驱动的 CI/CD 助手
- **Auggie** - Augment Code 的 AI 助手

你也可以通过指定 CLI 命令来添加自定义 Agent。

---

### 内置 Git 管理器

优雅的可视化 Git 面板。通过键盘即可完成差异对比、暂存修改和提交代码。

![Git 管理器](docs/assets/feature-editor.png)

- 变更列表显示所有修改的文件
- 支持暂存/取消暂存操作
- 提交历史浏览
- 代码差异对比视图

---

### 内置代码编辑器

基于 Monaco 构建的轻量级编辑器。支持 50+ 种语言高亮，提供流畅的多标签拖拽体验。

![代码编辑器](docs/assets/feature-git.png)

- 多标签编辑，支持拖拽排序
- 文件树支持创建/重命名/删除操作
- 自动语言检测
- 编辑器状态跨会话持久化

---

### AI 代码审查

自动生成高质量的 Commit Message，并利用 AI 助手对代码变更进行深度审查与优化。

![AI 代码审查](docs/assets/feature-agents.png)

---

### 三栏合并工具

内置专业的三栏合并编辑器。清晰展示冲突来源，支持一键采纳变更与实时结果预览，让解决冲突变得轻松愉悦。

![三栏合并工具](docs/assets/feature-merge.png)

---

### Worktree 管理

毫秒级创建与切换 Git Worktree。在不同功能分支间自由穿梭，无需重复配置环境。

- 从现有分支或新分支创建 worktree
- 即时切换 worktree
- 删除 worktree 并可选择同时删除分支
- 可视化 worktree 列表，显示分支状态

---

### IDE 桥接

在 EnsoAI 中统筹全局，一键跳转至 VS Code 或 Cursor 进行深度开发。无缝衔接现有工具链。

通过 `Cmd+Shift+P` 打开命令面板：
- **面板控制** - 切换 Workspace/Worktree 侧边栏显示
- **设置** - 打开设置对话框 (Cmd+,)
- **打开方式** - 在 Cursor、Ghostty、VS Code 等中打开当前项目

---

### 其他特性

- **多窗口支持** - 同时打开多个工作空间
- **主题同步** - 应用主题可与终端主题（400+ Ghostty 主题）同步
- **键盘快捷键** - 高效导航（Cmd+1-9 切换标签）
- **设置持久化** - 所有设置保存为 JSON，便于恢复

---

## 技术栈

- **框架**: Electron + React 19 + TypeScript
- **样式**: Tailwind CSS 4
- **编辑器**: Monaco Editor
- **终端**: xterm.js + node-pty
- **Git**: simple-git
- **数据库**: sqlite3

---

## FAQ

### 基础使用

<details>
<summary><strong>EnsoAI 与普通 IDE 有什么区别？</strong></summary>

EnsoAI 专注于 **Git Worktree + AI Agent** 的协作场景。它不是要替代 VS Code 或 Cursor，而是作为一个轻量级的工作空间管理器，让你能够：
- 在多个 worktree 之间快速切换，每个 worktree 独立运行 AI Agent
- 同时进行多个功能分支的开发，互不干扰
- 通过 "Open In" 功能随时跳转到你熟悉的 IDE 继续深度开发

</details>

<details>
<summary><strong>支持哪些 AI Agent？</strong></summary>

内置支持 Claude、Codex、Gemini、Cursor Agent、Droid、Auggie。你也可以在设置中添加任意支持 CLI 的 Agent，只需指定启动命令即可。

</details>

<details>
<summary><strong>Agent 会话是否会保留？</strong></summary>

是的。每个 worktree 的 Agent 会话独立保存，切换 worktree 后再切回来，之前的对话上下文仍然存在。

</details>

---

### 使用场景

<details>
<summary><strong>什么时候应该使用 EnsoAI？</strong></summary>

| 场景 | 说明 |
|------|------|
| **多任务并行开发** | 同时处理 feature-A 和 bugfix-B，每个分支有独立的 AI 会话和终端 |
| **AI 辅助 Code Review** | 在新 worktree 中让 AI 审查代码，主分支开发不受影响 |
| **实验性开发** | 创建临时 worktree 让 AI 自由实验，不满意直接删除 |
| **对比调试** | 同时打开多个 worktree 对比不同实现 |

</details>

<details>
<summary><strong>为什么使用官方 CLI 而不使用 ACP？</strong></summary>

虽然 ACP 能够统一不同 Agent 的核心能力，但是也仅限于核心能力缺失了很多功能。切换不同 Agent 的场景其实并不多而且不同 Agent 的 CLI 核心功能都相似。所以我们认为对于有经验的开发者各 CLI 更具有生产力。

</details>

<details>
<summary><strong>EnsoAI 适合什么规模的项目？</strong></summary>

中小型项目最为合适。对于大型 monorepo，建议配合 VS Code 等全功能 IDE 使用 —— EnsoAI 负责 worktree 管理和 AI 交互，IDE 负责深度开发。

</details>

---

### 开发流程

<details>
<summary><strong>使用 EnsoAI 的典型开发流程是什么？</strong></summary>

```
1. 打开 Workspace
   └── 选择或添加 Git 仓库

2. 创建/切换 Worktree
   └── 为新功能创建 worktree（自动关联新分支）

3. 启动 AI Agent
   └── 在 Agent 面板与 Claude/Codex 等对话
   └── AI 直接在当前 worktree 目录下工作

4. 编辑 & 测试
   └── 使用内置编辑器快速修改
   └── 使用终端运行测试/构建

5. 提交 & 合并
   └── 完成后在终端 git commit/push
   └── 或通过 "Open In" 跳转到 IDE 进行最终审查
```

</details>

<details>
<summary><strong>如何高效管理多个并行任务？</strong></summary>

1. 为每个任务创建独立 worktree（`Cmd+N` 或点击 + 按钮）
2. 使用快捷键 `Cmd+1-9` 快速切换 worktree
3. 每个 worktree 有独立的 Agent 会话、终端标签、编辑器状态
4. 完成后删除 worktree，可选择同时删除分支

</details>

<details>
<summary><strong>AI Agent 生成的代码如何 review？</strong></summary>

推荐流程：
1. 让 AI 在独立 worktree 中生成代码
2. 使用内置编辑器或 "Open In Cursor/VS Code" 审查
3. 满意后在终端提交；不满意可继续对话修改或直接删除 worktree

</details>

---

### 快捷键

<details>
<summary><strong>常用快捷键有哪些？</strong></summary>

| 快捷键 | 功能 |
|--------|------|
| `Cmd+Shift+P` | 打开命令面板 |
| `Cmd+,` | 打开设置 |
| `Cmd+1-9` | 切换到对应标签 |
| `Cmd+T` | 新建终端/Agent 会话 |
| `Cmd+W` | 关闭当前终端/会话 |
| `Cmd+S` | 保存文件 |
| `Shift+Enter` | 终端中输入换行 |

</details>

---

### 故障排除

<details>
<summary><strong>Agent 无法启动？</strong></summary>

1. 确认对应 CLI 工具已安装（如 `claude`、`codex`）
2. 在终端中手动运行命令验证
3. 检查设置中的 Agent 路径配置

</details>

<details>
<summary><strong>终端显示异常/花屏？</strong></summary>

进入设置 → 终端 → 将渲染器从 WebGL 切换为 DOM。

</details>

---

## License

MIT License - 详见 [LICENSE](LICENSE)。
