# MAIN PROCESS

Electron 主进程逻辑。IPC 通信、系统服务、原生模块集成。

## STRUCTURE

```
main/
├── index.ts           # 应用入口 (app.whenReady, 窗口管理, 信号处理)
├── ipc/               # IPC handlers (17 模块)
│   ├── index.ts       # 统一注册 + 资源清理
│   ├── git.ts         # Git 操作
│   ├── terminal.ts    # PTY 会话管理
│   ├── agent.ts       # AI Agent 控制
│   └── ...
├── services/          # 业务服务
│   ├── claude/        # Claude IDE Bridge (MCP 集成)
│   ├── git/           # simple-git 封装
│   ├── terminal/      # node-pty 管理
│   └── ...
└── utils/             # 工具函数
```

## WHERE TO LOOK

| 任务 | 文件 | 备注 |
|------|------|------|
| 新增 IPC | `ipc/<domain>.ts` + `ipc/index.ts` 注册 | 参考 `ipc/git.ts` 模式 |
| 窗口生命周期 | `index.ts` | `app.on('window-all-closed')` 等 |
| 菜单定制 | `services/MenuBuilder.ts` | macOS/Windows 差异处理 |
| 进程清理 | `ipc/index.ts` → `cleanupAllResources()` | 关键：PTY 必须 await 退出 |

## CONVENTIONS

### IPC Handler 模式
```typescript
// ipc/example.ts
export function registerExampleHandlers(): void {
  ipcMain.handle('example:action', async (_, arg: string) => {
    return await doSomething(arg);
  });
}

// ipc/index.ts 注册
registerExampleHandlers();
```

### 资源清理（关键）
```typescript
// 异步清理 (正常退出)
await cleanupAllResources();

// 同步清理 (信号中断)
cleanupAllResourcesSync();
```

## ANTI-PATTERNS

- **不要遗漏 IPC 注册** — 新 handler 必须在 `ipc/index.ts` 调用
- **PTY 不 await 退出** — 会导致 Node 崩溃，见 `destroyAllTerminalsAndWait()`
- **原生模块同步调用** — `node-pty` 操作应 async

## NOTES

- `node-pty` 和 `@parcel/watcher` 在 `electron.vite.config.ts` 中标记为 external
- Claude IDE Bridge 通过 WebSocket 与 Claude Code CLI 通信
- 自动更新逻辑在 `services/updater/`
