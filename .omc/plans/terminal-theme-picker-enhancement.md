# 终端配色选择组件样式和功能增强

## 需求摘要

本计划实现终端配色选择器的三项核心增强：

1. **实时应用配色** - 键盘上下移动焦点或鼠标悬停时，直接应用配色到整个系统
2. **配色收藏系统** - 支持收藏配色，提供全部/收藏视图切换
3. **未展开状态收藏** - 下拉框未展开时也能收藏当前配色

---

## 验收标准

### 需求1：实时应用配色
- [ ] 下拉框展开后，键盘上下移动焦点时，直接应用该配色到整个系统（终端+应用主题同步）
- [ ] 鼠标悬停在条目上停留 150ms 后，直接应用该配色
- [ ] 快速划过时不触发应用（防抖）
- [ ] 无需点击确认，焦点移动即应用

### 需求2：配色收藏系统
- [ ] 配色行右侧新增「全部/收藏」切换器（使用 Switch 或 Select）
- [ ] 切换到「收藏」时，下拉框仅显示已收藏的配色
- [ ] 每个配色条目右侧显示爱心图标（已收藏：实心；未收藏：空心描边）
- [ ] 点击爱心可切换收藏状态
- [ ] 特殊交互：在「收藏」视图中，当前选中的非收藏配色临时显示在列表第1位

### 需求3：未展开状态收藏
- [ ] 下拉框未展开时，当前选中项右侧显示爱心图标
- [ ] 可通过左右按钮浏览配色，直接点击爱心收藏

---

## 技术方案

### 状态设计

```typescript
// settings.ts 新增持久化状态
favoriteTerminalThemes: string[]  // 收藏的配色名列表

// AppearanceSettings.tsx 本地状态
showFavoritesOnly: boolean        // 是否仅显示收藏
```

### 关键实现点

1. **实时应用配色（简化方案）**
   - 无需 `previewThemeName` 临时状态
   - 键盘导航或鼠标悬停时，直接调用 `setTerminalTheme(themeName)`
   - Store 的 `setTerminalTheme` 已实现应用主题同步逻辑（sync-terminal 模式）
   - 鼠标悬停使用 150ms 防抖，避免快速划过时频繁切换

2. **Combobox 扩展**
   - `ComboboxItem` 支持 `endAddon` 属性，用于放置爱心图标
   - 或直接在 `ThemeCombobox` 中自定义 Item 渲染

3. **收藏列表逻辑**
   - 「收藏」视图：`favoriteTerminalThemes` + 当前选中项（如非收藏则临时置顶）
   - 「全部」视图：所有配色

---

## 实现步骤

### Phase 1: Store 扩展 (settings.ts)

**文件**: `/Users/ofeiss/project/EnsoAI/src/renderer/stores/settings.ts`

**改动**:
1. 在 `SettingsState` 接口中添加:
   ```typescript
   favoriteTerminalThemes: string[];
   addFavoriteTerminalTheme: (theme: string) => void;
   removeFavoriteTerminalTheme: (theme: string) => void;
   toggleFavoriteTerminalTheme: (theme: string) => void;
   ```

2. 在初始状态中添加:
   ```typescript
   favoriteTerminalThemes: [],
   ```

3. 实现 action 方法:
   ```typescript
   addFavoriteTerminalTheme: (theme) =>
     set((state) => ({
       favoriteTerminalThemes: state.favoriteTerminalThemes.includes(theme)
         ? state.favoriteTerminalThemes
         : [...state.favoriteTerminalThemes, theme],
     })),
   removeFavoriteTerminalTheme: (theme) =>
     set((state) => ({
       favoriteTerminalThemes: state.favoriteTerminalThemes.filter((t) => t !== theme),
     })),
   toggleFavoriteTerminalTheme: (theme) =>
     set((state) => ({
       favoriteTerminalThemes: state.favoriteTerminalThemes.includes(theme)
         ? state.favoriteTerminalThemes.filter((t) => t !== theme)
         : [...state.favoriteTerminalThemes, theme],
     })),
   ```

4. 在 `merge` 函数中添加迁移逻辑（确保旧用户升级时 `favoriteTerminalThemes` 为空数组）

---

### Phase 2: ComboboxItem 扩展 (combobox.tsx)

**文件**: `/Users/ofeiss/project/EnsoAI/src/renderer/components/ui/combobox.tsx`

**改动**:
1. 修改 `ComboboxItem` 组件，支持 `endAddon` 属性:
   ```typescript
   function ComboboxItem({
     className,
     children,
     endAddon,
     ...props
   }: ComboboxPrimitive.Item.Props & {
     endAddon?: React.ReactNode;
   }) {
     return (
       <ComboboxPrimitive.Item
         className={cn(
           "grid min-h-8 ... grid-cols-[1rem_1fr_auto] ...",
           className
         )}
         ...
       >
         <ComboboxPrimitive.ItemIndicator className="col-start-1">...</ComboboxPrimitive.ItemIndicator>
         <div className="col-start-2">{children}</div>
         {endAddon && (
           <div className="col-start-3 flex items-center">{endAddon}</div>
         )}
       </ComboboxPrimitive.Item>
     );
   }
   ```

