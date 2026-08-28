// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import SiteTable from '../components/SiteTable.vue'
import { useAppStore } from '../store/app'

describe('SiteTable', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('表头第6列显示"状态"而非"生命"', () => {
    const w = mount(SiteTable)
    const heads = w.findAll('th').map(h => h.text())
    expect(heads[5]).toContain('状态')
    expect(heads[5]).not.toContain('生命')
  })
  it('备注为空时显示"—"', () => {
    const store = useAppStore()
    store.data.sites = [{ id: '1', name: 'A', url: 'https://a', categoryId: null, tags: [], status: 'ok', note: '', deletedAt: '' } as any]
    store.data.categories = []
    const w = mount(SiteTable)
    const noteCell = w.findAll('td').find(td => td.text() === '—')!
    expect(noteCell.exists()).toBe(true)
  })
})
