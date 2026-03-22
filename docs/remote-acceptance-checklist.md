# Remote Acceptance Checklist

## 目标模型

Enso 当前的 remote 模式不是 VS Code Remote 那种“把整个窗口切到远端”。

它的目标更窄，也更实际：

- 把远程仓库路径挂进当前本地窗口
- 在同一个窗口里继续使用 Enso 现有的仓库、文件、终端、worktree、Claude 能力
- 只闭环 Enso 自己的远程仓库工作流，不扩展成通用远程 IDE 平台

这件事值不值得做？值得。因为用户真正要的是在当前窗口里操作远程仓库，而不是再造一个完整的 VS Code Remote 平台。

## 已实现能力

当前实现已经覆盖这些核心能力：

- 远程连接文案已统一到“把远程仓库挂进当前窗口”
- 远程主机平台限制已明确为 `Linux x64/arm64 + glibc`
- 连接阶段会真实校验 `platform / arch / libc`，不再对 musl/Alpine 装死
- 连接诊断中的 `sync-settings` 和 `sync-session-state` 已改成真实共享状态同步
- 远程 terminal session 由后端原子 `createAndAttach`，避免创建后再补一层远程 attach
- 同一远程连接内的文件操作已补齐：
  - `copy`
  - `checkConflicts`
  - `batchCopy`
  - `batchMove`
- 远程 worktree merge 全流程已补齐：
  - `merge`
  - `mergeState`
  - `conflicts`
  - `conflictContent`
  - `resolve`
  - `abort`
  - `continue`
- 远程 Claude plugins / marketplaces 已补齐

## 手动验收清单

下面这份清单按真实用户路径组织。不要只测 happy path，那种测试没价值。

### 1. 连接与平台校验

目标：确认连接前置校验是真的，不是假 UI。

- 新建一个 SSH profile，保存后确认设置页文案明确说明：
  - 这是把远程仓库挂进当前窗口
  - 当前只支持 `Linux x64/arm64 glibc`
- 分别连接这些目标机：
  - `Linux x64 glibc`
  - `Linux arm64 glibc`
  - `Linux musl / Alpine`
  - 非 Linux 主机
- 预期：
  - glibc Linux 可继续连接
  - musl/Alpine 和非 Linux 主机会在连接阶段明确失败
  - 错误信息能指出是不支持的平台/libc，而不是模糊报错

### 2. 远程仓库挂载

目标：确认产品模型正确，窗口不切换，挂载的是远程仓库路径。

- 从侧边栏 Remote Host 入口选择一个 profile
- 挂载一个远程仓库路径到当前窗口
- 预期：
  - 当前窗口继续保留本地 UI 和本地状态
  - 远程仓库以 remote repository 的形式出现在当前窗口
  - 仓库根路径表现为远程虚拟路径，不是本地假路径

### 3. 文件浏览与基本读写

目标：确认 remote repository 不是只读模型。

- 在远程仓库中执行：
  - 新建文件
  - 新建文件夹
  - 重命名文件/目录
  - 删除文件/目录
  - 编辑文本文件并保存
- 预期：
  - 所有操作都能直接落到远端仓库
  - 文件树刷新正确
  - 保存后 Git 状态能正确反映修改

### 4. 同连接内复制、移动与冲突处理

目标：确认 remote 文件操作闭环，不只是单文件读写。

- 在同一远程连接内执行：
  - 单文件复制
  - 多文件批量复制
  - 多文件批量移动
  - 目录复制
  - 目录移动
- 人为制造同名冲突，验证：
  - replace
  - skip
  - rename
- 预期：
  - 同一连接内操作成功
  - 冲突检测结果包含名字、大小、修改时间等可判断信息
  - 冲突处理选择生效

### 5. 本地与跨连接限制

目标：确认限制是明确的，不会做出半残行为。

- 尝试这些不支持的操作：
  - 本地文件复制到远程仓库
  - 远程文件复制到本地仓库
  - 远程连接 A 复制到远程连接 B
- 预期：
  - 操作被明确拒绝
  - 错误信息说明“不支持本地与远程之间传输”或“不支持跨远程连接传输”
  - 不出现部分成功、部分失败的脏状态

### 6. Git 与 worktree

目标：确认远程仓库不是只有文件树，Git 主路径能走通。

- 在远程仓库上执行：
  - 加载 worktrees
  - 创建 worktree
  - 删除 worktree
  - 切换/查看分支
  - 查看 changed files
  - stage / unstage / discard
  - commit
  - fetch / push
- 预期：
  - UI 行为与本地仓库一致
  - Git 操作实际落在远端仓库

### 7. Merge 与冲突处理

目标：确认 remote merge 不是只有“发起 merge”这一步。

