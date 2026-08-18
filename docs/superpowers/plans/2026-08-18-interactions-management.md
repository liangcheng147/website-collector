# 归集 v1.2 交互与管理实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「归集」实现 24 项交互与管理需求：选中交互（左键/Ctrl/Shift/全选）、打开链接按钮、主页面四种拖拽、管理页面（分类/标签两页签）、侧边栏折叠持久化、小窗口滚动修复、主题下拉框。

**Architecture:** 全部业务逻辑在 Pinia store（`src/store/app.ts`）中实现并持久化到 `./data/websites.json`；侧边栏折叠状态写入 `settings.json`（Rust `settings.rs` 增加字段）；拖拽用 HTML5 Drag & Drop，数据通过自定义 MIME 类型（`application/x-site-id` / `application/x-cat-id` / `application/x-tag`）交换；管理页面为 `ManageView.vue` 顶层视图替换主区域；打开链接用 `@tauri-apps/plugin-opener`。

**Tech Stack:** Tauri 2 / Rust，Vue 3 + Pinia，TypeScript，Vitest + cargo test。

## Global Constraints

- 不改变现有交互逻辑与布局结构；现有侧边栏右键、批量操作栏弹窗、右键菜单**全部保留**。
- 数据继续存储在 `./data/websites.json`；设置存储在 `./data/settings.json`。
- 分类嵌套最多 3 层（depth 0/1/2）；`flatCategories` 中 `depth < 2` 才可作为父分类。
- 测试命令：Rust `cargo test`（在 `src-tauri/` 下执行）；前端 `npm test`；类型+构建 `npm run build`；打包 `npm run tauri build`。
- 提交信息风格：`feat:` / `fix:` / `docs:` + 中文说明。
- 拖拽数据 MIME 约定：`application/x-site-id`=网站 id，`application/x-cat-id`=分类 id，`application/x-tag`=标签名。
- 新 UI 元素必须使用 CSS 变量（亮/暗主题自动适配）。

---

### Task 1: Rust settings 增加 `sidebarCollapsed` 字段 + 类型同步

**Files:**
- Modify: `src-tauri/src/settings.rs`
- Modify: `src/types.ts`
- Modify: `src/store/app.ts`（state 默认值）
- Modify: `src/store/app.spec.ts`（mock 与断言同步）
- Test: `src-tauri/src/settings.rs`（现有 `mod tests`）

**Interfaces:**
- Produces: Rust `Settings` 增加 `#[serde(default)] pub sidebar_collapsed: Vec<String>`（camelCase → `sidebarCollapsed`），`defaults()` 返回空 Vec。前端 `Settings` 增加 `sidebarCollapsed: string[]`。前端 store 默认 settings 为 `{ theme: 'system', zoom: 100, sidebarCollapsed: [] }`。

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/settings.rs` 的 `mod tests` 中新增：

```rust
#[test]
fn sidebar_collapsed_roundtrip() {
    let d = tmp_dir("collapsed");
    let mut s = Settings::defaults();
    s.sidebar_collapsed = vec!["分类".into(), "系统".into()];
    save_settings(&d, &s).unwrap();
    let loaded = load_settings(&d);
    assert_eq!(loaded.sidebar_collapsed, vec!["分类".to_string(), "系统".to_string()]);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn missing_sidebar_collapsed_defaults_empty() {
    let d = tmp_dir("collapsed_missing");
    fs::write(settings_file_path(&d), r#"{"theme":"dark","zoom":110}"#).unwrap();
    let s = load_settings(&d);
    assert!(s.sidebar_collapsed.is_empty());
    assert_eq!(s.theme, "dark");
    let _ = fs::remove_dir_all(&d);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test`（在 `src-tauri/` 目录）
Expected: FAIL — `Settings` 结构体无 `sidebar_collapsed` 字段，编译错误。

- [ ] **Step 3: 实现字段**

修改 `src-tauri/src/settings.rs`：

```rust
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)] pub theme: String,
    #[serde(default)] pub zoom: u32,
    #[serde(default)] pub sidebar_collapsed: Vec<String>,
}

impl Settings {
    pub fn defaults() -> Self {
        Settings { theme: "system".into(), zoom: 100, sidebar_collapsed: vec![] }
    }
}
```

同步修改 `src/types.ts`：

```ts
export interface Settings {
  theme: 'system' | 'light' | 'dark'
  zoom: number
  sidebarCollapsed: string[]
}
```

同步修改 `src/store/app.ts` state（第 30 行）：

```ts
settings: { theme: 'system', zoom: 100, sidebarCollapsed: [] } as Settings,
```

同步更新 `src/store/app.spec.ts` 中受影响的位置：
- mock 中 `getSettings`/`setSettings` 返回对象加 `sidebarCollapsed: []`；
- 断言 `expect(s.settings).toEqual({ theme: 'dark', zoom: 130 })`（第 134 行）改为 `{ theme: 'dark', zoom: 130, sidebarCollapsed: [] }`；
- 断言 `expect(api.setSettings).toHaveBeenCalledWith({ theme: 'system', zoom: 150 })`（第 127 行）改为 `{ theme: 'system', zoom: 150, sidebarCollapsed: [] }`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test`（`src-tauri/`）+ `npm test`
Expected: PASS（Rust 2 个新测试通过；前端 updateSettings/init 相关断言通过）。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs src/types.ts src/store/app.ts src/store/app.spec.ts
git commit -m "feat: settings 增加 sidebarCollapsed 字段（侧边栏折叠状态持久化）"
```

---

### Task 2: store 选中交互（单选/范围/全选当前视图）

**Files:**
- Modify: `src/store/app.ts`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `filteredSites` getter（已有）。
- Produces:
  - state 新增 `lastSelectedId: string | null`（Shift 范围锚点）。
  - `selectOne(id: string)` — 单选，重置 selectedIds 为 `[id]`，记录锚点。
  - `toggleSelect(id: string)` — 追加/取消，更新锚点（修改现有实现）。
  - `selectRange(id: string)` — 从锚点行到 `id` 行的全部行选中（基于 `filteredSites` 顺序）。
  - `selectAllVisible()` — `filteredSites` 全选；若当前已全选则清空。

- [ ] **Step 1: 写失败测试**

在 `src/store/app.spec.ts` 的 describe 内追加：

```ts
it('selectOne resets selection and records anchor', () => {
  const s = useAppStore()
  s.data = baseData
  s.selectedIds = ['a', 'b']
  s.selectOne('c')
  expect(s.selectedIds).toEqual(['c'])
  expect(s.lastSelectedId).toBe('c')
})

