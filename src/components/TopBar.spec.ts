// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { NSelect } from 'naive-ui'
import TopBar from './TopBar.vue'
import { useAppStore } from '../store/app'

const setSettingsMock = vi.fn()
vi.mock('../api', () => ({
  setSettings: (...args: unknown[]) => setSettingsMock(...args),
}))

describe('TopBar 检测范围', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setSettingsMock.mockReset().mockResolvedValue(undefined)
  })

  function scopeSelect(w: ReturnType<typeof mount>) {
    return w.findAllComponents(NSelect).find((c) => c.attributes('data-testid') === 'check-scope')!
  }

  it('下拉显示并持久化当前检测范围', async () => {
    const store = useAppStore()
    store.settings.checkScope = 'all'
    const w = mount(TopBar)
    const select = scopeSelect(w)
    expect(select.props('value')).toBe('all')
    select.vm.$emit('update:value', 'category')
    await flushPromises()
    expect(store.settings.checkScope).toBe('category')
    expect(setSettingsMock).toHaveBeenCalled()
  })

  it('点击检测按当前范围触发 check-scope', async () => {
    const store = useAppStore()
    store.settings.checkScope = 'tag'
    const w = mount(TopBar)
    await w.find('[data-testid="btn-check-all"]').trigger('click')
    expect(w.emitted('check-scope')![0]).toEqual(['tag'])
  })

  it('检测中点击按钮触发取消检测', async () => {
    const store = useAppStore()
    store.checking = true
    const w = mount(TopBar)
    await w.find('[data-testid="btn-check-all"]').trigger('click')
    expect(w.emitted('cancel-check')).toBeTruthy()
  })
})
