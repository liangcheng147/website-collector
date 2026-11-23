# 设置页、分类树、全项目风格统一与近期功能设计

日期：2026-11-23
状态：待批准
范围：前端表现层全量统一到 Naive UI + 设置页/分类树重排 + 近期本地功能；不含云端化

## 1. 为什么做

### 现状

- Naive UI 迁移第一册只完成了外壳、顶栏、状态栏和部分弹窗，项目里仍大量混用旧写法：
  - `SettingsModal.vue` 内容层仍靠 `main.css` 的 `.modal-content` 全局规则，色板是自定义 `button.palette-swatch`，数据存储路径是原生 `<input readonly>`。
  - `AddEditModal`、`AddCategoryModal`、`AddTagsModal`、`PickCategoryModal`、`ImportExportModal`、`ManageCategories`、`ManageTags`、`ManageView`、`RecycleView`、`SiteTable` 仍大量使用 `.btn`、`.modal-content`、`.cb`、`.chip`、`.segctrl`、`.grid2x2`、`.actions`、`.manage-*`、`.cat-*` 等旧类。
  - `main.css` 仍有 300 行，包含大量已迁移组件的旧规则。
  - 分类树层级表现弱（只有缩进和箭头）。
  - 近期本地能力有缺口：重复链接管理、favicon、检查策略、批量整理、搜索筛选、备份体验。

### 目标

1. **全项目风格统一**：Naive UI 作为唯一组件来源；自绘仅限标题栏、外壳、站点拖拽；颜色唯一来源仍是 `src/theme/`；清理 `main.css` 中已迁移组件的旧规则。
2. **设置页规整**：四个分区控件全部 Naive UI，去掉对 `.modal-content` 表单式规则的依赖；关于页信息层级清楚。
3. **分类树层级清晰**：采用引导线 + 缩进层级，保留拖拽/右键/折叠持久化。
4. **近期本地功能落地**：按优先级实现重复链接管理、favicon、检查策略、批量整理、搜索筛选、备份体验、命令面板。

### 非目标

- 不做云端化（账号、同步、Web 服务）；只在数据结构上不堵死未来扩展。
- 不改 Rust 侧数据格式的核心结构（除站点元数据/检查策略所需的增量字段）。
- 不换图标库、不引入 Tailwind、不用 `n-global-style`。
- 不做多语言、不做移动端响应式重排。

### 反向目标（宁可失败也不要做成）

- 为了用库而放弃无边框 + 透明窗口 + 自绘标题栏。
- 让两套颜色系统并存（颜色只能来自 `src/theme/`）。
- 让测试继续断言实现细节（CSS 文本、组件内部类名）。
- 把设置页做成“卡片套卡片”的臃肿布局。
- 全项目统一变成“只改样式不测行为”的表面工程。

## 2. 约束

- 窗口 `decorations: false` + `transparent: true`，标题栏自绘。
- 颜色唯一来源：`src/theme/palettes.ts`（主色）+ `src/theme/tokens.ts`（语义色/中性色）。
- 组件来源：Naive UI（`2.45.3`）；自绘仅限标题栏、外壳、站点拖拽。
- 分类树当前是手写递归 `CategoryNode`，承担 HTML5 DnD、右键菜单、折叠状态持久化；层级样式改动不得破坏这些交互。
- 现有测试约束：组件单测与 e2e 覆盖关键行为和 testid；改版后仍需通过。
- CI 只跑 `npm test` + Playwright；`npm run build`（`vue-tsc --noEmit` + `vite build`）需通过。
- `src/api.ts` 是前端与 Rust 的唯一契约：每个 `invoke('xxx', ...)` 必须对应 `src-tauri/src/commands.rs` 里一个 `#[tauri::command]`；新增/改名 IPC 命令时两侧要同步，并在 `src-tauri/capabilities/` 放行权限。

## 3. 方案对比

### 3.1 风格统一策略

| 方案 | 关键权衡 | 结论 |
|---|---|---|
| A. 全项目一次性统一到 Naive UI | 彻底、干净；改动面大，需要按组件分批提交与测试 | **采用** |
| B. 只统一设置页，其他组件留旧 | 改动小；但混用问题还在，违背“整个项目风格统一” | 否 |

### 3.2 设置页排版

| 方案 | 关键权衡 | 结论 |
|---|---|---|
| A. Naive UI 设置项分组 | 控件统一、层级靠分组标题+设置行+说明；不依赖旧 `.modal-content` | **采用** |
| B. 全部换成 `n-form`/`n-list` 强表单 | 太呆板，设置页不是长表单 | 否 |

### 3.3 分类树层级

