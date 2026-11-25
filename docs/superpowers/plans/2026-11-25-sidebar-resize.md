# 左侧栏宽度可拖动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让左侧栏（分类 / 视图 / 标签 / 系统）可以用鼠标拖动右边缘调整宽度，范围 160–360px，默认 170px，宽度持久化，双击复位，键盘可调。

**Architecture:** 新增一个无依赖的组合式函数 `useSidebarResize`，集中管理宽度状态、`localStorage` 读写、clamp 与指针/键盘事件。`App.vue` 的 `.body` 用动态 `gridTemplateColumns` 绑定宽度，并在侧栏右边缘渲染一条绝对定位的 6px 拖拽手柄（不参与 grid 布局）。管理页保持全宽且不渲染手柄。

**Tech Stack:** Vue 3.5, Pinia, TypeScript, Vitest + happy-dom, Playwright

**Spec:** `docs/superpowers/specs/2026-11-25-sidebar-resize-design.md`

## Global Constraints

- 宽度范围 **160–360px**，默认 **170px**，取值一律 `Math.round` 后 clamp。
- 持久化键固定为 `localStorage['site-collector-sidebar-width']`；读写失败静默忽略。
- **不引入新依赖**（不用 splitpanes / vue-resizable / CSS 原生 resize）。
- 颜色只能来自 `src/theme` 写入的 CSS 变量，**禁止硬编码十六进制**。
- 模板中不出现静态 `style="..."`；宽度、位置用动态 `:style` 绑定。
- 保留现有 `data-testid` / ARIA 与 e2e 选择器；不改 Rust 侧、数据格式、IPC。
- 管理页（`manage === true`）不渲染拖拽手柄，仍由 `.manage { grid-column: 1 / -1 }` 全宽显示。
- 每个任务结束必须跑 `npm test` 与 `npm run build`；改动界面后跑 `npm run lint`，收尾跑 `npx playwright test`。

## Review Focus

1. **监听器泄漏** —— `pointermove` / `pointerup` / `pointercancel` 必须在拖动结束或组件卸载时移除；重复 `pointerup` 不得重复写 localStorage。
2. **越界拖动** —— 从 170 拖到 1000 应停在 360，拖到 -1000 应停在 160；小数宽度取整。
3. **脏 localStorage** —— 值缺失、`"abc"`、`"NaN"`、`"999"` 时分别回退默认 / clamp 到边界，不得抛错。
4. **不破坏 grid** —— 手柄绝对定位，不占列；`.content` 的滚动行为不变；管理页无手柄。
5. **命中区与层级** —— 6px 宽、以 `translateX(-3px)` 骑在分割线上，`z-index` 高于内容，否则拖不到。
6. **无障碍** —— `role="separator"`、`aria-orientation="vertical"`、`aria-valuemin/max/now`、`tabindex="0"`；←/→ 每次 ±10px，`Home` 复位。
7. **既有测试不回归** —— `App.spec.ts` 用 stub 挂载，新增手柄不得影响命令面板相关用例。

---

## File Structure

| 文件 | 职责 | 状态 |
|---|---|---|
| `src/composables/useSidebarResize.ts` | 宽度状态、clamp、localStorage 读写、指针/键盘交互 | 新建 |
| `src/composables/useSidebarResize.spec.ts` | 纯函数与交互单测 | 新建 |
| `src/App.vue` | `.body` 动态列宽 + 拖拽手柄 + 手柄样式 | 修改 |
| `src/App.spec.ts` | App 级拖拽/持久化/复位测试 | 修改 |
| `e2e/sidebar-resize.spec.ts` | 真实浏览器拖动 + 刷新后保留 | 新建 |

---

### Task 1: 宽度状态与交互组合式函数

**Files:**
- Create: `src/composables/useSidebarResize.spec.ts`
- Create: `src/composables/useSidebarResize.ts`

