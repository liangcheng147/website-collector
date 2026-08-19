# 5 个 Bug 修复设计文档

## 问题清单

| # | 问题 | 文件 | 优先级 |
|---|------|------|--------|
| 1 | 主页拖拽不生效（dragstart 不触发） | SiteTable.vue, main.css | 高 |
| 2 | 链接分类列显示 ID 而非名称 | SiteTable.vue | 中 |
| 3 | 侧边栏分类不可折叠 | CategoryNode.vue, app.ts (store) | 中 |
| 4 | 添加弹窗默认分类未跟随侧边栏选择 | App.vue, AddEditModal.vue | 中 |
| 5 | 管理页批量添加分类表单排版偏挤 | ManageCategories.vue, main.css | 低 |

---

## 修复 1：主页拖拽

### 根因

`<tr draggable="true">` 在 Chromium（WebView2）里，配合全局 `user-select: none` 导致 dragstart 不触发。`-webkit-user-drag: element` 对 `<tr>` 元素不可靠。

### 方案

把 draggable 从 `<tr>` 移到内容 `<td>`：

- `<tr>` 不设 `draggable`
- 第一个 `<td>` 加 `draggable="true"` + dragstart/dragend 处理
- drop target（CategoryNode）不变，仍监听 drop 事件
- 保持现有 `data-site-id` / `data-site-ids` 逻辑

### 改动文件

- `src/components/SiteTable.vue`：draggable 从 tr 移到 td，dragstart/dragend 事件移到 td

---

## 修复 2：分类列显示 ID

### 根因

`SiteTable.vue:96` 直接输出 `{{ s.categoryId }}`，显示原始 ID（如 auto36）。

### 方案

通过 `store.flatCategories` 映射 ID → 名称，未分类显示"未分类"。

### 改动文件

- `src/components/SiteTable.vue`：加 computed 方法，模板用 computed 替代 `s.categoryId`

---

## 修复 3：侧边栏分类折叠

### 现状

CategoryNode 始终显示所有子分类，无法展开/收起。

### 方案

- CategoryNode 加折叠箭头（▶/▼），有子分类时显示
- 点击箭头切换子分类可见性（不触发 setView）
- 折叠状态存 `store.settings.collapsedCategories: number[]`（分类 id 数组）
- 侧边栏宽度适当加宽以容纳缩进

### 改动文件

- `src/components/CategoryNode.vue`：加箭头 + 点击事件 + 条件渲染子分类
- `src/store/app.ts`：settings 加 `collapsedCategories: number[]`，加 toggle action
- `src/styles/main.css`：箭头样式 + 缩进样式
- `src/components/Sidebar.vue`：侧边栏宽度微调（可选）

---

## 修复 4：添加默认分类

### 现状

AddEditModal 的 `categoryId` 默认 null（未分类），即使用户在某个分类视图下。

### 方案

- App.vue 的 `openAdd()` 传入 `defaultCategoryId`
- 当 `store.view.kind === 'category'` 时传 `store.view.id`，否则 null
- AddEditModal 接收 `defaultCategoryId` prop，初始化时用它

### 改动文件

- `src/components/App.vue`：openAdd 传 defaultCategoryId
- `src/components/AddEditModal.vue`：接收 prop，初始化 categoryId

---

## 修复 5：管理页排版

### 现状

左卡"批量添加分类"表单布局偏挤，标签和输入框间距/对齐不理想。

### 方案

- 给 `<label>` 加 `display:block; margin-bottom:4px` 确保标签独占一行
- 左卡宽度从 `240px` 调整为 `280px`
- 给 `.manage-card` 加 `min-width` 防止压缩

### 改动文件

- `src/styles/main.css`：manage-card 宽度 + label 样式
- `src/components/ManageCategories.vue`：确认结构

---

## 验证

- `npm run build` 通过
- `npm test` 全部通过
- 手动验证：拖拽站点到分类/标签/回收站
- 手动验证：侧边栏分类折叠/展开
- 手动验证：添加弹窗默认分类
- 手动验证：管理页表单布局