| 方案 | 关键权衡 | 结论 |
|---|---|---|
| A. 引导线 + 缩进层级 | 层级最清楚，纯 CSS + 少量模板，不动数据/交互 | **采用** |
| B. 分组底色 + 缩进 | 干净但层级感弱 | 否 |
| C. 换 `n-tree` | 层级标准，但要重适配拖拽/菜单/折叠，风险最高 | 暂缓，后续评估 |

## 4. 已定的做法

### 4.1 全项目风格统一

**迁移清单（按组件）**：

| 组件 | 现状 | 目标 |
|---|---|---|
| `AddEditModal.vue` | `.btn`、`.modal-content`、原生 `input/select/textarea` | `n-input`/`n-select`/`n-button`/`n-modal`；表单用 Naive 布局 |
| `AddCategoryModal.vue` | `.btn`、`.modal-content` | 同上 |
| `AddTagsModal.vue` | `.btn`、`.modal-content`、`TagInput` | 同上；`TagInput` 内部 chip 用 Naive 风格 |
| `PickCategoryModal.vue` | `.btn`、`.modal-content` | `n-modal` + Naive 列表/树选择 |
| `ImportExportModal.vue` | `.btn`、`.grid2x2`、`.segctrl`、`.modal-content` | `n-button` 网格/列表；`n-radio-group` 或 `n-segmented` 做导入方式；说明用 `n-alert`/`n-text` |
| `ManageView.vue` | `.btn`、`.manage-tabs` | `n-button`/`n-tabs` 或统一按钮组 |
| `ManageCategories.vue` | `.btn`、`.cb`、`.cat-head/cat-row`、`.manage-*` | `n-data-table` 或 Naive 列表；`n-checkbox`；`n-button` |
| `ManageTags.vue` | 同上 + `.segctrl` | 同上 |
| `RecycleView.vue` | `.btn`、`.cb` | `n-data-table` 或 Naive 列表；`n-checkbox`；`n-button` |
| `SiteTable.vue` | `.btn`、`.cb` | `n-data-table`（若保留自绘表格则至少统一按钮/复选框为 Naive） |
| `TagInput.vue` | `.chip`、`.tag-opts` | Naive 风格 chip/下拉；或 `n-select` + `n-tag` |
| `ContextMenu.vue` | 自绘 `.ctx` | 评估换 `n-dropdown`（`trigger="manual"` + `x`/`y`） |
| `SettingsModal.vue` | 见 4.2 | 见 4.2 |
| `CategoryNode.vue` | `.row`、`.children`、`.collapse-arrow` | 保留结构，样式升级到 4.3；右键菜单内容见 4.1 |
| `Sidebar.vue` | `.row`、`.group-*`、`.cnt` | 保留外壳结构，样式统一；计数/分组标题用 Naive 风格 |
| `TitleBar.vue` | 自绘 | 保留 |
| `TopBar.vue`、`StatusBar.vue` | 已迁移 | 保持 |

**规则**：
- 颜色、圆角、间距、字号优先用 Naive 主题变量与 `src/theme/` 变量；不在组件里写死十六进制。
- 模板中不再出现静态 `style="..."`（动态数值如进度宽度、拖拽坐标除外）。
- `main.css` 只保留：标题栏、外壳布局、滚动条、减少动效、主题变量、少量工具类；删除已迁移组件的旧规则。
- 测试与 e2e 选择器改为 role / 文本 / `data-testid`，不依赖 `.btn`、`.cb` 等样式类。

### 4.2 设置页

- **控件统一**：文件路径用 `n-input`（只读）；链接用 `n-button text` 或统一链接样式；说明文字用 `n-text depth="3"` 或统一 `.muted`；分组标题统一样式；不再混用裸 `label/p` 做主要排版。
- **色板网格**：也换成 Naive UI 实现（如 `n-radio-group` + 自定义渲染，或 `n-select` 自定义渲染），保持色块可辨识度与主题联动。
- **排版节奏**：页签内容统一为“分组标题 + 设置行/信息块 + 说明文字”；组间距大、组内小；按钮尺寸统一。
- **页签内容**：
  - 主题：模式选择 + 色板选择 + 说明，分组清晰。
  - 显示：缩放滑块放进设置行，右侧显示当前值，说明弱化。
  - 数据存储：路径 `n-input` + “打开数据目录”同一行；存储说明用说明块；回退提示用 `n-alert type="warning"`。
  - 关于：见下。
- **脱离旧规则**：设置页不再依赖 `.modal-content` 表单式全局规则；其他弹窗在 4.1 中同步迁移，最终删除该全局块。

### 4.3 关于页