it('toggleSelect maintains anchor', () => {
  const s = useAppStore()
  s.data = baseData
  s.toggleSelect('a')
  s.toggleSelect('b')
  expect(s.selectedIds).toEqual(['a', 'b'])
  expect(s.lastSelectedId).toBe('b')
})

it('selectRange selects between anchor and target', () => {
  const s = useAppStore()
  s.data = baseData
  s.view = { kind: 'all' } // filteredSites 顺序 = [a, b, c]
  s.selectOne('a')
  s.selectRange('c')
  expect(s.selectedIds).toEqual(['a', 'b', 'c'])
})

it('selectRange respects filtered order', () => {
  const s = useAppStore()
  s.data = baseData
  s.view = { kind: 'tag', id: '框架' } // filteredSites = [a, b]
  s.selectOne('b')
  s.selectRange('a')
  expect(s.selectedIds).toEqual(['a', 'b'])
})

it('selectAllVisible selects all filtered sites', () => {
  const s = useAppStore()
  s.data = baseData
  s.search = '框架'
  s.selectAllVisible()
  expect(s.selectedIds).toEqual(['a', 'b'])
})

it('selectAllVisible clears when already all selected', () => {
  const s = useAppStore()
  s.data = baseData
  s.selectedIds = ['a', 'b', 'c']
  s.selectAllVisible()
  expect(s.selectedIds).toEqual([])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — `selectOne`/`selectRange`/`selectAllVisible` 不存在。

- [ ] **Step 3: 实现**

修改 `src/store/app.ts`：

state 新增（`selectedIds` 之后）：

```ts
lastSelectedId: null as string | null,
```

替换现有 `toggleSelect`，并新增三个 action（放在 `clearSelection` 之后）：

```ts
toggleSelect(id: string) {
  const i = this.selectedIds.indexOf(id)
  if (i >= 0) this.selectedIds.splice(i, 1)
  else this.selectedIds.push(id)
  this.lastSelectedId = id
},
selectOne(id: string) {
  this.selectedIds = [id]
  this.lastSelectedId = id
},
selectRange(id: string) {
  const ids = this.filteredSites.map(s => s.id)
  const cur = ids.indexOf(id)
  if (cur < 0) { this.selectedIds = [id]; this.lastSelectedId = id; return }
  const anchor = ids.indexOf(this.lastSelectedId ?? id)
  if (anchor < 0) { this.selectedIds = [id]; this.lastSelectedId = id; return }
  const from = Math.min(cur, anchor)
  const to = Math.max(cur, anchor)
  this.selectedIds = ids.slice(from, to + 1)
  this.lastSelectedId = id
},
selectAllVisible() {
  const ids = this.filteredSites.map(s => s.id)
  if (ids.length && ids.every(i => this.selectedIds.includes(i))) this.selectedIds = []
  else this.selectedIds = ids
},
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（6 个新测试 + 原有用例）。

- [ ] **Step 5: Commit**

```bash
git add src/store/app.ts src/store/app.spec.ts
git commit -m "feat: store 选中交互 selectOne/selectRange/selectAllVisible 与范围锚点"
```

---

### Task 3: SiteTable 全选 + 行选中 + 打开链接按钮 + 网站拖拽源

**Files:**
- Modify: `src/components/SiteTable.vue`
- Modify: `src/styles/main.css`
- Modify: `src/api.ts`（openUrl 封装）

**Interfaces:**
- Consumes: store `selectOne`/`selectRange`/`toggleSelect`/`selectAllVisible`/`filteredSites`（Task 2）。`api.openUrl(url)`。
- Produces: `api.openUrl(url: string): Promise<void>`（用 `@tauri-apps/plugin-opener` 的 `openUrl`）。SiteTable 行 `draggable`，dragstart 写 `application/x-site-id`；行 drop 接收 `application/x-tag`。表头全选复选框。

- [ ] **Step 1: api.ts 增加 openUrl**

`src/api.ts` 末尾追加：

```ts
import { openUrl } from '@tauri-apps/plugin-opener'
export const openLink = (url: string) => openUrl(url)
```

- [ ] **Step 2: 修改 SiteTable.vue**

`<script setup lang="ts">` 部分（保留现有逻辑，新增函数）：

```ts
const allSelected = computed(() =>
  store.filteredSites.length > 0 && store.filteredSites.every(s => store.selectedIds.includes(s.id)))

function onRowClick(e: MouseEvent, site: Site) {
  if (e.ctrlKey || e.metaKey) store.toggleSelect(site.id)
  else if (e.shiftKey) store.selectRange(site.id)
  else store.selectOne(site.id)
}
function onSiteDragStart(e: DragEvent, id: string) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-site-id', id)
  e.dataTransfer.effectAllowed = 'move'
}
function onRowDrop(e: DragEvent, site: Site) {
  const tag = e.dataTransfer?.getData('application/x-tag')
  if (tag) store.addTagsToSites([site.id], [tag])
}
function onRowDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-tag')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
}
```

script 导入需调整（合并进现有导入，`computed` 加入 vue 导入；新增 Site 类型与 api）：

```ts
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../store/app'
import type { Site } from '../types'
import * as api from '../api'
import ContextMenu from './ContextMenu.vue'
```

template 修改：

1. 表头加全选列（`<tr><th></th>...` 改为）：

```html
<tr>
  <th><span class="cb" :class="{ checked: allSelected }" @click="store.selectAllVisible()"></span></th>
  <th>名称</th><th>链接</th><th>分类</th><th>标签</th><th>生命</th><th>备注</th>
