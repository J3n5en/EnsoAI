# Web Inspector 功能设计

## 概述

Web Inspector 是一个浏览器元素检查工具，通过油猴脚本在浏览器中选择元素，将元素信息发送到 Enso，并自动写入当前 active 的 agent session 终端。

## 架构

```
┌─────────────────┐    HTTP POST     ┌─────────────────┐
│  油猴脚本        │ ───────────────→ │  Enso 主进程     │
│  (浏览器)        │   :18765         │  (HTTP Server)  │
└─────────────────┘                  └────────┬────────┘
                                              │ IPC
                                              ▼
                                     ┌─────────────────┐
                                     │  渲染进程        │
                                     │  写入 Agent 终端 │
                                     └─────────────────┘
```

## 技术决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 端口 | 固定 18765 | 简单，避开常用端口 |
| 通信方式 | HTTP POST | 单向发送，实现简单 |
| 写入方式 | 直接写入终端 | 复用现有机制，用户可见可控 |
| 设置分类 | 独立分类 | 功能独立，便于扩展 |

## 组件清单

| 组件 | 文件位置 | 说明 |
|------|----------|------|
| 设置项 | `src/renderer/stores/settings.ts` | 添加 `webInspectorEnabled` |
| 设置 UI | `src/renderer/components/settings/WebInspectorSettings.tsx` | 独立分类，开关+安装按钮+状态 |
| 设置对话框 | `src/renderer/components/settings/SettingsDialog.tsx` | 添加新分类导航 |
| HTTP Server | `src/main/services/webInspector/WebInspectorServer.ts` | 监听 18765 端口 |
| IPC 处理 | `src/main/ipc/webInspector.ts` | 注册 IPC handlers |
| IPC 注册 | `src/main/ipc/index.ts` | 导入新模块 |
| 渲染进程监听 | `src/renderer/hooks/useWebInspector.ts` | 监听数据并写入终端 |
| 油猴脚本 | `scripts/web-inspector.user.js` | 浏览器端脚本 |

## 数据结构

### 请求格式（POST /inspect）

```typescript
interface InspectPayload {
  element: string      // <div class="xxx" id="yyy">
  path: string         // 完整 CSS 路径
  attributes: Record<string, string>
  styles: Record<string, string>
  position: { top: string, left: string, width: string, height: string }
  innerText: string
  url: string          // 当前页面 URL
  timestamp: number
}
```

### 终端输出格式

```
[Web Inspector] https://example.com
Element: <button class="btn primary" id="submit">
Path: body > main > form > button.btn.primary
Attributes: { type: "submit", disabled: "false" }
Size: 120x40 @ (100, 200)
Text: "提交"
```

## IPC 通道

- `web-inspector:start` - 启动 server
- `web-inspector:stop` - 停止 server
- `web-inspector:status` - 查询状态
- `web-inspector:data` - 主进程 → 渲染进程推送数据

## 实现顺序

1. 油猴脚本修改
2. 设置项 + 设置 UI
3. 主进程 HTTP Server + IPC
4. 渲染进程监听 + 终端写入
