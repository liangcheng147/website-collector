# 网站收藏管家 v1.2（Bug 修复 + 布局重设计）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复用户真机验收发现的 3 个 bug（导入/导出与设置按钮无响应、弹窗定位错误），并按已确认的布局设计（C 极简 + B 大卡片分栏 + 导入导出 2×2 网格 + 绿色成功提示）重画全部弹窗与状态栏。

**Architecture:** 三个 bug 根因已定位：① `src-tauri/capabilities/default.json` 缺少 `"dialog:default"` 权限导致 Tauri v2 静默拦截 dialog 插件 IPC；② `ModalMask` 未 Teleport，弹窗渲染在侧栏 `animation: rowIn`（transform）内部，`position:fixed` 失效。布局重设计为纯前端 CSS/模板改造：先改基础布局与弹窗系统 CSS，再逐个重画弹窗组件，最后统一回归并重建 MSI。

**Tech Stack:** Tauri 2、tauri-plugin-dialog、Vue 3、Pinia、Vite、TypeScript、Vitest。

## Global Constraints

（以下约束来自用户确认的设计原型 `design/layout-all-pages.html`，所有任务隐含包含本约束。值必须照抄，不得改动。）

- 整体布局 **C 极简**：侧栏宽度 **170px**（App.vue `.body` 的 `grid-template-columns` 由 `200px 1fr` 改 `170px 1fr`）；侧栏/顶栏/状态栏 padding 微缩。
- 弹窗风格 **B 大卡片分栏**：`.modal` 宽 `width:min(560px,92%)`、padding 18px、`h3` 字号 14px；内部两栏 `grid-template-columns:1fr 1fr; gap:18px`，左栏为表单/操作，右栏 `.help`（`border-left:2px dashed var(--border); padding-left:16px`）放说明。
- 导入/导出四个按钮 **2×2 网格**（`.grid2x2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }`）。
- 成功提示（状态栏 flash）为 **绿色**：新增 `--ok-txt:#12906B` 变量与 `.flash-ok { color:var(--ok-txt); font-weight:700; }`；`statusbar` 中 `flashMsg` 用 `.flash-ok`，`connectivityError` 仍用琥珀色 `.pending-hint`。
- 表格生命状态 `.ok` 也改为 `--ok-txt`（原 `--ok:#4FF0A8` 太浅，可读性差，设计原型已用 `--ok-txt`）。
- 分类嵌套 ≤3 层、链接唯一、检测判定、删除进回收站、每次变更即时持久化等既有业务规则**保持不变**，本次不改 store/api/rust。
- 弹窗仍只点击遮罩空白关闭（`ModalMask` 保留 `e.target === e.currentTarget` 守卫与嵌套弹窗不误关外层的行为，仅新增 Teleport）。
- 修复权限后需在**真机**执行 `npm run tauri dev` 手动验证对话框能弹出；全部完成后重新 `npm run tauri build` 重建 MSI。
- 验证命令（既有约定）：`npm run test`（vitest 回归）、`npm run build`（vue-tsc + vite）、`cargo test`（在 `src-tauri` 目录）、真机 `npm run tauri dev`。组件/样式改动无现成组件测试，以 build + 手动为准。

---

### Task 1: 修复 dialog 权限（导入/导出、设置更改位置、首次启动选目录无响应）

**Files:**
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: 无
- Produces: main window 获得 `dialog:default` 权限，`@tauri-apps/plugin-dialog` 的 `open`/`save` 调用不再被静默拦截（修复 bug ①与③）。

- [ ] **Step 1: 在 permissions 数组追加 dialog 权限**

