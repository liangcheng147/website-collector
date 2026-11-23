// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import ManageTags from '../components/ManageTags.vue'
import { useAppStore } from '../store/app'
import type { AppData } from '../types'

vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
}))

// ManageTags 在 setup 里调 useDialog()，没有 provider 会抛异常
function mountWithDialog(component: Component) {
  return mount({
    setup: () => () => h(NDialogProvider, null, { default: () => h(component) }),
  })
}

function seed(): AppData {
  return {
    version: 1,
    categories: [{ id: 'c1', name: '开发', children: [] }],
    sites: [
      { id: 's1', name: 'A', url: 'https://a.dev', categoryId: 'c1', tags: ['框架', '工具'], status: 'ok', lastCheck: null, note: '' },
      { id: 's2', name: 'B', url: 'https://b.dev', categoryId: 'c1', tags: ['框架'], status: 'ok', lastCheck: null, note: '' },
    ],
    recycleBin: [],
    tags: ['框架', '工具'],
  }
}

describe('ManageTags', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('渲染顺序为 标签列表 在前、批量加/去标签 在后', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageTags)
    const cards = w.findAll('.manage-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('h4').text()).toBe('标签列表')
    expect(cards[1].find('h4').text()).toBe('批量加/去标签')
  })

  it('批量操作按钮为 n-button（删除为 error 类型）', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageTags)
    const del = w.findAll('button').find(b => b.text().includes('删除所选'))
    expect(del).toBeDefined()
    expect(del!.classes()).toContain('n-button')
    expect(del!.classes()).toContain('n-button--error-type')
    const merge = w.findAll('button').find(b => b.text().includes('合并所选'))
    expect(merge).toBeDefined()
    expect(merge!.classes()).toContain('n-button')
  })

  it('行选择与全选为 n-checkbox', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageTags)
    expect(w.findAll('.n-checkbox').length).toBeGreaterThan(0)
  })

  it('批量模式为 n-radio-group', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageTags)
    expect(w.find('.n-radio-group').exists()).toBe(true)
    expect(w.text()).toContain('批量添加')
    expect(w.text()).toContain('批量去除')
  })

  it('不再使用 .cb / .btn / .segctrl 旧控件类', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageTags)
    expect(w.find('.cb').exists()).toBe(false)
    expect(w.find('.btn').exists()).toBe(false)
    expect(w.find('.segctrl').exists()).toBe(false)
  })

  it('选择标签后删除所选', async () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageTags)
    const boxes = w.findAll('.n-checkbox')
    expect(boxes.length).toBe(3) // 1 全选 + 2 行
    await boxes[1].trigger('click')
    const del = w.findAll('button').find(b => b.text().includes('删除所选'))!
    await del.trigger('click')
    expect(store.data.tags).not.toContain('框架')
    expect(store.data.tags).toContain('工具')
  })
})
