import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './app'
import type { AppData, Site } from '../types'

function makeSite(id: string, status: Site['status'], tags: string[]): Site {
  return { id, name: 'Site' + id, url: 'https://' + id + '.dev', categoryId: 'c1', tags, status, lastCheck: null }
}

const baseData: AppData = {
  version: 1,
  categories: [{ id: 'c1', name: '开发', children: [{ id: 'c2', name: '前端', children: [] }] }],
  sites: [
    makeSite('a', 'ok', ['框架']),
    makeSite('b', 'dead', ['框架']),
    makeSite('c', 'unknown', ['工具']),
  ],
  recycleBin: [],
  tags: ['框架', '工具'],
}

describe('app store', () => {
  beforeEach(() => setActivePinia(createPinia()))

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
})