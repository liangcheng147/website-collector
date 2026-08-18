import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from './app'
vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
  checkConnectivity: vi.fn().mockResolvedValue(true),
  checkSite: vi.fn().mockResolvedValue({ status: 'ok', usedUrl: 'https://x.dev' }),
  getDataLocation: vi.fn().mockResolvedValue({ dir: 'C:\\data', isFallback: false }),
  getSettings: vi.fn().mockResolvedValue({ theme: 'system', zoom: 100, sidebarCollapsed: [], collapsedCategories: [] }),
  setSettings: vi.fn().mockResolvedValue(undefined),
}))
import * as api from '../api'
import type { AppData, Site } from '../types'

function makeSite(id: string, status: Site['status'], tags: string[]): Site {
  return { id, name: 'Site' + id, url: 'https://' + id + '.dev', categoryId: 'c1', tags, status, lastCheck: null, note: '' }
}

const makeData = (): AppData => ({
  version: 1,
  categories: [{ id: 'c1', name: '开发', children: [{ id: 'c2', name: '前端', children: [] }] }],
  sites: [
    makeSite('a', 'ok', ['框架']),
    makeSite('b', 'dead', ['框架']),
    makeSite('c', 'unknown', ['工具']),
  ],
  recycleBin: [],
  tags: ['框架', '工具'],
})

let baseData: AppData = makeData()

