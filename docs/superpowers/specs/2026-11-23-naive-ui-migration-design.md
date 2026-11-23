# 界面组件库迁移设计（Naive UI）

日期：2026-11-23
状态：待批准
范围：前端表现层（`src/`），不含 Rust 侧

## 1. 为什么做

### 现状

样式全部手写，集中在 `src/styles/main.css`（468 行），所有组件共用一套全局类名。2026-10-06 做过一次「组件风格统一」，但执行方式是在文件末尾**追加**新规则，而不是替换旧规则，结果是两套规范叠加：

- `--shadow-md` 在 L9 和 L19 各定义一次，后者静默覆盖前者，带青绿调的投影失效
- `--radius` / `--radius-sm|md|lg` 两套圆角命名并存
- `.btn` 在模板里出现 **57 次**，但 CSS 中从未定义；样式全靠 `button { ... }` 元素选择器兜底，`TopBar.vue` 里 `<select class="btn">` 实际无效
- `.empty` 与 `.empty-state` 两套几乎逐行相同的空状态
- 内联 `style="..."` 共 31 处，其中 14 处在 `SettingsModal.vue`
- `ManageView` 依赖 `App.vue` scoped 样式里的 `.body` 网格定义（`grid-column: 1 / -1` 跨文件耦合）
- 没有任何 lint

### 目标

以 Naive UI 作为唯一组件来源，建立「**颜色定义一次 → 组件与外壳同时生效**」的结构，并把样式按组件就近组织。

### 可验证的成功标准

1. 11 套色板 × 亮/暗 全部正常，切换不需要改 CSS 文件
2. `main.css` 从 468 行降到 **≤ 120 行**，且只剩标题栏、外壳布局、滚动条、减少动效
3. 模板中不再出现静态 `style="..."`（动态数值如进度宽度除外）
4. `npm test` 中不再有「读 CSS 文本做断言」的用例
5. e2e 30 个用例通过，且定位不依赖 `.btn` 这类样式类名
6. `npm run build`（`vue-tsc --noEmit` + `vite build`）通过

## 2. 边界

### 非目标

- 不改 Rust 侧、数据格式、IPC 契约
- 不改信息架构与交互流程（设置页的视觉呈现会变，但分区内容不变）
- 不做多语言、不做响应式重排、不做移动端
- 不换图标库（继续 `lucide-vue-next`，Naive 接受任意图标组件）

### 反向目标（宁可失败也不要做成）

- 为了用库而放弃无边框 + 透明窗口 + 自绘标题栏
- 让两套颜色系统并存（CSS 变量写一份、库主题再写一份）
- 让测试继续断言实现细节（CSS 文本、组件内部类名）

## 3. 约束

- 窗口 `decorations: false` + `transparent: true`，圆角来自 `.app` 的 `border-radius`
- 标题栏必须自绘，拖拽区依赖 `data-tauri-drag-region`
- 11 套色板 + 亮/暗，运行时可切
- 界面缩放目前用 `transform: scale()` + 宽高反向补偿（`store.applyAppearance`）
- Tauri 2 / Vue 3.5 / Vite 6 / Pinia；CI 只跑 `npm test` + Playwright
- 现有 148 个 vitest 用例，其中 **16 个文件是 CSS 文本断言**（`tests/*.spec.ts`，读 `main.css` 断言包含 `--space-1: 4px` 之类字符串）；真正跑浏览器的是 `e2e/` 下 4 个文件、30 个用例
- 现有组件单测中 8 个文件依赖 DOM 结构（`find('.cb')` 等）

## 4. 方案对比

| 方案 | 关键权衡 | 结论 |
|---|---|---|
| **A. Naive UI** | 不注入全局 CSS（不与透明窗口冲突）；主题是 TS 对象（11 套色板可收敛为一张表）；暗色内置（可删约 20 行覆盖）；表格/树/弹窗齐全 | **采用** |
| B. Element Plus | 教程最多；但暗色是固定变量集，11 套 × 亮暗 = 22 组手写覆盖；设计语言偏中后台，桌面感弱；注入全局样式 | 否 |
| C. DaisyUI | 主题即 CSS 变量，与现有 `data-palette` 几乎无缝；但需要 Tailwind，全项目类名重写，等于引入第三套写法；无树/表格 | 否 |
| D. shadcn-vue | 源码复制、自由度最高；需 Tailwind + Reka UI + 大量手写，单人维护成本最高 | 否 |

采用 A 的核心理由：项目有两个特殊约束——透明无边框窗口、11 套可切换色板。Naive UI 是唯一对两者都不逆风的选项。

## 5. 已定的做法

### 5.1 颜色的唯一来源

新增 `src/theme/palettes.ts`：

