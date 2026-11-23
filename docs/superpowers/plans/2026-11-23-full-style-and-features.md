# 全项目风格统一、设置页、分类树与近期功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 SiteCollector 前端表现层全量统一到 Naive UI，重排设置页与分类树，并落地近期本地功能。

**Architecture:** 按“先统一组件、再重排重点页面、最后加功能”的顺序推进。组件迁移保持行为不变，只换表现层与清理旧 CSS；设置页/分类树在统一后做结构重排；近期功能在统一后的组件上增量实现。

**Tech Stack:** Vue 3.5 + TypeScript + Pinia + Vite + Naive UI 2.45.3 + Tauri 2 + Rust（reqwest/serde）。

**Spec:** `docs/superpowers/specs/2026-11-23-settings-and-tree-design.md`

## Global Constraints

- 颜色唯一来源：`src/theme/palettes.ts` + `src/theme/tokens.ts`；禁止在组件中写死十六进制。
- Naive UI 版本固定 `2.45.3`；不引入 Tailwind；不换图标库（继续 `lucide-vue-next`）。
- 不使用 `n-global-style`；保留无边框 + 透明窗口 + 自绘 TitleBar / 外壳 / 站点拖拽。
- `src/api.ts` 是前端与 Rust 的唯一契约：新增/改名 IPC 命令必须同步 `src-tauri/src/commands.rs` 的 `#[tauri::command]` 与 `src-tauri/capabilities/` 权限。
- Vite 固定端口 `1420`（`strictPort: true`）。
- 测试：`npm test`（Vitest）；类型 + 构建：`npm run build`（`vue-tsc --noEmit` + `vite build`）；e2e：`npx playwright test`。
- 模板中不出现静态 `style="..."`（动态数值如进度宽度、拖拽坐标除外）。
- 测试/e2e 选择器用 role / 文本 / `data-testid`，不依赖 `.btn`、`.cb` 等样式类。
- 提交粒度：每个 Task 结束时提交，保持可回滚。

## Review Focus

- **旧类残留**：迁移后模板仍出现 `.btn` / `.cb` / `.segctrl` / `.grid2x2` / `.modal-content` 作为主要交互控件。
- **行为回归**：拖拽、右键菜单、折叠持久化、批量选择、导入导出、更新流程在换组件后失效。
- **颜色外泄**：组件或 `main.css` 出现 `src/theme/` 之外的十六进制颜色。
- **测试脆弱**：测试/e2e 仍依赖样式类或 CSS 文本断言。
- **透明窗口**：迁移后出现白底、圆角丢失、拖拽区失效等外壳问题。

---

### Task 1: 迁移表单类弹窗到 Naive UI

**Files:**
- Modify: `src/components/AddEditModal.vue`
- Modify: `src/components/AddCategoryModal.vue`
- Modify: `src/components/AddTagsModal.vue`
- Modify: `src/components/PickCategoryModal.vue`
- Modify: `src/components/AddEditModal.spec.ts`
- Modify: `src/components/AddCategoryModal.spec.ts`（若存在）
- Modify: `src/components/AddTagsModal.spec.ts`（若存在）
- Modify: `src/components/PickCategoryModal.spec.ts`（若存在）

**Interfaces:**
- Consumes: 现有 `store`、`api`、`TagInput`、`AddCategoryModal`。
- Produces: 四个弹窗的模板不再使用 `.btn` / `.modal-content` 作为主要控件；保留原有 `data-testid`（`input-url`、`textarea-note`、`btn-save`、`btn-fetch-title` 等）。

