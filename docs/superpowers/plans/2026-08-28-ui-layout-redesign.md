# 界面布局与组件微调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 微调「归集」桌面应用（Tauri 2 + Vue 3）的界面布局与组件呈现——侧栏、站点列表、管理页、弹窗（含标签输入）的布局/密度调整；整体框架与配色不变。

**Architecture:** 纯前端改动，集中在 `src/components/*.vue` 与全局样式 `src/styles/main.css`。每个界面独立成任务，组件与其 CSS 规则同任务修改；改动通过现有 Vitest 组件测试 + `npm run build` 回归验证，可视化由 Tauri 窗口人工确认。

**Tech Stack:** Vue 3 (`<script setup>`) + TypeScript + Pinia（`src/store/app.ts`）+ Vite；测试用 Vitest + `@vue/test-utils` + happy-dom。`npm test` 跑 `src/**/*.spec.ts`。

## Global Constraints

- 仅改 `src/` 前端；**不改 `src-tauri/`、不改 `src/api.ts` IPC 契约**（每条任务默认包含此约束）。
- 保留现有交互逻辑（折叠/展开、搜索防抖、多选/框选、拖拽、键盘流、Esc 行为）。
- 本轮**不改**配色/主题 CSS 变量（`main.css` `:root` 与 `[data-theme="dark"]` 的主色 `--primary`、语义色、圆角、阴影均保留）。
- 项目根 `vite.config.ts` 固定端口 1420（`strictPort:true`），改动时不要碰它。
- 复制/文案保持简体中文，与现状一致。

---

## Project Orientation（给执行者）

- 运行测试：`npm test`（Vitest，happy-dom 环境）。
- 类型检查 + 构建：`npm run build`（先 `vue-tsc --noEmit` 再 `vite build`，缺一不可）。
- 组件测试用 `@vue/test-utils` 的 `mount()`；用到 Pinia store 的测试在 `beforeEach` 里 `setActivePinia(createPinia())` 后再 `useAppStore()`。
- 全局样式集中在 `src/styles/main.css`，组件内联样式在各自 `.vue` 的 `<style>`（注意 `App.vue` 等有 `scoped`）。
- 现有组件测试：`src/components/TagInput.spec.ts`（4 项）、`src/store/app.spec.ts`。新增测试放在对应组件旁，命名 `Xxx.spec.ts`。

---

## Task 1: 侧栏——分类组图标按钮 + 标签组可折叠

**Files:**
- Modify: `src/components/Sidebar.vue:55-60`（分类组按钮）、`:72-73`（标签组加折叠）
- Modify: `src/styles/main.css` `.sidebar .mini` / `.group-actions`（改为 `.group-btn` 图标样式）
- Test: `src/components/Sidebar.spec.ts`（新建）

**Interfaces:**
- Consumes: `store.toggleGroup(group)`、`store.isCollapsed(group)`、`store.settings.sidebarCollapsed`、`store.expandAllCategories()`、`store.collapseAllCategories()`（均已在 `Sidebar.vue` 现状中存在）。
- Produces: 分类组渲染两个 `.group-btn`（⤢/⤡）；标签组被 `toggleGroup('标签')` + `v-if="!isCollapsed('标签')"` 控制显隐。

- [ ] **Step 1: 写失败测试**

```ts
// src/components/Sidebar.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from '../components/Sidebar.vue'
import { useAppStore } from '../store/app'

describe('Sidebar', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('点击"标签"组标题可折叠该组', async () => {
    const store = useAppStore()
    store.settings.sidebarCollapsed = []
    const w = mount(Sidebar)
    const tagLabel = w.findAll('.group-label').find(l => l.text().startsWith('标签'))!
    expect(store.settings.sidebarCollapsed).not.toContain('标签')
    await tagLabel.trigger('click')
    expect(store.settings.sidebarCollapsed).toContain('标签')
  })
  it('分类组渲染展开/收起图标按钮', () => {
    const w = mount(Sidebar)
    const catLabel = w.findAll('.group-label').find(l => l.text().startsWith('分类'))!
    const btns = catLabel.findAll('.group-btn')
    expect(btns).toHaveLength(2)
    expect(btns[0].text()).toBe('⤢')
    expect(btns[1].text()).toBe('⤡')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/Sidebar.spec.ts`