```ts
export type PaletteId = 'teal' | 'ocean' | 'indigo' | 'violet' | 'rose'
  | 'amber' | 'emerald' | 'slate' | 'stone' | 'sky' | 'plum'

export interface PaletteColors {
  primary: string      // 主色
  container: string    // 主色浅底（当前 --primary-t），用于选中行/标签底色
  onPrimary: string    // 主色上的文字色
}

export interface Palette {
  id: PaletteId
  name: string         // 中文显示名
  light: PaletteColors
  dark: PaletteColors
}

export const PALETTES: Palette[]
```

新增 `src/theme/index.ts`：

- `buildThemeOverrides(palette, dark): GlobalThemeOverrides`
  - `common`: `primaryColor` / `primaryColorHover` / `primaryColorPressed` / `primaryColorSuppl`、`borderRadius`、`fontFamily`、`fontSize`
  - `Button`: 高度与圆角
  - `DataTable` / `Tree` / `Modal`: 少量覆盖
  - hover / pressed 由 `primary` 与白/黑按固定比例混合计算（不引入依赖），不逐套手写
- `applyShellVars(palette, dark)`：把变量写到 `documentElement.style`，供**自绘外壳**使用（标题栏、侧栏、状态栏）

另新增 `src/theme/tokens.ts`，存放**与调色板无关**的颜色与外壳变量：

- 语义色：成功 / 警告 / 危险及其底色与边框（当前 `--ok` / `--pending` / `--danger` 系列）
- 外壳中性色：`--bg` / `--panel` / `--text` / `--text-2` / `--border` / `--border-2` / `--hover`
- 每套亮 / 暗各一份，由 `applyShellVars` 统一写出

规则：**十六进制颜色只允许出现在 `src/theme/` 下**（`palettes.ts` 放主色，`tokens.ts` 放其余）。`main.css` 中不得再出现调色板颜色或语义色。

`data-theme` / `data-palette` 属性保留，供原生滚动条与 `color-scheme` 使用。

### 5.2 哪些保留自绘

| 保留自绘 | 理由 |
|---|---|
| `TitleBar.vue` | 窗口按钮与拖拽区是桌面专属，库无对应物 |
| `App.vue` 的网格骨架 | 三行两列是应用外壳，不是组件 |
| `Sidebar.vue` 容器与分区 | 分类/标签/系统三段的组织方式不属于树控件 |
| `StatusBar.vue` | 状态条是自定义信息栏 |
| 站点拖拽（HTML5 DnD） | 跨组件拖放，不属任何单个控件 |

外壳内部的按钮、输入框、开关等**一律换成 `n-*`**。

### 5.3 组件替换映射

| 现有实现 | 替换为 | 备注 |
|---|---|---|
| `button.btn`（57 处） | `n-button` | `primary` → `type="primary"`；`btn-ghost` → `quaternary`；`danger` → `type="error"` |
| `input` / `select` | `n-input` / `n-select` | `TopBar` 标签筛选改用 `n-select` |
| `.cb` 复选框 | `n-checkbox` 或 `n-data-table` 的 selection 列 | |
| `.toggle` 开关 | `n-switch` | 设置页「自动检查更新」 |
| `.modal` + `ModalMask` | `n-modal preset="card"` | 传 `to` 指定挂载点，见 5.4 |
| `ConfirmModal` / `PromptModal` | `useDialog()` | 需要 `n-dialog-provider` |
| `.site-table` | `n-data-table` | 见 5.4 风险一 |
| `CategoryNode` 递归 | `n-tree` | 见 5.4 风险二 |
| `.settings-nav` | `n-tabs placement="left"` | |
| `.empty` / `.empty-state` | `n-empty` | 删掉两套重复样式 |
| `data-tooltip` 属性 | `n-tooltip` | 删掉自实现的 tooltip CSS |
| `ContextMenu.vue` | `n-dropdown`（`trigger="manual"` + `x`/`y`） | 保留现有菜单项定义 |
| `progress` | `n-progress` | 更新下载进度 |
| 状态栏 flash 消息 | 保留（`store.flash`） | 不换成 `useMessage`，避免提示位置跳变 |

### 5.4 三个高风险点与判定规则

**风险一：表格框选。** `n-data-table` 没有框选（marquee）能力，而 `useSelection` 是现有核心交互。

做法：在表格外层容器叠加一个绝对定位的选框层；`row-props` 给每行 `<tr>` 加 `data-row-key`；框选结束时用几何命中拿到 id 列表，写回 `checked-row-keys`。
验收：拖拽框选 3 行 → 3 行选中、状态栏计数正确、`Esc` 清空。
退路：若一批内无法稳定，保留自绘 `<table>`，但视觉变量接 Naive，其余部分照常迁移。

