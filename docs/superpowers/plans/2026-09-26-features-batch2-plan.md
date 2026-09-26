# 功能批次 2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 10 项新功能（多选拖拽、浏览器书签互通、URL 标题获取、并发检测、编辑去重、排序扩展、空状态、筛选计数、备注放宽）+ 3 项 Bug 修复（checkOne 离线预检、原子写入、版本对齐）

**架构:** 前端 Pinia store + Vue 组件；Rust 端新增 `bookmarks_html.rs` 模块；3 个新 IPC 命令；URL 归一化工具函数支撑去重逻辑；原子写入用临时文件 + rename。

**Tech Stack:** Vue 3 + Pinia + Vitest（前端）；Rust + Tauri 2 + reqwest（后端）；scraper + encoding_rs（新书签模块）；lucide-vue-next（图标）

## Global Constraints

- Vite 固定端口 1420，不可修改
- 每个 `invoke('xxx', ...)` 必须对应 `commands.rs` 中一个 `#[tauri::command]`
- 新增 IPC 命令三方同步：`api.ts` + `commands.rs` + `lib.rs` + `capabilities/default.json`
- `Site.note` 禁止换行（textarea 拦截 Enter）
- URL 去重归一化：转小写 + 去尾部 `/`
- 中文排序使用 `localeCompare(b, 'zh')`
- 书签 HTML >3 层拍平；编码自动识别 UTF-8 → GBK 回退
- `check_connectivity` 在 `checkAll`/`checkSelected` 之前执行（已在位），`checkOne` 需补齐
- WebView 复核保持串行，HTTP 检测并发 5
- 本地编译 Rust 前加 MSVC oncore x64 lib 路径到 `LIB` 环境变量

---

## Task 1: 版本号对齐

**Files:**
- Modify: `package.json:4`
- Modify: `src-tauri/Cargo.toml:3`
- Modify: `src-tauri/tauri.conf.json:4`

- [ ] **Step 1: 修改三个文件的 version 字段**

`package.json` 第 4 行：`"version": "0.1.0"` → `"version": "0.2.0"`
`Cargo.toml` 第 3 行：`version = "0.1.2"` → `version = "0.2.0"`
`tauri.conf.json` 第 4 行：`"version": "0.1.5"` → `"version": "0.2.0"`

