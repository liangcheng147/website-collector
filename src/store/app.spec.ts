import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore, UNCATEGORIZED_ID } from './app'
vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
  checkConnectivity: vi.fn().mockResolvedValue(true),
  checkSite: vi.fn().mockResolvedValue({ status: 'ok', usedUrl: 'https://x.dev' }),
  verifySiteWebview: vi.fn().mockResolvedValue({ status: 'ok', usedUrl: 'https://x.dev' }),
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

  it('filtered count differs from total when filtering by category', () => {
    const s = useAppStore()
    s.data = makeData()
    s.data.sites[1].categoryId = 'c2' // b 挂到 c1 的子分类 c2
    s.data.sites[2].categoryId = null // c 移出 c1 子树
    s.view = { kind: 'category', id: 'c1' }
    // c1 子树包含 a（直属）和 b（经子分类 c2），c 已移出
    expect(s.filteredSites.length).to.be.lessThan(s.data.sites.length)
    expect(s.filteredSites.length).to.be.greaterThan(0)
    expect(s.filteredSites.map(x => x.id).sort()).toEqual(['a', 'b'])
  })

  it('uncategorized view returns only sites without a category', () => {
    const s = useAppStore()
    s.data = baseData
    s.data.sites[0].categoryId = null
    s.view = { kind: 'category', id: UNCATEGORIZED_ID }
    expect(s.filteredSites.map(x => x.id)).toEqual(['a'])
    s.data.sites[1].categoryId = null
    expect(s.filteredSites.map(x => x.id).sort()).toEqual(['a', 'b'])
  })

  it('uncategorizedCount counts sites without a category', () => {
    const s = useAppStore()
    s.data = baseData
    s.data.sites[1].categoryId = null
    s.data.sites[2].categoryId = null
    expect(s.uncategorizedCount).toBe(2)
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

  it('init keeps defaults when getSettings omits collapsedCategories', async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ theme: 'system', zoom: 100, sidebarCollapsed: [] } as any)
    const s = useAppStore()
    await s.init()
    expect(s.settings.collapsedCategories).toEqual([])
    expect(s.settings.collapsedCategories.includes('c1')).toBe(false)
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
    vi.mocked(api.verifySiteWebview).mockResolvedValue({ status: 'dead', usedUrl: 'https://x.dev' })
    await s.checkAll()
    expect(s.data.sites.every(x => x.status === 'dead')).toBe(true)
    expect(s.progress.done).toBe(s.progress.total)
    expect(s.checking).toBe(false)
  })

  it('checkAll processes all sites and tracks progress', async () => {
    const s = useAppStore()
    s.data = {
      version: 1,
      categories: [],
      sites: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({
        id, name: id.toUpperCase(), url: `https://${id}.dev`, categoryId: null, tags: [], status: 'unknown', lastCheck: null, note: '',
      })),
      recycleBin: [],
      tags: [],
    }
    vi.mocked(api.checkConnectivity).mockResolvedValue(true)
    let callCount = 0
    let active = 0
    let maxActive = 0
    vi.mocked(api.checkSite).mockImplementation(async () => {
      callCount++
      active++
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      active--
      return { status: 'ok', usedUrl: 'https://x.dev' }
    })
    vi.mocked(api.verifySiteWebview).mockResolvedValue({ status: 'ok', usedUrl: 'https://x.dev' })
    await s.checkAll()
    expect(callCount).toBe(8)
    expect(maxActive).toBe(5) // 并发上限 5 个 worker
    expect(s.progress.done).toBe(8)
    expect(s.progress.total).toBe(8)
    expect(s.checking).toBe(false)
  })

  it('checkSelected checks only selected sites and clears selection', async () => {
    const s = useAppStore()
    s.data = baseData
    vi.mocked(api.checkConnectivity).mockResolvedValue(true)
    vi.mocked(api.checkSite).mockResolvedValue({ status: 'ok', usedUrl: 'x' })
    s.selectedIds = ['a', 'c']
    await s.checkSelected()
    expect(api.checkSite).toHaveBeenCalledTimes(2)
    expect(s.data.sites.find(x => x.id === 'b')!.status).toBe('dead') // 未选中的 b 保持原状态
    expect(s.progress.done).toBe(2)
    expect(s.selectedIds).toEqual([])
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

  it('cancelCheck stops checkAll after in-flight sites', async () => {
    const s = useAppStore()
    s.data = {
      version: 1,
      categories: [],
      sites: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => ({
        id, name: id.toUpperCase(), url: `https://${id}.dev`, categoryId: null, tags: [], status: 'unknown', lastCheck: null, note: '',
      })),
      recycleBin: [],
      tags: [],
    }
    vi.mocked(api.checkConnectivity).mockResolvedValue(true)
    const resolvers: ((v: any) => void)[] = []
    vi.mocked(api.checkSite).mockImplementation(() => new Promise<any>(res => resolvers.push(res)))
    const promise = s.checkAll()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(resolvers.length).toBe(5) // 5 个 worker 同时在检，剩余 2 个未开始
    s.cancelCheck()
    resolvers.forEach(r => r({ status: 'ok', usedUrl: 'x' }))
    await promise
    expect(api.checkSite).toHaveBeenCalledTimes(5) // f、g 不再发起
    expect(s.data.sites.filter(x => x.lastCheck).length).toBe(5) // 在检的结果保留
    expect(s.progress.done).toBe(5)
    expect(s.checking).toBe(false)
    expect(s.cancelled).toBe(true)
  })

  it('checkOne is skipped while checking', async () => {
    const s = useAppStore()
    s.data = baseData
    s.checking = true
    await s.checkOne('a')
    expect(api.checkSite).not.toHaveBeenCalled()
  })

  it('checkOne aborts when offline', async () => {
    const s = useAppStore()
    s.data = makeData()
    s.data.sites.forEach(x => x.status = 'unknown') // baseData 状态不全是 unknown，先归位再验证未误标
    vi.mocked(api.checkConnectivity).mockResolvedValueOnce(false) // 用 once 避免污染后续测试的默认实现
    await s.checkOne('a')
    expect(s.connectivityError).to.equal(true)
    expect(s.data.sites.find(x => x.id === 'a')?.status).to.equal('unknown')
  })

  it('checkAll verifies dead sites via webview', async () => {
    const s = useAppStore()
    s.data = baseData // a:ok, b:dead, c:unknown
    vi.mocked(api.checkSite).mockResolvedValue({ status: 'dead', usedUrl: 'x' })
    vi.mocked(api.verifySiteWebview).mockResolvedValue({ status: 'ok', usedUrl: 'x' })
    await s.checkAll()
    expect(s.data.sites.every(x => x.status === 'ok')).toBe(true)
    expect(api.verifySiteWebview).toHaveBeenCalledTimes(3)
  })

  it('checkAll does not verify already-ok sites', async () => {
    const s = useAppStore()
    s.data = baseData
    vi.mocked(api.checkSite).mockImplementation(async (url) =>
      url.includes('a') ? { status: 'ok', usedUrl: url } : { status: 'dead', usedUrl: url })
    await s.checkAll()
    expect(api.verifySiteWebview).toHaveBeenCalledTimes(2) // 只复核 b、c
  })

  it('checkOne resets cancelled after a cancelled batch', async () => {
    const s = useAppStore()
    s.data = baseData
    s.cancelled = true
    await s.checkOne('a')
    expect(s.cancelled).toBe(false)
  })

  it('collapseAllCategories collapses every category', () => {
    const s = useAppStore()
    s.data.categories = [
      { id: 'a', name: 'A', children: [{ id: 'a1', name: 'A1', children: [] }] },
      { id: 'b', name: 'B', children: [] },
    ]
    s.expandAllCategories()
    expect(s.settings.collapsedCategories).toEqual([])
    s.collapseAllCategories()
    expect(s.settings.collapsedCategories.sort()).toEqual(['a', 'a1', 'b'])
  })

  it('expandAllCategories clears collapsed set', () => {
    const s = useAppStore()
    s.data.categories = [{ id: 'x', name: 'X', children: [] }]
    s.settings.collapsedCategories = ['x']
    s.expandAllCategories()
    expect(s.settings.collapsedCategories).toEqual([])
  })

  it('    validateSite rejects empty name/url and bad url', () => {
    const s = useAppStore()
    expect(s.validateSite('', 'https://a.dev')).toMatch(/名称/)
    expect(s.validateSite('站点', '')).toMatch(/链接/)
    expect(s.validateSite('站点', 'not-a-url')).toMatch(/链接/)
    expect(s.validateSite('站点', 'https://a.dev')).toBeNull()
  })

  it('validateSite allows note up to 200 chars', () => {
    const s = useAppStore()
    const note = '好'.repeat(200)
    const result = s.validateSite('Test', 'https://test.dev', note)
    expect(result).to.equal(null)
  })

  it('validateSite rejects note over 200 chars', () => {
    const s = useAppStore()
    const note = '好'.repeat(201)
    const result = s.validateSite('Test', 'https://test.dev', note)
    expect(result).to.equal('备注不能超过 200 字')
  })

  it('selectRelative moves active selection by arrow and Delete moves to recycle', () => {
  const s = useAppStore()
  s.data.sites = [
    { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
    { id: '2', name: 'B', url: 'https://b.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
    { id: '3', name: 'C', url: 'https://c.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
  ]
  s.view = { kind: 'all' }
  s.selectRelative('down')        // active -> 1
  s.selectRelative('down')        // active -> 2
  expect(s.activeId).toBe('2')
  s.deleteSelectedToRecycle()     // moves [2] to recycle
  expect(s.data.sites.map(x => x.id)).toEqual(['1', '3'])
  expect(s.trashedSites.some(x => x.site.id === '2')).toBe(true)
})

  it('normalizeUrlForCompare lowercases and strips trailing slash', () => {
    const s = useAppStore()
    expect(s.normalizeUrlForCompare('https://GitHub.com/')).to.equal('https://github.com')
    expect(s.normalizeUrlForCompare('https://example.com')).to.equal('https://example.com')
    expect(s.normalizeUrlForCompare('https://Example.COM/path/')).to.equal('https://example.com/path')
  })

  it('isDuplicateUrl excludes given id', () => {
    const s = useAppStore()
    s.data = makeData()
    expect(s.isDuplicateUrl('https://a.dev', 'a')).to.equal(false)
    expect(s.isDuplicateUrl('https://a.dev', 'z')).to.equal(true)
  })

  it('isDuplicateUrl normalizes case and trailing slash', () => {
    const s = useAppStore()
    s.data = makeData()
    expect(s.isDuplicateUrl('https://A.dev/', 'z')).to.equal(true)
  })

  it('restoreSite skips when URL conflicts', () => {
    const s = useAppStore()
    s.data = makeData()
    s.data.recycleBin = [{ site: s.data.sites.find(x => x.id === 'a')!, deletedAt: new Date().toISOString() }]
    s.data.sites = s.data.sites.filter(x => x.id !== 'a')
    s.data.sites.push({
      id: 'dup', name: 'Duplicate', url: 'https://a.dev',
      categoryId: null, tags: [], status: 'unknown', lastCheck: null, note: ''
    })
    s.persist = async () => {}
    s.restoreSite('a')
    expect(s.data.sites.find(x => x.id === 'a')).to.equal(undefined)
    expect(s.data.recycleBin.find(x => x.site.id === 'a')).to.equal(undefined)
  })

  it('toggleSort cycles and orders filteredSites', () => {
    const s = useAppStore()
    s.data.sites = [
      { id: '1', name: 'Banana', url: 'https://b.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
      { id: '2', name: 'Apple', url: 'https://a.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' },
    ]
    s.toggleSort('name')
    expect(s.sortKey).toBe('name'); expect(s.sortDir).toBe('asc')
    expect(s.filteredSites.map(x => x.name)).toEqual(['Apple', 'Banana'])
    s.toggleSort('name')
    expect(s.sortDir).toBe('desc')
    expect(s.filteredSites.map(x => x.name)).toEqual(['Banana', 'Apple'])
  })

  it('sorts by category display name with pinyin', () => {
    const s = useAppStore()
    s.data = {
      version: 1,
      categories: [{ id: 'c1', name: '开发', children: [{ id: 'c2', name: '前端', children: [] }] }],
      sites: [
        { id: 'a', name: 'A', url: 'https://a.dev', categoryId: 'c2', tags: [], status: 'unknown', lastCheck: null, note: '' },
        { id: 'b', name: 'B', url: 'https://b.dev', categoryId: 'c1', tags: [], status: 'unknown', lastCheck: null, note: '' },
      ],
      recycleBin: [],
      tags: [],
    }
    s.toggleSort('category')
    // 开发 < 前端 (k < q in pinyin)
    expect(s.filteredSites[0].id).to.equal('b')
    expect(s.filteredSites[1].id).to.equal('a')
  })

  it('sorts by lastCheck with nulls following direction', () => {
    const s = useAppStore()
    s.data = makeData()
    s.data.sites[0].lastCheck = '2026-01-01T00:00:00Z'
    s.data.sites[1].lastCheck = null
    s.data.sites[2].lastCheck = '2026-06-01T00:00:00Z'
    s.toggleSort('lastCheck')
    // asc: null first (oldest), then 2026-01, then 2026-06
    expect(s.filteredSites[0].lastCheck).to.equal(null)
    expect(s.filteredSites[2].lastCheck).to.equal('2026-06-01T00:00:00Z')
  })
})
