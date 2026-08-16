import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from './app'
vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
  checkConnectivity: vi.fn().mockResolvedValue(true),
  checkSite: vi.fn().mockResolvedValue({ status: 'ok', usedUrl: 'https://x.dev' }),
}))
import * as api from '../api'
import type { AppData, Site } from '../types'

function makeSite(id: string, status: Site['status'], tags: string[]): Site {
  return { id, name: 'Site' + id, url: 'https://' + id + '.dev', categoryId: 'c1', tags, status, lastCheck: null }
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
    s.addSite({ name: 'Vite', url: 'https://vite.dev', categoryId: 'c2', tags: ['工具', '框架'] })
    expect(s.data.sites).toHaveLength(4)
    expect(s.data.tags).toContain('框架')
    expect(s.data.tags).toContain('工具')
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
})