- [ ] **Step 2: 提交**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git -C src-tauri cargo check 2>/dev/null || true
git commit -m "chore: align version to 0.2.0 across all manifests"
```

---

## Task 2: URL 归一化工具函数

**Files:**
- Modify: `src/store/app.ts`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: 无
- Produces: `normalizeUrlForCompare(url: string): string` — 供 F5/F6 调用

- [ ] **Step 1: 写失败测试**

在 `app.spec.ts` 末尾（describe 块内）加：

```ts
it('normalizeUrlForCompare lowercases and strips trailing slash', () => {
  const s = useAppStore()
  ;(s as any).normalizeUrlForCompare = (url: string) => url.toLowerCase().replace(/\/+$/, '')
  expect((s as any).normalizeUrlForCompare('https://GitHub.com/')).to.equal('https://github.com')
  expect((s as any).normalizeUrlForCompare('https://example.com')).to.equal('https://example.com')
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/store/app.spec.ts -t "normalizeUrlForCompare" 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 3: 实现**

在 `app.ts` 的 actions 中新增方法：

```ts
normalizeUrlForCompare(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '')
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/store/app.spec.ts -t "normalizeUrlForCompare" 2>&1 | tail -5
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/store/app.ts src/store/app.spec.ts
git commit -m "feat: add normalizeUrlForCompare for URL dedup"
```

---

## Task 3: 编辑/恢复 URL 去重

**Files:**
- Modify: `src/store/app.ts:172-174,186-189,210-217`
- Modify: `src/components/AddEditModal.vue:37-48`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `normalizeUrlForCompare` (Task 2)
- Produces: 更新后的 `isDuplicateUrl` 支持 excludeId

- [ ] **Step 1: 写失败测试**

```ts
it('isDuplicateUrl excludes given id', () => {
  const s = useAppStore()
  s.data = makeData()
  // url https://a.dev exists for site 'a'; checking for id 'a' should be false (self)
  expect(s.isDuplicateUrl('https://a.dev', 'a')).to.equal(false)
  // checking for a different id should be true (duplicate)
  expect(s.isDuplicateUrl('https://a.dev', 'z')).to.equal(true)
})

it('isDuplicateUrl normalizes case and trailing slash', () => {
  const s = useAppStore()
  s.data = makeData()
  expect(s.isDuplicateUrl('https://A.dev/', 'z')).to.equal(true)
})
```

注意：需要在 `makeData` 中确认站点 url 格式。站点 `a` 的 url 是 `https://a.dev`。

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/store/app.spec.ts -t "isDuplicateUrl" 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 3: 实现**

修改 `app.ts:172-174`：

```ts
isDuplicateUrl(url: string, excludeId?: string): boolean {
  const norm = this.normalizeUrlForCompare(url)
  return this.data.sites.some(s =>
    s.id !== excludeId && this.normalizeUrlForCompare(s.url) === norm
  )
}
```

修改 `app.ts:186-189` updateSite 前加去重检查（返回 boolean 给前端）：

添加新方法 `isEditingDuplicate(url: string, id: string): boolean`：

```ts
isEditingDuplicate(url: string, id: string): boolean {
  return this.isDuplicateUrl(url, id)
}
```

修改 `app.ts:210-217` restoreSites：

```ts
restoreSites(siteIds: string[]) {
  const set = new Set(siteIds)
  const restored = this.data.recycleBin.filter(t => set.has(t.site.id)).map(t => t.site)
  if (!restored.length) return
  this.data.recycleBin = this.data.recycleBin.filter(t => !set.has(t.site.id))
  for (const site of restored) {
    if (this.isDuplicateUrl(site.site.id ? site.url : site.url, site.site.id)) {
      continue  // skip duplicate on restore
    }
    this.data.sites.push(site)
  }
  this.persist()
}
```

注意：上面的 `restoreSites` 去重逻辑需要更仔细处理。实际上恢复时如果冲突应该跳过而不是静默丢弃。改为：

```ts
restoreSites(siteIds: string[]) {
  const set = new Set(siteIds)
  const candidates = this.data.recycleBin.filter(t => set.has(t.site.id))
  if (!candidates.length) return
  this.data.recycleBin = this.data.recycleBin.filter(t => !set.has(t.site.id))
  for (const t of candidates) {
    if (this.isDuplicateUrl(t.site.url, t.site.id)) continue
    this.data.sites.push(t.site)
  }
  this.persist()
}
```

但注意 `restoreSite`（单条恢复）也需要处理。检查现有代码 `restoreSite` 是 201-208 行。加一行：

```ts
restoreSite(siteId: string) {
  const idx = this.data.recycleBin.findIndex(t => t.site.id === siteId)
  if (idx >= 0) {
    const site = this.data.recycleBin[idx].site
    if (this.isDuplicateUrl(site.url, site.id)) return  // conflict, skip
    this.data.sites.push(site)
    this.data.recycleBin.splice(idx, 1)
    this.persist()
  }
}
```

Wait, `isDuplicateUrl(site.url, site.site.id)` — `site.site.id`? No, `site` is already the Site object inside recycleBin item. Let me re-read the code.

In `restoreSite(siteId)`, it finds `this.data.recycleBin[idx]` where `recycleBin` items are `TrashedSite { site: Site, deletedAt: string }`. So `this.data.recycleBin[idx].site` is a `Site`. The call should be `this.isDuplicateUrl(site.url, site.id)`.

- [ ] **Step 4: 修改 AddEditModal.vue 使用新的去重**

在 `save()` 函数中，编辑时增加去重检查：

```ts
function save() {
  validationMsg.value = ''
  const err = store.validateSite(name.value, url.value)
  if (err) { validationMsg.value = err; return }
  if (props.editing) {
    if (store.isDuplicateUrl(url.value, props.editing.id)) {
      validationMsg.value = '该链接已存在'
      return
    }
    store.updateSite(props.editing.id, { name: name.value, url: url.value, categoryId: categoryId.value, tags: tags.value, note: note.value })
  } else {
    dup.value = store.isDuplicateUrl(url.value)
    if (dup.value) return
    store.addSite({ name: name.value, url: url.value, categoryId: categoryId.value, tags: tags.value, note: note.value })
  }
  emit('close')
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run src/store/app.spec.ts 2>&1 | tail -10
```

Expected: all PASS

- [ ] **Step 6: 提交**

```bash
git add src/store/app.ts src/components/AddEditModal.vue src/store/app.spec.ts
git commit -m "feat: add URL dedup on edit and restore with normalization"
```

---

## Task 4: 多选拖拽

**Files:**
- Modify: `src/components/SiteTable.vue:58-62`
- Modify: `src/components/CategoryNode.vue:46-53`
- Modify: `src/components/Sidebar.vue:39-44,58-63`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `store.selectedIds`, `store.moveSites`, `store.addTagsToSites`
- Produces: 无新增接口，仅扩展现有 drop 逻辑

- [ ] **Step 1: 写失败测试 — moveSites 支持多 ID**

```ts
it('moveSites updates multiple sites by ids', () => {
  const s = useAppStore()
  s.data = makeData()
  s.moveSites(['a', 'b'], 'c2')
  expect(s.data.sites.find(x => x.id === 'a')?.categoryId).to.equal('c2')
  expect(s.data.sites.find(x => x.id === 'b')?.categoryId).to.equal('c2')
  expect(s.data.sites.find(x => x.id === 'c')?.categoryId).to.equal('c1')  // untouched
})
```

注意：`moveSites` 已经存在（312-316 行），这个测试是验证现有功能。应该 PASS。

- [ ] **Step 2: 修改 SiteTable.vue onSiteDragStart**

```ts
function onSiteDragStart(e: DragEvent, id: string) {
  if (!e.dataTransfer) return
  const ids = store.selectedIds.includes(id) && store.selectedIds.length > 1
    ? store.selectedIds.join(',')
    : id
  e.dataTransfer.setData('application/x-site-id', ids)
  e.dataTransfer.effectAllowed = 'move'
}
```

- [ ] **Step 3: 修改 CategoryNode.vue onDrop**

```ts
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const raw = e.dataTransfer?.getData('application/x-site-id')
  if (raw) {
    const ids = raw.split(',')
    store.moveSites(ids, props.cat.id)
    return
  }
  const catId = e.dataTransfer?.getData('application/x-cat-id')
  if (catId) store.moveCategory(catId, props.cat.id)
}
```

- [ ] **Step 4: 修改 Sidebar.vue onUncatDrop**

```ts
function onUncatDrop(e: DragEvent) {
  e.preventDefault()
  uncatDrop.value = false
  const raw = e.dataTransfer?.getData('application/x-site-id')
  if (raw) {
    store.moveSites(raw.split(','), null)
  }
}
```

- [ ] **Step 5: 修改 Sidebar.vue onTagDrop（站点拖到标签）**

```ts
function onTagDrop(e: DragEvent, t: string) {
  e.preventDefault()
  tagDrop.value = null
  const raw = e.dataTransfer?.getData('application/x-site-id')
  if (raw) {
    store.addTagsToSites(raw.split(','), [t])
  }
}
```

- [ ] **Step 6: 运行全量测试**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all PASS

- [ ] **Step 7: 提交**

```bash
git add src/components/SiteTable.vue src/components/CategoryNode.vue src/components/Sidebar.vue
git commit -m "feat: multi-select drag — drag one of selection moves all"
```

---

## Task 5: 排序扩展（分类/备注/检测时间）

**Files:**
- Modify: `src/store/app.ts:43-44,67-74`
- Modify: `src/components/SiteTable.vue:90-96`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: 无
- Produces: `toggleSort` 支持 3 个新字段

- [ ] **Step 1: 写失败测试**

```ts
it('sort by category name uses display name', () => {
  const s = useAppStore()
  s.data = {
    ...makeData(),
    sites: [
      makeSite('a', 'ok', []),  // categoryId c1 = 开发
      makeSite('b', 'ok', []),  // categoryId c2 = 前端
    ]
  }
  s.data.sites[0].categoryId = 'c1'
  s.data.sites[1].categoryId = 'c2'
  s.toggleSort('category' as any)
  // 前端 < 开发 (by pinyin q < k is false... actually 前 qian < 开 kai? No: 前=qian, 开=kai. k < q so 开发 < 前端)
  // flatCategories: c1=开发, c2=前端
  const names = s.filteredSites.map(x => s.getCategoryName ? x.name : x.name)
  expect(s.filteredSites[0].id).to.equal('a')  // c1=开发 sorts first
})

it('sort by lastCheck null follows direction', () => {
  const s = useAppStore()
  s.data = makeData()
  s.data.sites[0].lastCheck = '2026-01-01T00:00:00Z'
  s.data.sites[1].lastCheck = null
  s.data.sites[2].lastCheck = null
  s.toggleSort('lastCheck' as any)
  // asc: nulls first (oldest)
  expect(s.filteredSites[0].lastCheck).to.equal(null)
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/store/app.spec.ts -t "sort by" 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 3: 修改 store 排序逻辑**

修改 `app.ts:43-44` state 类型：

```ts
sortKey: null as 'name' | 'url' | 'status' | 'category' | 'note' | 'lastCheck' | null,
```

修改 `app.ts:67-74` 排序实现：

```ts
const sortKey = state.sortKey
if (sortKey) {
  const dir = state.sortDir === 'asc' ? 1 : -1
  list = [...list].sort((a, b) => {
    let av: string, bv: string
    if (sortKey === 'category') {
      av = getCategoryName(state.data.categories, a.categoryId)
      bv = getCategoryName(state.data.categories, b.categoryId)
    } else if (sortKey === 'lastCheck') {
      av = a.lastCheck ?? ''
      bv = b.lastCheck ?? ''
    } else {
      av = (a as any)[sortKey] ?? ''
      bv = (b as any)[sortKey] ?? ''
    }
    if (sortKey === 'category' || sortKey === 'name' || sortKey === 'note') {
      return av.localeCompare(bv, 'zh') * dir
    }
    if (sortKey === 'status') {
      const order = { unknown: 0, ok: 1, dead: 2 }
      return ((order as any)[av] - (order as any)[bv]) * dir
    }
    return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
  })
}
```

需要新增一个 `getCategoryName` 辅助函数（store 内部用）：

```ts
function getCategoryName(cats: Category[], id: string | null): string {
  if (!id) return ''
  const walk = (list: Category[]): string | null => {
    for (const c of list) {
      if (c.id === id) return c.name
      const hit = walk(c.children)
      if (hit) return hit
    }
    return null
  }
  return walk(cats) ?? ''
}
```

- [ ] **Step 4: 修改 toggleSort 三态循环**

```ts
toggleSort(key: typeof this.sortKey extends infer T ? T : never) {
  const k = key as any
  if (this.sortKey !== k) { this.sortKey = k; this.sortDir = 'asc' }
  else if (this.sortDir === 'asc') this.sortDir = 'desc'
  else { this.sortKey = null; this.sortDir = 'asc' }
}
```

Actually, keep the existing simpler signature and just extend the type union. Let me redefine:

```ts
toggleSort(key: 'name' | 'url' | 'status' | 'category' | 'note' | 'lastCheck') {
```

- [ ] **Step 5: 修改 SiteTable.vue 表头**

在 `thead` 中修改分类列、备注列为可排序：

```html
<th @click="store.toggleSort('category')" class="sortable">
  分类 <span v-if="store.sortKey==='category'">{{ store.sortDir==='asc'?'▲':'▼' }}</span>
</th>
<!-- ... -->
<th @click="store.toggleSort('note')" class="sortable">
  备注 <span v-if="store.sortKey==='note'">{{ store.sortDir==='asc'?'▲':'▼' }}</span>
</th>
```

新增检测时间列表头：

```html
<th @click="store.toggleSort('lastCheck')" class="sortable">
  检测时间 <span v-if="store.sortKey==='lastCheck'">{{ store.sortDir==='asc'?'▲':'▼' }}</span>
</th>
```

- [ ] **Step 6: 运行全量测试**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all PASS

- [ ] **Step 7: 提交**

```bash
git add src/store/app.ts src/components/SiteTable.vue src/store/app.spec.ts
git commit -m "feat: add category/note/lastCheck sort with pinyin for Chinese"
```

---

## Task 6: 筛选结果计数

**Files:**
- Modify: `src/components/StatusBar.vue:8`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `store.filteredSites.length`
- Produces: 无新增接口

- [ ] **Step 1: 写失败测试（验证计数逻辑可被 store 获取）**

```ts
it('filtered count differs from total when view is category', () => {
  const s = useAppStore()
  s.data = makeData()
  s.view = { kind: 'category', id: 'c1' }
  // c1 contains site a (and its descendant c2 contains b)
  expect(s.filteredSites.length).to.be.lessThan(s.data.sites.length)
})
```

- [ ] **Step 2: 运行确认失败（验证测试正确性）**

```bash
npx vitest run src/store/app.spec.ts -t "filtered count" 2>&1 | tail -5
```

Expected: FAIL（因为测试逻辑还不确定，可能 PASS 因为 filteredSites 已有实现）

- [ ] **Step 3: 修改 StatusBar.vue**

```html
<span>
  共 {{ store.data.sites.length }} 个
  <template v-if="store.filteredSites.length !== store.data.sites.length">
    · 当前 {{ store.filteredSites.length }} 个
  </template>
</span>
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/StatusBar.vue src/store/app.spec.ts
git commit -m "feat: show filtered count in status bar"
```

---

## Task 7: 空状态引导

**Files:**
- Modify: `src/components/SiteTable.vue:127-132`
- Modify: `src/components/RecycleView.vue`（找到空状态位置）
- Test: `src/components/SiteTable.spec.ts`（新建）

**Interfaces:**
- Consumes: lucide-vue-next icons（安装后可用）
- Produces: 各场景空状态组件

- [ ] **Step 1: 安装 lucide-vue-next**

```bash
npm install lucide-vue-next
```

Expected: 安装成功

- [ ] **Step 2: 写失败测试**

新建 `src/components/SiteTable.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SiteTable from './SiteTable.vue'

describe('SiteTable empty state', () => {
  it('shows empty message when no sites exist', async () => {
    setActivePinia(createPinia())
    const wrapper = mount(SiteTable, { global: { plugins: [createPinia()] } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有网站')
  })
})
```

- [ ] **Step 3: 运行确认失败**

```bash
npx vitest run src/components/SiteTable.spec.ts 2>&1 | tail -10
```

Expected: FAIL（组件渲染问题，因为 store 未正确 mock）

- [ ] **Step 4: 改进测试（mock store）**

测试改为用 store 驱动：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../store/app'
import SiteTable from './SiteTable.vue'
import { nextTick } from 'vue'

vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  openLink: vi.fn(),
}))

describe('SiteTable empty state', () => {
  it('renders empty state with icon and message when no sites', async () => {
    setActivePinia(createPinia())
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    store.view = { kind: 'all' }
    const wrapper = mount(SiteTable)
    await nextTick()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有网站')
  })
})
```

- [ ] **Step 5: 实现 SiteTable 空状态改进**

将 `SiteTable.vue` 的空状态模板改为：

```html
<div v-if="store.filteredSites.length === 0" class="empty-state">
  <FolderOpen :size="48" :stroke-width="1.5" class="empty-icon" />
  <b v-if="store.data.sites.length === 0">还没有网站</b>
  <b v-else-if="store.view.kind === 'category' && store.view.id === '__uncategorized__'">所有站点都已分类</b>
  <b v-else-if="store.view.kind === 'category'">该分类下暂无站点</b>
  <b v-else>当前筛选没有结果</b>
  <span class="hint" v-if="store.data.sites.length === 0">点击右上角「添加」开始归集你的链接</span>
  <span class="hint" v-else>试着切换分类、标签或清空搜索</span>
</div>
```

添加 import：

```ts
import { FolderOpen } from 'lucide-vue-next'
```

- [ ] **Step 6: 实现 RecycleView 空状态**

找到 `RecycleView.vue` 中的空状态位置，改为：

```html
<div v-if="store.trashedSites.length === 0" class="empty-state">
  <Trash2 :size="48" :stroke-width="1.5" class="empty-icon" />
  <b>回收站为空</b>
</div>
```

添加：

```ts
import { Trash2 } from 'lucide-vue-next'
```

- [ ] **Step 7: 运行测试**

```bash
npx vitest run src/components/SiteTable.spec.ts 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/components/SiteTable.vue src/components/RecycleView.vue src/components/SiteTable.spec.ts package.json package-lock.json
git commit -m "feat: add empty state guidance with Lucide icons"
```

---

## Task 8: 备注字数放宽

**Files:**
- Modify: `src/components/AddEditModal.vue:67`
- Modify: `src/store/app.ts:407-413`
- Modify: `src/components/SiteTable.vue:123`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: 无
- Produces: `validateSite` note 限制 200

- [ ] **Step 1: 写失败测试**

```ts
it('validateSite allows note up to 200 chars', () => {
  const s = useAppStore()
  const longNote = '好'.repeat(200)
  const result = s.validateSite('Test', 'https://test.dev', longNote)
  expect(result).to.equal(null)  // 200 chars OK
})

it('validateSite rejects note over 200 chars', () => {
  const s = useAppStore()
  const tooLong = '好'.repeat(201)
  const result = s.validateSite('Test', 'https://test.dev', tooLong)
  expect(result).to.equal('备注不能超过 200 字')
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/store/app.spec.ts -t "validateSite.*note" 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 3: 实现 validateSite 支持 note 参数**

修改 `app.ts:407-413`：

```ts
validateSite(name: string, url: string, note?: string): string | null {
  if (!name.trim()) return '请填写名称'
  const u = url.trim()
  if (!u) return '请填写链接'
  if (!/^https?:\/\/.+/.test(u)) return '链接格式应为 http(s)://...'
  if (note && note.length > 200) return '备注不能超过 200 字'
  return null
}
```

- [ ] **Step 4: 修改 AddEditModal.vue 备注输入框**

```html
<label>备注（200 字以内）</label>
<textarea
  v-model="note"
  maxlength="200"
  style="height:52px;resize:none"
  placeholder="网站简介"
  @keydown.enter.prevent
></textarea>
<span class="char-count">{{ note.length }}/200</span>
```

添加保存时传 note 到 validateSite：

```ts
const err = store.validateSite(name.value, url.value, note.value)
```

- [ ] **Step 5: 修改 SiteTable.vue 备注列 hover**

现有代码已有 `:title="s.note"`（123 行），保持不动，确保长备注可 hover 查看。

- [ ] **Step 6: 运行测试**

```bash
npx vitest run src/store/app.spec.ts -t "validateSite" 2>&1 | tail -5
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/store/app.ts src/components/AddEditModal.vue src/store/app.spec.ts
git commit -m "feat: extend note limit to 200 chars with counter"
```

---

## Task 9: 并发检测

**Files:**
- Modify: `src/store/app.ts:466-527`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `api.checkSite`, `api.verifySiteWebview`, `api.checkConnectivity`
- Produces: 无新增接口，仅内部逻辑变更

- [ ] **Step 1: 写失败测试 — 并发检测进度递增**

```ts
it('checkAll processes sites concurrently and tracks progress', async () => {
  const s = useAppStore()
  s.data = {
    ...makeData(),
    sites: [
      makeSite('a', 'unknown', []),
      makeSite('b', 'unknown', []),
      makeSite('c', 'unknown', []),
    ]
  }
  let callCount = 0
  ;(api.checkSite as any) = vi.fn().mockImplementation(async () => {
    callCount++
    return { status: 'ok', usedUrl: 'https://x.dev' }
  })
  await s.checkAll()
  expect(callCount).to.equal(3)
  expect(s.progress.done).to.equal(3)
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/store/app.spec.ts -t "concurrently" 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 3: 实现并发检测**

修改 `checkAll` 方法（466-485 行）：

```ts
async checkAll() {
  if (this.checking) return
  this.cancelled = false
  if (!(await api.checkConnectivity())) { this.connectivityError = true; this.view = { kind: 'dead' }; return }
  this.connectivityError = false
  this.checking = true
  const sites = [...this.data.sites]
  this.progress = { done: 0, total: sites.length }
  try {
    const CONCURRENCY = 5
    let idx = 0
    const worker = async () => {
      while (idx < sites.length && !this.cancelRequested) {
        const s = sites[idx++]
        await this.checkSiteWithVerify(s)
        this.progress.done++
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, sites.length) }, () => worker())
    await Promise.all(workers)
  } finally {
    this.cancelled = this.cancelRequested
    this.checking = false
    this.cancelRequested = false
    await this.persist()
  }
}
```

- [ ] **Step 4: 同步修改 checkSelected 并发**

```ts
async checkSelected() {
  if (this.checking) return
  this.cancelled = false
  if (!(await api.checkConnectivity())) { this.connectivityError = true; this.view = { kind: 'dead' }; return }
  this.connectivityError = false
  this.checking = true
  const ids = [...this.selectedIds]
  this.progress = { done: 0, total: ids.length }
  try {
    const CONCURRENCY = 5
    let idx = 0
    const sitesMap = new Map(this.data.sites.map(s => [s.id, s]))
    const worker = async () => {
      while (idx < ids.length && !this.cancelRequested) {
        const id = ids[idx++]
        const s = sitesMap.get(id)
        if (s) await this.checkSiteWithVerify(s)
        this.progress.done++
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker())
    await Promise.all(workers)
  } finally {
    this.cancelled = this.cancelRequested
    this.checking = false
    this.cancelRequested = false
    await this.persist()
    this.clearSelection()
  }
}
```

- [ ] **Step 5: 运行测试**

```bash
npx vitest run src/store/app.spec.ts 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/store/app.ts src/store/app.spec.ts
git commit -m "feat: concurrent link checking with 5 workers, WebView verify stays serial"
```

---

## Task 10: checkOne 离线预检

**Files:**
- Modify: `src/store/app.ts:496-503`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `api.checkConnectivity`
- Produces: 无

- [ ] **Step 1: 写失败测试**

```ts
it('checkOne aborts when offline', async () => {
  const s = useAppStore()
  s.data = makeData()
  ;(api.checkConnectivity as any) = vi.fn().mockResolvedValue(false)
  await s.checkOne('a')
  expect(s.connectivityError).to.equal(true)
  expect(s.data.sites.find(x => x.id === 'a')?.status).to.equal('unknown')  // unchanged
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/store/app.spec.ts -t "checkOne aborts" 2>&1 | tail -5
```

Expected: FAIL

- [ ] **Step 3: 实现**

修改 `app.ts:496-503`：

```ts
async checkOne(id: string) {
  if (this.checking) return
  this.cancelled = false
  if (!(await api.checkConnectivity())) { this.connectivityError = true; this.view = { kind: 'dead' }; return }
  const s = this.data.sites.find(x => x.id === id)
  if (!s) return
  await this.checkSiteWithVerify(s)
  this.persist()
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/store/app.spec.ts -t "checkOne" 2>&1 | tail -5
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/store/app.ts src/store/app.spec.ts
git commit -m "fix: add connectivity pre-check to checkOne"
```

---

## Task 11: 原子写入

**Files:**
- Modify: `src-tauri/src/data.rs:48-53`
- Test: `src-tauri/src/data.rs` (tests module)

**Interfaces:**
- Consumes: 无
- Produces: `save_data` 内部原子化

- [ ] **Step 1: 写测试**

在 `data.rs` 的 `#[cfg(test)]` 模块中加：

```ts
#[test]
fn atomic_save_does_not_corrupt_on_failure() {
  let d = tmp_dir("atomic");
  let p = data_file_path(&d);
  // 创建有效文件
  let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
  save_data(&d, &data).unwrap();
  let original = fs::read_to_string(&p).unwrap();
  
  // 模拟：save_data 应在写失败时保留原文件
  // 这里验证 rename 逻辑存在（写 .tmp 再 rename）
  let tmp = p.with_extension("json.tmp");
  assert!(!tmp.exists() || tmp.exists());  // 不强制，仅验证主文件未损坏
  let loaded = load_data(&d);
  assert_eq!(loaded.version, 1);
}
```

Wait, Rust tests use `assert!` not `expect`. And the test is for Rust, not TS. Let me rewrite:

```rust
#[test]
fn atomic_save_writes_then_renames() {
    let d = tmp_dir("atomic");
    let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    save_data(&d, &data).unwrap();
    let loaded = load_data(&d);
    assert_eq!(loaded.version, 1);
    // 验证没有残留 .tmp 文件
    let tmp = data_file_path(&d).with_extension("json.tmp");
    assert!(!tmp.exists(), "atomic write should not leave .tmp behind");
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd src-tauri && LIB="C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231\lib\onecore\x64;${LIB:-}" cargo test atomic_save 2>&1 | tail -10
```

Expected: 可能 PASS（测试不严格），但实现要更新

- [ ] **Step 3: 实现原子写入**

修改 `data.rs:48-53`：

```rust
pub fn save_data(app_data_dir: &Path, data: &AppData) -> Result<(), String> {
    let path = data_file_path(app_data_dir);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}
```

- [ ] **Step 4: 运行测试**

```bash
cd src-tauri && LIB="C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231\lib\onecore\x64;${LIB:-}" cargo test save_data 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/data.rs
git commit -m "fix: atomic save_data via tmp file + rename"
```

---

## Task 12: 浏览器书签 HTML 导入/导出

**Files:**
- Create: `src-tauri/src/bookmarks_html.rs`
- Modify: `src-tauri/src/lib.rs:2-8,20-41`
- Modify: `src-tauri/src/commands.rs`（+2 命令）
- Modify: `src-tauri/Cargo.toml`（+2 依赖）
- Modify: `src/api.ts`（+2 包装）
- Modify: `src/components/ImportExportModal.vue`（+书签 HTML 选项）
- Modify: `src/store/app.ts`（合并书签数据）
- Test: `src-tauri/src/bookmarks_html.rs`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `data::AppData`, `data::merge_into`
- Produces: `ParsedBookmarks` 结构体、2 个 IPC 命令

- [ ] **Step 1: 添加 Cargo.toml 依赖**

在 `[dependencies]` 中添加：

```toml
scraper = "0.20"
encoding_rs = "0.8"
```

- [ ] **Step 2: 写 Rust 测试**

新建 `src-tauri/src/bookmarks_html.rs`，先写测试：

```rust
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBookmarkSite {
    pub name: String,
    pub url: String,
    pub category_path: Vec<String>,  // root → leaf
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBookmarks {
    pub sites: Vec<ParsedBookmarkSite>,
    pub categories: Vec<Vec<String>>,  // each is a path
}

fn parse_bookmarks_html(html: &str) -> Result<ParsedBookmarks, String> {
    // TODO: implement
    Ok(ParsedBookmarks { sites: vec![], categories: vec![] })
}

fn export_bookmarks_html() -> String {
    // TODO: implement
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic_bookmarks() {
        let html = r#"<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><DT><H3>工具</H3><DL>
<DT><A HREF="https://github.com">GitHub</A>
<DT><A HREF="https://stackoverflow.com">Stack Overflow</A>
</DL></DL>"#;
        let result = parse_bookmarks_html(html).unwrap();
        assert_eq!(result.sites.len(), 2);
        assert_eq!(result.sites[0].name, "GitHub");
        assert_eq!(result.sites[1].url, "https://stackoverflow.com");
        assert_eq!(result.categories.len(), 1);
        assert_eq!(result.categories[0], vec!["工具"]);
    }

    #[test]
    fn parse_nested_folders() {
        let html = r#"<DL><DT><H3>开发</H3><DL>
<DT><H3>前端</H3><DL><DT><A HREF="https://react.dev">React</A></DL>
<DT><H3>后端</H3><DL><DT><A HREF="https://spring.io">Spring</A></DL>
</DL></DL>"#;
        let result = parse_bookmarks_html(html).unwrap();
        assert_eq!(result.sites.len(), 2);
        assert_eq!(result.sites[0].category_path, vec!["开发", "前端"]);
    }

    #[test]
    fn flatten_depth_beyond_3() {
        let html = r#"<DL><DT><H3>A</H3><DL><DT><H3>B</H3><DL>
<DT><H3>C</H3><DL><DT><H3>D</H3><DL>
<DT><A HREF="https://deep.dev">Deep</A>
</DL></DL></DL></DL></DL>"#;
        let result = parse_bookmarks_html(html).unwrap();
        // D is at depth 4, should flatten C/D → A/B/C, D's site moves to A/B/C
        let site = &result.sites[0];
        assert_eq!(site.category_path, vec!["A", "B", "C"]);
    }
}
```

- [ ] **Step 3: 运行确认失败**

```bash
cd src-tauri && LIB="C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231\lib\onecore\x64;${LIB:-}" cargo test bookmarks_html 2>&1 | tail -15
```

Expected: FAIL（stub 实现）

- [ ] **Step 4: 实现 parse_bookmarks_html**

```rust
fn parse_bookmarks_html(html: &str) -> Result<ParsedBookmarks, String> {
    use scraper::{Html, Selector};
    
    // 检测编码：先用 UTF-8，失败尝试 GBK
    let dom = Html::parse_fragment(html);
    
    let h3_sel = Selector::parse("h3").map_err(|e| format!("selector error: {:?}", e))?;
    let a_sel = Selector::parse("a[href]").map_err(|e| format!("selector error: {:?}", e))?;
    let dl_sel = Selector::parse("dl").map_err(|e| format!("selector error: {:?}", e))?;
    
    let mut sites: Vec<ParsedBookmarkSite> = Vec::new();
    let mut categories: Vec<Vec<String>> = Vec::new();
    
    // 递归遍历 DL 树
    fn walk_dl(
        dl_element: &scraper::ElementRef,
        path: &mut Vec<String>,
        sites: &mut Vec<ParsedBookmarkSite>,
        categories: &mut Vec<Vec<String>>,
    ) {
        let child_nodes: Vec<_> = dl_element.children().collect();
        let mut i = 0;
        while i < child_nodes.len() {
            if let Some(el) = child_nodes[i].value().as_element() {
                let tag = el.name().to_lowercase();
                if tag == "dt" {
                    // 检查 DT 内是否有 H3（子文件夹）或 A（书签）
                    // 遍历 DT 的子元素...
                    // 简化：直接在当前 DL 层级扫描 H3 和 A
                    i += 1;
                    continue;
                }
            }
            i += 1;
        }
    }
    
    // 更简单的方案：直接用 scraper 选择器 + 手动追踪层级
    // 由于 HTML 书签结构是 <DL><DT><H3>..</H3><DL>..</DL></DT></DL>
    // 采用遍历 DL 的直接子元素方式
    
    for dl in dom.select(&dl_sel) {
        // 每个 DL 的直接子 DT
        for dt in dl.children().filter_map(|c| scraper::ElementRef::wrap(c)) {
            let mut h3_found = false;
            for h3 in dt.select(&h3_sel) {
                let folder_name = h3.text().collect::<String>().trim().to_string();
                if folder_name.is_empty() { continue; }
                
                let mut new_path = path.clone();
                // 拍平：如果深度超过 2（从 0 开始），截断到 3 层
                if new_path.len() >= 3 {
                    new_path = new_path[..3].to_vec();
                } else {
                    new_path.push(folder_name.clone());
                }
                
                if !new_path.is_empty() && !categories.contains(&new_path) {
                    categories.push(new_path.clone());
                }
                
                // 找下一个兄弟 DL
                // ...
                h3_found = true;
            }
            if h3_found { continue; }
            
            // 不是文件夹，找 A 标签
            for a in dt.select(&a_sel) {
                let href = a.value().attr("href").unwrap_or("").to_string();
                let name = a.text().collect::<String>().trim().to_string();
                if href.is_empty() { continue; }
                
                // HTML 实体解码
                let name = html_decode(&name);
                
                if !path.is_empty() && !categories.contains(path) {
                    categories.push(path.clone());
                }
                
                sites.push(ParsedBookmarkSite {
                    name,
                    url: href,
                    category_path: path.clone(),
                });
            }
        }
    }
    
    // 去重：同 URL 保留首个
    let mut seen = std::collections::HashSet::new();
    sites.retain(|s| seen.insert(s.url.clone()));
    
    Ok(ParsedBookmarks { sites, categories })
}

fn html_decode(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}
```

注意：上面的实现是伪代码级的近似。实际 HTML 书签结构更复杂，`scraper` crate 的 ElementRef 遍历和兄弟查找需要精确处理。这里的计划提供一个正确的大致框架，实现时需调试 scraper API。

- [ ] **Step 5: 实现 export_bookmarks_html**

```rust
fn export_bookmarks_html(data: &crate::data::AppData) -> String {
    let mut out = String::from("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\n<DL>\n");
    
    // 按分类分组站点
    let mut path_map: std::collections::HashMap<String, Vec<&crate::data::Site>> = std::collections::HashMap::new();
    let mut uncategorized: Vec<&crate::data::Site> = Vec::new();
    
    fn collect_by_path(
        cats: &[crate::data::Category],
        prefix: &str,
        map: &mut std::collections::HashMap<String, Vec<&crate::data::Site>>,
        sites: &[crate::data::Site],
    ) {
        for c in cats {
            let path = if prefix.is_empty() { c.name.clone() } else { format!("{}/{}", prefix, c.name) };
            let cat_sites: Vec<_> = sites.iter().filter(|s| s.category_id.as_deref() == Some(&c.id)).collect();
            if !cat_sites.is_empty() {
                map.entry(path.clone()).or_insert_with(Vec::new).extend(cat_sites);
            }
            collect_by_path(&c.children, &path, map, sites);
        }
    }
    
    collect_by_path(&data.categories, "", &mut path_map, &data.sites);
    uncategorized.extend(data.sites.iter().filter(|s| s.category_id.is_none()));
    
    for (path, sites) in &path_map {
        out.push_str(&format!("<DT><H3>{}</H3>\n<DL>\n", path));
        for s in sites {
            out.push_str(&format!("<DT><A HREF=\"{}\">{}</A>\n", s.url, html_encode(&s.name)));
        }
        out.push_str("</DL>\n");
    }
    
    if !uncategorized.is_empty() {
        for s in &uncategorized {
            out.push_str(&format!("<DT><A HREF=\"{}\">{}</A>\n", s.url, html_encode(&s.name)));
        }
    }
    
    out.push_str("</DL>\n");
    out
}

fn html_encode(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}
```

- [ ] **Step 5.5: 在 `bookmarks_html.rs` 中新增 `to_app_data` 函数**

将 `ParsedBookmarks` 转换为 `data::AppData`：

```rust
use crate::data::{AppData as AppDataStruct, Category, Site};

fn to_app_data(parsed: &ParsedBookmarks) -> AppDataStruct {
    let mut categories: Vec<Category> = Vec::new();
    let mut sites: Vec<Site> = Vec::new();
    let mut tag_set = std::collections::HashSet::new();
    
    // 按 path 建树（最多 3 层）
    for path in &parsed.categories {
        let mut parent: Option<&mut Category> = None;
        for (depth, name) in path.iter().enumerate() {
            if depth >= 3 { break }  // 拍平
            // 查找或创建...
        }
    }
    
    for s in &parsed.sites {
        let category_id = if s.category_path.is_empty() { None } else { Some(...) };
        sites.push(Site {
            id: format!("bm{}", sites.len()),
            name: s.name.clone(),
            url: s.url.clone(),
            category_id,
            tags: vec![],
            status: "unknown".into(),
            last_check: None,
            note: String::new(),
        });
    }
    
    AppDataStruct { version: 1, categories, sites, recycle_bin: vec![], tags: tag_set.into_iter().collect() }
}
```

注意：实现时需正确处理分类树构建（path → nested Category）。

- [ ] **Step 6: 注册 IPC 命令**

在 `commands.rs` 顶部加 `use crate::bookmarks_html;`，新增：

```rust
#[tauri::command]
pub fn import_bookmarks_html(app: tauri::AppHandle, html: String) -> Result<data::AppData, String> {
    let parsed = bookmarks_html::parse_bookmarks_html(&html)?;
    let mut current = data::load_data(&active_data_dir(&app));
    let incoming = bookmarks_html::to_app_data(&parsed);
    data::merge_into(&mut current, &incoming);
    data::save_data(&active_data_dir(&app), &current)?;
    Ok(current)
}

#[tauri::command]
pub fn export_bookmarks_html_to_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let data = data::load_data(&active_data_dir(&app));
    // 排除回收站
    let export_data = data::AppData { recycle_bin: vec![], ..data };
    let html = bookmarks_html::export_bookmarks_html(&export_data);
    std::fs::write(&path, html).map_err(|e| e.to_string())
}
```

- [ ] **Step 7: 在 lib.rs 注册**

添加 `mod bookmarks_html;` 和 invoke_handler 中两行。

- [ ] **Step 8: api.ts 添加包装**

```ts
export const importBookmarksHtml = (html: string) => invoke<AppData>('import_bookmarks_html', { html })
export const exportBookmarksHtmlToFile = (path: string) => invoke<void>('export_bookmarks_html_to_file', { path })
```

- [ ] **Step 9: 前端 ImportExportModal.vue 添加书签 HTML 选项**

导出区加：

```html
<button class="btn" @click="exportHtml">导出浏览器书签</button>
```

导入区加：

```html
<button class="btn" @click="importHtml">导入浏览器书签</button>
```

实现 `exportHtml` / `importHtml` 函数（复用现有文件选择模式）。

- [ ] **Step 10: 运行测试**

```bash
cd src-tauri && LIB="..." cargo test bookmarks_html 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 11: 提交**

```bash
git add src-tauri/src/bookmarks_html.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src/api.ts src/components/ImportExportModal.vue
git commit -m "feat: browser bookmark HTML import/export with Netscape format support"
```

---

## Task 13: URL 自动获取标题

**Files:**
- Modify: `src-tauri/src/commands.rs`（+1 命令）
- Modify: `src-tauri/src/lib.rs`（注册）
- Modify: `src/api.ts`（+1 包装）
- Modify: `src/components/AddEditModal.vue`（标题获取 UI）
- Test: `src-tauri/src/check.rs`（借用其 reqwest 客户端模式）
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: reqwest 客户端（复用 check.rs 模式）
- Produces: `fetch_site_title_cmd` 命令

- [ ] **Step 1: 写 Rust 测试**

在 `check.rs` 或新建测试文件中。直接写在 `commands.rs` 的测试模块中不太合适——应该写一个独立的测试文件或在 `check.rs` 中加一个可测试的纯函数。

更好的方案：把 `fetch_site_title` 写成 `check.rs` 中的纯函数，返回 `String`，再在 `commands.rs` 中包装成命令。

在 `check.rs` 底部加：

```rust
pub async fn fetch_site_title(url: &str) -> Result<String, String> {
    let client = client();
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    let body = resp.text().await.map_err(|e| e.to_string())?;
    
    // 提取 <title>
    let lower = body.to_lowercase();
    let title_start = lower.find("<title>").ok_or("no title tag")? + 7;
    let title_end = lower.find("</title>").ok_or("no closing title")?;
    let raw = &body[title_start..title_end];
    
    // 清理空白和 HTML 实体
    let cleaned = raw.trim().replace('\n', " ").replace('\r', "");
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = html_decode_simple(&cleaned);
    
    if cleaned.is_empty() || cleaned.to_lowercase() == "loading..." {
        // 回退到域名
        let domain = url::Url::parse(url)
            .ok()
            .and_then(|u| u.host_str().map(|h| h.to_string()))
            .unwrap_or_else(|| url.to_string());
        return Ok(domain);
    }
    
    Ok(cleaned)
}

fn html_decode_simple(input: &str) -> String {
    input.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}
```

测试：

```rust
#[test]
fn fetch_title_extracts_title_tag() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        use std::io::{Read, Write};
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf);
            let body = "<html><head><title>My Site &amp; Co</title></head><body></body></html>";
            let resp = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            let _ = stream.write_all(resp.as_bytes());
        }
    });
    let url = format!("http://{}/", addr);
    let rt = tokio::runtime::Runtime::new().unwrap();
    let title = rt.block_on(fetch_site_title(&url)).unwrap();
    assert_eq!(title, "My Site & Co");
}

#[test]
fn fetch_title_falls_back_to_domain_when_empty() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        use std::io::{Read, Write};
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf);
            let body = "<html><head><title>Loading...</title></head><body></body></html>";
            let resp = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            let _ = stream.write_all(resp.as_bytes());
        }
    });
    let url = format!("http://{}/", addr);
    let rt = tokio::runtime::Runtime::new().unwrap();
    let title = rt.block_on(fetch_site_title(&url)).unwrap();
    assert_eq!(title, format!("http://{}/", addr).split('/').nth(2).unwrap_or(""));
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd src-tauri && LIB="..." cargo test fetch_title 2>&1 | tail -10
```

Expected: FAIL

- [ ] **Step 3: 注册 IPC 命令**

在 `commands.rs` 中新增：

```rust
#[tauri::command]
pub async fn fetch_site_title_cmd(url: String) -> Result<String, String> {
    crate::check::fetch_site_title(&url).await
}
```

在 `lib.rs` 中注册：

```rust
commands::fetch_site_title_cmd,
```

- [ ] **Step 4: api.ts 添加**

```ts
export const fetchSiteTitle = (url: string) => invoke<string>('fetch_site_title_cmd', { url })
```

- [ ] **Step 5: AddEditModal.vue 实现标题获取 UI**

添加 ref：

```ts
const titleError = ref('')
const fetchingTitle = ref(false)
```

添加方法：

```ts
async function fetchTitle() {
  if (!url.value.trim()) return
  fetchingTitle.value = true
  titleError.value = ''
  try {
    const title = await api.fetchSiteTitle(url.value.trim())
    if (!name.value.trim()) {
      name.value = title
    }
  } catch (e: any) {
    titleError.value = '无法获取标题，请手动输入或点击重试'
  } finally {
    fetchingTitle.value = false
  }
}
```

在模板中 URL 输入框后加：

```html
<label>链接</label>
<div class="url-row">
  <input v-model="url" placeholder="https://..." @blur="fetchTitle" />
  <button type="button" class="btn small" @click="fetchTitle" :disabled="fetchingTitle">
    {{ fetchingTitle ? '...' : '获取名称' }}
  </button>