</tr>
```

2. 行标签加事件与属性（`<tr v-for="s in store.filteredSites" ...>`）：

```html
<tr
  v-for="s in store.filteredSites" :key="s.id"
  :class="{ 'row-selected': store.selectedIds.includes(s.id) }"
  draggable="true"
  @click="onRowClick($event, s)"
  @mouseenter="hoverId = s.id"
  @mouseleave="hoverId = null"
  @dblclick="onRowDblClick(s)"
  @contextmenu.prevent="onRight($event, s.id)"
  @dragstart="onSiteDragStart($event, s.id)"
  @dragover="onRowDragOver"
  @drop="onRowDrop($event, s)"
>
```

3. 链接列加打开按钮（紧跟 URL 后）：

```html
<td class="muted">
  {{ s.url }}
  <span v-if="hoverId === s.id" class="open-btn" title="打开链接" @click.stop="api.openLink(s.url)">⧉</span>
</td>
```

- [ ] **Step 3: 样式**

`src/styles/main.css` 追加：

```css
/* ---- 选中交互与打开链接 ---- */
.site-table { user-select:none; }
.site-table th:first-child, .site-table td:first-child { width:28px; text-align:center; }
.site-table td:first-child .cb { cursor:pointer; }
.open-btn { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:5px; background:var(--primary); color:#fff; font-size:11px; cursor:pointer; margin-left:6px; vertical-align:middle; user-select:none; }
.open-btn:hover { background:var(--primary-w); }
```

- [ ] **Step 4: 验证**

Run: `npm test`（store 回归）+ `npm run build`
Expected: PASS；类型检查通过（`computed`、`Site`、`api.openLink` 均可用）。

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/components/SiteTable.vue src/styles/main.css
git commit -m "feat: 表格全选/左键选中交互/打开链接按钮/网站行拖拽源"
```

---

### Task 4: 侧边栏四分组折叠 + 状态持久化

**Files:**
- Modify: `src/components/Sidebar.vue`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: `store.settings.sidebarCollapsed: string[]`（Task 1），`store.updateSettings(patch)`。
- Produces: 四个分组（`分类`/`视图`/`标签`/`系统`）标题可点击折叠；折叠的分组 key 存入 `sidebarCollapsed`。分组 key 直接用中文名：`'分类'`、`'视图'`、`'标签'`、`'系统'`。

- [ ] **Step 1: 修改 Sidebar.vue**

script 新增：

```ts
function isCollapsed(g: string) { return store.settings.sidebarCollapsed.includes(g) }
function toggleGroup(g: string) {
  const cur = store.settings.sidebarCollapsed
  const next = cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g]
  store.updateSettings({ sidebarCollapsed: next })
}
```

template 改为四个分组结构（每组标题可点 + 内容 `v-if` 控制）。示例（分类组）：

```html
<div class="group-label" @click="toggleGroup('分类')">分类 <span class="caret">{{ isCollapsed('分类') ? '▶' : '▼' }}</span></div>
<template v-if="!isCollapsed('分类')">
  <div class="row" :class="{ active: store.view.kind === 'all' }" @click="setView('all')" @contextmenu.prevent="onAllMenu">全部 <span class="cnt">{{ store.data.sites.length }}</span></div>
  <CategoryNode v-for="c in store.data.categories" :key="c.id" :cat="c" :depth="0" />
</template>
```

其余三组同样包裹（视图组包「⚠ 失效」行；标签组包标签行；系统组包回收站行）。

- [ ] **Step 2: 样式**

`src/styles/main.css` 的 `.sidebar .group-label` 追加折叠样式：

```css
.sidebar .group-label { cursor:pointer; display:flex; justify-content:space-between; align-items:center; user-select:none; }
.sidebar .group-label .caret { font-size:10px; color:var(--text-2); }
```

- [ ] **Step 3: 验证**

Run: `npm run build`
Expected: PASS。手动确认（可选）：`npm run dev` 点分组标题折叠/展开，重启后状态保持。

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.vue src/styles/main.css
git commit -m "feat: 侧边栏四分组可折叠，状态存入 settings"
```

---

### Task 5: 拖放目标 + 分类拖拽改层级（store moveCategory）

**Files:**
- Modify: `src/store/app.ts`
- Modify: `src/components/CategoryNode.vue`
- Modify: `src/components/Sidebar.vue`
- Modify: `src/styles/main.css`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `application/x-site-id`（网站拖入）、`application/x-cat-id`（分类拖入）、`application/x-tag`（标签拖入）。store `moveSites(ids, categoryId)`、`addTagsToSites(ids, tags)`（已有）。
- Produces: store `moveCategory(id: string, targetParentId: string | null)` — 把分类移到 `targetParentId` 下（null=顶级）；禁止移到自己或自己子孙、目标父分类 depth ≥ 2、或目标为自己。分类节点 draggable（dragstart 写 `application/x-cat-id`）。

- [ ] **Step 1: 写失败测试**

`src/store/app.spec.ts` 追加：

```ts
it('moveCategory moves to top level', () => {
  const s = useAppStore()
  s.data = baseData // c1(开发) → c2(前端)
  s.moveCategory('c2', null)
  expect(s.data.categories.some(c => c.id === 'c2')).toBe(true)
  expect(s.data.categories[0].children.some(c => c.id === 'c2')).toBe(false)
})

it('moveCategory moves under another category', () => {
  const s = useAppStore()
  s.data = baseData
  s.data.categories.push({ id: 'c3', name: '工具', children: [] })
  s.moveCategory('c1', 'c3')
  expect(s.data.categories.some(c => c.id === 'c1')).toBe(false)
  expect(s.data.categories.find(c => c.id === 'c3')!.children.some(c => c.id === 'c1')).toBe(true)
})

it('moveCategory rejects moving into own subtree', () => {
  const s = useAppStore()
  s.data = baseData
  s.moveCategory('c1', 'c2') // c2 是 c1 的子孙
  expect(s.data.categories[0].id).toBe('c1')
  expect(s.data.categories[0].children.some(c => c.id === 'c2')).toBe(true)
})

it('moveCategory rejects too deep target', () => {
  const s = useAppStore()
  s.data = baseData
  // baseData: c1(开发) → c2(前端)；把 c2 再挂一个子分类 c3（depth 2）
  s.data.categories[0].children[0].children.push({ id: 'c3', name: 'C', children: [] })
  s.moveCategory('c1', 'c3') // c3 已是第 3 层（depth 2），不能再作为父
  expect(s.data.categories.some(c => c.id === 'c1')).toBe(true)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — `moveCategory` 不存在。

- [ ] **Step 3: 实现 store action**

`src/store/app.ts` 中 `moveSites` 之后新增：

```ts
moveCategory(id: string, targetParentId: string | null) {
  if (id === targetParentId) return
  let node: any = null
  let from: any[] = []
  const find = (list: any[]): boolean => {
    for (const c of list) {
      if (c.id === id) { node = c; from = list; return true }
      if (find(c.children)) return true
    }
    return false
  }
  if (!find(this.data.categories) || !node) return
  if (targetParentId != null) {
    const isDescendant = (c: any): boolean => c.id === targetParentId || c.children.some(isDescendant)
    if (node.children.some(isDescendant)) return
    const targetDepth = this.flatCategories.find(f => f.id === targetParentId)?.depth ?? 0
    if (targetDepth >= 2) return
  }
  const idx = from.indexOf(node)
  if (idx >= 0) from.splice(idx, 1)
  if (targetParentId == null) {
    this.data.categories.push(node)
  } else {
    const walk = (list: any[]): boolean => {
      for (const c of list) {
        if (c.id === targetParentId) { c.children.push(node); return true }
        if (walk(c.children)) return true
      }
      return false
    }
    walk(this.data.categories)
  }
  this.persist()
},
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（4 个新测试）。

- [ ] **Step 5: 修改 CategoryNode.vue 支持拖拽**

script 新增：

```ts
function onCatDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-cat-id', props.cat.id)
  e.dataTransfer.effectAllowed = 'move'
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  const siteId = e.dataTransfer?.getData('application/x-site-id')
  if (siteId) { store.moveSites([siteId], props.cat.id); return }
  const catId = e.dataTransfer?.getData('application/x-cat-id')
  if (catId) store.moveCategory(catId, props.cat.id)
}
function onDragOver(e: DragEvent) {
  const types = e.dataTransfer?.types ?? []
  if (types.includes('application/x-site-id') || types.includes('application/x-cat-id')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    dragOver.value = true
  }
}
function onDragLeave() { dragOver.value = false }
```

state 新增 `const dragOver = ref(false)`。

template 节点 div 加：

```html
draggable="true"
:class="[(depth > 0 ? 'row sub' : 'row'), { active: store.view.kind === 'category' && store.view.id === cat.id, 'drop-over': dragOver }]"
@dragstart="onCatDragStart($event)"
@dragover="onDragOver"
@dragleave="onDragLeave"
@drop="onDrop"
```

（保留原有 `@click`/`@contextmenu` 等）

- [ ] **Step 6: 修改 Sidebar.vue 拖放目标**

「全部」行（分类组内）增加分类拖入目标（改层级为顶级）：

```html
<div class="row" :class="{ active: ..., 'drop-over': allDrop }" @click="setView('all')" @contextmenu.prevent="onAllMenu"
  @dragover="onAllDragOver" @dragleave="allDrop = false" @drop="onAllDrop">
  全部 <span class="cnt">{{ store.data.sites.length }}</span>
</div>
```

script 新增：

```ts
const allDrop = ref(false)
function onAllDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-cat-id')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    allDrop.value = true
  }
}
function onAllDrop(e: DragEvent) {
  e.preventDefault()
  allDrop.value = false
  const catId = e.dataTransfer?.getData('application/x-cat-id')
  if (catId) store.moveCategory(catId, null)
}
```

标签行增加两个能力：接收网站拖入（加标签）+ 自身可拖（作为 `application/x-tag` 源）：

```html
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
```

script 新增：

```ts
const tagDrop = ref<string | null>(null)
function onTagDragStart(e: DragEvent, t: string) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-tag', t)
  e.dataTransfer.effectAllowed = 'copy'
}
function onTagDragOver(e: DragEvent, t: string) {
  if (e.dataTransfer?.types.includes('application/x-site-id')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    tagDrop.value = t
  }
}
function onTagDrop(e: DragEvent, t: string) {
  e.preventDefault()
  tagDrop.value = null
  const siteId = e.dataTransfer?.getData('application/x-site-id')
  if (siteId) store.addTagsToSites([siteId], [t])
}
```

- [ ] **Step 7: 拖拽视觉样式**

`src/styles/main.css` 追加：

```css
.sidebar .row.drop-over, .site-table tr.drop-over, .cat-node.drop-over { outline:2px dashed var(--primary); outline-offset:-2px; background:var(--primary-t); }
```

- [ ] **Step 8: 验证**

Run: `npm test` + `npm run build`
Expected: PASS。手动（可选）验证 4 种拖拽。

- [ ] **Step 9: Commit**

```bash
git add src/store/app.ts src/store/app.spec.ts src/components/CategoryNode.vue src/components/Sidebar.vue src/styles/main.css
git commit -m "feat: 主页面拖拽（分类改层级/网站改分类/网站加标签/标签加网站）"
```

---

### Task 6: 管理页面 — 入口 + 分类页签（批量添加/批量删除）

**Files:**
- Create: `src/components/ManageView.vue`
- Create: `src/components/ManageCategories.vue`
- Modify: `src/components/TopBar.vue`
- Modify: `src/App.vue`
- Modify: `src/store/app.ts`
- Modify: `src/store/app.spec.ts`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: `store.flatCategories`、`store.addCategory(name, parentId)`、`store.updateSettings`、现有 `ConfirmModal`。`store.categoryCounts` getter（本任务新增）。
- Produces:
  - store `categoryCounts(state): Record<string, number>` — 每个分类 id → 该分类（含所有子孙）下的网站数。
  - store `deleteCategories(ids: string[], mode: 'move-to-uncategorized' | 'delete-sites')` — 批量删除分类（收集选中分类+其子树），统一处置网站。
  - `ManageView.vue`（props 无，emit `back`）；`ManageCategories.vue`（props 无）。
  - `TopBar` emit `manage`；`App.vue` 监听 `@manage` 切换 `manage` 状态。

- [ ] **Step 1: 写失败测试**

`src/store/app.spec.ts` 追加：

```ts
it('categoryCounts counts descendants', () => {
  const s = useAppStore()
  s.data = baseData
  // baseData: 站点 a,b,c 都在 c1 下；把 a 挂到 c2
  s.data.sites[0].categoryId = 'c2'
  expect(s.categoryCounts['c1']).toBe(3)
  expect(s.categoryCounts['c2']).toBe(1)
})