2. 调整 grid 布局从 `grid-cols-[1rem_1fr]` 改为 `grid-cols-[1rem_1fr_auto]`

---

### Phase 3: ThemeCombobox 重构 (AppearanceSettings.tsx)

**文件**: `/Users/ofeiss/project/EnsoAI/src/renderer/components/settings/AppearanceSettings.tsx`

**改动 1**: 新增爱心按钮组件
```typescript
function FavoriteButton({
  isFavorite,
  onClick,
}: {
  isFavorite: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="p-1 hover:text-red-500 transition-colors"
    >
      {isFavorite ? (
        <Heart className="h-4 w-4 fill-red-500 text-red-500" />
      ) : (
        <Heart className="h-4 w-4" />
      )}
    </button>
  );
}
```

**改动 2**: 扩展 ThemeCombobox Props
```typescript
function ThemeCombobox({
  value,
  onValueChange,
  themes,
  favoriteThemes,
  onToggleFavorite,
  onHighlightChange,  // 新增：高亮项变化回调
}: {
  value: string;
  onValueChange: (value: string | null) => void;
  themes: string[];
  favoriteThemes: string[];
  onToggleFavorite: (theme: string) => void;
  onHighlightChange?: (theme: string | null) => void;
}) {
  // ...
}
```

**改动 3**: 监听高亮项变化
- 使用 `@base-ui/react` Combobox 的事件监听高亮项
- 键盘导航：监听 `ArrowUp`/`ArrowDown` 时更新预览
- 需要研究 `@base-ui/react` API，可能需要使用 `onHighlightChange` 或追踪 `data-highlighted` 属性

**改动 4**: 鼠标悬停防抖预览
```typescript
const hoverTimeoutRef = React.useRef<NodeJS.Timeout>();

const handleItemMouseEnter = (themeName: string) => {
  clearTimeout(hoverTimeoutRef.current);
  hoverTimeoutRef.current = setTimeout(() => {
    onHighlightChange?.(themeName);
  }, 150);
};

const handleItemMouseLeave = () => {
  clearTimeout(hoverTimeoutRef.current);
};
```

**改动 5**: 渲染爱心图标
```typescript
{filteredThemes.map((name) => (
  <ComboboxItem
    key={name}
    value={name}
    onMouseEnter={() => handleItemMouseEnter(name)}
    onMouseLeave={handleItemMouseLeave}
    endAddon={
      <FavoriteButton
        isFavorite={favoriteThemes.includes(name)}
        onClick={() => onToggleFavorite(name)}
      />
    }
  >
    {name}
  </ComboboxItem>
))}
```

---

### Phase 4: AppearanceSettings 主组件改造

**文件**: `/Users/ofeiss/project/EnsoAI/src/renderer/components/settings/AppearanceSettings.tsx`

**改动 1**: 引入新状态和 Store 方法
```typescript
const {
  // ... existing
  favoriteTerminalThemes,
  toggleFavoriteTerminalTheme,
} = useSettingsStore();

// 本地状态
const [previewThemeName, setPreviewThemeName] = React.useState<string | null>(null);
const [showFavoritesOnly, setShowFavoritesOnly] = React.useState(false);
```

**改动 2**: 计算显示的配色列表
```typescript
const displayThemes = React.useMemo(() => {
  if (!showFavoritesOnly) {
    return themeNames;
  }
  // 收藏视图：收藏列表 + 当前选中项（如非收藏则置顶）
  const favorites = themeNames.filter((name) =>
    favoriteTerminalThemes.includes(name)
  );
  if (!favoriteTerminalThemes.includes(terminalTheme)) {
    return [terminalTheme, ...favorites];
  }
  return favorites;
}, [themeNames, showFavoritesOnly, favoriteTerminalThemes, terminalTheme]);
```

**改动 3**: 预览主题计算
```typescript
const previewTheme = React.useMemo(() => {
  const themeName = previewThemeName ?? terminalTheme;
  return getXtermTheme(themeName) ?? defaultDarkTheme;
}, [previewThemeName, terminalTheme]);
```

**改动 4**: 处理下拉框关闭
```typescript
const handleOpenChange = (open: boolean) => {
  if (!open) {
    // 关闭时清除预览
    setPreviewThemeName(null);
  }
};
```