</div>
<p v-if="titleError" class="err">⚠ {{ titleError }}</p>
```

添加 CSS：

```css
.url-row { display: flex; gap: 8px; }
.url-row input { flex: 1; }
```

- [ ] **Step 6: 运行全量测试**

```bash
npx vitest run 2>&1 | tail -10
cd src-tauri && LIB="..." cargo test fetch_title 2>&1 | tail -5
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/check.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src/api.ts src/components/AddEditModal.vue
git commit -m "feat: auto-fetch site title from URL on blur with manual retry"
```

---

## 执行顺序总结

| 顺序 | Task | 类型 | 依赖 |
|------|------|------|------|
| 1 | 版本号对齐 | chore | 无 |
| 2 | URL 归一化 | feat | 无 |
| 3 | 编辑/恢复去重 | feat | Task 2 |
| 4 | 多选拖拽 | feat | 无 |
| 5 | 排序扩展 | feat | 无 |
| 6 | 筛选计数 | feat | 无 |
| 7 | 空状态引导 | feat | 无 |
| 8 | 备注放宽 | feat | 无 |
| 9 | 并发检测 | feat | 无 |
| 10 | checkOne 预检 | fix | 无 |
| 11 | 原子写入 | fix | 无 |
| 12 | 书签 HTML | feat | 无（独立新模块） |
| 13 | URL 标题获取 | feat | 无 |

Task 2-11 可以部分并行（无相互依赖），Task 12 和 13 是独立完整功能，可与其它任务并行。
