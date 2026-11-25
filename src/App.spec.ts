// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import App from './App.vue'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from './composables/useSidebarResize'

vi.mock('./api', () => ({
  loadData: vi.fn().mockResolvedValue({ version: 1, categories: [], sites: [], recycleBin: [], tags: [] }),
  getDataLocation: vi.fn().mockResolvedValue({ dir: '', isFallback: false }),
  getSettings: vi.fn().mockResolvedValue({
    theme: 'system', palette: 'teal', zoom: 100, sidebarCollapsed: [], collapsedCategories: [],
    autoCheckUpdate: false, autoFetchFavicon: true, autoCheck: false, checkInterval: 0,
    checkScope: 'all', retryCount: 1, concurrency: 3,
  }),
  saveData: vi.fn().mockResolvedValue(undefined),
  setSettings: vi.fn().mockResolvedValue(undefined),
  checkConnectivity: vi.fn().mockResolvedValue(true),
  checkSiteOnce: vi.fn().mockResolvedValue({ status: 'ok', usedUrl: 'https://x.dev' }),
  verifySiteWebview: vi.fn().mockResolvedValue({ status: 'ok', usedUrl: 'https://x.dev' }),
}))
vi.mock('./updater', () => ({ checkForUpdate: vi.fn().mockResolvedValue({ ok: false }) }))

// Tauri 窗口 API 与大量子交互在命令面板测试中不需要，全部打桩；CommandPalette/AddEditModal 保持真实
const stubs = {
  TitleBar: true,
  TopBar: true,
  Sidebar: true,
  SiteTable: true,
  StatusBar: true,
  RecycleView: true,
  ManageView: true,
  ImportExportModal: true,
  SettingsModal: true,
  PickCategoryModal: true,
  AddTagsModal: true,
  DeadCleanupModal: true,
}

async function mountApp() {
  const w = mount(App, { global: { stubs } })
  await flushPromises()
  await nextTick()
  return w
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}

async function openPalette() {
  pressKey('k', { ctrlKey: true })
  await nextTick()
}

describe('App 全局命令面板快捷键', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('Ctrl+K 打开命令面板，再按一次关闭', async () => {
    await mountApp()
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeNull()
    await openPalette()
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeTruthy()
    await openPalette()
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeNull()
  })

  it('Cmd+K（metaKey）同样打开', async () => {
    await mountApp()
    pressKey('k', { metaKey: true })
    await nextTick()
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeTruthy()
  })

  it('焦点在输入框内时 Ctrl+K 仍打开命令面板', async () => {
    await mountApp()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await openPalette()
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeTruthy()
    input.remove()
  })

  it('通过面板执行「添加站点」会打开添加弹窗并关闭面板', async () => {
    await mountApp()
    await openPalette()
    const input = document.body.querySelector('[data-testid="command-search"] input') as HTMLInputElement
    input.value = '添加'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    pressKey('Enter')
    await nextTick()
    await nextTick()
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="modal-add-edit"]')).toBeTruthy()
  })

  it('面板打开时按 Esc 只关闭面板，保留其后已打开的弹窗', async () => {
    await mountApp()
    await openPalette()
    const input = document.body.querySelector('[data-testid="command-search"] input') as HTMLInputElement
    input.value = '添加'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    pressKey('Enter')
    await nextTick()
    await nextTick()
    expect(document.body.querySelector('[data-testid="modal-add-edit"]')).toBeTruthy()

    await openPalette()
    pressKey('Escape')
    await nextTick()
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="modal-add-edit"]')).toBeTruthy()
  })
})

function resizer() {
  return document.querySelector('[data-testid="sidebar-resizer"]') as HTMLElement
}
function bodyEl() {
  return document.querySelector('.body') as HTMLElement
}
function pointer(type: string, clientX: number) {
  return new MouseEvent(type, { bubbles: true, clientX, button: 0 })
}

// mountApp 不挂到 document，document.querySelector 查不到 App 自身 DOM；本组测试需要真实命中拖拽手柄。
async function mountAttached() {
  const w = mount(App, { global: { stubs }, attachTo: document.body })
  await flushPromises()
  await nextTick()
  return w
}

describe('App 侧栏宽度拖动', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('默认渲染 170px 与可访问的分割线', async () => {
    await mountAttached()
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
    await mountAttached()
    resizer().dispatchEvent(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 260))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe('260px 1fr')
    expect(resizer().getAttribute('aria-valuenow')).toBe('260')
    document.dispatchEvent(pointer('pointerup', 260))
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('260')
  })

  it('拖动越界被限制在 160–360', async () => {
    await mountAttached()
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
    await mountAttached()
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
    await mountAttached()
    resizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe('180px 1fr')
    resizer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await nextTick()
    expect(bodyEl().style.gridTemplateColumns).toBe('170px 1fr')
  })

  it('挂载时恢复持久化宽度', async () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '240')
    await mountAttached()
    expect(bodyEl().style.gridTemplateColumns).toBe('240px 1fr')
  })
})