it('deleteCategories moves sites to uncategorized', () => {
  const s = useAppStore()
  s.data = baseData
  s.data.sites.forEach(x => x.categoryId = 'c2') // 站点都挂 c2 下
  s.deleteCategories(['c2'], 'move-to-uncategorized')
  expect(s.data.categories[0].children).toHaveLength(0)
  expect(s.data.sites.every(x => x.categoryId === null)).toBe(true)
})

it('deleteCategories with parent removes descendants too', () => {
  const s = useAppStore()
  s.data = baseData
  s.deleteCategories(['c1'], 'move-to-uncategorized')
  expect(s.data.categories).toHaveLength(0)
  expect(s.data.sites.every(x => x.categoryId === null)).toBe(true)
})

it('deleteCategories delete-sites sends sites to recycle', () => {
  const s = useAppStore()
  s.data = baseData
  s.deleteCategories(['c1'], 'delete-sites')
  expect(s.data.categories).toHaveLength(0)
  expect(s.data.sites).toHaveLength(0)
  expect(s.trashedSites).toHaveLength(3)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — `categoryCounts`/`deleteCategories` 不存在。

- [ ] **Step 3: 实现 store**

getters 中 `flatCategories` 之后新增：

```ts
categoryCounts(state): Record<string, number> {
  const counts: Record<string, number> = {}
  const parentOf = new Map<string, string>()
  const walk = (list: any[], parentId: string | null) => {
    for (const c of list) { parentOf.set(c.id, parentId); walk(c.children, c.id) }
  }
  walk(state.data.categories, null)
  for (const s of state.data.sites) {
    if (!s.categoryId) continue
    let cur: string | null = s.categoryId
    while (cur) { counts[cur] = (counts[cur] ?? 0) + 1; cur = parentOf.get(cur) ?? null }
  }
  return counts
},
```

actions 中 `deleteCategory` 之后新增：

```ts
deleteCategories(ids: string[], mode: 'move-to-uncategorized' | 'delete-sites') {
  const affected = new Set<string>()
  const collectSubtree = (c: any) => { affected.add(c.id); c.children.forEach(collectSubtree) }
  const walk = (list: any[]) => {
    for (const c of list) {
      if (ids.includes(c.id)) collectSubtree(c)
      else walk(c.children)
    }
  }
  walk(this.data.categories)
  const prune = (list: any[]) => {
    const kept = list.filter(c => !affected.has(c.id))
    kept.forEach(c => prune(c.children))
    list.length = 0
    kept.forEach(c => list.push(c))
  }
  prune(this.data.categories)
  if (mode === 'move-to-uncategorized') {
    this.data.sites.forEach(s => { if (s.categoryId && affected.has(s.categoryId)) s.categoryId = null })
  } else {
    const toDelete = this.data.sites.filter(s => s.categoryId && affected.has(s.categoryId)).map(s => s.id)
    this.deleteSites(toDelete)
  }
  this.persist()
},
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（4 个新测试）。

- [ ] **Step 5: 创建 ManageView.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import ManageCategories from './ManageCategories.vue'
import ManageTags from './ManageTags.vue'
const emit = defineEmits(['back'])
const tab = ref<'categories' | 'tags'>('categories')
</script>

<template>
  <div class="manage">
    <div class="manage-bar">
      <button class="btn" @click="emit('back')">← 返回主页面</button>
      <span class="manage-title">管理</span>
      <div class="manage-tabs">
        <button class="btn" :class="{ active: tab === 'categories' }" @click="tab = 'categories'">分类</button>
        <button class="btn" :class="{ active: tab === 'tags' }" @click="tab = 'tags'">标签</button>
      </div>
    </div>
    <div class="manage-content">
      <ManageCategories v-if="tab === 'categories'" />
      <ManageTags v-else />
    </div>
  </div>
</template>
```

- [ ] **Step 6: 创建 ManageCategories.vue**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../store/app'
import ConfirmModal from './ConfirmModal.vue'
const store = useAppStore()
const name = ref('')
const parentId = ref<string | null>(null)
const selected = ref<string[]>([])
const delMode = ref(false)
const catList = computed(() =>
  store.flatCategories.map(c => ({ ...c, count: store.categoryCounts[c.id] ?? 0 })))
function add() {
  if (!name.value.trim()) return
  const validParent = store.flatCategories.find(c => c.id === parentId.value && c.depth < 2)
  store.addCategory(name.value.trim(), validParent ? validParent.id : null)
  name.value = ''
}
function toggle(id: string) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}
function doDelete(mode: string) {
  store.deleteCategories([...selected.value], mode === 'delete' ? 'delete-sites' : 'move-to-uncategorized')
  selected.value = []
  delMode.value = false
}
</script>

<template>
  <div class="manage-cols">
    <div class="manage-card">
      <h4>批量添加分类</h4>
      <label>父分类</label>
      <select v-model="parentId">
        <option :value="null">（顶级分类）</option>
        <option v-for="c in store.flatCategories.filter(c => c.depth < 2)" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
      </select>
      <label>分类名称</label>
      <input v-model="name" placeholder="分类名" @keydown.enter="add" />
      <div class="actions"><button class="btn primary" @click="add">添加</button></div>
      <p class="muted">逐个输入，可连续添加多个。</p>
    </div>
    <div class="manage-card">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h4>分类列表</h4>
        <button class="btn danger" :disabled="!selected.length" @click="delMode = true">🗑 批量删除所选</button>
      </div>
      <div class="cat-head">
        <span class="chk-col"></span><span class="name-col">分类</span><span class="cnt-col">网站数</span>
      </div>
      <div v-for="c in catList" :key="c.id" class="cat-row">
        <span class="chk-col"><span class="cb" :class="{ checked: selected.includes(c.id) }" @click="toggle(c.id)"></span></span>
        <span class="name-col" :style="{ paddingLeft: c.depth * 14 + 'px' }">{{ c.name }}</span>
        <span class="cnt-col muted">{{ c.count }}</span>
      </div>
      <div v-if="!catList.length" class="empty">暂无分类</div>
    </div>
  </div>
  <ConfirmModal
    v-if="delMode"
    title="删除分类"
    :message="`删除所选 ${selected.length} 个分类，其中网站如何处理？`"
    :options="[{ value: 'move', label: '网站移入未分类' }, { value: 'delete', label: '连同网站删除', danger: true }]"
    hint="「连同网站删除」会把这些分类下所有网站移入回收站，可在回收站恢复。"
    @choose="doDelete"
    @close="delMode = false"
  />
</template>
```

- [ ] **Step 7: 修改 TopBar.vue**

script emit 需声明（当前未声明 emit）。改为：

```ts
const emit = defineEmits(['check-all', 'add', 'import-export', 'settings', 'manage'])
```

template 在「导入/导出」按钮前加管理按钮：

```html
<button class="btn" @click="emit('manage')">▦ 管理</button>
```

（其余按钮保持，`$emit` 用法可继续用或统一为 `emit`。）

- [ ] **Step 8: 修改 App.vue**

script 新增：

```ts
const manage = ref(false)
```

template body 改为：

```html
<div class="body">
  <ManageView v-if="manage" @back="manage = false" />
  <template v-else>
    <Sidebar />
    <main class="content">
      <RecycleView v-if="store.view.kind === 'recycle'" />
      <SiteTable v-else @edit="openEdit" @check-site="(ids: string[]) => ids.length === 1 ? store.checkOne(ids[0]) : store.checkSelected()" @move="pickIds = $event" @tag="tagIds = $event" />
    </main>
  </template>
</div>
```

import 新增 `import ManageView from './components/ManageView.vue'`。`TopBar` 加 `@manage="manage = true"`。

- [ ] **Step 9: 管理页样式**

`src/styles/main.css` 追加：

```css
/* ---- 管理页面 ---- */
.manage { grid-column:1 / -1; flex:1; display:flex; flex-direction:column; min-height:0; background:var(--bg); }
.manage-bar { display:flex; align-items:center; gap:10px; padding:8px 14px; background:var(--panel); border-bottom:1px solid var(--border); flex:none; }
.manage-title { font-weight:700; font-size:14px; }
.manage-tabs { display:flex; gap:6px; margin-left:8px; }
.manage-tabs .btn.active { background:var(--primary-t); color:var(--primary); border-color:var(--primary-t); font-weight:600; }
.manage-content { flex:1; min-height:0; overflow:auto; padding:14px; }
.manage-cols { display:grid; grid-template-columns:240px 1fr; gap:14px; align-items:start; }
.manage-card { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px; box-shadow:var(--shadow); }
.manage-card h4 { margin-bottom:10px; font-size:14px; }
.cat-head, .cat-row { display:flex; align-items:center; padding:6px 8px; font-size:13px; }
.cat-head { background:var(--bg); border-radius:var(--radius); color:var(--text-2); font-size:12px; font-weight:600; margin-bottom:4px; }
.cat-row { border-bottom:1px solid var(--border); cursor:pointer; }
.cat-row:hover { background:var(--hover); }
.chk-col { width:30px; flex:none; }
.name-col { flex:1; }
.cnt-col { width:60px; flex:none; text-align:center; }
```

- [ ] **Step 10: 验证**

Run: `npm test` + `npm run build`
Expected: PASS。

- [ ] **Step 11: Commit**

```bash
git add src/store/app.ts src/store/app.spec.ts src/components/ManageView.vue src/components/ManageCategories.vue src/components/TopBar.vue src/App.vue src/styles/main.css
git commit -m "feat: 管理页面（入口/分类页签：批量添加与批量删除）"
```

---

### Task 7: 管理页面 — 标签页签（列表/重命名/删除/合并/批量加去标签）

**Files:**
- Create: `src/components/ManageTags.vue`
- Modify: `src/store/app.ts`
- Modify: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `PromptModal`、`store.data.tags`、`store.flatCategories`。
- Produces:
  - store `renameTag(oldName: string, newName: string)` — 更新所有网站的标签名并刷新 tags。
  - store `deleteTags(tags: string[])` — 从所有网站移除这些标签并刷新 tags。
  - store `mergeTags(source: string[], target: string)` — 所有网站中属于 `source` 的标签替换为 `target`（去重），刷新 tags。
  - store `addTagsByScope(categoryId: string | null, tags: string[])` — 给某分类（含子树）下所有网站批量加标签；`null`=全部网站。
  - store `removeTagsByScope(categoryId: string | null, tags: string[])` — 批量移除。

- [ ] **Step 1: 写失败测试**

`src/store/app.spec.ts` 追加：

```ts
it('renameTag renames across sites', () => {
  const s = useAppStore()
  s.data = baseData
  s.renameTag('框架', '前端框架')
  expect(s.data.sites[0].tags).toContain('前端框架')
  expect(s.data.sites[0].tags).not.toContain('框架')
  expect(s.data.tags).toContain('前端框架')
  expect(s.data.tags).not.toContain('框架')
})

it('deleteTags removes from all sites', () => {
  const s = useAppStore()
  s.data = baseData
  s.deleteTags(['框架'])
  expect(s.data.sites.every(x => !x.tags.includes('框架'))).toBe(true)
  expect(s.data.tags).toEqual(['工具'])
})

it('mergeTags merges into target and dedups', () => {
  const s = useAppStore()
  s.data = baseData
  s.data.sites[0].tags = ['框架', '工具']
  s.mergeTags(['框架', '工具'], '全栈')
  expect(s.data.sites[0].tags).toEqual(['全栈'])
  expect(s.data.sites[2].tags).toEqual(['全栈'])
  expect(s.data.tags).toContain('全栈')
  expect(s.data.tags).not.toContain('框架')
})

it('addTagsByScope adds to category descendants only', () => {
  const s = useAppStore()
  s.data = baseData
  s.data.sites[0].categoryId = 'c2' // a 挂 c2（c1 的子树）
  s.data.sites[1].categoryId = 'c1' // b 挂 c1
  s.data.sites[2].categoryId = null // c 未分类
  s.addTagsByScope('c2', ['新标签'])
  expect(s.data.sites[0].tags).toContain('新标签')
  expect(s.data.sites[1].tags).not.toContain('新标签')
  expect(s.data.sites[2].tags).not.toContain('新标签')
})

it('addTagsByScope null applies to all', () => {
  const s = useAppStore()
  s.data = baseData
  s.addTagsByScope(null, ['全部'])
  expect(s.data.sites.every(x => x.tags.includes('全部'))).toBe(true)
})

it('removeTagsByScope removes from scope', () => {
  const s = useAppStore()
  s.data = baseData
  s.removeTagsByScope(null, ['框架'])
  expect(s.data.sites.every(x => !x.tags.includes('框架'))).toBe(true)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — 5 个新 action 不存在。

- [ ] **Step 3: 实现 store actions**

`src/store/app.ts` 中 `addTagsToSites` 之后新增：

```ts
renameTag(oldName: string, newName: string) {
  this.data.sites.forEach(s => {
    const i = s.tags.indexOf(oldName)
    if (i >= 0) s.tags[i] = newName
  })
  this.refreshTags()
},

deleteTags(tags: string[]) {
  const set = new Set(tags)
  this.data.sites.forEach(s => { s.tags = s.tags.filter(t => !set.has(t)) })
  this.refreshTags()
},

mergeTags(source: string[], target: string) {
  const set = new Set(source)
  this.data.sites.forEach(s => {
    const replaced = s.tags.map(t => set.has(t) ? target : t)
    s.tags = [...new Set(replaced)]
  })
  this.refreshTags()
},

addTagsByScope(categoryId: string | null, tags: string[]) {
  const ids = categoryId == null ? null : new Set(collectCategoryIds(this.data.categories, categoryId))
  this.data.sites.forEach(s => {
    if (ids == null || (s.categoryId && ids.has(s.categoryId))) {
      tags.forEach(t => { if (!s.tags.includes(t)) s.tags.push(t) })
    }
  })
  this.refreshTags()
},

removeTagsByScope(categoryId: string | null, tags: string[]) {
  const set = new Set(tags)
  const ids = categoryId == null ? null : new Set(collectCategoryIds(this.data.categories, categoryId))
  this.data.sites.forEach(s => {
    if (ids == null || (s.categoryId && ids.has(s.categoryId))) {
      s.tags = s.tags.filter(t => !set.has(t))
    }
  })
  this.refreshTags()
},
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS（6 个新测试）。

- [ ] **Step 5: 创建 ManageTags.vue**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../store/app'
import PromptModal from './PromptModal.vue'
const store = useAppStore()
const selected = ref<string[]>([])
const hovered = ref<string | null>(null)
const renaming = ref<string | null>(null)
const merging = ref(false)
const scopeCat = ref<string | null>(null)
const scopeTags = ref('')
const removeMode = ref(false)
const tagCounts = computed(() => {
  const m: Record<string, number> = {}
  store.data.sites.forEach(s => s.tags.forEach(t => { m[t] = (m[t] ?? 0) + 1 }))
  return m
})
function toggle(t: string) {
  const i = selected.value.indexOf(t)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(t)
}
function doRename(newName: string) {
  if (renaming.value && newName !== renaming.value) store.renameTag(renaming.value, newName)
  renaming.value = null
}
function doDelete() {
  if (selected.value.length) store.deleteTags([...selected.value])
  selected.value = []
}
function doMerge(target: string) {
  if (selected.value.length > 1 && target) store.mergeTags([...selected.value], target)
  selected.value = []
  merging.value = false
}
function doBatch() {
  const tags = scopeTags.value.split(/[#\s，,]+/).filter(Boolean)
  if (!tags.length) return
  if (removeMode.value) store.removeTagsByScope(scopeCat.value, tags)
  else store.addTagsByScope(scopeCat.value, tags)
  scopeTags.value = ''
}
</script>

<template>
  <div class="manage-cols">
    <div class="manage-card">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h4>标签列表</h4>
        <div style="display:flex;gap:6px">
          <button class="btn danger" :disabled="!selected.length" @click="doDelete">🗑 删除所选</button>
          <button class="btn" :disabled="selected.length < 2" @click="merging = true">🔗 合并所选</button>
        </div>
      </div>
      <div class="cat-head">
        <span class="chk-col"></span><span class="name-col">标签</span><span class="cnt-col">网站数</span>
      </div>
      <div v-for="t in store.data.tags" :key="t" class="cat-row"
        @mouseenter="hovered = t" @mouseleave="hovered = null">
        <span class="chk-col"><span class="cb" :class="{ checked: selected.includes(t) }" @click="toggle(t)"></span></span>
        <span class="name-col"># {{ t }}
          <span v-if="hovered === t" class="btn mini" style="margin-left:6px" @click="renaming = t">✎ 重命名</span>
        </span>
        <span class="cnt-col muted">{{ tagCounts[t] ?? 0 }}</span>
      </div>
      <div v-if="!store.data.tags.length" class="empty">暂无标签</div>
    </div>
    <div class="manage-card">
      <h4>批量加/去标签</h4>
      <div class="mode-row">
        <label><input type="radio" :checked="!removeMode" @change="removeMode = false" /> 批量添加</label>
        <label style="margin-left:10px"><input type="radio" :checked="removeMode" @change="removeMode = true" /> 批量去除</label>
      </div>
      <label>标签（空格分隔）</label>
      <input v-model="scopeTags" placeholder="标签1 标签2" />
      <label>分类范围</label>
      <select v-model="scopeCat">
        <option :value="null">全部网站</option>
        <option v-for="c in store.flatCategories" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
      </select>
      <div class="actions">
        <button class="btn primary" @click="doBatch">{{ removeMode ? '批量去除' : '批量添加' }}</button>
      </div>
      <p class="muted">按所选分类范围（含其子分类）批量应用；选「全部网站」则作用于全部。</p>
    </div>
  </div>
  <PromptModal v-if="renaming" :title="'重命名标签'" :initial="renaming" hint="修改后所有网站的该标签同步更新。" @confirm="doRename" @close="renaming = null" />
  <PromptModal v-if="merging" :title="'合并标签'" :initial="selected[0]" hint="所选标签合并为目标标签：网站上的标签统一替换，被合并的标签自动消失。" @confirm="doMerge" @close="merging = false" />
</template>
```

- [ ] **Step 6: mini 按钮样式**

`src/styles/main.css` 追加：

```css
.btn.mini { padding:1px 8px; font-size:11px; }
```

- [ ] **Step 7: 验证**

Run: `npm test` + `npm run build`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/store/app.ts src/store/app.spec.ts src/components/ManageTags.vue src/styles/main.css
git commit -m "feat: 管理页标签页签（重命名/删除/合并/批量加去标签）"
```

---

### Task 8: 主题下拉框 + 小窗口滚动修复

**Files:**
- Modify: `src/components/SettingsModal.vue`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: `store.settings.theme`、`store.updateSettings({ theme })`。
- Produces: 主题分区 radio 改为 `<select>`（system/light/dark 三档）。`.body > *` 加 `min-height:0` 使侧边栏/内容区正确滚动、状态栏不被裁切。

- [ ] **Step 1: 修改 SettingsModal.vue**

`setTheme` 改为接收字符串：

```ts
function setTheme(t: string) {
  store.updateSettings({ theme: (['system', 'light', 'dark'].includes(t) ? t : 'system') as 'system' | 'light' | 'dark' })
}
```

template 主题分区（第 30-36 行）替换：

```html
<template v-if="section === 'theme'">
  <label>主题模式</label>
  <select :value="store.settings.theme" @change="setTheme(($event.target as HTMLSelectElement).value)">
    <option value="system">跟随系统</option>
    <option value="light">亮色</option>
    <option value="dark">暗色</option>
  </select>
  <p class="muted">跟随系统：启动时读取系统主题，运行中不实时切换。</p>
</template>
```

- [ ] **Step 2: 小窗口滚动修复**

`src/styles/main.css` 中 `.body` 规则追加：

```css
.body > * { min-height:0; }
```

（`overflow:auto` 的 `.sidebar`/`.content` 已存在，补 `min-height:0` 让其在矮窗口中正确收缩滚动；`.statusbar` 为 `flex:none` 常驻。）

- [ ] **Step 3: 验证**

Run: `npm run build`
Expected: PASS。手动（可选）：设置弹窗主题改为下拉框并生效；缩小窗口侧边栏可滚动、状态栏可见。

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsModal.vue src/styles/main.css
git commit -m "feat: 主题改为下拉框；修复小窗口侧边栏/状态栏被裁切"
```

---

### Task 9: 全量验证与打包

**Files:**
- 无新文件。

- [ ] **Step 1: 全量测试**

Run: `npm test` + `cargo test`（`src-tauri/`）
Expected: PASS（前端 store 全部用例 + Rust 全部用例）。

- [ ] **Step 2: 类型与构建**

Run: `npm run build`
Expected: PASS（vue-tsc 无错误，vite build 完成）。

- [ ] **Step 3: 打包**

Run: `npm run tauri build`
Expected: 生成 exe / msi / nsis 安装包无错误。

- [ ] **Step 4: 手动冒烟（可选但推荐）**

运行打包产物或 `npm run tauri dev`，验证：
- 左键/Ctrl/Shift 选中、表头全选、打开链接按钮；
- 4 种拖拽（分类改层级、网站改分类、网站加标签、标签加网站）；
- 管理页分类批量添加/删除、标签重命名/删除/合并/批量加去标签；
- 侧边栏折叠且重启保持；缩小窗口滚动正常；
- 主题下拉框切换亮/暗/跟随。

- [ ] **Step 5: Commit（如有遗漏修复）**

```bash
git add -A
git commit -m "feat: 归集 v1.2 交互与管理完整交付"
```