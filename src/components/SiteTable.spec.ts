// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import SiteTable from '../components/SiteTable.vue'
import { useAppStore, UNCATEGORIZED_ID } from '../store/app'

describe('SiteTable', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('表头第6列显示"状态"而非"生命"', () => {
    const w = mount(SiteTable)
    const heads = w.findAll('th').map(h => h.text())
    expect(heads[5]).toContain('状态')
    expect(heads[5]).not.toContain('生命')
  })
  it('备注为空时显示"—"', () => {
    const store = useAppStore()
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '', deletedAt: '' } as any]
    store.data.categories = []
    const w = mount(SiteTable)
    const noteCell = w.findAll('td').find(td => td.text() === '—')!
    expect(noteCell.exists()).toBe(true)
  })
  it('无站点时渲染空状态引导', () => {
    const store = useAppStore()
    store.view = { kind: 'all' }
    const w = mount(SiteTable)
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.find('.empty-state .empty-icon').exists()).toBe(true)
    expect(w.text()).toContain('还没有网站')
    expect(w.text()).toContain('点击右上角「添加」开始归集你的链接')
  })
  it('有站点但筛选无结果时提示调整筛选', () => {
    const store = useAppStore()
    store.view = { kind: 'all' }
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '', deletedAt: '' } as any]
    store.search = '不存在的关键词'
    const w = mount(SiteTable)
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.text()).toContain('当前筛选没有结果')
    expect(w.text()).toContain('试着切换分类、标签或清空搜索')
  })
  it('未分类视图为空时提示所有站点都已分类', () => {
    const store = useAppStore()
    store.view = { kind: 'category', id: UNCATEGORIZED_ID }
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: 'c1', tags: [], status: 'ok', note: '', deletedAt: '' } as any]
    const w = mount(SiteTable)
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.text()).toContain('所有站点都已分类')
  })
})
