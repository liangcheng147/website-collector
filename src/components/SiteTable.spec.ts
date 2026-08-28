// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SiteTable from './SiteTable.vue'
import { useAppStore } from '../store/app'

it('shows filtered-empty text when sites exist but filter yields none', () => {
  setActivePinia(createPinia())
  const s = useAppStore()
  s.data.sites = [{ id: '1', name: 'a', url: 'https://a.dev', categoryId: null, tags: [], status: 'unknown', lastCheck: null, note: '' }]
  s.view = { kind: 'tag', id: '不存在' }
  const w = mount(SiteTable)
  expect(w.text()).toContain('当前筛选没有结果')
})
