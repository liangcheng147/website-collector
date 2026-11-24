// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import SiteTable from '../components/SiteTable.vue'
import { useAppStore, UNCATEGORIZED_ID } from '../store/app'
import type { Site } from '../types'

const { openLinkMock, readFaviconMock } = vi.hoisted(() => ({
  openLinkMock: vi.fn(),
  readFaviconMock: vi.fn(),
}))
vi.mock('../api', () => ({
  openLink: openLinkMock,
  readFavicon: readFaviconMock,
}))

describe('SiteTable', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    openLinkMock.mockReset()
    readFaviconMock.mockReset().mockResolvedValue(null)
  })
  it('表头第6列显示"状态"而非"生命"', () => {
    const w = mount(SiteTable)
    const heads = w.findAll('th').map(h => h.text())
    expect(heads[5]).toContain('状态')
    expect(heads[5]).not.toContain('生命')
  })
  it('备注为空时显示"—"', () => {
    const store = useAppStore()
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '', deletedAt: '' } as unknown as Site]
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
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '', deletedAt: '' } as unknown as Site]
    store.search = '不存在的关键词'
    const w = mount(SiteTable)
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.text()).toContain('当前筛选没有结果')
    expect(w.text()).toContain('试着切换分类、标签或清空搜索')
  })
  it('未分类视图为空时提示所有站点都已分类', () => {
    const store = useAppStore()
    store.view = { kind: 'category', id: UNCATEGORIZED_ID }
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: 'c1', tags: [], status: 'ok', note: '', deletedAt: '' } as unknown as Site]
    const w = mount(SiteTable)
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.text()).toContain('所有站点都已分类')
  })
  it('批量按钮为 n-button，选择为 n-checkbox', async () => {
    const store = useAppStore()
    store.view = { kind: 'all' }
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '', deletedAt: '' } as unknown as Site]
    store.data.categories = []
    const w = mount(SiteTable)
    const boxes = w.findAll('.n-checkbox')
    expect(boxes.length).toBe(2) // 1 全选 + 1 行
    await boxes[1].trigger('click')
    expect(w.find('.batchbar').exists()).toBe(true)
    const deleteBtn = w.findAll('.batchbar button').find(b => b.text().includes('删除所选'))
    expect(deleteBtn).toBeDefined()
    expect(deleteBtn!.classes()).toContain('n-button')
    expect(deleteBtn!.classes()).toContain('n-button--error-type')
  })
  it('名称列在无 faviconPath 时渲染图标占位', () => {
    const store = useAppStore()
    store.view = { kind: 'all' }
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '' } as unknown as Site]
    store.data.categories = []
    const w = mount(SiteTable)
    expect(w.find('[data-testid="site-favicon-placeholder"]').exists()).toBe(true)
    expect(w.find('[data-testid="site-favicon"]').exists()).toBe(false)
  })
  it('名称列在有 faviconPath 时显示缓存的图标', async () => {
    const store = useAppStore()
    store.view = { kind: 'all' }
    readFaviconMock.mockResolvedValue('data:image/png;base64,AAAA')
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '', faviconPath: 'C:/data/favicons/a.png' } as unknown as Site]
    store.data.categories = []
    const w = mount(SiteTable)
    await flushPromises()
    expect(readFaviconMock).toHaveBeenCalledWith('C:/data/favicons/a.png')
    const img = w.find('[data-testid="site-favicon"]')
    expect(img.exists()).toBe(true)
    expect((img.element as HTMLImageElement).src).toContain('data:image/png;base64,AAAA')
  })
  it('无选中时批量操作禁用，选中后启用', async () => {
    const store = useAppStore()
    store.view = { kind: 'all' }
    store.data.sites = [
      { id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '' },
      { id: '2', name: 'B', url: 'https://b', categoryId: null, tags: [], status: 'ok', note: '' },
    ] as unknown as Site[]
    store.data.categories = []
    const w = mount(SiteTable)
    const findBtn = (text: string) =>
      w.findAll('.batchbar button').find(b => b.text().includes(text))!
    for (const label of ['检测所选', '移动分类', '添加标签', '删除所选']) {
      expect(findBtn(label).classes()).toContain('n-button--disabled')
    }
    await w.findAll('.n-checkbox')[1].trigger('click')
    for (const label of ['检测所选', '移动分类', '添加标签', '删除所选']) {
      expect(findBtn(label).classes()).not.toContain('n-button--disabled')
    }
  })
  it('批量移动/标签按钮以选中 id 触发事件', async () => {
    const store = useAppStore()
    store.view = { kind: 'all' }
    store.data.sites = [
      { id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '' },
      { id: '2', name: 'B', url: 'https://b', categoryId: null, tags: [], status: 'ok', note: '' },
    ] as unknown as Site[]
    store.data.categories = []
    const w = mount(SiteTable)
    await w.findAll('.n-checkbox')[1].trigger('click')
    await w.findAll('.n-checkbox')[2].trigger('click')
    const clickBtn = async (text: string) => {
      const btn = w.findAll('.batchbar button').find(b => b.text().includes(text))!
      await btn.trigger('click')
    }
    await clickBtn('移动分类')
    expect(w.emitted('move')![0]).toEqual([['1', '2']])
    await clickBtn('添加标签')
    expect(w.emitted('tag')![0]).toEqual([['1', '2']])
  })
  it('失效视图显示清理入口并可触发 cleanup', async () => {
    const store = useAppStore()
    store.view = { kind: 'dead' }
    store.data.sites = [
      { id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'dead', note: '' },
      { id: '2', name: 'B', url: 'https://b', categoryId: null, tags: [], status: 'ok', note: '' },
    ] as unknown as Site[]
    store.data.categories = []
    const w = mount(SiteTable)
    const cleanup = w.findAll('.batchbar button').find(b => b.text().includes('清理失效'))
    expect(cleanup).toBeDefined()
    expect(cleanup!.classes()).not.toContain('n-button--disabled')
    await cleanup!.trigger('click')
    expect(w.emitted('cleanup')).toBeTruthy()
  })
  it('非失效视图不显示清理入口', () => {
    const store = useAppStore()
    store.view = { kind: 'all' }
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'dead', note: '' }] as unknown as Site[]
    store.data.categories = []
    const w = mount(SiteTable)
    expect(w.findAll('.batchbar button').some(b => b.text().includes('清理失效'))).toBe(false)
  })
})
