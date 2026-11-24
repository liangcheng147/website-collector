// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import App from './App.vue'

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