**改动 5**: UI 布局调整 - 配色行
```tsx
<div className="grid grid-cols-[100px_1fr_auto] items-center gap-4">
  <span className="text-sm font-medium">{t('Color scheme')}</span>
  <div className="flex items-center gap-2">
    <Button variant="outline" size="icon" onClick={handlePrevTheme}>
      <ChevronLeft className="h-4 w-4" />
    </Button>
    <div className="flex-1">
      <ThemeCombobox
        value={terminalTheme}
        onValueChange={handleThemeChange}
        themes={displayThemes}
        favoriteThemes={favoriteTerminalThemes}
        onToggleFavorite={toggleFavoriteTerminalTheme}
        onHighlightChange={setPreviewThemeName}
        onOpenChange={handleOpenChange}
      />
    </div>
    <Button variant="outline" size="icon" onClick={handleNextTheme}>
      <ChevronRight className="h-4 w-4" />
    </Button>
    {/* 未展开时的收藏按钮 */}
    <FavoriteButton
      isFavorite={favoriteTerminalThemes.includes(terminalTheme)}
      onClick={() => toggleFavoriteTerminalTheme(terminalTheme)}
    />
  </div>
  {/* 全部/收藏切换器 */}
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground">{t('Favorites')}</span>
    <Switch
      checked={showFavoritesOnly}
      onCheckedChange={setShowFavoritesOnly}
    />
  </div>
</div>
```

---

### Phase 5: 左右切换按钮适配

**文件**: `/Users/ofeiss/project/EnsoAI/src/renderer/components/settings/AppearanceSettings.tsx`

**改动**: 左右切换在收藏模式下只切换收藏列表
```typescript
const handlePrevTheme = () => {
  const list = showFavoritesOnly ? displayThemes : themeNames;
  const currentIndex = list.indexOf(terminalTheme);
  const newIndex = currentIndex <= 0 ? list.length - 1 : currentIndex - 1;
  setTerminalTheme(list[newIndex]);
};

const handleNextTheme = () => {
  const list = showFavoritesOnly ? displayThemes : themeNames;
  const currentIndex = list.indexOf(terminalTheme);
  const newIndex = currentIndex >= list.length - 1 ? 0 : currentIndex + 1;
  setTerminalTheme(list[newIndex]);
};
```

---

### Phase 6: 国际化

**文件**: 相关 i18n 文件

**新增翻译 key**:
- `Favorites` / `收藏`
- `All themes` / `全部配色` (可选)

---

## 风险识别与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `@base-ui/react` Combobox 不直接暴露 `highlightedValue` | 无法监听键盘高亮变化 | 1. 使用 MutationObserver 监听 `data-highlighted` 属性变化；2. 或 wrap Combobox 使用 controlled mode |
| 鼠标快速移动导致频繁预览 | 性能问题 | 已设计 150ms 防抖 |
| 收藏列表为空时切换到收藏视图 | 用户困惑 | 显示空状态提示，或自动添加当前配色到显示列表 |
| 持久化迁移问题 | 老用户数据丢失 | 在 merge 函数中妥善处理 `favoriteTerminalThemes` 默认值 |

---

## 验证步骤

### 单元测试
1. `toggleFavoriteTerminalTheme` 正确添加/移除配色
2. `displayThemes` 在不同模式下返回正确列表
3. 非收藏配色在收藏视图中置顶显示

### 手动测试
1. **预览测试**
   - 打开配色下拉框
   - 键盘上下移动，观察预览区是否实时变化
   - 鼠标悬停条目 200ms，观察预览区变化
   - 快速划过条目，确认不触发预览
   - 按 Escape 关闭，确认恢复原配色

2. **收藏测试**
   - 点击条目右侧爱心，确认收藏状态切换
   - 切换到「收藏」视图，确认只显示已收藏配色
   - 选择一个非收藏配色，切换到「收藏」视图，确认该配色显示在列表第一位
   - 关闭应用重启，确认收藏列表持久化

3. **未展开收藏测试**
   - 不展开下拉框，点击右侧爱心，确认收藏成功
   - 使用左右按钮切换配色，点击爱心收藏不同配色

---

## 提交策略

| 序号 | 提交信息 | 内容 |
|------|----------|------|
| 1 | `feat(settings): add favorite terminal themes storage` | Store 扩展 |
| 2 | `feat(ui): add endAddon support to ComboboxItem` | Combobox 扩展 |
| 3 | `feat(settings): add terminal theme live preview` | 实时预览功能 |
| 4 | `feat(settings): add terminal theme favorites system` | 收藏系统 UI |
| 5 | `feat(settings): add collapsed state favorite button` | 未展开状态收藏 |

---

## 成功标准

1. 用户可以通过键盘/鼠标悬停实时预览配色效果
2. 用户可以收藏喜欢的配色，并快速在收藏列表中切换
3. 收藏数据跨会话持久化
4. 交互流畅，无明显卡顿
5. 代码符合项目现有风格和设计规范