**Interfaces:**
- Produces（Task 2 依赖这些名字，不得改名）：
  ```ts
  // src/composables/useSidebarResize.ts
  export const SIDEBAR_MIN_WIDTH = 160
  export const SIDEBAR_MAX_WIDTH = 360
  export const SIDEBAR_DEFAULT_WIDTH = 170
  export const SIDEBAR_WIDTH_STORAGE_KEY = 'site-collector-sidebar-width'

  export function clampSidebarWidth(value: number): number
  export function readSidebarWidth(storage?: Storage | null): number
  export function writeSidebarWidth(width: number, storage?: Storage | null): void

  export function useSidebarResize(): {
    width: Ref<number>
    dragging: Ref<boolean>
    onPointerDown: (e: PointerEvent) => void
    onDoubleClick: () => void
    onKeydown: (e: KeyboardEvent) => void
  }
  ```

- [ ] **Step 1: 先写失败测试**

创建 `src/composables/useSidebarResize.spec.ts`：

```ts
// @vitest-environment happy-dom
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  clampSidebarWidth,
  readSidebarWidth,
  writeSidebarWidth,
  useSidebarResize,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from './useSidebarResize'

const Harness = defineComponent({
  setup() {
    return useSidebarResize()
  },
  template: '<div />',
})

function pointer(type: string, clientX: number, button = 0): PointerEvent {
  // happy-dom 的 PointerEvent 构造支持不完整，用 MouseEvent 提供 clientX/button 后断言类型
  return new MouseEvent(type, { bubbles: true, clientX, button }) as unknown as PointerEvent
}

describe('useSidebarResize 纯函数', () => {
  beforeEach(() => localStorage.clear())

  it('clampSidebarWidth 限制在 160–360 并取整', () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(1000)).toBe(SIDEBAR_MAX_WIDTH)
    expect(clampSidebarWidth(240.6)).toBe(241)
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('readSidebarWidth 处理缺失与脏数据', () => {
    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH)
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '999')
    expect(readSidebarWidth()).toBe(SIDEBAR_MAX_WIDTH)
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, 'abc')
    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('writeSidebarWidth 写入 clamp 后的整数字符串', () => {
    writeSidebarWidth(999.4)
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('360')
  })
})

describe('useSidebarResize 交互', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('拖动更新宽度，pointerup 时持久化', async () => {
    const w = mount(Harness)
    w.vm.onPointerDown(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 260))
    await nextTick()
    expect(w.vm.width).toBe(260)
    document.dispatchEvent(pointer('pointerup', 260))
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('260')
    w.unmount()
  })

  it('拖动越界被 clamp', async () => {
    const w = mount(Harness)
    w.vm.onPointerDown(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 5000))
    await nextTick()
    expect(w.vm.width).toBe(SIDEBAR_MAX_WIDTH)
    document.dispatchEvent(pointer('pointermove', -5000))
    await nextTick()
    expect(w.vm.width).toBe(SIDEBAR_MIN_WIDTH)
    document.dispatchEvent(pointer('pointerup', 0))
    w.unmount()
  })

  it('双击复位默认宽度并持久化', () => {
    const w = mount(Harness)
    w.vm.width = 300
    w.vm.onDoubleClick()
    expect(w.vm.width).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('170')
    w.unmount()
  })

  it('键盘 ←/→ 步进 10px，Home 复位', () => {
    const w = mount(Harness)
    w.vm.width = 200
    w.vm.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(w.vm.width).toBe(210)
    w.vm.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(w.vm.width).toBe(200)
    w.vm.onKeydown(new KeyboardEvent('keydown', { key: 'Home' }))
    expect(w.vm.width).toBe(SIDEBAR_DEFAULT_WIDTH)
    w.unmount()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/composables/useSidebarResize.spec.ts`
Expected: FAIL —— 模块 `./useSidebarResize` 不存在。

- [ ] **Step 3: 实现组合式函数**

创建 `src/composables/useSidebarResize.ts`：

