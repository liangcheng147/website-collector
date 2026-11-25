# 左侧栏宽度可拖动 — 设计

日期：2026-11-25
状态：已确认

## 意图

左侧栏（分类 / 视图 / 标签 / 系统）当前固定为 170px。分类名称较长或标签较多时，用户需要更大的横向空间。让用户用鼠标拖动侧栏右边缘调整宽度，并记住选择。

## 目标

- 鼠标拖动侧栏右边缘即可调整宽度。
- 宽度限制在 160–360px，避免拖没或挤占主内容。
- 宽度持久化到 `localStorage`，重启后保留。
- 双击分割线复位为默认 170px。
- 键盘可调（←/→），并带基本 ARIA 语义。

## 非目标

- 不改动右侧内容区布局、表格列宽或管理页。
- 不引入新的第三方拖拽/分栏依赖。
- 不把宽度写进 Rust 设置或数据文件（属纯前端偏好）。

## 约束

- 颜色只能来自 `src/theme` 写入的 CSS 变量，不硬编码十六进制。
- 模板中不出现静态 `style="..."`；宽度用动态 `:style` 绑定。
- 保留现有 `data-testid` / ARIA 与 e2e 选择器。

## 方案对比

- **A. 自绘拖拽手柄（选用）**：在侧栏右边缘放 6px 命中区，pointer 事件更新列宽；复用项目现有 localStorage 偏好模式。无新依赖，交互可控。
- B. CSS 原生 `resize: horizontal`：手柄在右下角、难发现，样式不可控，与整条分割线不匹配。放弃。
- C. 引入 splitpanes 等分栏库：为一个侧栏增加依赖与打包体积，收益不足。放弃。

## 设计

### 状态与持久化

- `App.vue` 新增 `sidebarWidth` ref，初值从 `localStorage['site-collector-sidebar-width']` 读取；非法/缺失时用 170。
- 取值统一经过 `clampSidebarWidth(v)`：`Math.min(360, Math.max(160, Math.round(v)))`。
- 拖动结束（pointerup）时写回 localStorage；读写失败静默忽略。

### 布局

- `.body` 改为 `position: relative`，并用动态绑定：
  `:style="{ gridTemplateColumns: sidebarWidth + 'px 1fr' }"`。
- 新增绝对定位的 `.sidebar-resizer`（6px 宽，贴右边缘，`cursor: col-resize`，`z-index` 高于内容）。绝对定位使其不参与 grid 布局。
- 仅在非管理页渲染（`v-if="!manage"`）；管理页仍由 `.manage { grid-column: 1 / -1 }` 全宽显示。

### 交互

- `pointerdown`：记录起始 X 与起始宽度，在 `document` 上挂 `pointermove` / `pointerup`。
- `pointermove`：`clamp(startWidth + dx)` 实时更新。
- `pointerup`：移除监听并持久化。
- `dblclick`：复位 170px 并持久化。
- `keydown` ←/→：每次 ±10px（同样 clamp 并持久化）；`Home` 复位。

### 无障碍

- 手柄：`role="separator"`、`aria-orientation="vertical"`、`aria-label="调整侧栏宽度"`、`aria-valuemin/max/now`、`tabindex="0"`。

### 视觉

- 默认透明；`:hover` / `:active` 时显示 `var(--primary)` 竖条；不硬编码颜色。

## 测试

- 纯函数单测：`clampSidebarWidth` 的边界（<160、>360、小数取整）。
- 组件测试（`App.spec.ts`，Sidebar 已 stub）：挂载后对 `[data-testid="sidebar-resizer"]` 派发 `pointerdown` → `document` 派发 `pointermove` → `pointerup`，断言 `.body` 的 `grid-template-columns` 与 localStorage 写入；双击断言复位。
- 回归：`npm test`、`npm run build`、`npx playwright test`。

## 待定

无。
