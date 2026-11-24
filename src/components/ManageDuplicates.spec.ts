// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../store/app'
import type { AppData } from '../types'
import ManageDuplicates from './ManageDuplicates.vue'

vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
}))

function dupData(): AppData {
  return {
    version: 1,
    categories: [],
    sites: [
      { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: ['框架'], status: 'ok', lastCheck: null, note: '第一条' },
      { id: '2', name: 'A2', url: 'HTTPS://A.dev/', categoryId: null, tags: ['工具'], status: 'dead', lastCheck: null, note: '第二条' },
      { id: '3', name: 'B', url: 'https://b.dev', categoryId: null, tags: [], status: 'unknown', lastCheck: null, note: '' },
    ],
    recycleBin: [],
    tags: ['框架', '工具'],
  }
}

function actionButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('button').find(b => b.text().includes(label))
}

describe('ManageDuplicates', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('列出重复分组且不含唯一链接', () => {
    const store = useAppStore()
    store.data = dupData()
    const w = mount(ManageDuplicates)
    expect(w.text()).toContain('https://a.dev')
    expect(w.text()).not.toContain('https://b.dev')
    expect(w.text()).toContain('2 条')
  })

  it('无重复时显示空态', () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    const w = mount(ManageDuplicates)
    expect(w.text()).toContain('暂无重复链接')
  })

  it('保留所选把同组其余站点移入回收站', async () => {
    const store = useAppStore()
    store.data = dupData()
    const w = mount(ManageDuplicates)
    await actionButton(w, '保留所选')!.trigger('click')
    expect(store.data.sites.map(s => s.id)).toEqual(['1', '3'])
    expect(store.trashedSites.map(t => t.site.id)).toEqual(['2'])
    expect(w.text()).toContain('暂无重复链接')
  })

  it('切换单选后以所选站点为保留项', async () => {
    const store = useAppStore()
    store.data = dupData()
    const w = mount(ManageDuplicates)
    const inputs = w.findAll('.n-radio input[type="radio"]')
    expect(inputs.length).toBe(2)
    await inputs[1].setValue()
    await actionButton(w, '保留所选')!.trigger('click')
    expect(store.data.sites.map(s => s.id)).toEqual(['2', '3'])
    expect(store.trashedSites.map(t => t.site.id)).toEqual(['1'])
  })

  it('合并到所选汇总标签与备注', async () => {
    const store = useAppStore()
    store.data = dupData()
    const w = mount(ManageDuplicates)
    await actionButton(w, '合并到所选')!.trigger('click')
    expect(store.data.sites.map(s => s.id)).toEqual(['1', '3'])
    const keeper = store.data.sites.find(s => s.id === '1')!
    expect(keeper.tags.slice().sort()).toEqual(['工具', '框架'])
    expect(keeper.note).toContain('第一条')
    expect(keeper.note).toContain('第二条')
  })

  it('标记整组为重复标签', async () => {
    const store = useAppStore()
    store.data = dupData()
    const w = mount(ManageDuplicates)
    await actionButton(w, '标记整组')!.trigger('click')
    expect(store.data.sites.filter(s => s.tags.includes('重复')).map(s => s.id)).toEqual(['1', '2'])
  })
})
