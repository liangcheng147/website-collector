// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, nextTick, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import CommandPalette from './CommandPalette.vue'

vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
}))

// n-modal 内容 teleport 到 document.body，断言统一走 body 查询
function mountPalette() {
  // 关掉 VTU 默认的 Transition 打桩：否则 n-modal 的 focus-trap 哨兵与卡片之间隔着
  // <transition-stub>，autoFocus 找不到真实卡片，聚焦断言与浏览器行为不一致
  return mount(
    { setup: () => () => h(NDialogProvider, null, { default: () => h(CommandPalette as Component) }) },
    { global: { stubs: { transition: false, Transition: false } } },
  )
}

async function mountedPalette() {
  const w = mountPalette()
  await nextTick()
  await nextTick()
  return w
}

function rows(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[data-testid="command-palette"] .cmd-row')) as HTMLElement[]
}

function searchInput(): HTMLInputElement {
  return document.body.querySelector('[data-testid="command-search"] input') as HTMLInputElement
}

async function typeQuery(q: string) {
  const el = searchInput()
  el.value = q
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}

describe('CommandPalette', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('打开时渲染全部命令并显示键盘提示', async () => {
    await mountedPalette()
    const list = rows()
    expect(list.length).toBeGreaterThan(5)
    expect(document.body.textContent).toContain('添加站点')
    expect(document.body.textContent).toContain('↑↓ 选择')
    expect(searchInput()).toBeTruthy()
  })

  it('输入关键字即时过滤命令数量', async () => {
    await mountedPalette()
    await typeQuery('添加')
    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain('添加站点')
    await typeQuery('视图')
    expect(rows()).toHaveLength(3)
    await typeQuery('设置')
    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain('设置')
  })

  it('上下键移动高亮，Enter 执行高亮命令并关闭', async () => {
    const w = await mountedPalette()
    await typeQuery('视图')
    expect(rows()[0].classList.contains('active')).toBe(true)
    pressKey('ArrowDown')
    await nextTick()
    expect(rows()[0].classList.contains('active')).toBe(false)
    expect(rows()[1].classList.contains('active')).toBe(true)
    pressKey('Enter')
    await nextTick()
    expect(w.findComponent(CommandPalette).emitted('view')).toBeTruthy()
    expect((w.findComponent(CommandPalette).emitted('view')![0] as [{ kind: string }])[0].kind).toBe('dead')
    expect(w.findComponent(CommandPalette).emitted('close')).toBeTruthy()
  })

  it('点击命令执行并触发对应事件且关闭', async () => {
    const w = await mountedPalette()
    const addRow = rows().find(r => r.textContent?.includes('添加站点'))!
    addRow.click()
    await nextTick()
    expect(w.findComponent(CommandPalette).emitted('add')).toBeTruthy()
    expect(w.findComponent(CommandPalette).emitted('close')).toBeTruthy()
  })

  it('Esc 关闭面板', async () => {
    const w = await mountedPalette()
    pressKey('Escape')
    await nextTick()
    expect(w.findComponent(CommandPalette).emitted('close')).toBeTruthy()
  })

  it('无匹配时显示空状态', async () => {
    await mountedPalette()
    await typeQuery('不存在的命令xyz')
    expect(rows()).toHaveLength(0)
    expect(document.body.textContent).toContain('没有匹配的命令')
  })

  it('打开时搜索框自动获得焦点', async () => {
    await mountedPalette()
    const active = document.activeElement as HTMLElement | null
    expect(active?.tagName).toBe('INPUT')
    expect(active?.closest('[data-testid="command-search"]')).toBeTruthy()
  })

  it('mouseenter 高亮对应行', async () => {
    await mountedPalette()
    const row = rows()[1]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await nextTick()
    expect(row.classList.contains('active')).toBe(true)
  })
})
