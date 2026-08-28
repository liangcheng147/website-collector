// @vitest-environment happy-dom
// src/components/Sidebar.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from '../components/Sidebar.vue'
import { useAppStore } from '../store/app'

describe('Sidebar', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('点击"标签"组标题可折叠该组', async () => {
    const store = useAppStore()
    store.settings.sidebarCollapsed = []
    const w = mount(Sidebar)
    const tagLabel = w.findAll('.group-label').find(l => l.text().startsWith('标签'))!
    expect(store.settings.sidebarCollapsed).not.toContain('标签')
    await tagLabel.trigger('click')
    expect(store.settings.sidebarCollapsed).toContain('标签')
  })
  it('分类组渲染展开/收起图标按钮', () => {
    const w = mount(Sidebar)
    const catLabel = w.findAll('.group-label').find(l => l.text().startsWith('分类'))!
    const btns = catLabel.findAll('.group-btn')
    expect(btns).toHaveLength(2)
    expect(btns[0].text()).toBe('⤢')
    expect(btns[1].text()).toBe('⤡')
  })
})
