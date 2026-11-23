// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import ManageCategories from '../components/ManageCategories.vue'
import { useAppStore } from '../store/app'
import type { AppData } from '../types'

vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
}))

// ManageCategories 在 setup 里调 useDialog()，没有 provider 会抛异常
function mountWithDialog(component: Component) {
  return mount({
    setup: () => () => h(NDialogProvider, null, { default: () => h(component) }),
  })
}

function seed(): AppData {
  return {
    version: 1,
    categories: [
      { id: 'c1', name: '开发', children: [{ id: 'c2', name: '前端', children: [] }] },
      { id: 'c3', name: '生活', children: [] },
    ],
    sites: [
      { id: 's1', name: 'A', url: 'https://a.dev', categoryId: 'c2', tags: [], status: 'ok', lastCheck: null, note: '' },
    ],
    recycleBin: [],
    tags: ['框架'],
  }
}

describe('ManageCategories', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('渲染顺序为 分类列表 在前、批量添加分类 在后', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageCategories)
    const cards = w.findAll('.manage-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('h4').text()).toBe('分类列表')
    expect(cards[1].find('h4').text()).toBe('批量添加分类')
  })

  it('批量操作按钮为 n-button（删除为 error 类型）', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageCategories)
    const del = w.findAll('button').find(b => b.text().includes('批量删除所选'))
    expect(del).toBeDefined()
    expect(del!.classes()).toContain('n-button')
    expect(del!.classes()).toContain('n-button--error-type')
  })

  it('行选择与全选为 n-checkbox', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageCategories)
    expect(w.findAll('.n-checkbox').length).toBeGreaterThan(0)
  })

  it('不再使用 .cb / .btn 旧控件类', () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageCategories)
    expect(w.find('.cb').exists()).toBe(false)
    expect(w.find('.btn').exists()).toBe(false)
  })

  it('点击行复选框选中该分类，全选复选框联动', async () => {
    const store = useAppStore()
    store.data = seed()
    const w = mountWithDialog(ManageCategories)
    const boxes = w.findAll('.n-checkbox')
    expect(boxes.length).toBe(4) // 1 全选 + 3 行
    await boxes[1].trigger('click')
    expect(boxes[1].classes()).toContain('n-checkbox--checked')
    expect(boxes[0].classes()).toContain('n-checkbox--indeterminate')
    await boxes[0].trigger('click')
    expect(w.findAll('.n-checkbox').every(b => b.classes().includes('n-checkbox--checked'))).toBe(true)
  })
})