```ts
import { onUnmounted, ref } from 'vue'

export const SIDEBAR_MIN_WIDTH = 160
export const SIDEBAR_MAX_WIDTH = 360
export const SIDEBAR_DEFAULT_WIDTH = 170
export const SIDEBAR_WIDTH_STORAGE_KEY = 'site-collector-sidebar-width'
const KEYBOARD_STEP = 10

/** 统一收敛宽度：取整后限制在 160–360；非法值回退默认。 */
export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)))
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readSidebarWidth(storage: Storage | null = getStorage()): number {
  if (!storage) return SIDEBAR_DEFAULT_WIDTH
  try {
    const raw = storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (raw === null) return SIDEBAR_DEFAULT_WIDTH
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

export function writeSidebarWidth(width: number, storage: Storage | null = getStorage()): void {
  if (!storage) return
  try {
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)))
  } catch {
    /* 隐私模式等写入失败时忽略 */
  }
}

/**
 * 侧栏宽度拖动：pointer 拖动实时更新，pointerup 持久化；
 * 双击复位；←/→ 步进，Home 复位。
 */
export function useSidebarResize() {
  const width = ref(readSidebarWidth())
  const dragging = ref(false)
  let startX = 0
  let startWidth = width.value

  function persist() {
    writeSidebarWidth(width.value)
  }

  function onPointerMove(e: PointerEvent) {
    width.value = clampSidebarWidth(startWidth + (e.clientX - startX))
  }

  function stopDrag() {
    if (!dragging.value) return
    dragging.value = false
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', stopDrag)
    document.removeEventListener('pointercancel', stopDrag)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    persist()
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.value = true
    startX = e.clientX
    startWidth = width.value
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', stopDrag)
    document.addEventListener('pointercancel', stopDrag)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function onDoubleClick() {
    width.value = SIDEBAR_DEFAULT_WIDTH
    persist()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') width.value = clampSidebarWidth(width.value - KEYBOARD_STEP)
    else if (e.key === 'ArrowRight') width.value = clampSidebarWidth(width.value + KEYBOARD_STEP)
    else if (e.key === 'Home') width.value = SIDEBAR_DEFAULT_WIDTH
    else return
    e.preventDefault()
    persist()
  }

  onUnmounted(stopDrag)

  return { width, dragging, onPointerDown, onDoubleClick, onKeydown }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/composables/useSidebarResize.spec.ts`
Expected: PASS（7 个用例）。

- [ ] **Step 5: 全量测试 + 构建 + 提交**

Run: `npm test` → 全绿；`npm run build` → EXIT=0。
```bash
git add src/composables/useSidebarResize.ts src/composables/useSidebarResize.spec.ts
git commit -m "feat: add sidebar resize composable"
```

---

### Task 2: App 集成拖拽手柄

**Files:**
- Modify: `src/App.vue`（script 引入、`.body` 动态列宽、手柄元素、scoped 样式）
- Modify: `src/App.spec.ts`（新增 describe）

**Interfaces:**
- Consumes：`useSidebarResize()` 返回的 `width` / `dragging` / `onPointerDown` / `onDoubleClick` / `onKeydown`；`SIDEBAR_MIN_WIDTH` / `SIDEBAR_MAX_WIDTH` / `SIDEBAR_DEFAULT_WIDTH` / `SIDEBAR_WIDTH_STORAGE_KEY`。
- Produces：`[data-testid="sidebar-resizer"]` 手柄，`role="separator"`。

- [ ] **Step 1: 先写失败测试**

先在 `src/App.spec.ts` 顶部现有 import 之后加入：

```ts
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from './composables/useSidebarResize'
```

再在文件末尾追加：