`src-tauri/capabilities/default.json` 改为：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default"
  ]
}
```

- [ ] **Step 2: 验证 JSON 合法且权限标识正确**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/capabilities/default.json','utf8')); console.log('JSON OK')"`
Expected: 输出 `JSON OK`。`dialog:default` 是 tauri-plugin-dialog v2 生成的默认权限集（含 allow-open/allow-save 等），包名 `@tauri-apps/plugin-dialog` 已按 v1.1 计划安装。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/capabilities/default.json
git commit -m "fix: 补全 dialog:default 权限，修复导入导出与设置选目录无响应"
```

---

### Task 2: ModalMask Teleport 到 body（修复弹窗定位/大小错误）

**Files:**
- Modify: `src/components/ModalMask.vue`

**Interfaces:**
- Consumes: 无（Props/Emits 接口不变）
- Produces: 弹窗遮罩经 `<Teleport to="body">` 渲染到 body 顶层，避开侧栏 `rowIn` 动画的 transform 造成的 `position:fixed` 失效（修复 bug ②）。所有引用 ModalMask 的弹窗组件（AddEditModal/AddCategoryModal/PromptModal/ConfirmModal/ImportExportModal/SettingsModal/FirstLaunchModal/PickCategoryModal/AddTagsModal）无需改动即可受益；嵌套弹窗（AddEditModal 内的 AddCategoryModal）两个遮罩同为 body 顶层，靠 DOM 顺序后渲染者在上层。

- [ ] **Step 1: 用 Teleport 包裹遮罩**

`src/components/ModalMask.vue` 完整改为：

```vue
<script setup lang="ts">
import { ref } from 'vue'
const emit = defineEmits(['close'])
const downOnMask = ref(false)
function onMaskDown(e: MouseEvent) { downOnMask.value = (e.target as HTMLElement).classList.contains('modal-mask') }
function onMaskClick(e: MouseEvent) { if (downOnMask.value && e.target === e.currentTarget) emit('close') }
</script>

<template>
  <Teleport to="body">
    <div class="modal-mask" @mousedown="onMaskDown" @click="onMaskClick">
      <slot />
    </div>
  </Teleport>
</template>
```

- [ ] **Step 2: 类型检查 + 回归测试**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 与 `vite build` 均通过（Teleport 为内置组件，TS 类型无影响）。

Run: `npm run test`
Expected: 全部通过（store 测试不涉及组件渲染，无回归）。

- [ ] **Step 3: 提交**

```bash
git add src/components/ModalMask.vue
git commit -m "fix: 弹窗 Teleport 到 body，修复侧栏内弹窗定位失效"
```

---

### Task 3: C 极简基础布局（侧栏 170px + 紧凑间距）

**Files:**
- Modify: `src/App.vue:62`（`.body` 的 grid 列宽）
- Modify: `src/styles/main.css`（`:root` 新增 `--ok-txt`；`.topbar`/`.sidebar`/`.statusbar` 间距；`.site-table .ok` 颜色）

**Interfaces:**
- Consumes: 无
- Produces: 全局布局基底 —— 侧栏 170px、顶栏 padding `6px 12px`、侧栏 padding `8px`、状态栏 padding `4px 12px`、`--ok-txt:#12906B`、表格 `.ok` 用深绿。后续 Task 4-10 依赖这些基础。

- [ ] **Step 1: 收窄侧栏**

`src/App.vue` 第 62 行 `grid-template-columns: 200px 1fr` 改为 `170px 1fr`：

```vue
.body { display: grid; grid-template-columns: 170px 1fr; min-height: 0; }
```

- [ ] **Step 2: 更新基础 CSS**

`src/styles/main.css`：

- `:root` 新增变量（第 4 行 `--ok:#4FF0A8;` 之后）：
```css
  --ok-txt:#12906B;
```
- `.topbar`（第 18 行）`padding:8px 12px` → `padding:6px 12px`
- `.sidebar`（第 21 行）`padding:10px` → `padding:8px`
- `.statusbar`（第 30 行）`padding:5px 12px` → `padding:4px 12px`
- `.site-table .ok`（第 42 行）`color:var(--ok)` → `color:var(--ok-txt); font-weight:700`

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 通过。

