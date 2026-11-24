// @vitest-environment happy-dom
// src/components/Sidebar.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import { UnfoldVertical, FoldVertical } from 'lucide-vue-next'
import Sidebar from '../components/Sidebar.vue'
import ContextMenu from '../components/ContextMenu.vue'
import { useAppStore } from '../store/app'

// Sidebar → CategoryNode 在 setup 里调 useDialog()，没有 provider 会抛异常
function mountWithDialog(component: Component) {
  return mount({
    setup: () => () => h(NDialogProvider, null, { default: () => h(component) }),
  })
}

describe('Sidebar', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('点击"标签"组标题可折叠该组', async () => {
    const store = useAppStore()
    store.settings.sidebarCollapsed = []
    const w = mountWithDialog(Sidebar)
    const tagLabel = w.findAll('.group-label').find(l => l.text().startsWith('标签'))!
    expect(store.settings.sidebarCollapsed).not.toContain('标签')
    await tagLabel.trigger('click')
    expect(store.settings.sidebarCollapsed).toContain('标签')
  })
  it('分类组渲染展开/收起图标按钮', () => {
    const w = mountWithDialog(Sidebar)
    const catLabel = w.findAll('.group-label').find(l => l.text().startsWith('分类'))!
    const btns = catLabel.findAll('.group-btn')
    expect(btns).toHaveLength(2)
    expect(btns[0].findComponent(UnfoldVertical).exists()).toBe(true)
    expect(btns[1].findComponent(FoldVertical).exists()).toBe(true)
  })
  it('分组标题为 n-text，组按钮为 n-button', () => {
    const w = mountWithDialog(Sidebar)
    const catLabel = w.findAll('.group-label').find(l => l.text().startsWith('分类'))!
    expect(catLabel.classes()).toContain('n-text')
    const btns = catLabel.findAll('.group-btn')
    expect(btns).toHaveLength(2)
    for (const b of btns) expect(b.classes()).toContain('n-button')
  })
  it('侧栏自身行使用 .side-row', () => {
    const w = mountWithDialog(Sidebar)
    const rows = w.findAll('.side-row')
    expect(rows.length).toBeGreaterThan(0)
    const allRow = rows.find(r => r.text().includes('全部'))
    expect(allRow).toBeDefined()
    const trashRow = rows.find(r => r.text().includes('回收站'))
    expect(trashRow).toBeDefined()
    expect(trashRow!.find('.cnt').exists()).toBe(true)
  })

  describe('分类树层级样式', () => {
    function seedTree() {
      const store = useAppStore()
      store.settings.sidebarCollapsed = []
      store.settings.collapsedCategories = []
      store.data.categories = [
        {
          id: 'root-a', name: '根A',
          children: [
            { id: 'child-a1', name: '子A1', children: [] },
            { id: 'child-a2', name: '子A2', children: [] },
          ],
        },
        { id: 'root-b', name: '根B', children: [] },
      ]
      store.data.sites = [
        { id: 's1', name: '站点一', url: 'https://a.dev', categoryId: 'child-a1', tags: [], status: 'ok', lastCheck: null, note: '' },
      ]
      return store
    }

    it('每个分类节点带 tree-node，子级渲染引导线元素', () => {
      seedTree()
      const w = mountWithDialog(Sidebar)
      expect(w.findAll('.tree-node')).toHaveLength(4)
      expect(w.findAll('.tree-guide')).toHaveLength(2)
    })

    it('缩进随 depth 递增（--depth 线性映射 18px/级）', () => {
      seedTree()
      const w = mountWithDialog(Sidebar)
      const rows = w.findAll('.tree-row')
      const depthOf = (el: HTMLElement) => Number(el.parentElement!.style.getPropertyValue('--depth'))
      const rootA = rows.find(r => r.text().includes('根A'))!
      const childA1 = rows.find(r => r.text().includes('子A1'))!
      expect(depthOf(rootA.element as HTMLElement)).toBe(0)
      expect(depthOf(childA1.element as HTMLElement)).toBe(1)
      expect(depthOf(childA1.element as HTMLElement)).toBeGreaterThan(depthOf(rootA.element as HTMLElement))
    })

    it('父级行标记 has-children，且不再有失效的 .row.sub', () => {
      seedTree()
      const w = mountWithDialog(Sidebar)
      const rootA = w.findAll('.tree-row').find(r => r.text().includes('根A'))!
      expect(rootA.classes()).toContain('has-children')
      expect(w.find('.row.sub').exists()).toBe(false)
    })

    it('选中分类行保留 active 主色态', async () => {
      const store = seedTree()
      const w = mountWithDialog(Sidebar)
      const rootA = w.findAll('.tree-row').find(r => r.text().includes('根A'))!
      await rootA.trigger('click')
      expect(store.view).toEqual({ kind: 'category', id: 'root-a' })
      expect(rootA.classes()).toContain('active')
    })

    it('折叠箭头仍写入 collapsedCategories', async () => {
      const store = seedTree()
      const w = mountWithDialog(Sidebar)
      const arrow = w.findAll('.collapse-arrow')[0]
      await arrow.trigger('click')
      expect(store.settings.collapsedCategories).toContain('root-a')
    })

    it('右键分类行仍打开菜单', async () => {
      seedTree()
      const w = mountWithDialog(Sidebar)
      const row = w.findAll('.tree-row').find(r => r.text().includes('根A'))!
      await row.trigger('contextmenu')
      expect(w.findComponent(ContextMenu).exists()).toBe(true)
    })

    it('分类行显示站点计数', () => {
      seedTree()
      const w = mountWithDialog(Sidebar)
      const rootA = w.findAll('.tree-row').find(r => r.text().includes('根A'))!
      const childA1 = w.findAll('.tree-row').find(r => r.text().includes('子A1'))!
      expect(rootA.find('.cnt').text()).toBe('1')
      expect(childA1.find('.cnt').text()).toBe('1')
    })
  })
})