```text
关于
┌─ 应用信息 ─────────────────────────────┐
│ SiteCollector                v0.3.3     │  （版本动态）
│ 本地优先的网站收藏与可用性检测桌面应用   │  （简介，弱化）
│ GitHub 仓库 · 问题反馈 · 发布页          │
│ MIT License · Copyright (c) 2026 fan-root│
└────────────────────────────────────────┘

┌─ 更新 ────────────────────────────────┐
│ [检查更新]                              │
│ 状态：已是最新版本 / 发现新版本 / 进度   │
│ 下载并安装 / 立即重启（按状态出现）       │
│ 启动时自动检查更新              [Switch] │
└────────────────────────────────────────┘

┌─ 诊断信息 ────────────────────────────┐
│ User Agent                             │
│ Mozilla/5.0 ...                        │
│ [复制诊断信息]（可选）                  │
└────────────────────────────────────────┘
```

- **作者/许可**：以 `LICENSE` 为准 —— `MIT License`，`Copyright (c) 2026 fan-root`。
- **版本号**：保持动态（`getVersion()`）。
- **检查更新**：更新分组内显眼放置。
- **补充信息**：简介、问题反馈、发布页链接；诊断区保留 UA，可选加 Tauri 版本和“复制诊断信息”。
- **暂不加**：最近检查时间。

### 4.4 分类树层级（方向 A）

- 每个节点左侧加竖向引导线（`::before` 或嵌套容器 `border-left`），末级用拐角收尾。
- 缩进从 `14px` 提到 `18–20px`。
- 子级字号略小、计数颜色更浅。
- 父级有子节点时可加很浅的底色或左侧色条。
- 保留现有选中态主色左侧色条。
- 保留 HTML5 DnD、右键菜单、折叠状态持久化。
- 清理失效的 `.row.sub` 规则。
- 可选：给每个分类显示站点数。

### 4.5 近期本地功能

| 优先级 | 功能 | 要解决什么 | 落地方式 |
|---|---|---|---|
| 1 | 重复链接管理 | 只在手动添加时拦截；导入合并用精确 URL 匹配；无重复视图 | 统一归一化规则；管理页“重复链接”视图；保留/合并/标记；导入摘要 |
| 2 | 站点元数据（favicon） | 列表只有名称/URL | 抓取 favicon 并缓存；列表显示；可选抓描述；设置开关 |
| 3 | 检查策略：范围 + 重试 | 只能手动批量检测 | 范围选择（全部/分类/标签）；失败重试；并发限速；检查历史 |
| 4 | 批量整理 | 大库逐条改效率低 | 失效清理向导；批量改分类/标签；规则整理后置 |
| 5 | 搜索筛选增强 | 收藏量大后单一搜索不够 | 组合筛选；保存常用筛选；排序增强 |
| 6 | 备份体验 | 只有 `.bak`，无备份列表/恢复 UI | 备份列表；一键恢复最近；手动备份；保留策略 |
| 7 | 效率 | 全靠鼠标 | 全局搜索/命令面板/快捷键（后置） |

**推荐顺序**：重复链接管理 → favicon → 检查策略（范围+重试）→ 批量整理 → 其余。

### 4.6 云端化方向（不在本次范围）

分阶段：**云备份 → 多设备同步 → 账号 + Web 服务**。前置设计：同步粒度、冲突合并、离线编辑。当前不做重，但导出/导入格式留扩展空间。

## 5. 留给实现者的判断

- 各组件迁移时选择最贴近的 Naive 组件（如 `n-data-table` vs Naive 列表）。
- 设置页分组的具体间距/字号取值。
- 分类树引导线的具体绘制方式与缩进数值。
- 是否本次一并做“每个分类显示站点数”。
- 重复链接归一化规则细节（协议、`www.`、尾斜杠、大小写）。
- favicon 抓取的缓存位置与失败回退策略。
- 检查策略的定时实现位置（Rust 定时任务 vs 前端定时 IPC）。
- 各功能内部的提交切分粒度。

## 6. 验收

- 全项目不再出现 `.btn`、`.cb`、`.segctrl`、`.grid2x2` 等旧类作为主要交互控件（TitleBar/外壳/拖拽除外）。
- `main.css` 只保留外壳/标题栏/滚动条/减少动效/主题变量/少量工具类；设置页不依赖 `.modal-content`。
- 设置页四个分区控件全部 Naive UI；关于页三组结构清晰；版本动态；作者/许可为 `LICENSE` 内容。
- 分类树层级一眼可见；拖拽、右键、折叠持久化不回归。
- 近期功能按优先级落地，每项有测试。
- `npm test` 通过；`npm run build` 通过；Playwright e2e 通过。
- 颜色仍只来自 `src/theme/`。

## 7. 相关文件

- `src/components/*.vue`
- `src/styles/main.css`
- `src/theme/palettes.ts`、`src/theme/tokens.ts`、`src/theme/index.ts`
- `src/store/app.ts`、`src/api.ts`
- `src-tauri/src/commands.rs`、`src-tauri/src/data.rs`、`src-tauri/src/bookmarks_html.rs`、`src-tauri/src/check.rs`
- `docs/superpowers/specs/2026-11-23-naive-ui-migration-design.md`