Run: `npm run test`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/App.vue src/styles/main.css
git commit -m "style: C 极简布局（侧栏 170px）与紧凑间距，表格 ok 色改深绿"
```

---

### Task 4: B 大卡片分栏弹窗系统 CSS + 2×2 网格 + 绿色 flash

**Files:**
- Modify: `src/styles/main.css`（弹窗系统样式替换 + 新增 `.modal-cols`/`.help`/`.grid2x2`/`.flash-ok` 等）

**Interfaces:**
- Consumes: Task 3 的 `--ok-txt` 变量
- Produces:
  - `.modal` 宽 `width:min(560px,92%)`、padding 18px、`h3` 14px、label 加粗
  - `.modal-cols { display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }`（两栏分栏骨架）
  - `.modal .help { border-left:2px dashed var(--border); padding-left:16px; }` + `.modal .help code` 代码块样式
  - `.grid2x2`、`.mode-row label` 行内化、`.flash-ok`
  - Task 5-10 的模板据此引用这些类。

- [ ] **Step 1: 替换弹窗系统样式**

`src/styles/main.css` 中把第 52-59 行整段（`.modal-mask` 到 `.mode-row`）替换为：

```css
.modal-mask { position:fixed; inset:0; background:rgba(74,59,110,.35); display:flex; align-items:center; justify-content:center; z-index:200; }
.modal { background:#fff; border:2px solid var(--primary); border-radius:var(--radius-lg); box-shadow:4px 4px 0 var(--accent); padding:18px; width:min(560px,92%); }
.modal h3 { margin-bottom:12px; color:var(--primary); font-size:14px; }
.modal label { display:block; margin:8px 0 3px; font-size:11px; color:var(--text-2); font-weight:700; letter-spacing:1px; }
.modal input, .modal select, .modal textarea { width:100%; margin-bottom:4px; padding:5px 8px; }
.modal .muted { font-size:11px; }
.modal .actions { display:flex; gap:8px; justify-content:flex-end; margin-top:14px; }
.modal .err { color:var(--danger); font-size:11px; margin-top:8px; }
.modal-cols { display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }
.modal .help { border-left:2px dashed var(--border); padding-left:16px; }
.modal .help code { display:block; background:var(--panel); border-radius:var(--radius); padding:6px 8px; margin:4px 0; font-size:11px; color:var(--text); }
.grid2x2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:6px 0; }
.grid2x2 button.btn { width:100%; }
.mode-row { margin:10px 0; font-size:12px; }
.mode-row label { display:inline; margin:0; font-weight:400; color:var(--text); letter-spacing:0; }
```

- [ ] **Step 2: 新增绿色 flash 样式**

`src/styles/main.css` 在 `.statusbar .pending-hint`（第 32 行）后追加：

```css
.statusbar .flash-ok { color:var(--ok-txt); font-weight:700; }
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/styles/main.css
git commit -m "style: B 大卡片分栏弹窗系统 + 2x2 网格 + 绿色成功提示"
```

---

### Task 5: 添加/编辑网站弹窗分栏（含嵌套新建分类）

**Files:**
- Modify: `src/components/AddEditModal.vue`（仅 `<template>` 部分）
- Test: `src/components/AddCategoryModal.vue`（本任务同时改，见 Task 6；AddEditModal 内嵌 AddCategoryModal 保持现状即可）

**Interfaces:**
- Consumes: Task 4 的 `.modal-cols`/`.help`；Task 2 的 Teleport
- Produces: AddEditModal 模板两栏化，脚本逻辑（含 `onCatChange`/`onCatCreated`/`save`）不动。

- [ ] **Step 1: 模板改为两栏分栏**

`src/components/AddEditModal.vue` 的 `<template>`（第 44-62 行）替换为：

```vue
<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.editing ? '编辑网站' : '添加网站' }}</h3>
      <div class="modal-cols">
        <div>
          <label>名称</label><input v-model="name" placeholder="网站名称" />
          <label>链接</label><input v-model="url" placeholder="https://..." />
          <label>分类</label>
          <select v-model="categoryId" @change="onCatChange">
            <option :value="null">未分类</option>
            <option v-for="c in store.flatCategories" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
            <option :value="'__new_cat__'">＋ 新建分类…</option>
          </select>
          <label>标签（空格分隔）</label><input v-model="tags" placeholder="框架 工具" />
          <p v-if="dup" class="err">⚠ 链接已存在</p>
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="save">保存</button></div>
        </div>
        <div class="help">
          <label>快捷操作</label>
          <p class="muted">下拉选择「＋ 新建分类…」会弹出新建分类弹窗，创建后自动选中新分类，表单内容保留。</p>
        </div>
      </div>
    </div>
    <AddCategoryModal v-if="showAddCat" :parent-id="pendingCat" @created="onCatCreated" @close="showAddCat = false" />
  </ModalMask>