```ts
function resizer() {
  return document.querySelector('[data-testid="sidebar-resizer"]') as HTMLElement
}
function bodyEl() {
  return document.querySelector('.body') as HTMLElement
}
function pointer(type: string, clientX: number) {
  return new MouseEvent(type, { bubbles: true, clientX, button: 0 })
}

describe('App 侧栏宽度拖动', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('默认渲染 170px 与可访问的分割线', async () => {
    await mountApp()
    expect(bodyEl().style.gridTemplateColumns).toBe('170px 1fr')
    const handle = resizer()
    expect(handle).not.toBeNull()
    expect(handle.getAttribute('role')).toBe('separator')
    expect(handle.getAttribute('aria-orientation')).toBe('vertical')
    expect(handle.getAttribute('aria-valuemin')).toBe('160')
    expect(handle.getAttribute('aria-valuemax')).toBe('360')
    expect(handle.getAttribute('aria-valuenow')).toBe('170')
    expect(handle.getAttribute('tabindex')).toBe('0')
  })

  it('拖动更新列宽，松手写入 localStorage', async () => {
    await mountApp()
    resizer().dispatchEvent(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 260))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe('260px 1fr')
    expect(resizer().getAttribute('aria-valuenow')).toBe('260')
    document.dispatchEvent(pointer('pointerup', 260))
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('260')
  })

  it('拖动越界被限制在 160–360', async () => {
    await mountApp()
    resizer().dispatchEvent(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 5000))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe(`${SIDEBAR_MAX_WIDTH}px 1fr`)
    document.dispatchEvent(pointer('pointermove', -5000))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe(`${SIDEBAR_MIN_WIDTH}px 1fr`)
    document.dispatchEvent(pointer('pointerup', 0))
  })

  it('双击复位为默认宽度', async () => {
    await mountApp()
    resizer().dispatchEvent(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 300))
    document.dispatchEvent(pointer('pointerup', 300))
    await nextTick()
    resizer().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe(`${SIDEBAR_DEFAULT_WIDTH}px 1fr`)
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('170')
  })

  it('键盘 → 加宽、Home 复位', async () => {
    await mountApp()
    resizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe('180px 1fr')
    resizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe('170px 1fr')
  })

  it('挂载时恢复持久化宽度', async () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '240')
    await mountApp()
    expect(bodyEl().style.gridTemplateColumns).toBe('240px 1fr')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/App.spec.ts`
Expected: FAIL —— 找不到 `[data-testid="sidebar-resizer"]`，且 `.body` 列宽仍是静态 170px（`style.gridTemplateColumns` 为空）。

- [ ] **Step 3: 集成到 App.vue**

script 顶部加：

```ts
import {
  useSidebarResize,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from './composables/useSidebarResize'
```

setup 内加：

```ts
const {
  width: sidebarWidth,
  dragging: sidebarDragging,
  onPointerDown: onSidebarPointerDown,
  onDoubleClick: onSidebarDoubleClick,
  onKeydown: onSidebarKeydown,
} = useSidebarResize()
```

模板中 `.body` 与手柄：

```html
<div class="body" :style="{ gridTemplateColumns: sidebarWidth + 'px 1fr' }">
  <ManageView v-if="manage" @back="manage = false" @dead-cleanup="deadCleanup = true" />
  <template v-else>
    <Sidebar />
    <main class="content">
      <RecycleView v-if="store.view.kind === 'recycle'" />
      <SiteTable v-else @edit="openEdit" @check-site="(ids: string[]) => ids.length === 1 ? store.checkOne(ids[0]) : store.checkSelected()" @move="pickIds = $event" @tag="tagIds = $event" @cleanup="deadCleanup = true" />
    </main>
    <div
      class="sidebar-resizer"
      :class="{ dragging: sidebarDragging }"
      data-testid="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整侧栏宽度"
      :aria-valuemin="SIDEBAR_MIN_WIDTH"
      :aria-valuemax="SIDEBAR_MAX_WIDTH"
      :aria-valuenow="sidebarWidth"
      tabindex="0"
      :style="{ left: sidebarWidth + 'px' }"
      @pointerdown="onSidebarPointerDown"
      @dblclick="onSidebarDoubleClick"
      @keydown="onSidebarKeydown"
    />
  </template>
</div>
```

scoped 样式改为：

