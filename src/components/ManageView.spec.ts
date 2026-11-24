// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, h, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import ManageView from '../components/ManageView.vue'

vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
}))

// ManageView 的子组件在 setup 里调 useDialog()，没有 provider 会抛异常
function mountWithDialog(component: Component) {
  return mount({
    setup: () => () => h(NDialogProvider, null, { default: () => h(component) }),
  })
}

describe('ManageView', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('返回按钮为 n-button 并触发 back', async () => {
    const w = mountWithDialog(ManageView)
    const back = w.findAll('button').find(b => b.text().includes('返回主页面'))
    expect(back).toBeDefined()
    expect(back!.classes()).toContain('n-button')
    await back!.trigger('click')
    expect(w.findComponent(ManageView).emitted('back')).toBeTruthy()
  })

  it('分类/标签切换为 n-tabs', () => {
    const w = mountWithDialog(ManageView)
    expect(w.find('.n-tabs').exists()).toBe(true)
    expect(w.text()).toContain('分类')
    expect(w.text()).toContain('标签')
  })

  it('点击标签页签切换到标签管理', async () => {
    const w = mountWithDialog(ManageView)
    expect(w.text()).toContain('分类列表')
    await w.find('[data-name="tags"]').trigger('click')
    await nextTick()
    expect(w.text()).toContain('标签列表')
  })

  it('点击重复链接页签切换到重复管理', async () => {
    const w = mountWithDialog(ManageView)
    expect(w.text()).toContain('重复链接')
    await w.find('[data-name="duplicates"]').trigger('click')
    await nextTick()
    expect(w.text()).toContain('暂无重复链接')
  })
})