</template>
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 通过（`.help` 内 `label`/`p.muted` 均已有样式）。

Run: `npm run test`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/components/AddEditModal.vue
git commit -m "style: 添加/编辑网站弹窗改为大卡片分栏"
```

---

### Task 6: 新建分类弹窗分栏（父级下拉 + 层级说明）

**Files:**
- Modify: `src/components/AddCategoryModal.vue`（仅 `<template>` 部分）

**Interfaces:**
- Consumes: Task 4 的 `.modal-cols`/`.help`；Task 2 的 Teleport
- Produces: AddCategoryModal 两栏化，`create()` 校验逻辑（depth<2 白名单）不动；本组件被 Sidebar「全部」右键、CategoryNode「添加子分类」、AddEditModal「＋ 新建分类…」复用，均自动受益。

- [ ] **Step 1: 模板改为两栏分栏**

`src/components/AddCategoryModal.vue` 的 `<template>`（第 19-33 行）替换为：

```vue
<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>新建分类</h3>
      <div class="modal-cols">
        <div>
          <label>父级分类</label>
          <select v-model="parentId">
            <option :value="null">顶层</option>
            <option v-for="c in store.flatCategories.filter(c => c.depth < 2)" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
          </select>
          <label>分类名称</label>
          <input v-model="name" placeholder="分类名" />
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="create">创建</button></div>
        </div>
        <div class="help">
          <label>层级规则</label>
          <p class="muted">分类最多嵌套 3 层。<br />父级列表只显示深度 ≤ 2 的分类，保证新分类不会超过第 3 层。</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/components/AddCategoryModal.vue
git commit -m "style: 新建分类弹窗改为大卡片分栏"
```

---

### Task 7: 重命名 / 删除分类弹窗分栏（新增 hint 说明）

**Files:**
- Modify: `src/components/PromptModal.vue`（新增 `hint` prop + 两栏）
- Modify: `src/components/ConfirmModal.vue`（新增 `hint` prop + 两栏）
- Modify: `src/components/CategoryNode.vue`（两处调用传 hint）

**Interfaces:**
- Consumes: Task 4 的 `.modal-cols`/`.help`；Task 2 的 Teleport
- Produces:
  - `PromptModal` props 扩展为 `{ title: string; initial?: string; hint?: string }`（hint 可选，兼容既有调用）
  - `ConfirmModal` props 扩展为 `{ title: string; message?: string; hint?: string; options: {...}[] }`
  - CategoryNode 在重命名弹窗传 `hint="修改后所有子分类与网站归属保持不变。"`，在删除确认弹窗传 `hint="「连同网站删除」会把该分类下所有网站移入回收站，可在回收站恢复。"`

- [ ] **Step 1: PromptModal 两栏 + hint prop**

`src/components/PromptModal.vue` 完整替换为：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
const props = defineProps<{ title: string; initial?: string; hint?: string }>()
const emit = defineEmits(['confirm', 'close'])
const value = ref(props.initial ?? '')
function ok() { if (value.value.trim()) emit('confirm', value.value.trim()) }
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.title }}</h3>
      <div class="modal-cols">
        <div>
          <label>内容</label>
          <input v-model="value" />
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="ok">确定</button></div>
        </div>
        <div class="help">
          <label>说明</label>
          <p class="muted">{{ props.hint ?? '输入内容后点击「确定」保存。' }}</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 2: ConfirmModal 两栏 + hint prop**

`src/components/ConfirmModal.vue` 完整替换为：

```vue
<script setup lang="ts">
import ModalMask from './ModalMask.vue'
const props = defineProps<{ title: string; message?: string; hint?: string; options: { value: string; label: string; danger?: boolean }[] }>()
const emit = defineEmits(['choose', 'close'])
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.title }}</h3>
      <div class="modal-cols">
        <div>
          <p class="muted" v-if="props.message">{{ props.message }}</p>
          <div class="actions" style="justify-content:flex-start">
            <button v-for="opt in props.options" :key="opt.value" class="btn" :class="{ danger: opt.danger }" @click="emit('choose', opt.value)">{{ opt.label }}</button>
          </div>
          <div class="actions"><button class="btn" @click="emit('close')">取消</button></div>
        </div>
        <div class="help">
          <label>风险提示</label>
          <p class="muted">{{ props.hint ?? '该操作会立即生效。' }}</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 3: CategoryNode 传 hint**

