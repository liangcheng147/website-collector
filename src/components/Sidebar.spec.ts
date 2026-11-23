// @vitest-environment happy-dom
// src/components/Sidebar.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import { UnfoldVertical, FoldVertical } from 'lucide-vue-next'
import Sidebar from '../components/Sidebar.vue'
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
  it('侧栏自身行不再依赖 .row，改用 .side-row', () => {
    const w = mountWithDialog(Sidebar)
    expect(w.find('.sidebar-fixed .row').exists()).toBe(false)
    const rows = w.findAll('.side-row')
    expect(rows.length).toBeGreaterThan(0)
    const allRow = rows.find(r => r.text().includes('全部'))
    expect(allRow).toBeDefined()
    expect(allRow!.classes()).not.toContain('row')
    const trashRow = rows.find(r => r.text().includes('回收站'))
    expect(trashRow).toBeDefined()
    expect(trashRow!.find('.cnt').exists()).toBe(true)
  })
})