Expected: FAIL（`.group-btn` 不存在 / 标签组不可点击折叠）。

- [ ] **Step 3: 最小实现**

`src/components/Sidebar.vue` 分类组（约 55-60 行）改为：

```html
<div class="group-label" @click="toggleGroup('分类')">分类 <span class="caret">{{ isCollapsed('分类') ? '▶' : '▼' }}</span>
  <span class="group-actions">
    <button class="group-btn" type="button" title="展开全部" @click.stop="store.expandAllCategories()">⤢</button>
    <button class="group-btn" type="button" title="收起全部" @click.stop="store.collapseAllCategories()">⤡</button>
  </span>
</div>
```

标签组（约 72-73 行）改为可折叠：

```html
<div class="group-label" @click="toggleGroup('标签')">标签 <span class="caret">{{ isCollapsed('标签') ? '▶' : '▼' }}</span></div>
<template v-if="!isCollapsed('标签')">
  <div class="tag-scroll">
    <div v-for="t in store.data.tags" :key="t" class="row"
      :class="{ active: store.view.kind === 'tag' && store.view.id === t, 'drop-over': tagDrop === t }"
      @click="setView('tag', t)"
      draggable="true"
      @dragstart="onTagDragStart($event, t)"
      @dragover="onTagDragOver($event, t)"
      @dragleave="tagDrop = null"
      @drop="onTagDrop($event, t)">
      # {{ t }}
    </div>
  </div>
</template>
```

`src/styles/main.css` 中替换 `.sidebar .mini` 相关规则为：

```css
.sidebar .group-actions { margin-left:auto; display:inline-flex; gap:6px; opacity:0; transition:opacity .15s var(--ease); }
.sidebar .group-label:hover .group-actions { opacity:1; }
.sidebar .group-btn { font-size:12px; line-height:1; width:22px; height:22px; padding:0; border-radius:6px; color:var(--text-2); background:transparent; border:1px solid var(--border-2); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:color .15s var(--ease), border-color .15s var(--ease); }
.sidebar .group-btn:hover { color:var(--primary); border-color:var(--primary); }
```

（删除原 `.sidebar .mini` 两条规则，避免残留样式。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/components/Sidebar.spec.ts`
Expected: PASS（2 项）。

- [ ] **Step 5: 提交**

```bash
git add src/components/Sidebar.vue src/styles/main.css src/components/Sidebar.spec.ts
git commit -m "feat(ui): 侧栏分类组改图标折叠按钮，标签组可折叠"
```

---

## Task 2: 站点列表——"状态"列 + 备注空显"—"

**Files:**
- Modify: `src/components/SiteTable.vue:95`（表头文案）、`:124`（备注单元格）
- Test: `src/components/SiteTable.spec.ts`（新建）

**Interfaces:**
- Consumes: `store.filteredSites`（含 `note` 字段）、`store.sortKey`/`store.sortDir`（现状排序逻辑不动）。
- Produces: 表头第 6 列显示"状态"；备注单元格空时渲染"—"、非空时渲染内容并带 `title`。

- [ ] **Step 1: 写失败测试**

```ts
// src/components/SiteTable.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import SiteTable from '../components/SiteTable.vue'
import { useAppStore } from '../store/app'

