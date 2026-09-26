// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useAppStore } from '../store/app'
import AddEditModal from './AddEditModal.vue'
import { mount } from '@vue/test-utils'

// ModalMask uses <Teleport to="body">, so modal content renders in document.body
// Query body directly instead of wrapper
describe('AddEditModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  // Helper: get text inputs (those without explicit type="text" attr, just plain <input>)
  function textInputs(): HTMLInputElement[] {
    return Array.from(document.body.querySelectorAll('input')).filter(
      el => el.type === 'text'
    ) as HTMLInputElement[]
  }

  it('shows validation error for empty name', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const btn = document.body.querySelector('.btn.primary') as HTMLElement
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('请填写名称')
  })

  it('shows validation error for bad URL', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'not-a-url'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    const btn = document.body.querySelector('.btn.primary') as HTMLElement
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('链接格式')
  })

  it('shows validation error for note over 200 chars', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://test.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = '好'.repeat(201)
    textarea.dispatchEvent(new Event('input'))
    await nextTick()
    const btn = document.body.querySelector('.btn.primary') as HTMLElement
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('备注不能超过 200 字')
  })

  it('shows char count for note', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Hello'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()
    expect(document.body.querySelector('.char-count')?.textContent).toBe('5/200')
  })

  it('shows error for duplicate URL on new site', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [{ id: '1', name: 'Existing', url: 'https://exists.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' }],
      recycleBin: [],
      tags: [],
    }
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'New Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://exists.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    const btn = document.body.querySelector('.btn.primary') as HTMLElement
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('链接已存在')
  })

  it('shows error for duplicate URL on edit', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [
        { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
        { id: '2', name: 'B', url: 'https://b.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
      ],
      recycleBin: [],
      tags: [],
    }
    mount(AddEditModal, { props: { editing: store.data.sites[1] } })
    await nextTick()
    const inputs = textInputs()
    ;(inputs[1] as HTMLInputElement).value = 'https://a.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    const btn = document.body.querySelector('.btn.primary') as HTMLElement
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('该链接已存在')
  })

  it('shows fetch title button', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    expect(document.body.textContent).toContain('获取名称')
  })

  it('shows edit mode title when editing', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [{ id: '1', name: 'Edit Me', url: 'https://edit.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' }],
      recycleBin: [],
      tags: [],
    }
    mount(AddEditModal, { props: { editing: store.data.sites[0] } })
    await nextTick()
    expect(document.body.textContent).toContain('编辑网站')
    const nameInput = textInputs()[0]
    expect(nameInput.value).toBe('Edit Me')
  })
})
