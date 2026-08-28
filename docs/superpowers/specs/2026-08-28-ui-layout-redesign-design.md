# 界面布局与组件微调设计（归集 v0.1.2）

## 目标与范围

重新敲定「归集」桌面应用的界面布局与组件呈现。整体应用框架（标题栏 + 顶栏 + 侧栏 + 内容 + 状态栏；无边框、透明窗口）**保持不变**。本轮聚焦**布局与组件微调**，逐屏与用户通过可视化伴侣确认。

约束：
- 仅前端（`src/`），不改 `src-tauri/`、不改 IPC 命令（`src/api.ts` 契约不变）。
- 保留现有交互逻辑：折叠/展开、搜索防抖、多选/框选、拖拽、键盘流、Esc 行为。
- 本轮**不改**配色/主题 CSS 变量（见末尾「下一阶段」）；只调整布局、间距与个别控件形态。

## 已确认决策（逐界面）

### 1. 侧栏 Sidebar
来源：`Sidebar.vue:55-60`（分类组）、`70-86`（视图/标签/系统组）；`main.css` `.sidebar .mini` / `.group-label` / `.caret`。

- **分类组**：把"展开全部/收起全部"两个 `.mini` 文字按钮，改为**图标按钮** `⤢`（展开整棵分类树）/ `⤡`（收起整树）。默认淡灰（`--text-2`），hover 时变 `--primary`（可加边框）；建议默认仅在组标题 hover 时显现（`opacity:0 → 1` 于 `.group-label:hover`）。保留单组折叠（`caret` ▼/▶ + 整行点击 `toggleGroup` 已存在，不动）。`store.expandAllCategories()` / `store.collapseAllCategories()` 保留。
- **标签组**：增加折叠能力——给"标签" `group-label` 加 `@click="toggleGroup('标签')"` 与 `caret`，并用 `v-if="!isCollapsed('标签')"` 包裹 `tag-scroll`。复用现有 `toggleGroup` / `sidebarCollapsed` 机制（已支持任意 group key）。
- **视图组、系统组**：保持不可折叠（现状）。
- CSS：调整 `.sidebar .mini`（或新增 `.sidebar .group-btn`）为图标样式 + hover；删除/迁移原描边小按钮样式。

### 2. 顶栏 TopBar
结论：**现状即可，不改动**。`TopBar.vue` 保持 `logo | 搜索 | 标签筛选▾ | 检测全部 | ＋添加 | ▦管理 | 导入/导出 | ⚙设置`。

### 3. 站点列表 SiteTable
来源：`SiteTable.vue:91-96`（表头）、`:117-124`（单元格）；`main.css` `.site-table`。方向1（文案/密度微调，结构不动）：
- "生命" 列表头 → **"状态"**（第 95 行 `th` 文案）。
- 备注列：空时显示 **"—"**，完整文字用 `title` 属性在 hover 时显示（`td` 改为 `{{ s.note || '—' }}` + `:title="s.note"`）。
- 行距略紧：`.site-table td` 纵向 padding 由 `7px 10px` 略减为 `6px 10px`。
- 列结构、吸顶批量栏、hover 操作（⋯ 菜单 / ⧉ 打开）均不变。

### 4. 回收站页 RecycleView
结论：**现状即可，不改动**。`RecycleView.vue` 保持 5 列表格 + 行内常驻"恢复 / 彻底删除" + 顶部批量栏（"回收站 · N 项" + 清空回收站）。

### 5. 管理页 ManageView / ManageCategories / ManageTags
结论：方向1 统一（两 tab 均左列表 / 右表单）+ 修正版一致性。来源 `manage-v2` 确认屏。
- **统一布局**：分类 tab 当前为"左表单 / 右列表"，改为与标签 tab 一致——**左列表 / 右操作表单**。即 `ManageCategories` 两卡对调：左 = 分类列表，右 = 批量添加分类表单。`ManageTags` 已为左列表 / 右表单，保留。
- **控件满宽**：`.manage-card` 内 `input / select / textarea` 增加 `width:100%`（当前缺失，是下拉/输入框长度混乱的根因）。
- **按钮统一尺寸**：操作按钮（添加、批量删除所选、删除所选、合并所选、批量添加/去除）统一样式与尺寸；危险按钮统一用 `.danger` 样式。
- **两卡等宽**：`.manage-cols` 由 `280px 1fr` 改为 `1fr 1fr`。
- **间距均匀**：`.manage-card` 内边距由 `14px` 加大为 `16-18px`，label 与控件间距统一、卡片间 `gap` 同步加大。
- **不含**"分类行 hover 重命名/删除"（方向2 未采纳）。

