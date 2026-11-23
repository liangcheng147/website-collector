// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import { useAppStore } from '../store/app'
import RecycleView from './RecycleView.vue'
import { mount } from '@vue/test-utils'

// RecycleView 在 setup 里调 useDialog()，没有 provider 会抛异常
function mountWithDialog(component: Component) {
  return mount({
    setup: () => () => h(NDialogProvider, null, { default: () => h(component) }),
  })
}

describe('RecycleView', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('shows empty state when recycle bin is empty', () => {
    const store = useAppStore()
    store.data.recycleBin = []
    const w = mountWithDialog(RecycleView)
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.text()).toContain('回收站为空')
  })

  it('shows trashed sites with restore/delete buttons', () => {
    const store = useAppStore()
    store.data.recycleBin = [
      { site: { id: '1', name: 'Old Site', url: 'https://old.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' }, deletedAt: '2026-09-01T10:00:00Z' },
    ]
    const w = mountWithDialog(RecycleView)
    expect(w.text()).toContain('Old Site')
    expect(w.text()).toContain('恢复')
    expect(w.text()).toContain('彻底删除')
  })

  it('shows batch bar with count when items selected', async () => {
    const store = useAppStore()
    store.data.recycleBin = [
      { site: { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' }, deletedAt: '2026-09-01T10:00:00Z' },
      { site: { id: '2', name: 'B', url: 'https://b.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' }, deletedAt: '2026-09-02T10:00:00Z' },
    ]
    const w = mountWithDialog(RecycleView)
    // Click checkbox inside first data row (skip header row's checkbox)
    const rows = w.findAll('tbody tr')
    const firstRowCb = rows[0].find('.n-checkbox')
    await firstRowCb.trigger('click')
    expect(w.text()).toContain('已选 1 项')
    expect(w.text()).toContain('恢复所选')
  })

  it('批量按钮为 n-button，选择为 n-checkbox', async () => {
    const store = useAppStore()
    store.data.recycleBin = [
      { site: { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' }, deletedAt: '2026-09-01T10:00:00Z' },
      { site: { id: '2', name: 'B', url: 'https://b.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' }, deletedAt: '2026-09-02T10:00:00Z' },
    ]
    const w = mountWithDialog(RecycleView)
    const boxes = w.findAll('.n-checkbox')
    expect(boxes.length).toBe(3) // 1 全选 + 2 行
    await boxes[1].trigger('click')
    const restoreBtn = w.findAll('button').find(b => b.text().includes('恢复所选'))
    expect(restoreBtn).toBeDefined()
    expect(restoreBtn!.classes()).toContain('n-button')
    const deleteBtn = w.findAll('button').find(b => b.text().includes('彻底删除所选'))
    expect(deleteBtn!.classes()).toContain('n-button--error-type')
  })

  it('shows recycle bin count in batch bar when nothing selected', () => {
    const store = useAppStore()
    store.data.recycleBin = [
      { site: { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' }, deletedAt: '2026-09-01T10:00:00Z' },
    ]
    const w = mountWithDialog(RecycleView)
    expect(w.text()).toContain('回收站 · 1 项')
    expect(w.text()).toContain('清空回收站')
  })

  it('shows deleted date formatted', () => {
    const store = useAppStore()
    store.data.recycleBin = [
      { site: { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' }, deletedAt: '2026-09-15T12:00:00Z' },
    ]
    const w = mountWithDialog(RecycleView)
    expect(w.text()).toContain('2026-09-15')
  })
})
