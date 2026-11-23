// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useAppStore } from '../store/app'
import ImportExportModal from './ImportExportModal.vue'

// n-modal 会 teleport 到 document.body，直接查 body
describe('ImportExportModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  async function mountModal() {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(ImportExportModal)
    await nextTick()
    await nextTick()
  }

  function actionButton(label: string): HTMLElement | undefined {
    return Array.from(document.body.querySelectorAll('button')).find(
      (el) => el.textContent?.trim() === label
    ) as HTMLElement | undefined
  }

  it('renders export/import actions as n-button', async () => {
    await mountModal()
    for (const label of ['导出 MD', '导出 JSON', '导出 HTML', '导入 MD', '导入 HTML', '导入 JSON']) {
      const btn = actionButton(label)
      expect(btn, `missing button: ${label}`).toBeDefined()
      expect(btn!.classList.contains('n-button')).toBe(true)
    }
  })

  it('uses n-radio-group for import mode', async () => {
    await mountModal()
    expect(document.body.querySelector('.n-radio-group')).not.toBeNull()
    expect(document.body.textContent).toContain('合并导入')
    expect(document.body.textContent).toContain('覆盖导入')
  })

  it('no longer uses legacy control classes', async () => {
    await mountModal()
    expect(document.body.querySelector('.btn')).toBeNull()
    expect(document.body.querySelector('.segctrl')).toBeNull()
    expect(document.body.querySelector('.grid2x2')).toBeNull()
    expect(document.body.querySelector('.modal-content')).toBeNull()
  })
})