### 6. 弹窗类（AddEdit / Settings / AddTags / ImportExport / PickCategory）
结论：方向1（加宽 + 松间距）+ 标签输入新布局。
- **弹窗加宽**：`.modal` 默认宽 `min(440px,92%)` → `min(520px,92%)`；`SettingsModal` 内联 `min(480px,92%)` 对齐为 520（或删内联、沿用默认）。
- **字段松间距**：`.modal label` margin 由 `10px 0 4px` → `14px 0 5px`；输入/选择内边距略增。
- **标签输入新布局**（`TagInput.vue`，影响所有使用处：AddEdit / AddTags / PickCategory 等）：
  - 已加标签 chips 显示在**输入框上方**（独立区域，可 × 移除）。
  - 输入框专用于**新建**标签（回车 / 逗号 / 空格提交，沿用现有 `commit()` 逻辑）。
  - 输入框**下方**下拉显示已有标签（`Teleport` 到 `body` + `position:fixed`，沿用现有修复，避免被 modal `overflow:auto` 裁切/遮挡）。
  - 结构调整：移除原 `.tag-input` 内联 flex 边框盒；改为 `.tag-input-wrap` > `.tag-chips`（上方）+ `.tag-field`（下方：`input` + 下拉）。下拉 `.tag-opts` 定位逻辑（`top` = 输入底部 + 2px）不变。

## 实施影响（文件清单）

| 文件 | 改动 |
| --- | --- |
| `src/components/Sidebar.vue` | 分类组图标按钮；标签组加折叠（caret + `toggleGroup` + `v-if`） |
| `src/styles/main.css` | `.sidebar .group-btn` 图标/hover；`.manage-card input/select/textarea{width:100%}`；`.manage-cols` `1fr 1fr`；`.manage-card` padding；`.modal` 宽 520；`.modal label` margin；`.site-table td` padding；`.tag-input*` 重构 |
| `src/components/SiteTable.vue` | "状态"表头；备注 "—" / `title` |
| `src/components/ManageCategories.vue` | 两卡对调为左列表 / 右表单 |
| `src/components/TagInput.vue` | 新布局（chips 上 / input 新建 / 下拉下） |
| `src/components/SettingsModal.vue` | 宽度对齐 520（可选） |

测试：`src/components/TagInput.spec.ts` 随模板结构调整保持 4 项通过；`npm test` 维持 62 项绿色；`npm run build` 通过。

## 验收标准
- 侧栏：分类组为图标折叠按钮（hover 显眼）；标签组可折叠；视图/系统组不变。
- 站点列表："状态"列、备注空显"—"、行距略紧；其余不变。
- 管理页：两 tab 均左列表/右表单；下拉/输入满宽等长；按钮尺寸统一；两卡等宽、间距均匀。
- 弹窗：默认宽 520；字段松间距；标签输入为「上 chips / 中新建输入 / 下已有标签下拉」。
- 顶栏、回收站：外观无变化。
- `npm test` 全绿、`npm run build` 通过。

## 下一阶段：配色与视觉样式
用户原计划含「样式（颜色）」。本轮仅完成布局与密度微调，**未改调色板**。现有 CSS 变量（`main.css` `:root` 与 `html[data-theme="dark"]`：主色 `#3B5BDB`、语义色、圆角 `--radius`、阴影、暗色对比度）作为基线保留。建议下一轮用可视化伴侣逐一定：主色倾向、语义色微调、圆角/阴影语言、暗色模式对比度。本轮实现先不触碰颜色。