`src/components/CategoryNode.vue` 第 52 行改为：

```vue
    <PromptModal v-if="renameCat" :title="'重命名分类'" :initial="renameCat.name" hint="修改后所有子分类与网站归属保持不变。" @confirm="doRename" @close="renameCat = null" />
```

第 53-60 行的 `<ConfirmModal>` 增加 hint 属性：

```vue
    <ConfirmModal
      v-if="delCat"
      :title="'删除分类'"
      :message="`删除「${delCat.name}」及其子分类，其中网站如何处理？`"
      :options="[{ value: 'move', label: '网站移入未分类' }, { value: 'delete', label: '连同网站删除', danger: true }]"
      hint="「连同网站删除」会把该分类下所有网站移入回收站，可在回收站恢复。"
      @choose="doDelete"
      @close="delCat = null"
    />
```

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 通过（新增 prop 均为可选，无调用方破坏）。

Run: `npm run test`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add src/components/PromptModal.vue src/components/ConfirmModal.vue src/components/CategoryNode.vue
git commit -m "style: 重命名与删除分类弹窗改为大卡片分栏并补充说明"
```

---

### Task 8: 导入/导出弹窗 2×2 网格 + 分栏

**Files:**
- Modify: `src/components/ImportExportModal.vue`（仅 `<template>` 部分）

**Interfaces:**
- Consumes: Task 4 的 `.modal-cols`/`.help`/`.grid2x2`/`.mode-row`；Task 2 的 Teleport
- Produces: 四个按钮按「导出 2×2 / 导入 2×2」两组网格排列，右栏放 md 格式示例 + JSON 说明；JSON 两段式确认视图同样两栏。`mode`/`jsonPath`/`msg` 与所有函数不动。

- [ ] **Step 1: 模板改为网格 + 分栏**

`src/components/ImportExportModal.vue` 的 `<template>`（第 61-91 行）替换为：

```vue
<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>导入 / 导出</h3>
      <template v-if="jsonPath">
        <div class="modal-cols">
          <div>
            <p class="muted">将导入：{{ jsonPath }}</p>
            <p class="muted">JSON 导入会覆盖当前全部数据（自动备份 .bak），确定继续？</p>
            <div class="actions">
              <button class="btn" @click="jsonPath = null">取消</button>
              <button class="btn danger" @click="confirmJsonImport">确定覆盖导入</button>
            </div>
          </div>
          <div class="help">
            <label>备份说明</label>
            <p class="muted">导入前自动生成 .bak 备份文件，导入失败可从中恢复。</p>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="modal-cols">
          <div>
            <label>导出</label>
            <div class="grid2x2">
              <button class="btn primary" @click="exportMd">导出 MD</button>
              <button class="btn primary" @click="exportJson">导出 JSON</button>
            </div>
            <label>导入</label>
            <div class="grid2x2">
              <button class="btn" @click="importMd">导入 MD</button>
              <button class="btn" @click="pickJson">导入 JSON</button>
            </div>
            <div class="mode-row">
              <label><input type="radio" v-model="mode" value="merge" /> 合并导入</label>
              <label style="margin-left:10px"><input type="radio" v-model="mode" value="overwrite" /> 覆盖导入（自动备份 .bak）</label>
            </div>
          </div>
          <div class="help">
            <label>md 格式示例</label>
            <code># 分类名<br />- [名称](https://链接)</code>
            <label>JSON 说明</label>
            <p class="muted">读取「导出 JSON」的备份文件，覆盖当前全部数据（自动备份 .bak）。导入成功后在状态栏闪现提示。</p>
          </div>
        </div>
      </template>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 通过。