```css
.body { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 170px 1fr; }
.body > * { min-height: 0; }
.content { overflow: auto; padding: 12px; background: var(--bg); }

.sidebar-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  transform: translateX(-3px);
  cursor: col-resize;
  touch-action: none;
  background: transparent;
  z-index: 5;
}
.sidebar-resizer:hover,
.sidebar-resizer.dragging { background: var(--primary); }
.sidebar-resizer:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
```

> 说明：`.body` 里保留 `grid-template-columns: 170px 1fr` 作为无 JS 兜底，内联 `:style` 会覆盖它。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/App.spec.ts`
Expected: PASS（既有 5 个 + 新增 6 个）。

- [ ] **Step 5: 全量测试 + 构建 + lint + 提交**

Run: `npm test`、`npm run build`、`npm run lint` → 全部 EXIT=0。
```bash
git add src/App.vue src/App.spec.ts
git commit -m "feat: make sidebar width draggable"
```

---

### Task 3: e2e 回归与收尾验证

**Files:**
- Create: `e2e/sidebar-resize.spec.ts`

- [ ] **Step 1: 写 e2e**

创建 `e2e/sidebar-resize.spec.ts`（mock 参考 `e2e/navigation.spec.ts` 的 `addInitScript` 写法，只需空数据）：

```ts
import { test, expect, Page } from '@playwright/test'

async function mockInvoke(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        switch (cmd) {
          case 'load_data':
            return { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
          case 'get_settings':
            return {
              theme: 'system', palette: 'teal', zoom: 100, sidebarCollapsed: [], collapsedCategories: [],
              autoCheckUpdate: false, autoFetchFavicon: true, autoCheck: false, checkInterval: 0,
              checkScope: 'all', retryCount: 1, concurrency: 3,
            }
          case 'get_data_location': return { dir: '/tmp', isFallback: false }
          case 'check_connectivity': return true
          default: return undefined
        }
      },
    }
  })
}

test.beforeEach(async ({ page }) => {
  await mockInvoke(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
})

test('拖动分割线加宽侧栏并在刷新后保留', async ({ page }) => {
  const handle = page.locator('[data-testid="sidebar-resizer"]')
  await expect(handle).toHaveAttribute('aria-valuenow', '170')

  const box = (await handle.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 90, y, { steps: 5 })
  await page.mouse.up()

  const stored = await page.evaluate(() => localStorage.getItem('site-collector-sidebar-width'))
  expect(Number(stored)).toBeGreaterThanOrEqual(250)
  await expect(handle).toHaveAttribute('aria-valuenow', String(Number(stored)))

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-testid="sidebar-resizer"]')).toHaveAttribute('aria-valuenow', String(Number(stored)))
})

test('双击分割线复位为 170', async ({ page }) => {
  const handle = page.locator('[data-testid="sidebar-resizer"]')
  await handle.dblclick()
  await expect(handle).toHaveAttribute('aria-valuenow', '170')
})
```

- [ ] **Step 2: 跑 e2e**

Run: `npx playwright test`
Expected: 34 passed（原 32 + 新增 2）。

- [ ] **Step 3: 全量验证**

```bash
npm test
npm run build
npm run lint
npx playwright test
```
Expected: 全部 EXIT=0。构建后删除 `dist/`：
```powershell
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
```

- [ ] **Step 4: 提交**

```bash
git add e2e/sidebar-resize.spec.ts
git commit -m "test: cover sidebar resize drag and persistence"
```

---

## 手工验收（`npm run tauri dev`）

1. 侧栏右边缘悬停出现主题色竖条，按下拖动，分类/视图/标签整体变宽，内容区同步收缩。
2. 拖到 160 以下 / 360 以上停住；松手后重启应用宽度仍在。
3. 双击分割线回到 170px。
4. Tab 聚焦分割线，←/→ 每次 10px，Home 复位。
5. 进入「管理」页，手柄消失，管理页全宽；返回列表后手柄恢复且宽度保留。
