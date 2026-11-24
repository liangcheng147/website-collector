// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, nextTick, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import { useAppStore } from '../store/app'
import DeadCleanupModal from './DeadCleanupModal.vue'
import type { AppData, Site } from '../types'

vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
}))

// useDialog 与 n-modal 都需要 provider；modal 内容 teleport 到 document.body
function mountWithDialog(component: Component) {
  return mount({
    setup: () => () => h(NDialogProvider, null, { default: () => h(component) }),
  })
}

function makeSite(id: string, status: Site['status']): Site {
  return { id, name: '站点' + id, url: `https://${id}.dev`, categoryId: null, tags: [], status, lastCheck: null, note: '' }
}

function seed(): AppData {
  return {
    version: 1,
    categories: [],
    sites: [makeSite('a', 'dead'), makeSite('b', 'ok'), makeSite('c', 'dead'), makeSite('d', 'unknown')],
    recycleBin: [],
    tags: [],
  }
}

async function mountModal() {
  const w = mountWithDialog(DeadCleanupModal)
  await nextTick()
  await nextTick()
  return w
}

function bodyButton(label: string): HTMLElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find(
    el => el.textContent?.trim() === label,
  ) as HTMLElement | undefined
}

describe('DeadCleanupModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('仅列出失效站点，不含正常/待检测', async () => {
    const store = useAppStore()
    store.data = seed()
    await mountModal()
    expect(document.body.textContent).toContain('站点a')
    expect(document.body.textContent).toContain('站点c')
    expect(document.body.textContent).not.toContain('站点b')
    expect(document.body.textContent).not.toContain('站点d')
    expect(document.body.querySelectorAll('.cleanup-row')).toHaveLength(2)
  })

  it('无失效站点时显示空状态且不可操作', async () => {
    const store = useAppStore()
    store.data = seed()
    store.data.sites = [makeSite('b', 'ok')]
    await mountModal()
    expect(document.body.textContent).toContain('没有失效站点')
    const trash = bodyButton('移入回收站')
    expect(trash).toBeDefined()
    expect(trash!.classList.contains('n-button--disabled')).toBe(true)
  })

  it('未选中时移入回收站禁用，勾选后启用并显示已选数', async () => {
    const store = useAppStore()
    store.data = seed()
    await mountModal()
    const trash = () => bodyButton('移入回收站')!
    expect(trash().classList.contains('n-button--disabled')).toBe(true)
    const boxes = Array.from(document.body.querySelectorAll('.n-checkbox'))
    ;(boxes[1] as HTMLElement).click()
    await nextTick()
    expect(trash().classList.contains('n-button--disabled')).toBe(false)
    expect(document.body.textContent).toContain('已选 1')
  })

  it('确认后才移入回收站，取消则不删除', async () => {
    const store = useAppStore()
    store.data = seed()
    await mountModal()
    const boxes = Array.from(document.body.querySelectorAll('.n-checkbox'))
    ;(boxes[1] as HTMLElement).click()
    await nextTick()
    ;(bodyButton('移入回收站')!).click()
    await nextTick()
    // 确认前不删除
    expect(store.data.sites.map(s => s.id)).toEqual(['a', 'b', 'c', 'd'])
    const dialogBtn = Array.from(document.body.querySelectorAll('.n-dialog button'))
      .find(el => el.textContent?.includes('移入回收站')) as HTMLElement
    expect(dialogBtn).toBeDefined()
    dialogBtn.click()
    await nextTick()
    expect(store.data.sites.map(s => s.id)).toEqual(['b', 'c', 'd'])
    expect(store.trashedSites.map(t => t.site.id)).toEqual(['a'])
    expect(store.deadCount).toBe(1)
  })

  it('点击否定按钮（取消）后 sites/trashedSites 不变', async () => {
    const store = useAppStore()
    store.data = seed()
    await mountModal()
    const boxes = Array.from(document.body.querySelectorAll('.n-checkbox'))
    ;(boxes[1] as HTMLElement).click()
    await nextTick()
    ;(bodyButton('移入回收站')!).click()
    await nextTick()
    const negativeBtn = Array.from(document.body.querySelectorAll('.n-dialog button'))
      .find(el => el.textContent?.includes('取消')) as HTMLElement
    expect(negativeBtn).toBeDefined()
    negativeBtn.click()
    await nextTick()
    expect(store.data.sites.map(s => s.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(store.trashedSites).toHaveLength(0)
  })

  it('dead 集合收缩时本地选中随之裁剪（外部变更模拟）', async () => {
    const store = useAppStore()
    store.data = seed()
    await mountModal()
    const headerBox = document.body.querySelector('.n-checkbox') as HTMLElement
    headerBox.click() // 全选 a、c
    await nextTick()
    expect(document.body.textContent).toContain('已选 2')
    store.updateSite('a', { status: 'ok' }) // 模拟检测恢复导致 a 不再是 dead
    await nextTick()
    expect(document.body.querySelectorAll('.cleanup-row')).toHaveLength(1)
    expect(document.body.textContent).toContain('已选 1')
    expect(document.body.textContent).not.toContain('已选 2')
  })

  it('全部移入回收站后自动关闭', async () => {
    const store = useAppStore()
    store.data = seed()
    const w = await mountModal()
    const headerBox = document.body.querySelector('.n-checkbox') as HTMLElement
    headerBox.click()
    await nextTick()
    ;(bodyButton('移入回收站')!).click()
    await nextTick()
    const dialogBtn = Array.from(document.body.querySelectorAll('.n-dialog button'))
      .find(el => el.textContent?.includes('移入回收站')) as HTMLElement
    dialogBtn.click()
    await nextTick()
    expect(store.trashedSites).toHaveLength(2)
    expect(w.findComponent(DeadCleanupModal).emitted('close')).toBeTruthy()
  })
})