describe('SiteTable', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('表头第6列显示"状态"而非"生命"', () => {
    const w = mount(SiteTable)
    const heads = w.findAll('th').map(h => h.text())
    expect(heads[5]).toContain('状态')
    expect(heads[5]).not.toContain('生命')
  })
  it('备注为空时显示"—"', () => {
    const store = useAppStore()
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '', deletedAt: '' } as any]
    store.data.categories = []
    const w = mount(SiteTable)
    const noteCell = w.findAll('td').find(td => td.text() === '—')!
    expect(noteCell.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/SiteTable.spec.ts`
Expected: FAIL（表头仍为"生命"；无"—"单元格）。

- [ ] **Step 3: 最小实现**

`src/components/SiteTable.vue` 表头（约 95 行）：

```html
<th @click="store.toggleSort('status')" class="sortable">状态 <span v-if="store.sortKey==='status'">{{ store.sortDir==='asc'?'▲':'▼' }}</span></th>
```

备注单元格（约 124 行）：

```html
<td class="muted" :title="s.note">{{ s.note || '—' }}</td>
```

（`.site-table td` 纵向 padding 由 `7px 10px` 微调为 `6px 10px`，在 `main.css` 第 95 行附近改一处即可，属于本任务密度微调。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/components/SiteTable.spec.ts`
Expected: PASS（2 项）。

- [ ] **Step 5: 提交**

```bash
git add src/components/SiteTable.vue src/styles/main.css src/components/SiteTable.spec.ts
git commit -m "feat(ui): 站点列表生命列改名状态，备注空显破折号"
```

---

## Task 3: 管理页——两 tab 统一左列表/右表单 + 控件一致性

**Files:**
- Modify: `src/components/ManageCategories.vue`（两卡对调）
- Modify: `src/styles/main.css` `.manage-cols`、`.manage-card`、新增 `.manage-card input/select/textarea{width:100%}`
- Test: `src/components/ManageCategories.spec.ts`（新建，验证卡片顺序）

**Interfaces:**
- Consumes: `store.flatCategories`、`store.categoryCounts`、`store.addCategory`、`store.deleteCategories`（现状逻辑不变）。
- Produces: `ManageCategories` 渲染顺序为「左=分类列表 / 右=批量添加分类」；`.manage-cols` 等宽 `1fr 1fr`；表单控件满宽。

- [ ] **Step 1: 写失败测试**

```ts
// src/components/ManageCategories.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ManageCategories from '../components/ManageCategories.vue'
import { useAppStore } from '../store/app'

describe('ManageCategories', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染顺序为 分类列表 在前、批量添加分类 在后', () => {
    const w = mount(ManageCategories)
    const cards = w.findAll('.manage-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('h4').text()).toBe('分类列表')
    expect(cards[1].find('h4').text()).toBe('批量添加分类')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/ManageCategories.spec.ts`
Expected: FAIL（当前左卡为"批量添加分类"）。

- [ ] **Step 3: 最小实现**

`src/components/ManageCategories.vue` 把 `<div class="manage-cols">` 内两个 `.manage-card` 对调：先放"分类列表"卡（含 `cat-head`/`cat-row` 与"🗑 批量删除所选"按钮），后放"批量添加分类"卡（父分类 select / 名称 input / 添加按钮）。控件结构不变，仅顺序与归属卡调换。

`src/styles/main.css`：

```css
.manage-cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
.manage-card { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; box-shadow:var(--shadow); min-width:0; }
.manage-card input, .manage-card select, .manage-card textarea { width:100%; }
```

（删除/覆盖原 `.manage-cols` 的 `280px 1fr` 与原 `.manage-card` 的 `padding:14px`。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/components/ManageCategories.spec.ts`
Expected: PASS（1 项）。

- [ ] **Step 5: 提交**

```bash
git add src/components/ManageCategories.vue src/styles/main.css src/components/ManageCategories.spec.ts
git commit -m "feat(ui): 管理页分类tab统一左列表右表单，控件满宽等宽"
```

---

## Task 4: 弹窗——加宽到 520px + 字段松间距

**Files:**
- Modify: `src/styles/main.css` `.modal`（宽度）、`.modal label`（margin）
- Modify: `src/components/SettingsModal.vue:23`（内联宽度对齐）

**Interfaces:**
- Consumes: 无（纯 CSS）。
- Produces: 所有 `.modal` 默认宽 520px；`.modal label` 间距加大；SettingsModal 不再用 480px 内联宽度。

- [ ] **Step 1: 静态核查（无单测，靠回归 + 构建 + 视觉）**

确认 `src/styles/main.css` 第 133 行 `.modal` 当前为 `width:min(440px,92%)`。

- [ ] **Step 2: 最小实现**

`src/styles/main.css` 第 133 行：

```css
.modal { background:#fff; border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-md); padding:18px 20px; width:min(520px,92%); max-height:calc(100% - 32px); overflow:auto; }
```

第 135 行 `.modal label`：

```css
.modal label { display:block; margin:14px 0 5px; font-size:12px; color:var(--text-2); font-weight:600; }
```

`src/components/SettingsModal.vue:23` 删除内联 `style="width:min(480px,92%)"`（改用 `.modal` 默认 520px），或改为 `width:min(520px,92%)`。本任务采用删除内联样式。

- [ ] **Step 3: 回归 + 构建验证**

Run: `npm test`
Expected: 全部 PASS（含 Task 1-3 新增测试，总数约 67）。
Run: `npm run build`
Expected: 构建通过（vue-tsc + vite 无错）。

- [ ] **Step 4: 提交**

```bash
git add src/styles/main.css src/components/SettingsModal.vue
git commit -m "feat(ui): 弹窗默认宽520并加大字段间距"
```

---

## Task 5: 标签输入——新布局（上 chips / 中新建 / 下已有下拉）

**Files:**
- Modify: `src/components/TagInput.vue`（模板重构）
- Modify: `src/styles/main.css` `.tag-input*` 规则
- Test: `src/components/TagInput.spec.ts`（现状 4 项，确认仍绿；选择器 `.chip`/`.chip-x`/`.opt` 不变）

**Interfaces:**
- Consumes: `props.modelValue: string[]`、`props.available: string[]`、`emit('update:modelValue', v)`（现状签名不变）；`commit()`、`onKey`、`onFocus`、`positionDropdown`、`add`、`remove` 逻辑保留。
- Produces: DOM 结构变为 `.tag-input-wrap` > `.tag-chips`（已加标签，可×移除）+ `.tag-field`（input 专用于新建 + `Teleport` 到 body 的 `.tag-opts` 下拉，位于 input 正下方）。`.chip`/`.chip-x`/`.opt` class 名保持不变，确保现有测试无需改选择器。

- [ ] **Step 1: 写/核对失败条件**

当前 `src/components/TagInput.spec.ts` 的 4 项（Enter 添加、下拉选已有、× 移除、Backspace 删末）依赖 `.chip`、`.chip-x`、`document.body.querySelector('.opt')`。重构后这些 class 仍在，应直接通过；先运行确认基线。

Run: `npm test -- src/components/TagInput.spec.ts`
Expected: PASS（4 项，作为重构前的基线）。

- [ ] **Step 2: 最小实现**

`src/components/TagInput.vue` 模板（约 43-52 行）重构为：

```html
<template>
  <div class="tag-input-wrap">
    <div class="tag-chips">
      <span v-for="t in modelValue" :key="t" class="chip">{{ t }}<button class="chip-x" type="button" @click="remove(t)">×</button></span>
    </div>
    <div class="tag-field">
      <input ref="inputEl" v-model="text" @focus="onFocus" @blur="open = false" @keydown="onKey" placeholder="输入新建标签，回车添加" />
      <Teleport to="body">
        <div v-if="open && filtered.length" class="tag-opts" :style="dropStyle">
          <button v-for="t in filtered" :key="t" type="button" class="opt" @mousedown.prevent="add(t)">{{ t }}</button>
        </div>
      </Teleport>
    </div>
  </div>
</template>
```

`src/styles/main.css` 把原 `.tag-input` 规则替换为：

```css
.tag-input-wrap { display:flex; flex-direction:column; gap:6px; }
.tag-chips { display:flex; flex-wrap:wrap; gap:6px; }
.tag-field { position:relative; }
.tag-field input { width:100%; border:1px solid var(--border-2); border-radius:var(--radius); padding:5px 10px; background:#fff; color:var(--text); font-size:13px; }
.tag-field input:focus { outline:none; border-color:var(--primary); box-shadow:var(--ring); }
.tag-input .chip { display:inline-flex; align-items:center; gap:4px; background:var(--primary-t); color:var(--primary); border-radius:6px; padding:1px 6px; font-size:12px; }
.tag-input .chip-x { border:none; background:none; color:inherit; cursor:pointer; font-size:13px; line-height:1; }
.tag-opts { position:fixed; z-index:1000; background:var(--panel); border:1px solid var(--border); border-radius:8px; box-shadow:var(--shadow-md); margin-top:2px; max-height:160px; overflow:auto; }
.tag-opts .opt { display:block; width:100%; text-align:left; border:none; background:none; padding:6px 10px; cursor:pointer; font-size:13px; }
.tag-opts .opt:hover { background:var(--hover); }
```

（移除原 `.tag-input { display:flex; flex-wrap; ... }` 整条；`.tag-opts` 定位逻辑 `positionDropdown()` 不变，仍 `top: r.bottom + 2px`、`left: r.left`。）

- [ ] **Step 3: 运行测试确认通过**

Run: `npm test -- src/components/TagInput.spec.ts`
Expected: PASS（4 项仍绿；若某选择器因结构调整失效，按 `.chip`/`.chip-x`/`.opt` 修正测试，不要改组件 class 名）。

- [ ] **Step 4: 提交**

```bash
git add src/components/TagInput.vue src/styles/main.css src/components/TagInput.spec.ts
git commit -m "feat(ui): 标签输入改为上chips中新建下已有下拉布局"
```

---

## Task 6: 顶栏/回收站核实无改动 + 全局验证

**Files:** 无代码改动（`TopBar.vue`、`RecycleView.vue` 保持现状）。

**Interfaces:** 验收基线。

- [ ] **Step 1: 静态核查**

确认 `src/components/TopBar.vue`、`src/components/RecycleView.vue` 自本计划启动以来未被修改（仅因本任务而"不改动"）。

- [ ] **Step 2: 全局回归 + 构建**

Run: `npm test`
Expected: 全部 PASS（约 67 项：原有 62 + 本计划新增 Sidebar 2 / SiteTable 2 / ManageCategories 1 = 67）。
Run: `npm run build`
Expected: 构建通过。

- [ ] **Step 3: 可视化清单（人工在 Tauri 窗口确认）**

- 侧栏：分类组为 ⤢/⤡ 图标按钮（hover 显眼）；标签组可点击折叠；视图/系统组不变。
- 站点列表：第 6 列为"状态"；备注空行显示"—"；行距略紧。
- 管理页：分类/标签两 tab 均左列表/右表单；下拉/输入框满宽等长；按钮尺寸统一；两卡等宽、间距均匀。
- 弹窗：默认宽 520；字段松间距；标签输入为「上 chips / 中新建输入 / 下已有标签下拉」。
- 顶栏、回收站：外观无变化。

- [ ] **Step 4: 提交（仅当本计划其它任务尚未提交时统一收尾；若已逐任务提交可跳过）**

```bash
git add -A
git commit -m "chore: 界面布局与组件微调实现完成" || echo "nothing to commit"
```

---

## 下一阶段（不在本计划范围）

配色/主题 CSS 变量（`--primary`、语义色、圆角、阴影、暗色对比度）本轮未改，列为后续独立可视化会话。届时另起 spec + plan。