- [ ] **Step 1: 写失败测试（AddEditModal 控件类型）**
  在 `src/components/AddEditModal.spec.ts` 增加断言：表单内主要输入为 Naive 控件（如 `.n-input`、`.n-select`），保存/取消按钮为 `.n-button`，且不再存在 `.btn` 类按钮。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/AddEditModal.spec.ts`
  Expected: FAIL（仍存在 `.btn` / 原生控件）
- [ ] **Step 3: 迁移 `AddEditModal.vue`**
  - `n-modal` 保留；内容层去掉 `.modal-content`，改用 Naive 布局（`n-form`/`n-space`/`n-input`/`n-select`/`n-button`）。
  - 名称/URL/备注用 `n-input`（备注 `type="textarea"`）；分类用 `n-select`；标签保留 `TagInput`（Task 5 再升级内部）。
  - 按钮：取消/保存用 `n-button`，保存 `type="primary"`；“获取名称”用 `n-button size="small"`。
  - 错误提示用 `n-text type="error"` 或统一 `.err` 样式（颜色取主题变量）。
- [ ] **Step 4: 运行测试确认通过**
  Run: `npm test -- src/components/AddEditModal.spec.ts`
  Expected: PASS
- [ ] **Step 5: 迁移 `AddCategoryModal.vue`**
  同样去掉 `.btn` / `.modal-content`，输入用 `n-input`，按钮用 `n-button`；保留创建逻辑与 `data-testid`。
- [ ] **Step 6: 迁移 `AddTagsModal.vue`**
  去掉 `.btn` / `.modal-content`；标签输入保留 `TagInput`（Task 5 升级），按钮用 `n-button`。
- [ ] **Step 7: 迁移 `PickCategoryModal.vue`**
  去掉 `.btn` / `.modal-content`；分类选择用 `n-tree`/`n-select`/Naive 列表；按钮用 `n-button`。
- [ ] **Step 8: 运行相关测试与类型检查**
  Run: `npm test -- src/components/AddEditModal.spec.ts src/components/AddCategoryModal.spec.ts src/components/AddTagsModal.spec.ts src/components/PickCategoryModal.spec.ts`
  Expected: PASS（文件不存在时跳过）
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 9: 提交**
  ```bash
  git add src/components/AddEditModal.vue src/components/AddCategoryModal.vue src/components/AddTagsModal.vue src/components/PickCategoryModal.vue src/components/*.spec.ts
  git commit -m "refactor(ui): migrate form modals to naive-ui"
  ```

---

### Task 2: 迁移导入导出弹窗到 Naive UI

**Files:**
- Modify: `src/components/ImportExportModal.vue`
- Modify: `src/components/ImportExportModal.spec.ts`（若存在）

**Interfaces:**
- Consumes: `api.exportMdToFile` / `exportJsonToFile` / `exportBookmarksHtmlToFile` / `importMdFromFile` / `importBookmarksHtml` / `importJsonFromFile` / `readTextFile`。
- Produces: 弹窗内主要按钮为 `n-button`；导入方式用 `n-radio-group` 或 `n-segmented`；说明用 `n-alert`/`n-text`。

- [ ] **Step 1: 写失败测试（导入导出控件类型）**
  断言：导出/导入按钮为 `.n-button`；导入方式为 Naive 单选/分段控件；不再存在 `.btn` / `.segctrl` / `.grid2x2`。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/ImportExportModal.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 迁移 `ImportExportModal.vue`**
  - 去掉 `.modal-content` / `.grid2x2` / `.segctrl` / `.actions`。
  - 导出/导入按钮用 `n-button`（可用 `n-space` 或网格布局）。
  - 导入方式用 `n-radio-group`（或 `n-segmented`），`v-model` 仍绑定 `mode`。
  - 说明文字用 `n-text depth="3"` 或 `n-alert`。
  - JSON 两段式确认保留，按钮换 `n-button`。
- [ ] **Step 4: 运行测试与构建**
  Run: `npm test -- src/components/ImportExportModal.spec.ts`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 5: 提交**
  ```bash
  git add src/components/ImportExportModal.vue src/components/ImportExportModal.spec.ts
  git commit -m "refactor(ui): migrate import/export modal to naive-ui"
  ```

---

### Task 3: 迁移管理页到 Naive UI

**Files:**
- Modify: `src/components/ManageView.vue`
- Modify: `src/components/ManageCategories.vue`
- Modify: `src/components/ManageTags.vue`
- Modify: `src/store/app.ts`（若需要补充选择相关逻辑）
- Modify: 对应 spec 文件

**Interfaces:**
- Consumes: `useSelection`、`store` 的分类/标签操作。
- Produces: 管理页主要按钮/复选框/列表为 Naive 控件；`.manage-*` / `.cat-*` / `.cb` / `.btn` 不再作为主要交互控件。

- [ ] **Step 1: 写失败测试（管理页控件类型）**
  断言：`ManageCategories`/`ManageTags` 中批量操作按钮为 `.n-button`，行选择为 `.n-checkbox`，不再存在 `.cb` / `.btn`。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/ManageCategories.spec.ts src/components/ManageTags.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 迁移 `ManageView.vue`**
  - 返回按钮、分类/标签切换用 `n-button`/`n-tabs`（或统一按钮组）；去掉 `.btn` / `.manage-tabs`。
- [ ] **Step 4: 迁移 `ManageCategories.vue`**
  - 列表可用 `n-data-table`（含 selection 列）或 Naive 列表 + `n-checkbox`。
  - 批量操作按钮用 `n-button`；删除用 `type="error"`。
  - 保留 `useSelection` 行为或改用 `n-data-table` 的 `checked-row-keys`（二选一，保持测试通过）。
- [ ] **Step 5: 迁移 `ManageTags.vue`**
  - 同上；批量模式用 `n-radio-group`/`n-segmented` 替代 `.segctrl`。
  - 合并/重命名逻辑保留。
- [ ] **Step 6: 运行测试与构建**
  Run: `npm test -- src/components/ManageCategories.spec.ts src/components/ManageTags.spec.ts`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 7: 提交**
  ```bash
  git add src/components/ManageView.vue src/components/ManageCategories.vue src/components/ManageTags.vue src/store/app.ts
  git commit -m "refactor(ui): migrate manage views to naive-ui"
  ```

---

### Task 4: 迁移列表与批量操作到 Naive UI

**Files:**
- Modify: `src/components/RecycleView.vue`
- Modify: `src/components/SiteTable.vue`
- Modify: `src/composables/useSelection.ts`（若需要）
- Modify: 对应 spec / e2e

**Interfaces:**
- Consumes: `store.selectedIds`、`useSelection`、`api`。
- Produces: 批量操作按钮为 `n-button`；选择列为 `n-checkbox` 或 `n-data-table` selection；保留原有 `data-testid`。

- [ ] **Step 1: 写失败测试（列表控件类型）**
  断言：`RecycleView`/`SiteTable` 批量按钮为 `.n-button`，选择为 `.n-checkbox`，不再存在 `.cb` / `.btn`。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/RecycleView.spec.ts src/components/SiteTable.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 迁移 `RecycleView.vue`**
  - 按钮换 `n-button`；选择换 `n-checkbox` 或 `n-data-table` selection。
  - 保留恢复/彻底删除/清空回收站逻辑与确认弹窗。
- [ ] **Step 4: 迁移 `SiteTable.vue`**
  - 批量操作按钮换 `n-button`；选择换 `n-checkbox` 或 `n-data-table` selection。
  - 保留框选（marquee）能力；若改用 `n-data-table`，按迁移 spec 风险一实现选框层。
  - 标签 chip 用 Naive 风格（Task 5 可再统一）。
- [ ] **Step 5: 运行测试与构建**
  Run: `npm test -- src/components/RecycleView.spec.ts src/components/SiteTable.spec.ts`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 6: 提交**
  ```bash
  git add src/components/RecycleView.vue src/components/SiteTable.vue src/composables/useSelection.ts
  git commit -m "refactor(ui): migrate lists and bulk actions to naive-ui"
  ```

---

### Task 5: 迁移 TagInput / ContextMenu / Sidebar 内部控件

**Files:**
- Modify: `src/components/TagInput.vue`
- Modify: `src/components/ContextMenu.vue`
- Modify: `src/components/Sidebar.vue`
- Modify: `src/components/TagInput.spec.ts`
- Modify: `src/components/Sidebar.spec.ts`

**Interfaces:**
- Consumes: `store.data.tags`、`store.settings.sidebarCollapsed`、`CategoryNode`。
- Produces: chip/下拉/右键菜单/侧栏行使用 Naive 风格；`TagInput` 仍暴露 `modelValue` / `update:modelValue` 与 `available` props。

- [ ] **Step 1: 写失败测试（TagInput/侧栏控件）**
  断言：`TagInput` chip 为 Naive 风格（如 `.n-tag`），选项列表为 `.n-select-dropdown` 或 Naive 菜单；侧栏不再依赖 `.row` 作为主要交互类。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/TagInput.spec.ts src/components/Sidebar.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 迁移 `TagInput.vue`**
  - 用 `n-select`（`multiple` / `tags` 模式）或 `n-dynamic-tags` + `n-input` 实现；保留大小写不敏感去重行为。
  - 保留 `data-testid`（若有）。
- [ ] **Step 4: 迁移 `ContextMenu.vue`**
  - 评估换 `n-dropdown`（`trigger="manual"` + `x`/`y`）；若替换，保留菜单项与 `action` 事件契约。
  - 若暂不替换，至少把 `.ctx` 样式接入主题变量并统一间距。
- [ ] **Step 5: 迁移 `Sidebar.vue` 内部控件**
  - 保留分组结构；分组标题/行样式接入 Naive 风格（可用 `n-text`/`n-button` 文本按钮）。
  - 计数 `.cnt` 样式统一。
- [ ] **Step 6: 运行测试与构建**
  Run: `npm test -- src/components/TagInput.spec.ts src/components/Sidebar.spec.ts`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 7: 提交**
  ```bash
  git add src/components/TagInput.vue src/components/ContextMenu.vue src/components/Sidebar.vue src/components/TagInput.spec.ts src/components/Sidebar.spec.ts
  git commit -m "refactor(ui): migrate tag input, context menu, sidebar controls"
  ```

---

### Task 6: 清理 `main.css` 与测试选择器

**Files:**
- Modify: `src/styles/main.css`
- Modify: `src/**/*.spec.ts`（移除 CSS 文本断言）
- Modify: `e2e/*.spec.ts`（选择器改为 role/文本/`data-testid`）

**Interfaces:**
- Consumes: 已迁移组件不再依赖的旧类。
- Produces: `main.css` 只保留外壳/标题栏/滚动条/减少动效/主题变量/少量工具类。

- [ ] **Step 1: 审计残留引用**
  Run: `grep -R "\.btn\|\.cb\|\.segctrl\|\.grid2x2\|\.modal-content\|\.cat-row\|\.manage-" -n src`
  Expected: 除 TitleBar/外壳/拖拽外无主要交互控件残留。
- [ ] **Step 2: 写失败测试（CSS 断言清理）**
  删除/修改依赖 `main.css` 文本的断言；改为行为断言。
- [ ] **Step 3: 清理 `main.css`**
  - 删除已迁移组件的旧规则（`.btn`、`.segctrl`、`.grid2x2`、`.modal-content` 相关、`.cat-*`、`.manage-*`、`.cb`、`.ctx` 等）。
  - 保留：标题栏、`.app`/`.body`/`.content` 外壳、滚动条、`@media (prefers-reduced-motion)`、主题变量、`.muted`/`.actions` 等仍被使用的工具类。
  - 目标：`main.css` 行数显著下降，且不含 `src/theme/` 之外的十六进制颜色。
- [ ] **Step 4: 更新 e2e 选择器**
  把 `.btn`、`.cb` 等定位改为 `getByRole` / `getByText` / `data-testid`。
- [ ] **Step 5: 运行全部前端测试与 e2e**
  Run: `npm test`
  Expected: PASS
  Run: `npx playwright test`
  Expected: PASS
- [ ] **Step 6: 运行构建**
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 7: 提交**
  ```bash
  git add src/styles/main.css src/**/*.spec.ts e2e/*.spec.ts
  git commit -m "chore(ui): clean legacy css and test selectors"
  ```

---

### Task 7: 设置页排版统一（含色板）

**Files:**
- Modify: `src/components/SettingsModal.vue`
- Modify: `src/components/SettingsModal.spec.ts`
- Modify: `src/components/SettingsModal.updater.spec.ts`
- Modify: `src/styles/main.css`（设置页相关规则迁移到组件或保留工具类）

**Interfaces:**
- Consumes: `store.settings`、`api.getDataFilePath` / `openDataDir` / `openLink`、`updater`、`PALETTES`。
- Produces: 设置页四个分区主要控件为 Naive UI；不再依赖 `.modal-content` 表单式规则；保留 `data-testid`（`modal-settings`、`settings-tab-*`）。

- [ ] **Step 1: 写失败测试（设置页控件类型）**
  断言：主题/显示/存储/关于分区内输入、选择、按钮、开关为 Naive 控件；文件路径为 `.n-input`；色板为 Naive 控件（如 `.n-radio-group` 或 `.n-select`）；不再存在原生 `<input readonly>` 与 `.palette-swatch`。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/SettingsModal.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 迁移设置页结构与控件**
  - 去掉 `.modal-content` / `.actions` / `.slider-row` 等旧布局，改用 Naive 分组布局（`n-space`/`n-form`/`n-list` 或统一分组类）。
  - 主题：模式选择保留 `n-select`；色板改为 Naive 实现（`n-radio-group` + 自定义渲染，或 `n-select` 自定义渲染），保持色块与主题联动；说明用 `n-text depth="3"`。
  - 显示：缩放用 `n-slider`，右侧显示当前值；说明弱化。
  - 数据存储：路径用 `n-input`（`readonly`），“打开数据目录”用 `n-button`；存储说明用 `n-text`/`n-alert`；回退提示用 `n-alert type="warning"`。
  - 关于：按 Task 8 结构。
  - 页脚“关闭”保留 `n-button`。
- [ ] **Step 4: 运行测试与构建**
  Run: `npm test -- src/components/SettingsModal.spec.ts src/components/SettingsModal.updater.spec.ts`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 5: 提交**
  ```bash
  git add src/components/SettingsModal.vue src/components/SettingsModal.spec.ts src/components/SettingsModal.updater.spec.ts
  git commit -m "refactor(ui): settings page on naive-ui layout"
  ```

---

### Task 8: 关于页重排

**Files:**
- Modify: `src/components/SettingsModal.vue`

**Interfaces:**
- Consumes: `getVersion`、`api.openLink`、`updater`、`navigator.userAgent`。
- Produces: 关于页三组结构（应用信息/更新/诊断）；作者/许可为 `MIT License · Copyright (c) 2026 fan-root`；版本动态。

- [ ] **Step 1: 写失败测试（关于页内容与结构）**
  断言：包含“本地优先的网站收藏与可用性检测桌面应用”简介；包含“问题反馈”“发布页”链接；包含 `MIT License` 与 `Copyright (c) 2026 fan-root`；不再包含“作者 bjb”；“检查更新”按钮存在；版本文本为动态 `v` + `getVersion()` 返回值。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/SettingsModal.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 实现关于页三组结构**
  - 应用信息：版本突出；简介弱化；仓库/问题反馈/发布页链接；许可与版权。
  - 更新：检查更新按钮 + 状态 + 下载/重启 + 自动检查开关。
  - 诊断信息：UA（弱化）+ 可选“复制诊断信息”按钮（复制版本、UA、应用标识）。
  - 需要 `data-testid` 时保持现有 `settings-tab-about` 可切换。
- [ ] **Step 4: 运行测试与构建**
  Run: `npm test -- src/components/SettingsModal.spec.ts src/components/SettingsModal.updater.spec.ts`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 5: 提交**
  ```bash
  git add src/components/SettingsModal.vue src/components/SettingsModal.spec.ts
  git commit -m "feat(settings): restructure about section"
  ```

---

### Task 9: 分类树层级样式

**Files:**
- Modify: `src/components/CategoryNode.vue`
- Modify: `src/components/Sidebar.vue`
- Modify: `src/styles/main.css`（新增引导线/层级规则，或放到组件 scoped 样式）
- Modify: `src/components/Sidebar.spec.ts`

**Interfaces:**
- Consumes: `store.settings.collapsedCategories`、`store.view`、拖拽/右键逻辑。
- Produces: 分类树显示层级引导线；缩进 18–20px；保留拖拽/右键/折叠持久化。

- [ ] **Step 1: 写失败测试（层级样式存在）**
  断言：`CategoryNode` 渲染包含引导线标识（如 `data-hierarchy` 或类名 `tree-node` / `tree-guide`）；缩进随 `depth` 增加而增加。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/Sidebar.spec.ts src/components/CategoryNode.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 实现层级样式**
  - `CategoryNode.vue` 增加层级类名/引导线元素；用 `::before` 或嵌套容器 `border-left` 画竖线；末级用拐角。
  - 缩进改为 `18 + depth * 18`（或 `18–20px` 基数）；子级字号略小、计数颜色更浅。
  - 父级有子节点时加浅底色/左侧色条；选中态保留主色左侧色条。
  - 清理失效的 `.row.sub` 规则。
- [ ] **Step 4: 验证交互不回归**
  Run: `npm test -- src/components/Sidebar.spec.ts src/components/CategoryNode.spec.ts`
  Expected: PASS
  Run: `npx playwright test`
  Expected: PASS（拖拽/折叠相关用例）
- [ ] **Step 5: 提交**
  ```bash
  git add src/components/CategoryNode.vue src/components/Sidebar.vue src/styles/main.css src/components/Sidebar.spec.ts
  git commit -m "feat(sidebar): hierarchical category tree styling"
  ```

---

### Task 10: 重复链接管理

**Files:**
- Modify: `src/store/app.ts`
- Modify: `src/types.ts`
- Modify: `src-tauri/src/data.rs`
- Modify: `src-tauri/src/bookmarks_html.rs`
- Create: `src/components/ManageDuplicates.vue`（或在 `ManageView` 增加“重复”页签）
- Modify: `src/components/ManageView.vue`
- Modify: 对应 spec / Rust 测试

**Interfaces:**
- Consumes: `store.data.sites`、`store.deleteSites`、`store.updateSite`（若有）。
- Produces: 统一 `normalizeUrl`；重复分组视图；保留/合并/标记操作；导入摘要包含重复数。

- [ ] **Step 1: 写失败测试（归一化与重复分组）**
  - 前端：`normalizeUrl('HTTPS://Example.com///')` 与 `normalizeUrl('https://example.com')` 相等。
  - 前端：给定重复数据，`duplicateGroups()` 返回预期分组。
  - Rust：`merge_into` 对大小写/尾斜杠不同的等价 URL 视为重复（更新而非新增）。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/store/app.spec.ts`
  Expected: FAIL
  Run: `cd src-tauri && cargo test merge`
  Expected: FAIL
- [ ] **Step 3: 实现归一化与重复分组**
  - `src/store/app.ts` 增加 `normalizeUrl`；`isDuplicateUrl` 改用统一归一化。
  - 增加 `duplicateGroups` computed（按归一化 URL 分组，过滤长度 > 1）。
  - Rust `merge_into` 改用与前端一致的归一化（至少大小写 + 尾斜杠）。
- [ ] **Step 4: 实现重复管理视图**
  - `ManageView` 增加“重复链接”页签。
  - 列出分组；每组支持：保留一条（其余进回收站）、合并（标签/备注合并）、标记。
  - 导入摘要：在 `importHtml` / `importMd` / `importJson` 后返回新增/合并数量（可先前端统计）。
- [ ] **Step 5: 运行测试与构建**
  Run: `npm test`
  Expected: PASS
  Run: `cd src-tauri && cargo test`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 6: 提交**
  ```bash
  git add src/store/app.ts src/types.ts src-tauri/src/data.rs src-tauri/src/bookmarks_html.rs src/components/ManageDuplicates.vue src/components/ManageView.vue
  git commit -m "feat: duplicate link management"
  ```

---

### Task 11: favicon 站点图标

**Files:**
- Modify: `src/types.ts`（`Site` 增加可选 `faviconPath` / `faviconUrl` / `description`）
- Modify: `src-tauri/src/data.rs`（`Site` 结构增加字段，serde 默认值兼容旧数据）
- Modify: `src-tauri/src/commands.rs`（新增抓取命令）
- Modify: `src-tauri/src/favicon.rs`（新建，抓取 + 缓存）
- Modify: `src/api.ts`
- Modify: `src/components/AddEditModal.vue`
- Modify: `src/components/SiteTable.vue`
- Modify: `src/store/app.ts`
- Modify: 对应 spec

**Interfaces:**
- Consumes: `reqwest`、数据目录、`Site`。
- Produces: `api.fetchFavicon(url) -> { faviconPath } `；`Site.faviconPath?`；列表显示图标；设置开关“自动抓取图标”。

- [ ] **Step 1: 写失败测试（抓取与显示）**
  - Rust：给定 HTML 含 `<link rel="icon" href="...">`，解析出 favicon URL；下载并写入缓存；失败返回 `None` 或错误但不阻塞。
  - 前端：`AddEditModal` 触发抓取后更新 `faviconPath`；`SiteTable` 显示 `<img>`/图标占位。
- [ ] **Step 2: 运行测试确认失败**
  Run: `cd src-tauri && cargo test favicon`
  Expected: FAIL
  Run: `npm test -- src/components/AddEditModal.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 实现 Rust 抓取与缓存**
  - 新增 `src-tauri/src/favicon.rs`：抓取页面、解析 favicon、下载到数据目录（如 `data/favicons/`），返回相对/绝对路径。
  - `Site` 增加 `favicon_path: Option<String>`（serde `default`），旧数据兼容。
  - 新增 `#[tauri::command] fetch_favicon(app, url) -> Result<Option<String>, String>`，并在 `lib.rs` / `capabilities` 注册。
- [ ] **Step 4: 前端接入**
  - `api.ts` 增加 `fetchFavicon`。
  - `AddEditModal` 在“获取名称”旁或自动抓取 favicon；失败静默。
  - `SiteTable` 显示 favicon（无则占位）。
  - 设置页增加“自动抓取图标”开关（`Settings` 增加字段，默认 true/false 待定）。
- [ ] **Step 5: 运行测试与构建**
  Run: `cd src-tauri && cargo test`
  Expected: PASS
  Run: `npm test`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 6: 提交**
  ```bash
  git add src/types.ts src-tauri/src/data.rs src-tauri/src/commands.rs src-tauri/src/favicon.rs src-tauri/src/lib.rs src/api.ts src/components/AddEditModal.vue src/components/SiteTable.vue src/store/app.ts src/components/SettingsModal.vue
  git commit -m "feat: favicon fetching and display"
  ```

---

### Task 12: 检查策略（范围 + 重试）

**Files:**
- Modify: `src/types.ts`（`Settings` 增加检查相关字段）
- Modify: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/check.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/api.ts`
- Modify: `src/store/app.ts`
- Modify: `src/components/SettingsModal.vue`
- Modify: `src/components/SiteTable.vue` / `TopBar.vue`（范围选择入口）
- Modify: 对应 spec / Rust 测试

**Interfaces:**
- Consumes: `check_site_cmd` / `verify_site_webview_cmd` / `check_connectivity_cmd`。
- Produces: `checkByScope(scope)`；失败重试；设置字段 `autoCheck` / `checkInterval` / `checkScope` / `retryCount` / `concurrency`。

- [ ] **Step 1: 写失败测试（范围与重试）**
  - Rust：`check_sites` 对失败项按 `retry_count` 重试；范围过滤（分类/标签）正确。
  - 前端：`store.checkByScope` 只检测目标站点；设置保存后生效。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/store/app.spec.ts`
  Expected: FAIL
  Run: `cd src-tauri && cargo test check`
  Expected: FAIL
- [ ] **Step 3: 实现设置字段与 Rust 重试**
  - `Settings` 增加 `autoCheck`、`checkInterval`、`checkScope`、`retryCount`、`concurrency`（默认值在 `store` 与 Rust 两侧一致）。
  - `check.rs` 增加重试与并发参数；命令接受参数。
- [ ] **Step 4: 前端接入**
  - `store.checkByScope(scope)`；`SiteTable`/`TopBar` 提供范围选择（全部/当前分类/选中）。
  - 设置页增加“检查”分区：自动检查开关、频率、范围、重试次数、并发。
  - 检查历史：显示最近检查时间（`Site.lastCheck` 已有）。
- [ ] **Step 5: 运行测试与构建**
  Run: `npm test`
  Expected: PASS
  Run: `cd src-tauri && cargo test`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 6: 提交**
  ```bash
  git add src/types.ts src-tauri/src/settings.rs src-tauri/src/check.rs src-tauri/src/commands.rs src/api.ts src/store/app.ts src/components/SettingsModal.vue src/components/SiteTable.vue src/components/TopBar.vue
  git commit -m "feat: check scope and retry policy"
  ```

---

### Task 13: 批量整理（失效清理 + 批量改分类/标签）

**Files:**
- Modify: `src/store/app.ts`
- Modify: `src/components/SiteTable.vue`
- Modify: `src/components/RecycleView.vue`
- Modify: `src/components/ManageView.vue`（可选入口）
- Modify: 对应 spec

**Interfaces:**
- Consumes: `store.deleteSites`、`store.moveSites`、`store.addTagsToSites`。
- Produces: 失效清理向导；批量改分类/标签入口统一。

- [ ] **Step 1: 写失败测试（批量操作）**
  断言：`store.moveSites` / `addTagsToSites` / `deleteSites` 对多 id 生效；失效视图可筛选 `dead`。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/store/app.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 实现失效清理向导**
  - 入口：失效视图或管理页。
  - 列出 `dead` 站点；支持批量移入回收站/删除；操作前确认；保留回收站兜底。
- [ ] **Step 4: 统一批量改分类/标签**
  - 复用现有 `PickCategoryModal` / `AddTagsModal`；确保批量按钮状态与选择联动。
- [ ] **Step 5: 运行测试与构建**
  Run: `npm test`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 6: 提交**
  ```bash
  git add src/store/app.ts src/components/SiteTable.vue src/components/RecycleView.vue src/components/ManageView.vue
  git commit -m "feat: bulk cleanup and organize tools"
  ```

---

### Task 14: 搜索筛选增强

**Files:**
- Modify: `src/store/app.ts`
- Modify: `src/components/TopBar.vue`
- Modify: `src/components/SiteTable.vue`
- Modify: 对应 spec

**Interfaces:**
- Consumes: `store.q`、`store.view`、`store.sortKey`。
- Produces: 组合筛选状态；保存常用筛选（可放 `Settings` 或独立存储）；排序增强。

- [ ] **Step 1: 写失败测试（组合筛选）**
  断言：关键词 + 分类 + 标签 + 状态组合过滤结果正确；保存筛选可恢复。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/store/app.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 实现组合筛选与保存**
  - `store` 增加筛选状态（分类/标签/状态/时间）与 `savedFilters`。
  - `TopBar` 增加筛选控件（Naive `n-select`/`n-checkbox-group`）。
  - 保存/应用筛选。
- [ ] **Step 4: 运行测试与构建**
  Run: `npm test`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 5: 提交**
  ```bash
  git add src/store/app.ts src/components/TopBar.vue src/components/SiteTable.vue
  git commit -m "feat: combined search filters"
  ```

---

### Task 15: 备份体验

**Files:**
- Modify: `src-tauri/src/data.rs`（备份列表/恢复）
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/api.ts`
- Modify: `src/components/SettingsModal.vue`（备份区）或新建 `BackupSettings.vue`
- Modify: 对应 spec / Rust 测试

**Interfaces:**
- Consumes: 数据目录、`.bak` 文件。
- Produces: `api.listBackups()` / `api.restoreBackup(path)` / `api.createBackup()`；设置页备份列表与恢复。

- [ ] **Step 1: 写失败测试（备份列表与恢复）**
  - Rust：`list_backups` 返回备份文件信息；`restore_backup` 恢复并创建当前数据备份。
  - 前端：设置页显示备份列表，可恢复最近备份。
- [ ] **Step 2: 运行测试确认失败**
  Run: `cd src-tauri && cargo test backup`
  Expected: FAIL
- [ ] **Step 3: 实现 Rust 备份命令**
  - `list_backups(app)`：扫描备份目录，返回路径/时间/大小。
  - `restore_backup(app, path)`：恢复前备份当前数据。
  - `create_backup(app)`：手动备份。
- [ ] **Step 4: 前端备份区**
  - 设置页“数据存储”或新建“备份”区：备份列表、恢复最近、手动备份、保留策略。
- [ ] **Step 5: 运行测试与构建**
  Run: `cd src-tauri && cargo test`
  Expected: PASS
  Run: `npm test`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 6: 提交**
  ```bash
  git add src-tauri/src/data.rs src-tauri/src/commands.rs src/api.ts src/components/SettingsModal.vue
  git commit -m "feat: backup list and restore"
  ```

---

### Task 16: 命令面板 / 快捷键（后置）

**Files:**
- Create: `src/components/CommandPalette.vue`
- Modify: `src/App.vue`
- Modify: `src/store/app.ts`
- Modify: `package.json`（若需要快捷键库；优先不新增依赖）

**Interfaces:**
- Consumes: `store`、视图切换、`PickCategoryModal` 等。
- Produces: `Ctrl+K` 打开命令面板；命令：添加站点、导入导出、检测全部、切换视图。

- [ ] **Step 1: 写失败测试（命令面板打开与命令执行）**
  断言：`Ctrl+K` 打开；输入过滤命令；执行“添加站点”打开添加弹窗。
- [ ] **Step 2: 运行测试确认失败**
  Run: `npm test -- src/components/CommandPalette.spec.ts`
  Expected: FAIL
- [ ] **Step 3: 实现命令面板**
  - 用 Naive `n-modal`/`n-input` + 列表；不引入新依赖。
  - 注册全局快捷键（`App.vue`）。
- [ ] **Step 4: 运行测试与构建**
  Run: `npm test`
  Expected: PASS
  Run: `npm run build`
  Expected: PASS
- [ ] **Step 5: 提交**
  ```bash
  git add src/components/CommandPalette.vue src/App.vue src/store/app.ts
  git commit -m "feat: command palette and shortcuts"
  ```

---

## 执行顺序与依赖

1. Task 1–6：全项目风格统一（可并行度低，建议顺序执行，Task 6 依赖前 5 个）。
2. Task 7–9：设置页与分类树（依赖 Task 1–6 的统一基础）。
3. Task 10–16：近期功能（依赖统一后的组件；Task 10/11/12 建议优先）。

## 验收

- `npm test` 全绿；`npm run build` 通过；`npx playwright test` 通过。
- 全项目模板不再以 `.btn` / `.cb` / `.segctrl` / `.grid2x2` / `.modal-content` 作为主要交互控件（TitleBar/外壳/拖拽除外）。
- `main.css` 只保留外壳/标题栏/滚动条/减少动效/主题变量/少量工具类；无 `src/theme/` 之外的十六进制颜色。
- 设置页四个分区控件全部 Naive UI；关于页三组结构清晰；版本动态；作者/许可为 `LICENSE` 内容。
- 分类树层级一眼可见；拖拽、右键、折叠持久化不回归。
- 近期功能按优先级落地，每项有测试。