- 在远程 worktree 上制造一个真实冲突
- 执行 merge
- 依次验证：
  - 能查询 `mergeState`
  - 能列出 `conflicts`
  - 能读取 `conflictContent`
  - 能执行单个冲突 `resolve`
  - 能 `abort`
  - 能 `continue`
- 预期：
  - 冲突列表和内容与实际 Git 状态一致
  - `abort` 后工作区回到 merge 前
  - `continue` 后 merge 正常完成

### 8. 终端与会话稳定性

目标：确认远程 session 生命周期是稳定的。

- 在远程仓库打开 terminal / agent session
- 连续执行：
  - 首次创建
  - 重新打开已有 session
  - 窗口内切换 tab / pane
  - 短暂断连后恢复
- 预期：
  - 首次创建不需要 renderer 再补一次远程 attach
  - 已有 session 可正常 attach
  - replay 内容正确，不重复、不丢失
  - 断连后的失败模式可预期

### 9. Claude 能力

目标：确认 remote 仓库上的 Claude 环境不是残废版。

- 在远程仓库验证：
  - prompts
  - MCP 基础调用
  - plugins 列表
  - plugin enable / disable
  - available plugins 查询
  - install / uninstall plugin
  - marketplaces list / add / remove / refresh
- 预期：
  - 这些操作都在远端环境执行
  - marketplace 变更会反映到后续插件查询

### 10. 共享状态同步

目标：确认诊断里的同步步骤是真同步。

- 建立连接前修改本地共享设置
- 建立连接后检查远端 `~/.ensoai/` 下共享状态文件
- 至少确认：
  - `settings.json`
  - `session-state.json`
- 预期：
  - 文件存在
  - 内容与当前本地共享状态一致
  - 连接诊断里的 `sync-settings` / `sync-session-state` 对应真实写入行为

## 与 VS Code Remote 的差距

这里不是“待补齐列表”，而是明确的产品边界。把边界说清楚，比乱扩功能重要得多。

### 明确不做

- 不做整窗远端工作台
- 不做 VS Code 那种远端 extension host
- 不做通用远端调试平台
- 不做端口转发平台
- 不做本地 <-> 远程文件传输
- 不做跨远程连接文件传输

### 当前与 VS Code Remote 的核心区别

- VS Code Remote 的模型是“把整个工作台迁到远端”
- Enso 的模型是“把远程仓库挂进当前本地窗口”
- VS Code Remote 更像远程 IDE 平台
- Enso remote 更像远程仓库工作流增强

这不是缺点本身。只要产品边界说清楚，它就是一个更小、更稳、更容易闭环的方案。

## 残余风险

### 1. 真实 Linux 远端回归仍然是必须的

本地 typecheck/lint 通过，不等于远端运行时真的没坑。remote 这种功能，最后一定要在真实 SSH 主机上压一遍。

### 2. glibc 约束是硬限制

现在的实现明确不支持 musl/Alpine。只要 runtime/helper 仍依赖当前产物形态，这个限制就不是文案问题，而是产品限制。

### 3. runtime/helper 升级路径仍要持续回归

远端 helper、server、runtime 三者只要版本关系处理不好，就会出现“能连上但行为不一致”的烂问题。每次升级都应该至少回归：

- 首次安装
- 已安装覆盖升级
- server 同步更新
- 旧状态文件兼容

### 4. 断连与重连是高风险区

remote 功能最容易烂在生命周期边界上。重点回归：

- 连接建立中断
- helper 已启动但 server 未握手
- session 已存在但窗口重挂载
- merge 中途断连

## 建议回归矩阵

如果时间有限，至少跑这几组组合：

- `Linux x64 glibc + 首次连接 + 首次挂载仓库`
- `Linux x64 glibc + 远程文件批量复制/移动 + 冲突处理`
- `Linux x64 glibc + worktree merge conflict + resolve/abort/continue`
- `Linux x64 glibc + Claude plugins + marketplaces`
- `Linux arm64 glibc + 首次连接 + terminal session`
- `Linux musl/Alpine + 连接失败路径`

## 核心判断

### 值得做

因为这解决的是一个真实问题：在不切走当前本地窗口的前提下操作远程仓库。

### 关键洞察

- 数据结构：核心不是“远端窗口”，而是“远程连接 ID + 远程路径 + 当前窗口上下文”
- 复杂度：一旦把目标定成“挂载远程仓库”，很多 VS Code Remote 式能力都该直接砍掉
- 风险点：最大风险不是 UI，而是 session 生命周期、远程文件操作边界和 merge 中断恢复

### Linus 式方案

1. 保持产品模型收敛，不要扩成整窗远端平台
2. 继续消灭“本地逻辑打补丁适配远端”的重复分支
3. 只补真实用户路径上的缺口，不做花活
4. 每次升级都先确认不会破坏现有远程仓库工作流