describe('app store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    baseData = makeData()
    vi.clearAllMocks()
  })

  it('all view returns all sites', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'all' }
    expect(s.filteredSites).toHaveLength(3)
  })

  it('flash sets message and auto-clears', () => {
    vi.useFakeTimers()
    const s = useAppStore()
    s.flash('已导出 md')
    expect(s.flashMsg).toBe('已导出 md')
    vi.advanceTimersByTime(2600)
    expect(s.flashMsg).toBe('')
    vi.useRealTimers()
  })

  it('dead view returns only dead', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'dead' }
    expect(s.filteredSites.map(x => x.id)).toEqual(['b'])
  })

  it('category view includes descendants', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'category', id: 'c1' }
    // c1 下无直属站点，但包含子分类 c2（也无站点），这里调整数据让 c2 下有站点
    s.data.sites[0].categoryId = 'c2'
    expect(s.filteredSites).toHaveLength(3)
  })

  it('tag view filters by tag', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'tag', id: '框架' }
    expect(s.filteredSites.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('search filters by name/url/tag', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'all' }
    s.search = '框架'
    expect(s.filteredSites).toHaveLength(2)
    s.search = '.dev'
    expect(s.filteredSites).toHaveLength(3)
  })

  it('addSite persists and dedups tags', async () => {
    const s = useAppStore()
    s.data = baseData
    s.addSite({ name: 'Vite', url: 'https://vite.dev', categoryId: 'c2', tags: ['工具', '框架'], note: '' })
    expect(s.data.sites).toHaveLength(4)
    expect(s.data.tags).toContain('框架')
    expect(s.data.tags).toContain('工具')
  })

  it('addSite carries note', () => {
    const s = useAppStore()
    s.data = baseData
    s.addSite({ name: 'Vite', url: 'https://vite.dev', categoryId: 'c2', tags: ['工具'], note: '构建工具' })
    expect(s.data.sites[s.data.sites.length - 1]!.note).toBe('构建工具')
  })

  it('updateSite sets note', () => {
    const s = useAppStore()
    s.data = baseData
    s.updateSite('a', { note: '新备注' })
    expect(s.data.sites[0].note).toBe('新备注')
  })

  it('search ignores note', () => {
    const s = useAppStore()
    s.data = baseData
    s.data.sites[0].note = '绝密内部关键词'
    s.view = { kind: 'all' }
    s.search = '绝密内部关键词'
    expect(s.filteredSites).toHaveLength(0)
  })

  it('updateSettings persists and applies', async () => {
    const s = useAppStore()
    await s.updateSettings({ zoom: 150 })
    expect(s.settings.zoom).toBe(150)
    expect(api.setSettings).toHaveBeenCalledWith({ theme: 'system', zoom: 150, sidebarCollapsed: [], collapsedCategories: [] })
  })

  it('init loads settings', async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ theme: 'dark', zoom: 130, sidebarCollapsed: [], collapsedCategories: [] })
    const s = useAppStore()
    await s.init()
    expect(s.settings).toEqual({ theme: 'dark', zoom: 130, sidebarCollapsed: [], collapsedCategories: [] })
  })

  it('deleteSites moves to recycle bin', () => {
    const s = useAppStore()
    s.data = baseData
    s.deleteSites(['a'])
    expect(s.data.sites.map(x => x.id)).toEqual(['b', 'c'])
    expect(s.trashedSites).toHaveLength(1)
    expect(s.trashedSites[0].site.id).toBe('a')
  })

  it('restoreSite returns to sites', () => {
    const s = useAppStore()
    s.data = baseData
    s.deleteSites(['a'])
    s.restoreSite('a')
    expect(s.data.sites).toHaveLength(3)
    expect(s.trashedSites).toHaveLength(0)
  })

  it('restoreSites restores multiple in one go', () => {
    const s = useAppStore()
    s.data = baseData
    s.deleteSites(['a', 'b'])
    s.restoreSites(['a', 'b'])
    expect(s.data.sites).toHaveLength(3)
    expect(s.trashedSites).toHaveLength(0)
  })

  it('restoreSites ignores ids not in recycle bin', () => {
    const s = useAppStore()
    s.data = baseData
    s.deleteSites(['a'])
    s.restoreSites(['a', 'zzz'])
    expect(s.data.sites).toHaveLength(3)
    expect(s.trashedSites).toHaveLength(0)
  })

  it('permanentlyDeleteSites removes from recycle bin only', () => {
    const s = useAppStore()
    s.data = baseData
    s.deleteSites(['a', 'b'])
    s.permanentlyDeleteSites(['a'])
    expect(s.data.sites.map(x => x.id)).toEqual(['c'])
    expect(s.trashedSites.map(t => t.site.id)).toEqual(['b'])
  })

  it('deleteCategory move-to-uncategorized clears categoryId', () => {
    const s = useAppStore()
    s.data = baseData
    // baseData 站点都挂在 c1 下，删除 c1 应清空其站点 categoryId
    s.deleteCategory('c1', 'move-to-uncategorized')
    expect(s.data.sites[0].categoryId).toBeNull()
  })

  it('deleteCategory delete-sites sends sites to recycle', () => {
    const s = useAppStore()
    s.data = baseData
    // 把站点挂在 c2 下
    s.data.sites.forEach(x => x.categoryId = 'c2')
    s.deleteCategory('c2', 'delete-sites')
    expect(s.data.sites).toHaveLength(0)
    expect(s.trashedSites).toHaveLength(3)
  })

  it('addTagsToSites appends and dedups', () => {
    const s = useAppStore()
    s.data = baseData
    s.addTagsToSites(['a', 'b'], ['新标签'])
    expect(s.data.sites[0].tags).toContain('新标签')
    expect(s.data.sites[1].tags).toContain('新标签')
  })

  it('addCategory returns new id and appends under parent', () => {
    const s = useAppStore()
    s.data = baseData
    const id = s.addCategory('子分类', 'c1')
    expect(id).toMatch(/^id_/)
    expect(s.data.categories[0].children.some(c => c.id === id)).toBe(true)
  })

  it('checkAll updates statuses and progress', async () => {
    const s = useAppStore()
    s.data = baseData
    vi.mocked(api.checkConnectivity).mockResolvedValue(true)
    vi.mocked(api.checkSite).mockResolvedValue({ status: 'dead', usedUrl: 'https://x.dev' })
    await s.checkAll()
    expect(s.data.sites.every(x => x.status === 'dead')).toBe(true)
    expect(s.progress.done).toBe(s.progress.total)
    expect(s.checking).toBe(false)
  })

  it('checkAll skips when already checking', async () => {
    const s = useAppStore()
    s.data = baseData
    s.checking = true
    await s.checkAll()
    expect(api.checkConnectivity).not.toHaveBeenCalled()
  })

  it('checkAll aborts when offline', async () => {
    const s = useAppStore()
    s.data = baseData
    s.data.sites.forEach(x => x.status = 'unknown') // baseData 状态不全是 unknown，先归位再验证未误标
    vi.mocked(api.checkConnectivity).mockResolvedValue(false)
    await s.checkAll()
    expect(s.checking).toBe(false)
    expect(s.data.sites.every(x => x.status === 'unknown')).toBe(true) // 未误标
    expect(s.connectivityError).toBe(true)
  })

  it('init loads data and location', async () => {
    const s = useAppStore()
    await s.init()
    expect(s.location).toEqual({ dir: 'C:\\data', isFallback: false })
  })

  it('selectOne resets selection and records anchor', () => {
    const s = useAppStore()
    s.data = baseData
    s.selectedIds = ['a', 'b']
    s.selectOne('c')
    expect(s.selectedIds).toEqual(['c'])
    expect(s.lastSelectedId).toBe('c')
  })

  it('toggleSelect maintains anchor', () => {
    const s = useAppStore()
    s.data = baseData
    s.toggleSelect('a')
    s.toggleSelect('b')
    expect(s.selectedIds).toEqual(['a', 'b'])
    expect(s.lastSelectedId).toBe('b')
  })

  it('selectRange selects between anchor and target', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'all' } // filteredSites 顺序 = [a, b, c]
    s.selectOne('a')
    s.selectRange('c')
    expect(s.selectedIds).toEqual(['a', 'b', 'c'])
  })

  it('selectRange respects filtered order', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'tag', id: '框架' } // filteredSites = [a, b]
    s.selectOne('b')
    s.selectRange('a')
    expect(s.selectedIds).toEqual(['a', 'b'])
  })

  it('selectRange falls back to single-select when anchor hidden', () => {
    const s = useAppStore()
    s.data = baseData
    s.data.sites[0].categoryId = 'c9' // a 移出 c1 视图 → filteredSites = [b, c]
    s.view = { kind: 'category', id: 'c1' }
    s.selectOne('a') // 锚点 a 不在当前视图
    s.selectRange('b') // 目标非最后一行：buggy slice(-1, 1) 会得到 []，修复后应回退单选 ['b']
    expect(s.selectedIds).toEqual(['b'])
    expect(s.lastSelectedId).toBe('b')
  })

  it('selectAllVisible selects all filtered sites', () => {
    const s = useAppStore()
    s.data = baseData
    s.search = '框架'
    s.selectAllVisible()
    expect(s.selectedIds).toEqual(['a', 'b'])
  })

  it('selectAllVisible clears when already all selected', () => {
    const s = useAppStore()
    s.data = baseData
    s.selectedIds = ['a', 'b', 'c']
    s.selectAllVisible()
    expect(s.selectedIds).toEqual([])
  })

  it('moveCategory moves to top level', () => {
    const s = useAppStore()
    s.data = baseData // c1(开发) → c2(前端)
    s.moveCategory('c2', null)
    expect(s.data.categories.some(c => c.id === 'c2')).toBe(true)
    expect(s.data.categories[0].children.some(c => c.id === 'c2')).toBe(false)
  })

  it('moveCategory moves under another category', () => {
    const s = useAppStore()
    s.data = baseData
    s.data.categories.push({ id: 'c3', name: '工具', children: [] })
    s.moveCategory('c1', 'c3')
    expect(s.data.categories.some(c => c.id === 'c1')).toBe(false)
    expect(s.data.categories.find(c => c.id === 'c3')!.children.some(c => c.id === 'c1')).toBe(true)
  })

  it('moveCategory rejects moving into own subtree', () => {
    const s = useAppStore()
    s.data = baseData
    s.moveCategory('c1', 'c2') // c2 是 c1 的子孙
    expect(s.data.categories[0].id).toBe('c1')
    expect(s.data.categories[0].children.some(c => c.id === 'c2')).toBe(true)
  })

  it('moveCategory rejects too deep target', () => {
    const s = useAppStore()
    s.data = baseData
    // baseData: c1(开发) → c2(前端)；把 c2 再挂一个子分类 c3（depth 2）
    s.data.categories[0].children[0].children.push({ id: 'c3', name: 'C', children: [] })
    s.moveCategory('c1', 'c3') // c3 已是第 3 层（depth 2），不能再作为父
    expect(s.data.categories.some(c => c.id === 'c1')).toBe(true)
  })

  it('categoryCounts counts descendants', () => {
    const s = useAppStore()
    s.data = baseData
    // baseData: 站点 a,b,c 都在 c1 下；把 a 挂到 c2
    s.data.sites[0].categoryId = 'c2'
    expect(s.categoryCounts['c1']).toBe(3)
    expect(s.categoryCounts['c2']).toBe(1)
  })

  it('deleteCategories moves sites to uncategorized', () => {
    const s = useAppStore()
    s.data = baseData
    s.data.sites.forEach(x => x.categoryId = 'c2') // 站点都挂 c2 下
    s.deleteCategories(['c2'], 'move-to-uncategorized')
    expect(s.data.categories[0].children).toHaveLength(0)
    expect(s.data.sites.every(x => x.categoryId === null)).toBe(true)
  })

  it('deleteCategories with parent removes descendants too', () => {
    const s = useAppStore()
    s.data = baseData
    s.deleteCategories(['c1'], 'move-to-uncategorized')
    expect(s.data.categories).toHaveLength(0)
    expect(s.data.sites.every(x => x.categoryId === null)).toBe(true)
  })

  it('deleteCategories delete-sites sends sites to recycle', () => {
    const s = useAppStore()
    s.data = baseData
    s.deleteCategories(['c1'], 'delete-sites')
    expect(s.data.categories).toHaveLength(0)
    expect(s.data.sites).toHaveLength(0)
    expect(s.trashedSites).toHaveLength(3)
  })

  it('renameTag renames across sites', () => {
    const s = useAppStore()
    s.data = baseData
    s.renameTag('框架', '前端框架')
    expect(s.data.sites[0].tags).toContain('前端框架')
    expect(s.data.sites[0].tags).not.toContain('框架')
    expect(s.data.tags).toContain('前端框架')
    expect(s.data.tags).not.toContain('框架')
  })

  it('deleteTags removes from all sites', () => {
    const s = useAppStore()
    s.data = baseData
    s.deleteTags(['框架'])
    expect(s.data.sites.every(x => !x.tags.includes('框架'))).toBe(true)
    expect(s.data.tags).toEqual(['工具'])
  })

  it('mergeTags merges into target and dedups', () => {
    const s = useAppStore()
    s.data = baseData
    s.data.sites[0].tags = ['框架', '工具']
    s.mergeTags(['框架', '工具'], '全栈')
    expect(s.data.sites[0].tags).toEqual(['全栈'])
    expect(s.data.sites[2].tags).toEqual(['全栈'])
    expect(s.data.tags).toContain('全栈')
    expect(s.data.tags).not.toContain('框架')
  })

  it('addTagsByScope adds to category descendants only', () => {
    const s = useAppStore()
    s.data = baseData
    s.data.sites[0].categoryId = 'c2' // a 挂 c2（c1 的子树）
    s.data.sites[1].categoryId = 'c1' // b 挂 c1
    s.data.sites[2].categoryId = null // c 未分类
    s.addTagsByScope('c2', ['新标签'])
    expect(s.data.sites[0].tags).toContain('新标签')
    expect(s.data.sites[1].tags).not.toContain('新标签')
    expect(s.data.sites[2].tags).not.toContain('新标签')
  })

  it('addTagsByScope null applies to all', () => {
    const s = useAppStore()
    s.data = baseData
    s.addTagsByScope(null, ['全部'])
    expect(s.data.sites.every(x => x.tags.includes('全部'))).toBe(true)
  })

  it('removeTagsByScope removes from scope', () => {
    const s = useAppStore()
    s.data = baseData
    s.removeTagsByScope(null, ['框架'])
    expect(s.data.sites.every(x => !x.tags.includes('框架'))).toBe(true)
  })
})