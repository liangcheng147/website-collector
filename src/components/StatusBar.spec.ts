// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../store/app'
import StatusBar from './StatusBar.vue'
import { mount } from '@vue/test-utils'

describe('StatusBar', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('shows total site count', () => {
    const store = useAppStore()
    store.data.sites = [
      { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
    ]
    const w = mount(StatusBar)
    expect(w.text()).toContain('共 1 个')
  })

  it('shows filtered count when different from total', () => {
    const store = useAppStore()
    store.data.sites = [
      { id: '1', name: 'A', url: 'https://a.dev', categoryId: 'c1', tags: [], status: 'ok', lastCheck: null, note: '' },
      { id: '2', name: 'B', url: 'https://b.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
    ]
    store.data.categories = [{ id: 'c1', name: '开发', children: [] }]
    store.view = { kind: 'category', id: 'c1' }
    const w = mount(StatusBar)
    expect(w.text()).toContain('共 2 个')
    expect(w.text()).toContain('当前 1 个')
  })

  it('hides filtered count when same as total', () => {
    const store = useAppStore()
    store.data.sites = [
      { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
    ]
    store.view = { kind: 'all' }
    const w = mount(StatusBar)
    expect(w.text()).toContain('共 1 个')
    expect(w.text()).not.toContain('当前')
  })

  it('shows dead count', () => {
    const store = useAppStore()
    store.data.sites = [
      { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'dead', lastCheck: null, note: '' },
      { id: '2', name: 'B', url: 'https://b.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
    ]
    const w = mount(StatusBar)
    expect(w.text()).toContain('失效 1')
  })

  it('shows checking progress', () => {
    const store = useAppStore()
    store.checking = true
    store.progress = { done: 3, total: 10 }
    const w = mount(StatusBar)
    expect(w.text()).toContain('检测中 3/10')
  })

  it('shows cancelled state', () => {
    const store = useAppStore()
    store.checking = false
    store.cancelled = true
    store.progress = { done: 5, total: 10 }
    const w = mount(StatusBar)
    expect(w.text()).toContain('已手动停止')
    expect(w.text()).toContain('5/10')
  })

  it('shows offline warning', () => {
    const store = useAppStore()
    store.connectivityError = true
    const w = mount(StatusBar)
    expect(w.text()).toContain('网络似乎断开')
  })

  it('shows flash message', () => {
    const store = useAppStore()
    store.flashMsg = '已导出 md'
    const w = mount(StatusBar)
    expect(w.text()).toContain('已导出 md')
  })
})