Run: `npm run test`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/components/ImportExportModal.vue
git commit -m "style: 导入/导出弹窗改为 2x2 网格加大卡片分栏"
```

---

### Task 9: 设置 / 首次启动弹窗分栏

**Files:**
- Modify: `src/components/SettingsModal.vue`（仅 `<template>` 部分）
- Modify: `src/components/FirstLaunchModal.vue`（仅 `<template>` 部分）

**Interfaces:**
- Consumes: Task 4 的 `.modal-cols`/`.help`；Task 2 的 Teleport
- Produces: 两个存储相关弹窗两栏化，脚本逻辑（migrate/pick/readPicked/useDefault/step 切换）不动。

- [ ] **Step 1: SettingsModal 两栏**

`src/components/SettingsModal.vue` 的 `<template>`（第 27-36 行）替换为：

```vue
<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>设置 · 存储位置</h3>
      <div class="modal-cols">
        <div>
          <label>数据文件</label>
          <input :value="filePath" readonly />
          <div class="actions" style="justify-content:flex-start"><button class="btn" @click="migrate">更改位置…</button></div>
        </div>
        <div class="help">
          <label>迁移说明</label>
          <p class="muted">点击「更改位置…」选择新的数据文件夹。目标目录非空会拒绝迁移，失败自动回滚，原数据不受影响。</p>
        </div>
      </div>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 2: FirstLaunchModal 两栏（两个步骤各一栏）**

`src/components/FirstLaunchModal.vue` 的 `<template>`（第 51-71 行）替换为：

```vue
<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>选择数据目录</h3>
      <template v-if="step === 'choose'">
        <div class="modal-cols">
          <div>
            <p class="muted">首次使用，请选择数据存储位置。</p>
            <label>默认位置</label>
            <input :value="defaultDir" readonly />
            <div class="actions">
              <button class="btn" @click="useDefault">使用默认位置</button>
              <button class="btn primary" @click="pick">选择数据目录…</button>
            </div>
          </div>
          <div class="help">
            <label>已有数据</label>
            <p class="muted">若选中的目录已存在数据文件，会提示「该目录已有 N 个网站数据」，可选择读入或换目录。</p>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="modal-cols">
          <div>
            <p class="muted">该目录已有 <b>{{ pickedCount }}</b> 个网站数据，是否读入？</p>
            <div class="actions">
              <button class="btn" @click="step = 'choose'">换一个目录</button>
              <button class="btn primary" @click="readPicked">读入该目录</button>
            </div>
          </div>
          <div class="help">
            <label>读入说明</label>
            <p class="muted">读入后将使用该目录的数据文件作为默认存储位置。</p>
          </div>
        </div>
      </template>
      <p class="muted">{{ msg }}</p>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 通过。

Run: `npm run test`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/SettingsModal.vue src/components/FirstLaunchModal.vue
git commit -m "style: 设置与首次启动弹窗改为大卡片分栏"
```

---

### Task 10: 移动分类 / 添加标签弹窗分栏

**Files:**
- Modify: `src/components/PickCategoryModal.vue`（仅 `<template>` 部分）
- Modify: `src/components/AddTagsModal.vue`（仅 `<template>` 部分）

**Interfaces:**
- Consumes: Task 4 的 `.modal-cols`/`.help`；Task 2 的 Teleport
- Produces: 两个批量操作弹窗两栏化，confirm() 逻辑不动。

- [ ] **Step 1: PickCategoryModal 两栏**

`src/components/PickCategoryModal.vue` 的 `<template>`（第 12-22 行）替换为：

