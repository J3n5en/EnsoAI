# CLAUDE.md

## 设计规范

UI 开发必须遵循 `docs/design-system.md`，核心要点：

- **组件优先**：优先使用 [@coss/ui](https://coss.com/ui) 组件，禁止手动实现已有组件
- **颜色**：使用 CSS 变量（`text-primary`、`bg-accent`、`text-muted-foreground`）
- **尺寸**：Tab 栏 `h-9`、树节点 `h-7`、小按钮 `h-6`
- **间距**：紧凑 `gap-1`、标准 `gap-2`、缩进 `depth * 12 + 8px`
- **图标**：Lucide React，目录黄色、TS 蓝色、JS 黄色
- **文本截断**：`min-w-0 flex-1 truncate` + 固定元素 `shrink-0`
- **Monaco**：本地 worker、主题同步终端配色

## 提交信息规范

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范，Release Notes 会根据前缀自动分类。

### 格式

```
<类型>[可选作用域]: <描述>
```

### 类型

| 类型 | 说明 | Release Notes 分类 |
|------|------|-------------------|
| `feat` | 新功能 | ✨ 新功能 |
| `fix` | 问题修复 | 🐛 问题修复 |
| `ci` | CI/CD 配置 | 🔨 CI/CD |
| `build` | 构建相关 | 🔨 CI/CD |
| `docs` | 文档更新 | - |
| `style` | 代码风格（不影响逻辑） | - |
| `refactor` | 重构（无功能变化） | - |
| `perf` | 性能优化 | - |
| `test` | 测试相关 | - |
| `chore` | 杂项维护 | - |

### 示例

```bash
feat: 添加暗色主题支持
feat(terminal): 支持自定义字体大小
fix: 修复窗口关闭时崩溃问题
fix(editor): 解决中文输入法兼容问题
ci: 优化 GitHub Actions 构建流程
chore: 版本更新至 0.1.8
```

### 注意事项

- 描述使用中文
- 作用域可选，用于标注影响范围（如 `terminal`、`editor`、`main` 等）
- 仅 `feat`、`fix`、`ci`、`build` 前缀的提交会出现在自动生成的 Release Notes 中
