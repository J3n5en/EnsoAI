# Windows 终端与 Agent 检测修复说明

## 背景

在 Windows 环境下，项目出现了两个关联问题：

1. 打开应用后，终端页报错：`session:create -> File not found`
2. 设置页中的 `Claude`、`Codex` 显示“未安装”，即使本机命令实际可正常使用

这两个现象本质上来自同一条链路：**Windows Shell 解析错误，导致终端创建和 Agent CLI 检测都使用了错误的 shell**。

## 问题根因

### 1. `pwsh.exe` 被误判为可用

原来的 Windows Shell 检测逻辑中，只要配置项是 `powershell7`，就可能直接返回 `pwsh.exe` 这个命令名。

但在部分 Windows 机器上：

- 没有安装 PowerShell 7
- 系统只有 Windows PowerShell 5.x，即 `powershell.exe`

此时项目仍会把 `pwsh.exe` 当作可用 shell，最终传给 `node-pty`。`node-pty` 在创建 Windows 终端时找不到这个文件，就会抛出：

`Error: File not found`

### 2. Agent 检测依赖同一套 shell 逻辑

`Claude`、`Codex` 的检测逻辑会执行：

- `claude --version`
- `codex --version`

这些命令同样依赖 shell 解析与 PATH 注入。如果 shell 选错了，检测就会失败，界面上表现为“未安装”。

### 3. 设置里缓存了错误状态

即使系统环境已经正确，只要本地缓存中仍保留了旧的检测结果，设置页也可能继续显示“未安装”。

## 修复内容

### 一、修复 Windows Shell 检测与回退

修改文件：`src/main/services/terminal/ShellDetector.ts`

主要修复点：

1. **新增真实 PATH 查找逻辑**
   - 读取 Windows 注册表中的用户 PATH 和系统 PATH
   - 与当前进程 PATH 合并后再进行命令查找

2. **不再把纯命令名直接当作“可用路径”**
   - 例如 `pwsh.exe`、`powershell.exe`、`cmd.exe`
   - 现在会真正去 PATH 中解析它们是否存在

3. **修复 `powershell7` 的自动回退**
   - 若机器没有 `pwsh.exe`
   - 自动回退到 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

4. **修复 Windows 默认 shell 选择**
   - 以前默认偏向 `pwsh.exe`
   - 现在优先选择真实存在的 `pwsh`
   - 若不存在，则稳定回退到系统 PowerShell

### 二、修复设置页 Agent 状态刷新

修改文件：`src/renderer/components/settings/AgentSettings.tsx`

修复点：

- 设置页打开时，自动刷新内置 Agent 的检测状态
- 避免旧缓存导致 `Claude` / `Codex` 一直显示“未安装”

### 三、修复安装包中 `sqlite3` 原生模块缺失

修改文件：`package.json`

修复点：

- 去掉对 `sqlite3` 构建的忽略配置
- 确保安装包内包含 `node_sqlite3.node`

否则 EXE 运行时会出现主进程报错，导致应用无法正常启动。

## 实际验证结果

本次修复完成后，已进行以下验证：

### 1. 类型检查

- `pnpm typecheck` 通过

### 2. 构建验证

- `pnpm build` 通过

### 3. Shell 解析验证

在本机环境中确认：

- `pwsh` 不存在
- `powershell.exe` 存在
- `claude` 可从 npm 全局目录解析
- `codex` 可从 npm 全局目录解析

修复后，`powershell7` 配置最终会正确解析为：

`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

### 4. PTY 终端创建验证

通过 Electron 直接调用构建产物中的 `PtyManager` 验证：

- 能成功创建 PTY 会话
- 能正常执行 PowerShell 命令
- 终端输出正常返回

### 5. Agent CLI 检测验证

通过实际执行验证：

- `claude --version` 可返回版本号
- `codex --version` 可返回版本号

### 6. 安装包级验证

不仅验证了源码构建结果，还直接从已安装应用目录中的：

`D:\Program Files\EnsoAI\resources\app.asar`

导入实际运行代码进行验证，确认：

- 已安装版本也能正确解析 shell
- 已安装版本也能成功创建 PTY
- 已安装版本也能检测 Claude / Codex

## 最终结果

本次修复后，Windows 环境下以下问题已解决：

1. 终端页 `File not found` 报错
2. `session:create` 失败
3. `Claude` / `Codex` 被错误识别为“未安装”
4. EXE 因 `sqlite3` 原生模块缺失导致的启动报错

## 涉及文件

- `src/main/services/terminal/ShellDetector.ts`
- `src/renderer/components/settings/AgentSettings.tsx`
- `package.json`

## 备注

如果后续再遇到类似问题，优先检查以下几点：

1. 当前设置中选中的 shell 是否真实存在
2. GUI 进程是否继承到了正确的 PATH
3. npm 全局命令目录是否在用户 PATH 中
4. 安装包中的原生模块是否已正确打入 `app.asar.unpacked`