**风险二：侧边栏树。** `n-tree` 自带拖拽（内部指针事件），而「站点拖到分类上」是 HTML5 DnD，两套机制可能互相拦截。

做法：分类之间用 `n-tree` 的 `draggable` + `on-drop`（`before`/`inside`/`after` 正好对应排序与改父级）；站点拖入用 `render-label` 在外层包一个原生 drop 区。
验收：分类可拖动排序、可改父级、可展开收起且折叠状态持久化；站点可拖到分类与标签。
退路：若冲突不可解，保留手写递归 `CategoryNode`，仅把颜色与间距接到主题变量。

**风险三：弹窗与界面缩放。** 现状：`ModalMask` 用 `Teleport to="body"`，而缩放加在 `.app` 上——**弹窗今天不随缩放变化**，这是现存不一致。

做法：把缩放改为 Tauri 原生 `getCurrentWebview().setZoom(scale)`，删除 `transform` + 宽高补偿。这样 body 层弹窗一起缩放。
代价：需要在 `src-tauri/capabilities/` 放行 `core:webview:allow-set-webview-zoom`。
验收：缩放到 150%，主界面与弹窗同比放大，无模糊、无错位。

### 5.5 测试策略

- **删除** `tests/*.spec.ts` 全部 16 个文件（只读 CSS 文本，对用户零保障，且会随迁移集体变红）
- **替换为** `src/theme/palettes.spec.ts`：断言 11 套色板 × 亮暗都能生成完整 overrides（数据层断言，不读 CSS）
- 保留 8 个组件单测，把 `find('.cb')` 这类选择器改为 role / 文本 / `data-testid`
- e2e 选择器改为 `getByRole` / `getByText` / `data-testid`
- 新增约定：e2e 需要定位的元素加 `data-testid`，不依赖样式类

### 5.6 批次划分

每批结束时应用可正常运行、测试全绿、可单独回滚。

| 批次 | 内容 | 验收 |
|---|---|---|
| 0 基线 | 建分支并打标签；装 `naive-ui`；`n-config-provider` 接入但暂不换组件；删 16 个假测试、补主题数据测试；引入 ESLint + Prettier（按现状设基线，不整体 auto-fix）；在 `ci.yml` 增加 `npm run lint` 步骤 | 外观与现在完全一致，CI 开始拦 lint |
| 1 主题接线 | `palettes.ts` 成为唯一来源；壳层变量；删 `main.css` 中 22 段色板与暗色覆盖 | 11 色板 × 亮暗逐个切换正常 |
| 2 基础控件 | `n-button` / `n-input` / `n-select` / `n-switch` / `n-tooltip` / `n-progress` / `n-empty` | 顶栏、状态栏、各弹窗内部控件统一 |
| 3 弹窗 | 8 个 modal → `n-modal`；Confirm/Prompt → `useDialog` | 遮罩点击关闭、Esc 关闭、焦点不逃逸 |
| 4 设置页 | `n-tabs` + 表单化 | 四个分区内容不变，弹窗高度稳定 |
| 5 侧边栏 | 分类树 → `n-tree` | 风险二验收项 |
| 6 列表与表格 | 主表格、回收站、管理页的分类列表与标签列表统一到 `n-data-table`；**统一选择机制**（现状是两套并存：`SiteTable` 走 `store.selectedIds`，`RecycleView` / `ManageCategories` / `ManageTags` 走 `useSelection`） | 风险一验收项 + 三处列表交互一致 |
| 7 收尾 | 删死规则；`main.css` 拆为 `shell.css`；剩余样式就近到组件；缩放改原生；lint 收紧 | 成功标准 1–6 全部满足 |

### 5.7 依赖与权限

- 新增依赖：`naive-ui@2.45.x`（peer `vue ^3`）
- 不引入 Tailwind
- `src-tauri/capabilities/` 增加 `core:webview:allow-set-webview-zoom`

### 5.8 回滚

批次 0 打标签 `v0.3.4-ui-baseline`。此后每批一个提交（必要时拆小提交），出问题 `git revert` 该批即可，不需要回退整条迁移。

## 6. 留给实现者的判断

- 色板 hover/pressed 的混合比例（默认亮 10% / 暗 10%，需按对比度微调）
- 各组件具体用哪个 variant / size（`n-button` 的 `secondary`/`tertiary`/`quaternary` 对应关系）
- 框选层的实现方式（指针事件 vs `elementFromPoint` 命中）
- `useSelection` 的去留：批次 6 之后若三处调用方都改用 `n-data-table`，该 composable 可能整体作废
- ESLint 规则集与基线取值
- 每批内部的提交切分粒度

## 7. 后续（不在本设计内）

设置页应新增/优化的功能单独出设计。其中「字体大小」「界面密度」「圆角风格」「动效开关」依赖本设计建立的主题结构，需在本设计落地后再做。