```vue
<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>移动分类（{{ props.siteIds.length }} 项）</h3>
      <div class="modal-cols">
        <div>
          <label>目标分类</label>
          <select v-model="target">
            <option :value="null">未分类</option>
            <option v-for="c in store.flatCategories" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
          </select>
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="confirm">移动</button></div>
        </div>
        <div class="help">
          <label>说明</label>
          <p class="muted">选中多个网站后从「移动分类…」进入本弹窗，批量调整归属。</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 2: AddTagsModal 两栏**

`src/components/AddTagsModal.vue` 的 `<template>`（第 16-24 行）替换为：

```vue
<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>添加标签（{{ props.siteIds.length }} 项）</h3>
      <div class="modal-cols">
        <div>
          <label>新标签（空格分隔）</label>
          <input v-model="tags" placeholder="新标签，空格分隔" />
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="confirm">添加</button></div>
        </div>
        <div class="help">
          <label>说明</label>
          <p class="muted">标签以空格分隔，多个标签可一次添加，批量应用到选中的网站。</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 通过。

Run: `npm run test`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/PickCategoryModal.vue src/components/AddTagsModal.vue
git commit -m "style: 移动分类与添加标签弹窗改为大卡片分栏"
```

---

### Task 11: 状态栏成功提示改绿色

**Files:**
- Modify: `src/components/StatusBar.vue:14`（flashMsg 改用 `.flash-ok`）

**Interfaces:**
- Consumes: Task 4 的 `.statusbar .flash-ok` 样式；store 的 `flashMsg`/`connectivityError` 不变
- Produces: 导入导出成功等提示在状态栏以**绿色**闪现；断网警告仍为琥珀色。

- [ ] **Step 1: flashMsg 改用 green class**

`src/components/StatusBar.vue` 第 14 行改为：

```vue
    <span v-if="store.flashMsg" class="flash-ok">{{ store.flashMsg }}</span>
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 通过。

Run: `npm run test`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/components/StatusBar.vue
git commit -m "style: 状态栏成功提示改为绿色闪现"
```

---

### Task 12: 全量回归 + 重建 MSI

**Files:**
- 无代码改动（仅验证）

**Interfaces:**
- Consumes: 全部前置任务
- Produces: 回归通过的发布包：`src-tauri\target\release\bundle\msi\网站收藏管家_0.1.0_x64_zh-CN.msi` 与 `...\nsis\网站收藏管家_0.1.0_x64-setup.exe`。

- [ ] **Step 1: 前端全量回归**

Run: `npm run test`
Expected: 16/16 通过。

Run: `npm run build`
Expected: vue-tsc + vite build 通过。

- [ ] **Step 2: Rust 全量回归**

Run（在 `src-tauri` 目录）：`cargo test`
Expected: 21/21 通过。

- [ ] **Step 3: 真机验证 dialog 权限修复**

Run: `npm run tauri dev`
手动验证清单（对应 PRD §15.4）：
- [ ] 打开「导入/导出」弹窗，点 4 个按钮各能弹出系统对话框
- [ ] 「设置」→「更改位置…」能弹出文件夹选择框
- [ ] 首次启动（删除 `config.json` 后启动）能弹出目录选择对话框
- [ ] 各弹窗均居中、大小正常（不再被侧栏 transform 影响）
- [ ] 添加/编辑弹窗内选「＋ 新建分类…」能弹出嵌套新建分类弹窗，且点击内层弹窗遮罩不会关闭外层
- [ ] 弹窗内拖选文字拖出遮罩松开不关闭
- [ ] 导入导出成功状态栏出现绿色提示；断网时仍为琥珀色警告

- [ ] **Step 4: 重建 MSI**

Run: `npm run tauri build`
Expected: 生成 `src-tauri\target\release\bundle\msi\网站收藏管家_0.1.0_x64_zh-CN.msi` 与 `src-tauri\target\release\bundle\nsis\网站收藏管家_0.1.0_x64-setup.exe`。

- [ ] **Step 5: 更新 ledger 并提交收尾**

在 `.superpowers\sdd\2026-08-16-website-collector-v1.1\progress.md` 追加 v1.2 完成记录（3 个 bug 修复 + 布局重设计 + 手动验收结果）。

```bash
git add .superpowers/sdd/2026-08-16-website-collector-v1.1/progress.md
git commit -m "docs: v1.2 回归与手动验收记录"
```