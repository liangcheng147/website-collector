# 组件风格统一设计

## 目标

保持现有青绿色系，统一应用中所有组件的视觉规范，解决复选框、按钮、输入框、标签、弹窗等组件样式不一致的问题。

## 设计规范

### 1. 开关 (Toggle)

- **尺寸**: 44×24px
- **圆角**: 12px（pill 形）
- **滑块**: 20×20px 圆形，白色，`box-shadow: 0 1px 3px rgba(0,0,0,.15)`
- **开启色**: `var(--primary)` (#0D9488)
- **关闭色**: `var(--border-2)` (#C3DED9)
- **动画**: `transform 180ms cubic-bezier(.2,.7,.3,1)`

### 2. 按钮

- **高度**: 36px
- **圆角**: 8px
- **padding**: 0 14px
- **字号**: 13px
- **字重**: 500
- **主要按钮**: `background: var(--primary); color: #fff`
- **次要按钮**: `background: #fff; color: var(--text); border: 1px solid var(--border)`
- **危险按钮**: `background: var(--danger); color: #fff`
- **描边按钮**: `background: transparent; color: var(--primary); border: 1px solid var(--primary)`
- **按下态**: `transform: scale(.97)`

### 3. 输入框 / 下拉框

- **高度**: 36px
- **圆角**: 8px
- **padding**: 0 10px
- **字号**: 13px
- **边框**: `1px solid var(--border-2)`
- **背景**: `#fff`
- **焦点态**: `border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring)`

### 4. 标签 / Chip

- **圆角**: 999px（pill 形）
- **padding**: 2px 10px
- **字号**: 12px
- **背景**: `var(--primary-t)`
- **文字色**: `var(--primary-w)`

### 5. 弹窗

- **padding**: 20px
- **圆角**: 14px
- **阴影**: `var(--shadow-lg)`

### 6. 焦点态 (Focus Ring)

- **宽度**: 3px
- **颜色**: `var(--ring)` = `rgba(13,148,136,.30)`
- **偏移**: 0

## 设置页面结构重构

### 当前问题

设置弹窗使用 Tab 切换模式，弹窗大小随内容跳变，操作路径不直观。

### 新结构：左侧导航 + 右侧内容

- **布局**: 左侧固定宽度导航栏 + 右侧内容区域
- **高度**: 固定高度（约 480px），不随内容变化
- **左侧导航**: 垂直菜单，当前项高亮（`background: var(--primary-t); border-right: 3px solid var(--primary)`）
- **右侧内容**: 可滚动区域，切换导航项时内容变化
- **导航项**: 主题、显示、数据存储、关于

### 交互

- 点击左侧导航项，右侧内容切换
- 弹窗高度固定，不随内容跳变
- 右侧内容区域可滚动（内容超出时）

## 影响范围

### 需要修改的文件

1. **`src/styles/main.css`** — 添加 Toggle 组件样式，统一按钮/输入框/标签/弹窗规范
2. **`src/components/SettingsModal.vue`** — 复选框改为 Toggle，按钮尺寸统一
3. **`src/components/AddEditModal.vue`** — 按钮/输入框统一
4. **`src/components/ImportExportModal.vue`** — 按钮/输入框统一
5. **`src/components/ConfirmModal.vue`** — 按钮统一
6. **`src/components/PromptModal.vue`** — 按钮/输入框统一
7. **`src/components/ModalMask.vue`** — 弹窗 padding 统一
8. **`src/components/TagInput.vue`** — 标签样式统一
9. **`src/components/SiteTable.vue`** — 复选框统一（如需要）
10. **`src/components/RecycleView.vue`** — 复选框统一（如需要）

### 不需要修改的

- 颜色系统（保持现有青绿色系）
- 字体/字号（保持现有）
- 布局结构（保持现有）
- 动画曲线（保持现有）

## 实现方式

1. 在 `main.css` 中新增 `.toggle` 组件样式
2. 在 `main.css` 中统一 `.btn`、`input`、`select`、`.chip`、`.modal` 的规范
3. 将 SettingsModal 中的 `<input type="checkbox">` 替换为 `.toggle` 组件
4. 确保所有弹窗使用统一的按钮/输入框/标签类名

## 验证

- `npm test` — 前端测试通过
- `npm run build` — 类型检查 + 构建通过
- 手动验证：所有弹窗的按钮/输入框/标签视觉一致
