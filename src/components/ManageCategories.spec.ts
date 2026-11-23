// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, type Component } from 'vue'
import { NDialogProvider } from 'naive-ui'
import ManageCategories from '../components/ManageCategories.vue'

// ManageCategories 在 setup 里调 useDialog()，没有 provider 会抛异常
function mountWithDialog(component: Component) {
  return mount({
    setup: () => () => h(NDialogProvider, null, { default: () => h(component) }),
  })
}

describe('ManageCategories', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染顺序为 分类列表 在前、批量添加分类 在后', () => {
    const w = mountWithDialog(ManageCategories)
    const cards = w.findAll('.manage-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('h4').text()).toBe('分类列表')
    expect(cards[1].find('h4').text()).toBe('批量添加分类')
  })
})
